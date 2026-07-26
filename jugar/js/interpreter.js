/* ============================================================
 * Intérprete — PSeInt en español (con cancelación)
 * ============================================================ */
(function (global) {
  'use strict';

  function RuntimeError(msg, line) {
    const e = new Error(msg);
    e.line = line || 0;
    e.phase = 'Ejecución';
    return e;
  }

  function normalize(name) { return name.toLowerCase(); }

  function defaultValue(type) {
    switch (type) {
      case 'entero': return 0;
      case 'real': return 0.0;
      case 'caracter': return '';
      case 'logico': return false;
    }
    return 0;
  }

  function formatValue(v) {
    if (typeof v === 'boolean') return v ? 'Verdadero' : 'Falso';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      return String(v);
    }
    if (v === null || v === undefined) return '';
    return String(v);
  }

  const YIELD_THRESHOLD = 20;
  function yieldControl() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function makeScope(parent) {
    return { parent, vars: {} };
  }
  function scopeGet(scope, name) {
    const key = normalize(name);
    let s = scope;
    while (s) { if (Object.prototype.hasOwnProperty.call(s.vars, key)) return s.vars[key]; s = s.parent; }
    return undefined;
  }
  function scopeGetRef(scope, name) {
    const key = normalize(name);
    let s = scope;
    while (s) { if (Object.prototype.hasOwnProperty.call(s.vars, key)) return s; s = s.parent; }
    return null;
  }
  function scopeSet(scope, name, value) {
    const key = normalize(name);
    const s = scopeGetRef(scope, key);
    if (s) s.vars[key] = value; else scope.vars[key] = value;
  }
  function scopeDeclare(scope, name, value) {
    scope.vars[normalize(name)] = value;
  }

  async function run(ast, io, signal, options = {}) {
    if (!signal) signal = new AbortController().signal;
    const stepDelay = options.stepDelay || 0; // milliseconds between steps (0 = normal mode)
    const stepHighlight = !!options.stepHighlight || stepDelay > 0;

    function checkCancel() {
      if (signal && signal.aborted) {
        throw new Error('Ejecución cancelada');
      }
    }

    const subprograms = {};
    for (const sp of ast.subprograms) subprograms[normalize(sp.name)] = sp;

    const globalScope = makeScope(null);

    async function execBlock(stmts, scope) {
      for (const s of stmts) {
        checkCancel();
        // Highlight only in step-by-step mode. Fast execution should not paint
        // blocks or wait for visual pauses.
        if (stepHighlight && s.line && window.__blockHighlightByLine) {
          if (window.__debugLog) {
            window.__debugLog('interpreter.step', {
              line: s.line,
              statementType: s.type,
              stepDelay,
              statementJson: JSON.parse(JSON.stringify(s))
            });
          }
          window.__blockHighlightByLine(s.line);
          await new Promise(r => setTimeout(r, stepDelay));
        }
        const r = await execStmt(s, scope);
        if (r && r.type === 'return') return r;
      }
      return null;
    }

    async function execStmt(s, scope) {
      checkCancel();
      switch (s.type) {
        case 'Definir': {
          for (const n of s.names) {
            scopeDeclare(scope, n.name, { type: s.dataType, value: defaultValue(s.dataType), isConst: false });
          }
          return;
        }
        case 'Constant': {
          const val = await evalExpr(s.value, scope);
          scopeDeclare(scope, s.name, { type: typeof val === 'number' ? (Number.isInteger(val) ? 'entero' : 'real') : (typeof val === 'boolean' ? 'logico' : 'caracter'), value: val, isConst: true });
          return;
        }
        case 'Dimension': {
          for (const arr of s.arrays) {
            const dims = [];
            for (const d of arr.dims) {
              const start = Math.trunc(await evalExpr(d.start, scope));
              const end = Math.trunc(await evalExpr(d.end, scope));
              if (end < start) throw RuntimeError(`Rango inválido en arreglo '${arr.name}': [${start}..${end}]`, s.line);
              dims.push({ start, end });
            }
            const existing = scopeGet(scope, arr.name);
            const type = existing ? existing.type : 'real';
            const data = buildArray(dims, 0, type);
            scopeDeclare(scope, arr.name, { type, isArray: true, dims, data, isConst: false });
          }
          return;
        }
        case 'Read': {
          for (const t of s.targets) {
            const input = await io.read();
            checkCancel();
            const target = t;
            const info = target.type === 'Variable' ? scopeGet(scope, target.name) : scopeGet(scope, target.name);
            if (!info) throw RuntimeError(`Variable '${target.name}' no declarada`, s.line);
            const type = info.type;
            const val = parseInput(input, type, s.line);
            if (target.type === 'Variable') {
              const cur = scopeGet(scope, target.name);
              cur.value = val;
            } else {
              const indices = [];
              for (const idx of target.indices) indices.push(Math.trunc(await evalExpr(idx, scope)));
              setArrayValue(info, indices, val, s.line);
            }
          }
          return;
        }
        case 'Write': {
          let out = '';
          for (const a of s.args) {
            const v = await evalExpr(a, scope);
            out += formatValue(v);
          }
          if (s.noNewline) io.write(out); else io.writeln(out);
          return;
        }
        case 'Assign': {
          const val = await evalExpr(s.value, scope);
          if (s.target.type === 'Variable') {
            const info = scopeGet(scope, s.target.name);
            if (!info) throw RuntimeError(`Variable '${s.target.name}' no declarada`, s.line);
            if (info.isConst) throw RuntimeError(`No se puede asignar a constante '${s.target.name}'`, s.line);
            info.value = coerce(val, info.type, s.line, s.target.name);
          } else if (s.target.type === 'Index') {
            const info = scopeGet(scope, s.target.name);
            if (!info) throw RuntimeError(`Arreglo '${s.target.name}' no declarado`, s.line);
            const indices = [];
            for (const idx of s.target.indices) indices.push(Math.trunc(await evalExpr(idx, scope)));
            setArrayValue(info, indices, coerce(val, info.type, s.line, s.target.name), s.line);
          }
          return;
        }
        case 'If': {
          const c = await evalExpr(s.condition, scope);
          if (c) return await execBlock(s.thenBlock, scope);
          for (const ei of s.elseIfs) {
            const cc = await evalExpr(ei.condition, scope);
            if (cc) return await execBlock(ei.body, scope);
          }
          if (s.elseBlock) return await execBlock(s.elseBlock, scope);
          return;
        }
        case 'Switch': {
          const d = await evalExpr(s.discriminant, scope);
          for (const c of s.cases) {
            for (const v of c.values) {
              const cv = await evalExpr(v, scope);
              if (cv === d) return await execBlock(c.body, scope);
            }
          }
          if (s.defaultBlock) return await execBlock(s.defaultBlock, scope);
          return;
        }
        case 'While': {
          let guard = 0;
          while (true) {
            checkCancel();
            const c = await evalExpr(s.condition, scope);
            if (!c) break;
            const r = await execBlock(s.body, scope);
            if (r && r.type === 'return') return r;
            if (++guard > 10000000) throw RuntimeError('Se excedió el límite de iteraciones (posible bucle infinito)', s.line);
            if (guard % YIELD_THRESHOLD === 0) await yieldControl();
          }
          return;
        }
        case 'Repeat': {
          let guard = 0;
          while (true) {
            checkCancel();
            const r = await execBlock(s.body, scope);
            if (r && r.type === 'return') return r;
            const c = await evalExpr(s.condition, scope);
            if (c) break;
            if (++guard > 10000000) throw RuntimeError('Se excedió el límite de iteraciones', s.line);
            if (guard % YIELD_THRESHOLD === 0) await yieldControl();
          }
          return;
        }
        case 'For': {
          const startV = await evalExpr(s.start, scope);
          const endV = await evalExpr(s.end, scope);
          const stepV = s.step ? await evalExpr(s.step, scope) : 1;
          if (stepV === 0) throw RuntimeError('El paso del bucle Para no puede ser 0', s.line);
          let v = scopeGet(scope, s.variable);
          if (!v) { scopeDeclare(scope, s.variable, { type: 'entero', value: startV, isConst: false }); v = scopeGet(scope, s.variable); }
          v.value = startV;
          const cmp = stepV > 0 ? (x, y) => x <= y : (x, y) => x >= y;
          let guard = 0;
          while (cmp(v.value, endV)) {
            checkCancel();
            const r = await execBlock(s.body, scope);
            if (r && r.type === 'return') return r;
            v.value = v.value + stepV;
            if (++guard > 10000000) throw RuntimeError('Se excedió el límite de iteraciones', s.line);
            if (guard % YIELD_THRESHOLD === 0) await yieldControl();
          }
          return;
        }
        case 'CallStmt': {
          await callSubprogram(s.call, scope, false);
          return;
        }
        case 'ClearScreen': io.clear(); return;
        case 'WaitKey': await io.waitKey(); return;
        case 'Sleep': {
          const t = await evalExpr(s.time, scope);
          if (t < 0) throw RuntimeError('Tiempo negativo no permitido', s.line);
          await io.sleep(t);
          return;
        }
      }
    }

    async function callSubprogram(callNode, callerScope, isExpression) {
      // Verificar si es una función built-in del juego
      const gameBuiltins = window.GAME_BUILTINS || [];
      const fnName = normalize(callNode.name);
      
      if (gameBuiltins.includes(fnName)) {
        // Función del juego detectada
        // Si hay un estado de juego activo, ejecutarla
        if (window.__gameState && window.__gameState.world) {
          const BUILTINS = window.GameRuntime && window.GameRuntime.BUILTINS;
          if (BUILTINS && BUILTINS[fnName]) {
            const args = [];
            for (const a of callNode.args) {
              args.push(await evalExpr(a, callerScope));
            }
            try {
              const result = await BUILTINS[fnName](args, window.__gameState, callNode.line);
              return result;
            } catch (e) {
              throw RuntimeError(`Error en función del juego '${callNode.name}': ${e.message}`, callNode.line);
            }
          }
        }
        // Si no hay estado de juego, es una llamada no-op en modo estándar
        // Evaluar argumentos para validarlos
        for (const a of callNode.args) {
          await evalExpr(a, callerScope);
        }
        return null;
      }
      
      const sp = subprograms[normalize(callNode.name)];
      if (!sp) throw RuntimeError(`Subproceso/Función '${callNode.name}' no declarado`, callNode.line);
      if (sp.params.length !== callNode.args.length) {
        throw RuntimeError(`'${callNode.name}' espera ${sp.params.length} argumentos, se dieron ${callNode.args.length}`, callNode.line);
      }
      const localScope = makeScope(null);
      for (let i = 0; i < callNode.args.length; i++) {
        const p = sp.params[i];
        const a = callNode.args[i];
        if (p.byRef) {
          if (a.type !== 'Variable' && a.type !== 'Index') {
            throw RuntimeError(`El argumento ${i+1} de '${callNode.name}' es Por Referencia y requiere una variable`, callNode.line);
          }
          if (a.type === 'Variable') {
            const origInfo = scopeGet(callerScope, a.name);
            if (!origInfo) throw RuntimeError(`Variable '${a.name}' no declarada`, callNode.line);
            localScope.vars[normalize(p.name)] = origInfo;
          } else {
            const origInfo = scopeGet(callerScope, a.name);
            if (!origInfo) throw RuntimeError(`Arreglo '${a.name}' no declarado`, callNode.line);
            const indices = [];
            for (const idx of a.indices) indices.push(Math.trunc(await evalExpr(idx, callerScope)));
            const proxy = {
              get type() { return origInfo.type; },
              get value() { return getArrayValue(origInfo, indices, callNode.line); },
              set value(v) { setArrayValue(origInfo, indices, v, callNode.line); }
            };
            localScope.vars[normalize(p.name)] = proxy;
          }
        } else {
          const v = await evalExpr(a, callerScope);
          const t = typeof v === 'number' ? (Number.isInteger(v) ? 'entero' : 'real') : (typeof v === 'boolean' ? 'logico' : 'caracter');
          localScope.vars[normalize(p.name)] = { type: t, value: v, isConst: false };
        }
      }
      if (sp.type === 'Function') {
        localScope.vars[normalize(sp.name)] = { type: 'unknown', value: 0, isConst: false, isReturn: true };
      }
      await execBlock(sp.body, localScope);
      if (sp.type === 'Function') {
        const ret = localScope.vars[normalize(sp.name)];
        return ret ? ret.value : 0;
      }
      return null;
    }

    async function evalExpr(node, scope) {
      checkCancel();
      switch (node.type) {
        case 'Number': return node.value;
        case 'String': return node.value;
        case 'Boolean': return node.value;
        case 'Variable': {
          const info = scopeGet(scope, node.name);
          if (!info) throw RuntimeError(`Variable '${node.name}' no declarada`, node.line);
          if (info.isArray) throw RuntimeError(`'${node.name}' es un arreglo`, node.line);
          return info.value;
        }
        case 'Index': {
          const info = scopeGet(scope, node.name);
          if (!info) throw RuntimeError(`Arreglo '${node.name}' no declarado`, node.line);
          if (!info.isArray) throw RuntimeError(`'${node.name}' no es un arreglo`, node.line);
          const indices = [];
          for (const idx of node.indices) indices.push(Math.trunc(await evalExpr(idx, scope)));
          return getArrayValue(info, indices, node.line);
        }
        case 'Call': {
          const bi = builtInFunction(node.name);
          if (bi) {
            const args = [];
            for (const a of node.args) args.push(await evalExpr(a, scope));
            return bi(args, node.line);
          }
          return await callSubprogram(node, scope, true);
        }
        case 'Unary': {
          const v = await evalExpr(node.arg, scope);
          if (node.op === '-') return -v;
          if (node.op === 'NO') return !v;
          return v;
        }
        case 'Binary': {
          const op = node.op;
          if (op === 'Y') { const l = await evalExpr(node.left, scope); if (!l) return false; return !!(await evalExpr(node.right, scope)); }
          if (op === 'O') { const l = await evalExpr(node.left, scope); if (l) return true; return !!(await evalExpr(node.right, scope)); }
          const l = await evalExpr(node.left, scope);
          const r = await evalExpr(node.right, scope);
          switch (op) {
            case '+':
              if (typeof l === 'string' || typeof r === 'string') return String(formatValue(l)) + String(formatValue(r));
              return l + r;
            case '-': return l - r;
            case '*': return l * r;
            case '/':
              if (r === 0) throw RuntimeError('División por cero', node.line);
              return l / r;
            case '%':
              if (r === 0) throw RuntimeError('Módulo por cero', node.line);
              return Math.trunc(l) % Math.trunc(r);
            case '^': return Math.pow(l, r);
            case '<': return l < r;
            case '>': return l > r;
            case '<=': return l <= r;
            case '>=': return l >= r;
            case '=': return l === r;
            case '<>': return l !== r;
          }
        }
      }
      return 0;
    }

    if (!ast.algorithm) throw RuntimeError('No se encontró el bloque Algoritmo', 0);
    await execBlock(ast.algorithm.body, globalScope);
  }

  // === Helpers ===
  function coerce(val, type, line, name) {
    if (type === 'entero') {
      if (typeof val === 'number') return Math.trunc(val);
      if (typeof val === 'boolean') return val ? 1 : 0;
      throw RuntimeError(`No se puede asignar ${typeof val} a variable Entero '${name}'`, line);
    }
    if (type === 'real') {
      if (typeof val === 'number') return val;
      throw RuntimeError(`No se puede asignar a variable Real '${name}'`, line);
    }
    if (type === 'caracter') {
      return String(val);
    }
    if (type === 'logico') {
      if (typeof val === 'boolean') return val;
      throw RuntimeError(`No se puede asignar valor no lógico a variable Logico '${name}'`, line);
    }
    return val;
  }

  function parseInput(text, type, line) {
    text = String(text || '').trim();
    if (type === 'entero') {
      if (!/^-?\d+$/.test(text)) throw RuntimeError(`Se esperaba un valor Entero, se leyó '${text}'`, line);
      return parseInt(text, 10);
    }
    if (type === 'real') {
      if (!/^-?\d+(\.\d+)?$/.test(text)) throw RuntimeError(`Se esperaba un valor Real, se leyó '${text}'`, line);
      return parseFloat(text);
    }
    if (type === 'logico') {
      const lower = text.toLowerCase();
      if (lower === 'verdadero' || lower === 'true') return true;
      if (lower === 'falso' || lower === 'false') return false;
      throw RuntimeError(`Se esperaba Verdadero/Falso, se leyó '${text}'`, line);
    }
    return text;
  }

  function buildArray(dims, level, type) {
    const { start, end } = dims[level];
    const size = end - start + 1;
    const arr = { __start: start };
    for (let i = 0; i < size; i++) {
      if (level === dims.length - 1) arr[i] = defaultValue(type);
      else arr[i] = buildArray(dims, level + 1, type);
    }
    return arr;
  }

  function getArrayValue(info, indices, line) {
    let cur = info.data;
    for (let i = 0; i < indices.length; i++) {
      const dim = info.dims[i];
      if (indices[i] < dim.start || indices[i] > dim.end) throw RuntimeError(`Índice ${indices[i]} fuera de rango [${dim.start}..${dim.end}]`, line);
      cur = cur[indices[i] - dim.start];
    }
    return cur;
  }

  function setArrayValue(info, indices, value, line) {
    let cur = info.data;
    for (let i = 0; i < indices.length - 1; i++) {
      const dim = info.dims[i];
      if (indices[i] < dim.start || indices[i] > dim.end) throw RuntimeError(`Índice ${indices[i]} fuera de rango [${dim.start}..${dim.end}]`, line);
      cur = cur[indices[i] - dim.start];
    }
    const li = indices.length - 1;
    const dim = info.dims[li];
    if (indices[li] < dim.start || indices[li] > dim.end) throw RuntimeError(`Índice ${indices[li]} fuera de rango [${dim.start}..${dim.end}]`, line);
    cur[indices[li] - dim.start] = value;
  }

  function builtInFunction(name) {
    const n = name.toLowerCase();
    switch (n) {
      case 'raiz': case 'rc': return args => Math.sqrt(args[0]);
      case 'abs': return args => Math.abs(args[0]);
      case 'trunc': return args => Math.trunc(args[0]);
      case 'redon': case 'round': return args => Math.round(args[0]);
      case 'sen': return args => Math.sin(args[0]);
      case 'cos': return args => Math.cos(args[0]);
      case 'tan': return args => Math.tan(args[0]);
      case 'exp': return args => Math.exp(args[0]);
      case 'ln': return args => Math.log(args[0]);
      case 'log': return args => Math.log10(args[0]);
      case 'azar': return args => Math.floor(Math.random() * args[0]);
      case 'longitud': return args => String(args[0]).length;
      case 'mayusculas': return args => String(args[0]).toUpperCase();
      case 'minusculas': return args => String(args[0]).toLowerCase();
      case 'concatenar': return args => String(args[0]) + String(args[1]);
      case 'subcadena': return args => String(args[0]).substring(args[1], args[2] + 1);
      case 'convertiratexto': return args => String(args[0]);
      case 'convertiranumero': return args => parseFloat(args[0]);
    }
    return null;
  }

  global.Interpreter = { run };
})(window);

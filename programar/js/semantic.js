/* ============================================================
 * Analizador Semántico — PSeInt en español
 * ============================================================ */
(function (global) {
  'use strict';

  function SemError(msg, line) {
    return { phase: 'Semántico', message: msg, line: line || 0, col: 0 };
  }

  function normalizeName(name) { return name.toLowerCase(); }

  function analyze(ast) {
    const errors = [];
    const subprograms = {};
    for (const sp of ast.subprograms) {
      const key = normalizeName(sp.name);
      if (subprograms[key]) errors.push(SemError(`Subprograma '${sp.name}' redeclarado`, sp.line));
      subprograms[key] = sp;
    }

    function newScope(parent) {
      return {
        parent,
        vars: {},
        functionName: parent ? parent.functionName : null,
        inLoop: parent ? parent.inLoop : 0,
      };
    }

    function findVar(scope, name) {
      const key = normalizeName(name);
      let s = scope;
      while (s) { if (s.vars[key]) return s.vars[key]; s = s.parent; }
      return null;
    }

    function declareVar(scope, name, info, line) {
      const key = normalizeName(name);
      if (Lexer.RESERVED_ALL.has(key)) {
        errors.push(SemError(`'${name}' es palabra reservada y no puede ser usada como identificador`, line));
        return;
      }
      if (scope.vars[key]) {
        errors.push(SemError(`Variable '${name}' redeclarada en el mismo ámbito`, line));
        return;
      }
      scope.vars[key] = info;
    }

    function isNumeric(t) { return t === 'entero' || t === 'real'; }
    function commonNumeric(a, b) { return (a === 'real' || b === 'real') ? 'real' : 'entero'; }

    // allowArray: permite que una variable sea arreglo sin índice (para pasar por referencia)
    function typeOfExpr(node, scope, allowArray = false) {
      if (!node) return 'unknown';
      switch (node.type) {
        case 'Number': return node.isReal ? 'real' : 'entero';
        case 'String': return 'caracter';
        case 'Boolean': return 'logico';
        case 'Variable': {
          const v = findVar(scope, node.name);
          if (!v) { errors.push(SemError(`Variable '${node.name}' no declarada`, node.line)); return 'unknown'; }
          if (v.isArray) {
            if (allowArray) return 'unknown'; // permitir pasar arreglo completo
            errors.push(SemError(`'${node.name}' es un arreglo, se requiere índice`, node.line));
            return 'unknown';
          }
          return v.type;
        }
        case 'Index': {
          const v = findVar(scope, node.name);
          if (!v) { errors.push(SemError(`Arreglo '${node.name}' no declarado`, node.line)); return 'unknown'; }
          // Permitir si es parámetro por referencia
          if (!v.isArray && !(v.isParam && v.byRef)) {
            errors.push(SemError(`'${node.name}' no es un arreglo`, node.line));
            return 'unknown';
          }
          const type = v.isArray ? v.type : 'unknown';
          if (v.dims && v.dims.length !== node.indices.length && !(v.isParam && v.byRef)) {
            errors.push(SemError(`'${node.name}' tiene ${v.dims.length} dimensiones, se dieron ${node.indices.length}`, node.line));
          }
          for (const idx of node.indices) {
            const t = typeOfExpr(idx, scope, false);
            if (t !== 'entero' && t !== 'unknown') errors.push(SemError(`Índices de arreglo deben ser enteros`, node.line));
          }
          return type;
        }
        case 'Call': {
          const sp = subprograms[normalizeName(node.name)];
          if (!sp) { errors.push(SemError(`Función/Subproceso '${node.name}' no declarado`, node.line)); return 'unknown'; }
          if (sp.params.length !== node.args.length) {
            errors.push(SemError(`'${node.name}' espera ${sp.params.length} argumentos, se dieron ${node.args.length}`, node.line));
          }
          for (const a of node.args) typeOfExpr(a, scope, false);
          return sp.type === 'Function' ? (sp.returnType || 'unknown') : 'unknown';
        }
        case 'Unary': {
          const t = typeOfExpr(node.arg, scope, false);
          if (node.op === '-') {
            if (!isNumeric(t) && t !== 'unknown') errors.push(SemError(`Operador unario '-' requiere número`, node.line));
            return t === 'unknown' ? 'unknown' : t;
          }
          if (node.op === 'NO') {
            if (t !== 'logico' && t !== 'unknown') errors.push(SemError(`Operador 'NO' requiere valor lógico`, node.line));
            return 'logico';
          }
          return 'unknown';
        }
        case 'Binary': {
          const lt = typeOfExpr(node.left, scope, false);
          const rt = typeOfExpr(node.right, scope, false);
          const op = node.op;
          if (['+','-','*','/','%','^'].includes(op)) {
            if (op === '+' && (lt === 'caracter' || rt === 'caracter')) return 'caracter';
            if ((isNumeric(lt) || lt === 'unknown') && (isNumeric(rt) || rt === 'unknown')) {
              if (op === '/') return 'real';
              if (op === '%') {
                if (lt === 'real' || rt === 'real') errors.push(SemError(`Operador % requiere enteros`, node.line));
                return 'entero';
              }
              return commonNumeric(lt === 'unknown' ? 'entero' : lt, rt === 'unknown' ? 'entero' : rt);
            }
            errors.push(SemError(`Operador '${op}' no aplicable a tipos ${lt} y ${rt}`, node.line));
            return 'unknown';
          }
          if (['<','>','<=','>=','=','<>'].includes(op)) {
            if (lt !== rt && !(isNumeric(lt) && isNumeric(rt)) && lt !== 'unknown' && rt !== 'unknown') {
              errors.push(SemError(`Comparación entre tipos incompatibles: ${lt} y ${rt}`, node.line));
            }
            return 'logico';
          }
          if (['Y','O'].includes(op)) {
            if (lt !== 'logico' && lt !== 'unknown') errors.push(SemError(`Operador '${op}' requiere lógicos`, node.line));
            if (rt !== 'logico' && rt !== 'unknown') errors.push(SemError(`Operador '${op}' requiere lógicos`, node.line));
            return 'logico';
          }
          return 'unknown';
        }
      }
      return 'unknown';
    }

    function checkAssignCompat(varType, valType, line, varName) {
      if (varType === 'unknown' || valType === 'unknown') return;
      if (varType === valType) return;
      if (varType === 'real' && valType === 'entero') return;
      errors.push(SemError(`No se puede asignar valor de tipo ${valType} a variable '${varName}' de tipo ${varType}`, line));
    }

    function checkBlock(stmts, scope) {
      for (const s of stmts) checkStmt(s, scope);
    }

    function checkStmt(s, scope) {
      if (!s) return;
      switch (s.type) {
        case 'Definir': {
          for (const n of s.names) declareVar(scope, n.name, { type: s.dataType, isConst: false, isArray: false }, n.line);
          return;
        }
        case 'Constant': {
          const t = typeOfExpr(s.value, scope, false);
          declareVar(scope, s.name, { type: t, isConst: true, isArray: false }, s.line);
          return;
        }
        case 'Dimension': {
          for (const arr of s.arrays) {
            const existing = findVar(scope, arr.name);
            if (existing && existing.isArray) {
              errors.push(SemError(`Arreglo '${arr.name}' redeclarado`, s.line));
            } else if (existing) {
              existing.isArray = true;
              existing.dims = arr.dims;
            } else {
              declareVar(scope, arr.name, { type: 'real', isConst: false, isArray: true, dims: arr.dims }, s.line);
            }
            for (const d of arr.dims) {
              const st = typeOfExpr(d.start, scope, false);
              const en = typeOfExpr(d.end, scope, false);
              if (st !== 'entero' && st !== 'unknown') errors.push(SemError(`Rango de arreglo debe ser entero`, s.line));
              if (en !== 'entero' && en !== 'unknown') errors.push(SemError(`Rango de arreglo debe ser entero`, s.line));
            }
          }
          return;
        }
        case 'Read': {
          for (const t of s.targets) {
            if (t.type === 'Variable') {
              const v = findVar(scope, t.name);
              if (!v) { errors.push(SemError(`Variable '${t.name}' no declarada`, t.line)); }
              else if (v.isConst) errors.push(SemError(`No se puede leer sobre constante '${t.name}'`, t.line));
            } else if (t.type === 'Index') {
              typeOfExpr(t, scope, false);
            }
          }
          return;
        }
        case 'Write': {
          for (const a of s.args) typeOfExpr(a, scope, false);
          return;
        }
        case 'Assign': {
          const valT = typeOfExpr(s.value, scope, false);
          if (s.target.type === 'Variable') {
            if (scope.functionName && normalizeName(scope.functionName) === normalizeName(s.target.name)) {
              const sp = subprograms[normalizeName(scope.functionName)];
              if (sp) sp.returnType = valT;
              return;
            }
            const v = findVar(scope, s.target.name);
            if (!v) { errors.push(SemError(`Variable '${s.target.name}' no declarada`, s.line)); return; }
            if (v.isConst) { errors.push(SemError(`No se puede asignar a la constante '${s.target.name}'`, s.line)); return; }
            if (v.isArray) { errors.push(SemError(`'${s.target.name}' es un arreglo, se requiere índice`, s.line)); return; }
            checkAssignCompat(v.type, valT, s.line, s.target.name);
          } else if (s.target.type === 'Index') {
            const v = findVar(scope, s.target.name);
            if (!v) { errors.push(SemError(`Arreglo '${s.target.name}' no declarado`, s.line)); return; }
            if (v.isConst) { errors.push(SemError(`No se puede asignar a constante '${s.target.name}'`, s.line)); return; }
            if (!v.isArray && !(v.isParam && v.byRef)) {
              errors.push(SemError(`'${s.target.name}' no es un arreglo`, s.line));
              return;
            }
            for (const idx of s.target.indices) {
              const it = typeOfExpr(idx, scope, false);
              if (it !== 'entero' && it !== 'unknown') errors.push(SemError(`Índices deben ser enteros`, s.line));
            }
            checkAssignCompat(v.type, valT, s.line, s.target.name);
          }
          return;
        }
        case 'If': {
          const ct = typeOfExpr(s.condition, scope, false);
          if (ct !== 'logico' && ct !== 'unknown') errors.push(SemError(`La condición del Si debe ser lógica`, s.line));
          checkBlock(s.thenBlock, scope);
          for (const ei of s.elseIfs) {
            const t = typeOfExpr(ei.condition, scope, false);
            if (t !== 'logico' && t !== 'unknown') errors.push(SemError(`La condición del SiNo Si debe ser lógica`, s.line));
            checkBlock(ei.body, scope);
          }
          if (s.elseBlock) checkBlock(s.elseBlock, scope);
          return;
        }
        case 'Switch': {
          typeOfExpr(s.discriminant, scope, false);
          for (const c of s.cases) {
            for (const v of c.values) typeOfExpr(v, scope, false);
            checkBlock(c.body, scope);
          }
          if (s.defaultBlock) checkBlock(s.defaultBlock, scope);
          return;
        }
        case 'While': {
          const t = typeOfExpr(s.condition, scope, false);
          if (t !== 'logico' && t !== 'unknown') errors.push(SemError(`Condición de Mientras debe ser lógica`, s.line));
          scope.inLoop++; checkBlock(s.body, scope); scope.inLoop--;
          return;
        }
        case 'Repeat': {
          scope.inLoop++; checkBlock(s.body, scope); scope.inLoop--;
          const t = typeOfExpr(s.condition, scope, false);
          if (t !== 'logico' && t !== 'unknown') errors.push(SemError(`Condición de Hasta Que debe ser lógica`, s.line));
          return;
        }
        case 'For': {
          const v = findVar(scope, s.variable);
          if (!v) {
            declareVar(scope, s.variable, { type: 'entero', isConst: false, isArray: false }, s.line);
          } else if (!isNumeric(v.type)) {
            errors.push(SemError(`Variable de control '${s.variable}' debe ser numérica`, s.line));
          }
          typeOfExpr(s.start, scope, false);
          typeOfExpr(s.end, scope, false);
          if (s.step) typeOfExpr(s.step, scope, false);
          scope.inLoop++; checkBlock(s.body, scope); scope.inLoop--;
          return;
        }
        case 'CallStmt': {
          const c = s.call;
          const sp = subprograms[normalizeName(c.name)];
          if (!sp) { errors.push(SemError(`Subproceso/Función '${c.name}' no declarado`, s.line)); return; }
          if (sp.params.length !== c.args.length) {
            errors.push(SemError(`'${c.name}' espera ${sp.params.length} argumentos, se dieron ${c.args.length}`, s.line));
          }
          for (let i = 0; i < c.args.length; i++) {
            const p = sp.params[i];
            if (p && p.byRef) {
              // Para parámetros por referencia, permitimos pasar un arreglo sin índice
              // y también permitimos variables normales
              const arg = c.args[i];
              if (arg.type === 'Variable') {
                const v = findVar(scope, arg.name);
                if (!v) { errors.push(SemError(`Variable '${arg.name}' no declarada`, s.line)); }
                // No verificamos si es arreglo, se permite
              } else if (arg.type === 'Index') {
                typeOfExpr(arg, scope, false); // validar índices
              } else {
                errors.push(SemError(`El argumento ${i+1} de '${c.name}' es Por Referencia y requiere una variable o índice`, s.line));
              }
            } else {
              // Paso por valor: evaluamos normal, pero permitimos arreglo? normalmente no, pero en PSeInt no se puede pasar arreglo por valor.
              typeOfExpr(c.args[i], scope, false);
            }
          }
          return;
        }
        case 'ClearScreen': case 'WaitKey': return;
        case 'Sleep': {
          const t = typeOfExpr(s.time, scope, false);
          if (!isNumeric(t) && t !== 'unknown') errors.push(SemError(`Esperar requiere un número positivo`, s.line));
          return;
        }
      }
    }

    function checkSubprogram(sp) {
      const scope = newScope(null);
      scope.functionName = sp.type === 'Function' ? sp.name : null;
      for (const p of sp.params) {
        declareVar(scope, p.name, {
          type: 'unknown',
          isConst: false,
          isArray: false,
          byRef: p.byRef,
          isParam: true
        }, p.line);
      }
      checkBlock(sp.body, scope);
      if (sp.type === 'Function' && !sp.returnType) {
        errors.push(SemError(`La función '${sp.name}' no asigna un valor de retorno`, sp.line));
      }
    }

    // Programa principal
    if (ast.algorithm) {
      const scope = newScope(null);
      checkBlock(ast.algorithm.body, scope);
    }
    for (const sp of ast.subprograms) checkSubprogram(sp);

    return { errors };
  }

  global.Semantic = { analyze };

})(window);
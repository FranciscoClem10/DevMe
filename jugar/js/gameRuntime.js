/* ============================================================
 * runtime.js — Ejecuta el AST paso a paso sobre el mundo.
 * Cada acción mueve al personaje y se refleja en el canvas.
 * ============================================================ */
(function(global){
'use strict';

const DIRS = ['arriba','derecha','abajo','izquierda'];
const DELTAS = { arriba:[0,-1], derecha:[1,0], abajo:[0,1], izquierda:[-1,0] };

function RuntimeError(msg, line){
  const e = new Error(msg);
  e.line = line||0;
  e.phase = 'Ejecución';
  return e;
}

function makeScope(parent){ return { parent, vars:{} }; }
function scopeGet(s, name){
  const k = name.toLowerCase();
  let c = s;
  while(c){ if(k in c.vars) return c.vars[k]; c = c.parent; }
  return undefined;
}
function scopeSet(s, name, v){
  const k = name.toLowerCase();
  let c = s;
  while(c){ if(k in c.vars){ c.vars[k]=v; return; } c = c.parent; }
  s.vars[k] = v;
}
function scopeDecl(s, name, v){ s.vars[name.toLowerCase()] = v; }

async function run(ast, world, ui, signal){
  const state = {
    ast, world, ui, signal,
    instrCount: 0,
    stepDelay: ui.getStepDelay,
    onStep: ui.onStep,
    stopped: false,
    paused: false,
    pauseResolve: null,
    error: null,
    log: (msg, cls) => ui.log(msg, cls)
  };
  // Exponer funciones de pausa/reanudar para la UI
  state.pause = function() {
    if (state.paused || state.stopped) return;
    state.paused = true;
    state._pausePromise = new Promise(resolve => { state.pauseResolve = resolve; });
    if (state.ui.onPause) state.ui.onPause();
  };
  state.resume = function() {
    if (!state.paused) return;
    state.paused = false;
    if (state.pauseResolve) { state.pauseResolve(); state.pauseResolve = null; }
    if (state.ui.onResume) state.ui.onResume();
  };
  state.togglePause = function() {
    if (state.paused) state.resume(); else state.pause();
  };
  window.__gameState = state;
  const subs = {};
  for(const sp of ast.subprograms) subs[sp.name.toLowerCase()] = sp;
  state.subs = subs;

  try {
    await execBlock(ast.algorithm.body, makeScope(null), state);
  } catch(e){
    if(e.message === 'Ejecución cancelada') return { cancelled:true, instrCount: state.instrCount };
    throw e;
  }
  return { ok:true, instrCount: state.instrCount };
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms||0)); }

async function execBlock(stmts, scope, state){
  for(const s of stmts){
    if(state.signal.aborted) throw new Error('Ejecución cancelada');
    // Check if paused - wait until resumed
    if(state.paused && state._pausePromise) await state._pausePromise;
    if(state.signal.aborted) throw new Error('Ejecución cancelada');
    if(s.line && state.onStep) state.onStep(s.line);
    const delay = typeof state.stepDelay === 'function' ? state.stepDelay() : state.stepDelay;
    if(delay > 0) await sleep(delay);
    if(state.signal.aborted) throw new Error('Ejecución cancelada');
    // Check pause again after delay
    if(state.paused && state._pausePromise) await state._pausePromise;
    const r = await execStmt(s, scope, state);
    if(r && r.type==='return') return r;
  }
  return null;
}

async function execStmt(s, scope, state){
  switch(s.type){
    case 'Define':
      for(const n of s.names){
        const dv = s.dataType==='logico' ? false : (s.dataType==='caracter' ? '' : 0);
        scopeDecl(scope, n, { type:s.dataType, value:dv });
      }
      return;
    case 'Assign': {
      const v = await evalExpr(s.value, scope, state);
      const existing = scopeGet(scope, s.name);
      if(existing){ existing.value = v; }
      else scopeDecl(scope, s.name, { type: typeof v==='number'?'entero':'caracter', value:v });
      return;
    }
    case 'Write': {
      let out = '';
      for(const a of s.args) out += formatValue(await evalExpr(a, scope, state));
      state.log(out, 'log-in');
      return;
    }
    case 'If': {
      const c = await evalExpr(s.condition, scope, state);
      if(c) return await execBlock(s.then, scope, state);
      for(const ei of s.elseIfs){
        if(await evalExpr(ei.condition, scope, state))
          return await execBlock(ei.body, scope, state);
      }
      if(s.elseBlock) return await execBlock(s.elseBlock, scope, state);
      return;
    }
    case 'Switch': {
      const d = await evalExpr(s.discriminant, scope, state);
      for(const c of s.cases){
        for(const v of c.values){
          if((await evalExpr(v, scope, state)) === d)
            return await execBlock(c.body, scope, state);
        }
      }
      if(s.defaultBlock) return await execBlock(s.defaultBlock, scope, state);
      return;
    }
    case 'While': {
      let guard = 0;
      while(await evalExpr(s.condition, scope, state)){
        if(state.signal.aborted) throw new Error('Ejecución cancelada');
        const r = await execBlock(s.body, scope, state);
        if(r && r.type==='return') return r;
        if(++guard > 2000) throw RuntimeError('Posible bucle infinito detectado (más de 2000 iteraciones)', s.line);
      }
      return;
    }
    case 'Repeat': {
      let guard = 0;
      while(true){
        const r = await execBlock(s.body, scope, state);
        if(r && r.type==='return') return r;
        if(await evalExpr(s.condition, scope, state)) break;
        if(++guard > 2000) throw RuntimeError('Posible bucle infinito detectado', s.line);
      }
      return;
    }
    case 'For': {
      const st = await evalExpr(s.start, scope, state);
      const en = await evalExpr(s.end, scope, state);
      const step = s.step ? await evalExpr(s.step, scope, state) : 1;
      if(step === 0) throw RuntimeError('El paso no puede ser 0', s.line);
      let vinfo = scopeGet(scope, s.variable);
      if(!vinfo){ scopeDecl(scope, s.variable, { type:'entero', value:st }); vinfo = scopeGet(scope, s.variable); }
      vinfo.value = st;
      const cmp = step > 0 ? (a,b) => a<=b : (a,b) => a>=b;
      let guard = 0;
      while(cmp(vinfo.value, en)){
        const r = await execBlock(s.body, scope, state);
        if(r && r.type==='return') return r;
        vinfo.value += step;
        if(++guard > 10000) throw RuntimeError('Posible bucle infinito detectado', s.line);
      }
      return;
    }
    case 'CallStmt': {
      await callFn(s.call, scope, state);
      return;
    }
  }
}

async function callFn(call, scope, state){
  const nameL = call.name.toLowerCase();
  // Comandos del juego (built-ins)
  if(BUILTINS[nameL]){
    const args = [];
    for(const a of call.args){
      // Para builtins, evaluamos normalmente; el identificador-respuesta
      // se maneja en evalExpr (devuelve su nombre como string).
      args.push(await evalExpr(a, scope, state));
    }
    const fn = BUILTINS[nameL];
    if(fn.length >= 3 && typeof fn === 'function' && fn.constructor.name === 'AsyncFunction'){
      return await fn(args, state, call.line);
    }
    return fn(args, state, call.line);
  }
  // Subprograma definido por el jugador
  const sp = state.subs[nameL];
  if(!sp) throw RuntimeError(`Función o comando no reconocido: '${call.name}'`, call.line);
  if(sp.params.length !== call.args.length)
    throw RuntimeError(`'${call.name}' espera ${sp.params.length} argumento(s), se recibieron ${call.args.length}`, call.line);
  const local = makeScope(null);
  for(let i=0; i<sp.params.length; i++){
    const v = await evalExpr(call.args[i], scope, state);
    scopeDecl(local, sp.params[i].name, { type: typeof v==='number'?'entero':'caracter', value:v });
  }
  if(sp.type==='Function' && sp.retVar){
    scopeDecl(local, sp.retVar, { type:'entero', value:0 });
  }
  await execBlock(sp.body, local, state);
  if(sp.type==='Function'){
    if(sp.retVar){ const rv = scopeGet(local, sp.retVar); return rv ? rv.value : 0; }
    const rv = scopeGet(local, sp.name); return rv ? rv.value : 0;
  }
  return null;
}

async function evalExpr(node, scope, state){
  if(state.signal.aborted) throw new Error('Ejecución cancelada');
  switch(node.type){
    case 'Number': return node.value;
    case 'String': return node.value;
    case 'Boolean': return node.value;
    case 'Variable': {
      const v = scopeGet(scope, node.name);
      if(v !== undefined) return v.value;
      // Si la variable no existe, devolver su nombre como texto.
      // Esto permite usar mover(derecha) sin comillas.
      return node.name;
    }
    case 'Call': return await callFn(node, scope, state);
    case 'Unary': {
      const v = await evalExpr(node.arg, scope, state);
      if(node.op==='-') return -v;
      if(node.op==='NO') return !v;
      return v;
    }
    case 'Binary': {
      const op = node.op;
      if(op==='Y'){ const l=await evalExpr(node.left,scope,state); if(!l) return false; return !!(await evalExpr(node.right,scope,state)); }
      if(op==='O'){ const l=await evalExpr(node.left,scope,state); if(l) return true; return !!(await evalExpr(node.right,scope,state)); }
      const l = await evalExpr(node.left, scope, state);
      const r = await evalExpr(node.right, scope, state);
      switch(op){
        case '+': if(typeof l==='string'||typeof r==='string') return String(formatValue(l))+String(formatValue(r)); return l+r;
        case '-': return l-r;
        case '*': return l*r;
        case '/': if(r===0) throw RuntimeError('División entre cero', node.line); return l/r;
        case 'MOD': case '%': if(r===0) throw RuntimeError('Módulo entre cero', node.line); return Math.trunc(l)%Math.trunc(r);
        case '^': return Math.pow(l,r);
        case '<': return l<r; case '>': return l>r;
        case '<=': return l<=r; case '>=': return l>=r;
        case '=': return l===r; case '<>': return l!==r;
      }
      break;
    }
  }
  return 0;
}

function formatValue(v){
  if(typeof v==='boolean') return v ? 'Verdadero' : 'Falso';
  if(v===null || v===undefined) return '';
  return String(v);
}

// ============= COMANDOS DEL JUEGO =============
async function doAction(state, line){
  state.instrCount++;
  state.ui.updateCounter(state.instrCount);
  state.ui.render();
  const delay = typeof state.stepDelay === 'function' ? state.stepDelay() : state.stepDelay;
  if(delay > 0) await sleep(delay);
  if(state.signal.aborted) throw new Error('Ejecución cancelada');
  // Verificar victoria
  if(state.ui.checkGoals()){
    state.stopped = true;
    throw new Error('__WIN__');
  }
}

function frontCell(world){
  const p = world.player;
  const [dx,dy] = DELTAS[p.dir];
  return { x: p.x + dx, y: p.y + dy };
}

function isWall(world, x, y){
  if(x<0 || y<0 || x>=world.W || y>=world.H) return true;
  if(world.walls.some(w => w.x===x && w.y===y)) return true;
  const d = world.doors.find(d => d.x===x && d.y===y);
  if(d && !d.open) return true;
  return false;
}
function hasBoxAt(world, x, y){ return world.boxes.some(b => b.x===x && b.y===y); }
function hasSwitchAt(world, x, y){ return world.switches.find(s => s.x===x && s.y===y); }
function hasDoorAt(world, x, y){ return world.doors.find(d => d.x===x && d.y===y); }

function normalizeDir(d){
  const s = String(d||'').toLowerCase().trim();
  if(['arriba','norte','n','up'].includes(s)) return 'arriba';
  if(['abajo','sur','s','down'].includes(s)) return 'abajo';
  if(['izquierda','oeste','w','left','izq'].includes(s)) return 'izquierda';
  if(['derecha','este','e','right','der'].includes(s)) return 'derecha';
  return null;
}

const BUILTINS = {
  // ---- Movimiento ----
  async avanzar(args, state, line){
    const w = state.world;
    const {x,y} = frontCell(w);
    if(isWall(w, x, y)) throw RuntimeError('No se puede avanzar: hay un muro o pared adelante', line);
    w.player.x = x;
    w.player.y = y;
    await doAction(state, line);
  },
  async mover(args, state, line){
    const dir = normalizeDir(args[0]);
    if(!dir) throw RuntimeError(`mover() requiere una dirección: arriba, abajo, izquierda o derecha. Se recibió: '${args[0]}'`, line);
    state.world.player.dir = dir;
    await BUILTINS.avanzar([], state, line);
  },
  async girar(args, state, line){
    const deg = Number(args[0]);
    if(isNaN(deg) || deg%90!==0) throw RuntimeError('girar() solo acepta múltiplos de 90 (ej: 90, -90, 180)', line);
    const p = state.world.player;
    let idx = DIRS.indexOf(p.dir);
    // girar(90) = izquierda (anti-horario), girar(-90) = derecha (horario)
    idx = (idx + Math.round(-deg/90) + 4) % 4;
    p.dir = DIRS[idx];
    await doAction(state, line);
  },

  // ---- Objetos ----
  async tomar(args, state, line){
    const w = state.world;
    if(w.player.carrying) throw RuntimeError('Ya llevas un objeto en el inventario', line);
    // Solo permitir tomar desde la misma casilla donde está el jugador
    const bidx = w.boxes.findIndex(b => b.x===w.player.x && b.y===w.player.y);
    if(bidx < 0) throw RuntimeError('No hay ningún objeto para tomar aquí (debes estar en la misma casilla)', line);
    w.player.carrying = w.boxes.splice(bidx, 1)[0];
    await doAction(state, line);
  },
  async soltar(args, state, line){
    const w = state.world;
    if(!w.player.carrying) throw RuntimeError('No llevas ningún objeto para soltar', line);
    const b = w.player.carrying;
    b.x = w.player.x;
    b.y = w.player.y;
    // Si se suelta sobre una meta, contar como entregada
    if(w.targets.some(t => t.x===b.x && t.y===b.y)){
      w.delivered++;
      w.deliveredAt.push({x:b.x, y:b.y});
    } else {
      w.boxes.push(b);
    }
    w.player.carrying = null;
    await doAction(state, line);
  },
  async activar(args, state, line){
    const w = state.world;
    // Solo permitir activar desde la misma casilla del interruptor
    const sw = hasSwitchAt(w, w.player.x, w.player.y);
    if(!sw) throw RuntimeError('No hay ningún interruptor aquí para activar (debes estar en la misma casilla)', line);
    sw.active = true;
    if(sw.targets){
      for(const t of sw.targets){
        const d = w.doors.find(d => d.x===t.x && d.y===t.y);
        if(d) d.open = true;
      }
    }
    await doAction(state, line);
  },
  async desactivar(args, state, line){
    const w = state.world;
    const sw = hasSwitchAt(w, w.player.x, w.player.y);
    if(!sw) throw RuntimeError('No hay ningún interruptor aquí para desactivar', line);
    sw.active = false;
    if(sw.targets){
      for(const t of sw.targets){
        const d = w.doors.find(d => d.x===t.x && d.y===t.y);
        if(d) d.open = false;
      }
    }
    await doAction(state, line);
  },
  async abrir(args, state, line){
    const w = state.world;
    const d = hasDoorAt(w, frontCell(w).x, frontCell(w).y);
    if(!d) throw RuntimeError('No hay ninguna puerta adelante para abrir', line);
    if(d.open){ state.log('La puerta ya está abierta.', 'log-info'); await doAction(state, line); return; }
    d.open = true;
    await doAction(state, line);
  },
  async cerrar(args, state, line){
    const w = state.world;
    const d = hasDoorAt(w, frontCell(w).x, frontCell(w).y);
    if(!d) throw RuntimeError('No hay ninguna puerta adelante para cerrar', line);
    d.open = false;
    await doAction(state, line);
  },
  async usar(args, state, line){
    const w = state.world;
    const f = frontCell(w);
    // Intentar puerta (desde la casilla de enfrente, lógica actual)
    const d = hasDoorAt(w, f.x, f.y);
    if(d){ d.open = !d.open; await doAction(state, line); return; }
    // Intentar switch (solo desde la misma casilla)
    const sw = hasSwitchAt(w, w.player.x, w.player.y);
    if(sw){
      sw.active = !sw.active;
      if(sw.targets) sw.targets.forEach(t => { const dd = w.doors.find(d => d.x===t.x && d.y===t.y); if(dd) dd.open = sw.active; });
      await doAction(state, line);
      return;
    }
    throw RuntimeError('No hay nada interactuable aquí', line);
  },
  async esperar(args, state, line){
    const t = Math.min(Number(args[0])||1, 5);
    await sleep(t * 300);
    state.instrCount++;
    state.ui.updateCounter(state.instrCount);
  },
  async decir(args, state, line){
    const msg = String(args[0] || '...');
    state.ui.sayBubble(msg);
    state.log(`💬 ${msg}`, 'log-info');
    await sleep(400);
  },

  // ---- Consultas (devuelven valor lógico) ----
  frentelibre(args, state){
    const {x,y} = frontCell(state.world);
    return !isWall(state.world, x, y);
  },
  hayobjeto(args, state){
    const {x,y} = frontCell(state.world);
    return hasBoxAt(state.world, x, y);
  },
  haycaja(args, state){
    const {x,y} = frontCell(state.world);
    return hasBoxAt(state.world, x, y);
  },
  haypuerta(args, state){
    const {x,y} = frontCell(state.world);
    return !!hasDoorAt(state.world, x, y);
  },
  puertaabierta(args, state){
    const {x,y} = frontCell(state.world);
    const d = hasDoorAt(state.world, x, y);
    return d ? d.open : false;
  },
  hayenemigo(){ return false; },
  hayswitch(args, state){
    const p = state.world.player;
    return !!hasSwitchAt(state.world, p.x, p.y);
  },
  inventariolleno(args, state){ return !!state.world.player.carrying; },
  llevoobjeto(args, state){ return !!state.world.player.carrying; },
  objetivocompleto(args, state){ return state.ui.checkGoalsSilent(); },

  // ---- Estado del jugador (consultas) ----
  posicionx(args, state){ return state.world.player.x; },
  posiciony(args, state){ return state.world.player.y; },
  direccionj(args, state){ return state.world.player.dir; },
  cajasentregadas(args, state){ return state.world.delivered; },
  cajasrestantes(args, state){ return state.world.boxesToCollect - state.world.delivered; },
  haycajaen(args, state){
    const x = Number(args[0]), y = Number(args[1]);
    if(isNaN(x)||isNaN(y)) return false;
    return hasBoxAt(state.world, x, y);
  },

  // ---- Utilidades matemáticas ----
  azar(args){ return Math.floor(Math.random() * (Number(args[0])||1)); },
  abs(args){ return Math.abs(Number(args[0])); },
  raiz(args){ return Math.sqrt(Number(args[0])); }
};

// Exponer lista de funciones built-in del juego para el analizador semántico
global.GAME_BUILTINS = Object.keys(BUILTINS);
// Exponer el objeto BUILTINS completo para que el interpreter pueda ejecutarlas
global.GAME_BUILTINS_OBJ = BUILTINS;

global.GameRuntime = { run, BUILTINS };

})(window);

/* ============================================================
 * gameRuntime.js — Ejecuta el AST paso a paso sobre el mundo.
 * Soporta: inventario LIFO, llaves, ítems, NPCs, placas de
 * presión, láseres, Leer por consola, entregar(), etc.
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

  // Calcular haces de láser al inicio
  recalcLaserBeams(world);

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
    if(state.paused && state._pausePromise) await state._pausePromise;
    if(state.signal.aborted) throw new Error('Ejecución cancelada');
    if(s.line && state.onStep) state.onStep(s.line);
    const delay = typeof state.stepDelay === 'function' ? state.stepDelay() : state.stepDelay;
    if(delay > 0) await sleep(delay);
    if(state.signal.aborted) throw new Error('Ejecución cancelada');
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
    case 'Read': {
      // Leer variable por consola
      for(const t of s.targets){
        if(t.type === 'Variable'){
          const val = await state.ui.read(t.name);
          const existing = scopeGet(scope, t.name);
          if(existing){
            // Convertir según tipo
            if(existing.type === 'entero') existing.value = parseInt(val, 10) || 0;
            else if(existing.type === 'real') existing.value = parseFloat(val) || 0;
            else if(existing.type === 'logico') existing.value = (val.toLowerCase() === 'verdadero' || val === 'true' || val === '1');
            else existing.value = val;
          } else {
            scopeDecl(scope, t.name, { type: typeof val==='number'?'entero':'caracter', value:val });
          }
        }
      }
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
  if(BUILTINS[nameL]){
    const args = [];
    for(const a of call.args){
      args.push(await evalExpr(a, scope, state));
    }
    const fn = BUILTINS[nameL];
    if(fn.length >= 3 && typeof fn === 'function' && fn.constructor.name === 'AsyncFunction'){
      return await fn(args, state, call.line);
    }
    return fn(args, state, call.line);
  }
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

// ============= ACCIÓN POST-MOVIMIENTO =============
async function doAction(state, line){
  state.instrCount++;
  state.ui.updateCounter(state.instrCount);
  // Recalcular placas de presión y láseres después de cada acción
  recalcPressurePlates(state.world);
  recalcLaserBeams(state.world);
  // Verificar si el jugador está en un haz de láser
  checkLaserDeath(state.world, line);
  // Auto-diálogo: si el jugador está adyacente a un NPC y lo mira, mostrar diálogo
  autoNPCDialog(state);
  state.ui.render();
  const delay = typeof state.stepDelay === 'function' ? state.stepDelay() : state.stepDelay;
  if(delay > 0) await sleep(delay);
  if(state.signal.aborted) throw new Error('Ejecución cancelada');
  if(state.paused && state._pausePromise) await state._pausePromise;
  if(state.signal.aborted) throw new Error('Ejecución cancelada');
  // Verificar objetivos después de cada acción
  if(state.ui.checkGoals()){
    state.stopped = true;
    throw new Error('__WIN__');
  }
}

// Muestra automáticamente el diálogo de un NPC si el jugador está enfrente y mirando
function autoNPCDialog(state){
  const w = state.world;
  if(!w.npcs || w.npcs.length === 0) return;
  const fc = frontCell(w);
  const npc = hasNPCAt(w, fc.x, fc.y);
  if(!npc) return;
  // Construir mensaje
  let msg = 'NPC: ';
  const needs = [];
  if(npc.requiredItems && npc.requiredItems.length > 0){
    const remaining = npc.requiredItems.filter(r => {
      return !npc.received.items.some(ri => ri.type === r || ri.id === r);
    });
    if(remaining.length > 0){
      needs.push('necesito: ' + remaining.join(', '));
    }
  }
  if(npc.requiredBoxes > 0){
    const remainingBoxes = npc.requiredBoxes - npc.received.boxes;
    if(remainingBoxes > 0){
      needs.push('necesito ' + remainingBoxes + ' caja(s)');
    }
  }
  if(needs.length === 0){
    msg += '¡Gracias! Ya tengo todo.';
  } else {
    msg += needs.join(' y ') + '.';
  }
  state.ui.sayBubble(msg);
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
  // Los NPCs bloquean el paso (no se puede caminar sobre ellos)
  if((world.npcs || []).some(n => n.x===x && n.y===y)) return true;
  return false;
}
function hasBoxAt(world, x, y){ return world.boxes.some(b => b.x===x && b.y===y); }
function hasSwitchAt(world, x, y){ return world.switches.find(s => s.x===x && s.y===y); }
function hasDoorAt(world, x, y){ return world.doors.find(d => d.x===x && d.y===y); }
function hasItemAt(world, x, y){ return (world.items || []).find(it => it.x===x && it.y===y); }
function hasNPCAt(world, x, y){ return (world.npcs || []).find(n => n.x===x && n.y===y); }

function normalizeDir(d){
  const s = String(d||'').toLowerCase().trim();
  if(['arriba','norte','n','up'].includes(s)) return 'arriba';
  if(['abajo','sur','s','down'].includes(s)) return 'abajo';
  if(['izquierda','oeste','w','left','izq'].includes(s)) return 'izquierda';
  if(['derecha','este','e','right','der'].includes(s)) return 'derecha';
  return null;
}

// ============= PLACAS DE PRESIÓN =============
function recalcPressurePlates(world){
  if(!world.pressurePlates) return;
  for(const pp of world.pressurePlates){
    // Contar cajas sobre esta placa
    const boxesOnPlate = world.boxes.filter(b => b.x===pp.x && b.y===pp.y).length;
    const wasActive = pp.active;
    pp.active = boxesOnPlate >= pp.cajasRequeridas;
    // Si cambió el estado, enviar señal a targets
    if(pp.active !== wasActive){
      applySignal(world, pp.targets, pp.active);
    }
  }
}

// ============= LÁSERES =============
function recalcLaserBeams(world){
  world.laserBeams = [];
  if(!world.lasers) return;
  for(const laser of world.lasers){
    if(!laser.active) continue;
    const dirMap = {
      'norte': [0,-1], 'arriba': [0,-1],
      'sur': [0,1], 'abajo': [0,1],
      'este': [1,0], 'derecha': [1,0],
      'oeste': [-1,0], 'izquierda': [-1,0]
    };
    const [dx,dy] = dirMap[laser.dir] || [1,0];
    let cx = laser.x + dx;
    let cy = laser.y + dy;
    while(cx>=0 && cy>=0 && cx<world.W && cy<world.H){
      // Detener en pared
      if(world.walls.some(w => w.x===cx && w.y===cy)) break;
      // Detener en caja
      if(world.boxes.some(b => b.x===cx && b.y===cy)) break;
      world.laserBeams.push({x:cx, y:cy});
      cx += dx;
      cy += dy;
    }
  }
}

function checkLaserDeath(world, line){
  if(!world.laserBeams) return;
  const px = world.player.x, py = world.player.y;
  if(world.laserBeams.some(b => b.x===px && b.y===py)){
    throw RuntimeError('¡El jugador ha sido alcanzado por un láser!', line);
  }
}

// ============= SEÑALES (interruptores, placas, NPCs) =============
function applySignal(world, targets, activate){
  if(!targets) return;
  for(const t of targets){
    if(t.type === 'laser'){
      // Los interruptores desactivan los láseres (lógica invertida)
      const laser = (world.lasers||[]).find(l => l.x===t.x && l.y===t.y);
      if(laser) laser.active = !activate;
    } else {
      // Por defecto: abrir/cerrar puerta
      const d = world.doors.find(d => d.x===t.x && d.y===t.y);
      if(d) d.open = activate;
    }
  }
}

// Verifica si una puerta tiene targets de señal (interruptor, placa, NPC)
function _doorHasSignalTargets(world, door){
  // Buscar en switches
  if(world.switches){
    for(const sw of world.switches){
      if(sw.targets && sw.targets.some(t => t.x===door.x && t.y===door.y && t.type!=='laser')) return true;
    }
  }
  // Buscar en placas de presión
  if(world.pressurePlates){
    for(const pp of world.pressurePlates){
      if(pp.targets && pp.targets.some(t => t.x===door.x && t.y===door.y)) return true;
    }
  }
  // Buscar en NPCs
  if(world.npcs){
    for(const npc of world.npcs){
      if(npc.targets && npc.targets.some(t => t.x===door.x && t.y===door.y)) return true;
    }
  }
  return false;
}

// ============= COMANDOS DEL JUEGO =============
const BUILTINS = {
  // ---- Movimiento ----
  async avanzar(args, state, line){
    const w = state.world;
    const {x,y} = frontCell(w);
    if(isWall(w, x, y)) throw RuntimeError('No se puede avanzar: hay un muro o pared adelante', line);
    // Verificar láser en casilla destino
    if(w.laserBeams && w.laserBeams.some(b => b.x===x && b.y===y)){
      w.player.x = x; w.player.y = y;
      throw RuntimeError('¡El jugador ha entrado en un haz de láser!', line);
    }
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
    idx = (idx + Math.round(-deg/90) + 4) % 4;
    p.dir = DIRS[idx];
    await doAction(state, line);
  },
  async empujar(args, state, line){
    const w = state.world;
    const {x,y} = frontCell(w);
    // Debe haber una caja enfrente
    const boxIdx = w.boxes.findIndex(b => b.x===x && b.y===y);
    if(boxIdx < 0) throw RuntimeError('No hay ninguna caja enfrente para empujar', line);
    // La casilla detrás de la caja (en la dirección del jugador) debe estar libre
    const [dx,dy] = DELTAS[w.player.dir];
    const behindX = x + dx, behindY = y + dy;
    if(isWall(w, behindX, behindY)) throw RuntimeError('No se puede empujar la caja: hay una pared detrás', line);
    if(hasBoxAt(w, behindX, behindY)) throw RuntimeError('No se puede empujar la caja: hay otra caja detrás', line);
    // Verificar láser en la casilla destino de la caja
    if(w.laserBeams && w.laserBeams.some(b => b.x===behindX && b.y===behindY)){
      throw RuntimeError('No se puede empujar la caja hacia un haz de láser', line);
    }
    // Mover la caja
    w.boxes[boxIdx].x = behindX;
    w.boxes[boxIdx].y = behindY;
    // Mover el jugador a la casilla de la caja
    w.player.x = x;
    w.player.y = y;
    await doAction(state, line);
  },

  // ---- Objetos (tomar unificado: llaves, ítems, cajas) ----
  async tomar(args, state, line){
    const w = state.world;
    const px = w.player.x, py = w.player.y;
    // 1. Intentar recoger llave o ítem del suelo
    const itemIdx = (w.items||[]).findIndex(it => it.x===px && it.y===py);
    if(itemIdx >= 0){
      const item = w.items.splice(itemIdx, 1)[0];
      w.inventory.push({ type: item.type, id: item.id });
      state.log(`Recogido: ${item.type} (${item.id})`, 'log-info');
      await doAction(state, line);
      return;
    }
    // 2. Intentar cargar una caja
    const bidx = w.boxes.findIndex(b => b.x===px && b.y===py);
    if(bidx >= 0){
      if(w.player.carrying) throw RuntimeError('Ya llevas una caja. No puedes cargar otra.', line);
      w.player.carrying = w.boxes.splice(bidx, 1)[0];
      await doAction(state, line);
      return;
    }
    throw RuntimeError('No hay ningún objeto para tomar aquí (debes estar en la misma casilla)', line);
  },
  async soltar(args, state, line){
    const w = state.world;
    if(!w.player.carrying) throw RuntimeError('No llevas ningún objeto para soltar', line);
    const b = w.player.carrying;
    b.x = w.player.x;
    b.y = w.player.y;
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
    const sw = hasSwitchAt(w, w.player.x, w.player.y);
    if(sw){
      sw.active = true;
      if(sw.targets) applySignal(w, sw.targets, true);
      await doAction(state, line);
      return;
    }
    throw RuntimeError('No hay ningún interruptor aquí para activar (debes estar en la misma casilla)', line);
  },
  async desactivar(args, state, line){
    const w = state.world;
    const sw = hasSwitchAt(w, w.player.x, w.player.y);
    if(sw){
      sw.active = false;
      if(sw.targets) applySignal(w, sw.targets, false);
      await doAction(state, line);
      return;
    }
    throw RuntimeError('No hay ningún interruptor aquí para desactivar', line);
  },
  async abrir(args, state, line){
    const w = state.world;
    const fc = frontCell(w);
    const d = hasDoorAt(w, fc.x, fc.y);
    if(!d) throw RuntimeError('No hay ninguna puerta adelante para abrir', line);
    if(d.open){ state.log('La puerta ya está abierta.', 'log-info'); await doAction(state, line); return; }
    if(d.locked){
      // Si la puerta tiene targets de señal, no se puede abrir con llave
      const hasSignalTargets = _doorHasSignalTargets(w, d);
      if(hasSignalTargets){
        throw RuntimeError('Esta puerta está controlada por una señal. Usa el activador correspondiente.', line);
      }
      // Buscar llave en el inventario (LIFO - cima de la pila)
      const keyIdx = findLastIndex(w.inventory, it => it.type === 'llave');
      if(keyIdx < 0) throw RuntimeError('La puerta está bloqueada. Necesitas una llave.', line);
      w.inventory.splice(keyIdx, 1); // consumir llave
      state.log('Llave consumida. Puerta desbloqueada.', 'log-info');
    }
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
  async entregar(args, state, line){
    const w = state.world;
    const fc = frontCell(w);
    const npc = hasNPCAt(w, fc.x, fc.y);
    if(!npc) throw RuntimeError('No hay un NPC enfrente para entregar. Debes estar mirando hacia él.', line);
    // Intentar entregar caja
    if(w.player.carrying && npc.acceptsCrates){
      w.player.carrying = null;
      npc.received.boxes++;
      state.log('Caja entregada al NPC.', 'log-info');
      checkNPCCompletion(w, npc, state);
      await doAction(state, line);
      return;
    }
    // Intentar entregar ítem de la pila (LIFO)
    if(w.inventory.length > 0){
      const topItem = w.inventory[w.inventory.length - 1];
      // Verificar si el NPC acepta este tipo de ítem
      const reqIdx = npc.requiredItems.indexOf(topItem.type);
      const reqIdIdx = npc.requiredItems.indexOf(topItem.id);
      if(reqIdx >= 0 || reqIdIdx >= 0){
        w.inventory.pop();
        npc.received.items.push(topItem);
        state.log(`Ítem entregado al NPC: ${topItem.type}`, 'log-info');
        checkNPCCompletion(w, npc, state);
        await doAction(state, line);
        return;
      }
      throw RuntimeError('El NPC no acepta este objeto en la cima de tu inventario', line);
    }
    throw RuntimeError('No tienes nada para entregar al NPC', line);
  },
  async usar(args, state, line){
    const w = state.world;
    const f = frontCell(w);
    const d = hasDoorAt(w, f.x, f.y);
    if(d){
      if(!d.open && !d.locked) { d.open = true; await doAction(state, line); return; }
      if(d.open) { d.open = false; await doAction(state, line); return; }
      if(d.locked) { state.log('La puerta está bloqueada. Necesitas una llave o una señal.', 'log-info'); await doAction(state, line); return; }
    }
    const sw = hasSwitchAt(w, w.player.x, w.player.y);
    if(sw){
      const newState = !sw.active;
      sw.active = newState;
      if(sw.targets) applySignal(w, sw.targets, newState);
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
    state.log(msg, 'log-info');
    await sleep(400);
  },
  async hablar(args, state, line){
    const w = state.world;
    const fc = frontCell(w);
    const npc = hasNPCAt(w, fc.x, fc.y);
    if(!npc) throw RuntimeError('No hay un NPC enfrente para hablar. Debes estar mirando hacia él.', line);
    // Construir mensaje de diálogo del NPC
    let msg = 'NPC: ';
    const needs = [];
    if(npc.requiredItems && npc.requiredItems.length > 0){
      const remaining = npc.requiredItems.filter(r => {
        return !npc.received.items.some(ri => ri.type === r || ri.id === r);
      });
      if(remaining.length > 0){
        needs.push('necesito: ' + remaining.join(', '));
      }
    }
    if(npc.requiredBoxes > 0){
      const remainingBoxes = npc.requiredBoxes - npc.received.boxes;
      if(remainingBoxes > 0){
        needs.push('necesito ' + remainingBoxes + ' caja(s)');
      }
    }
    if(needs.length === 0){
      msg += '¡Gracias! Ya tengo todo lo que necesitaba.';
    } else {
      msg += 'Hola, ' + needs.join(' y ') + '.';
    }
    state.ui.sayBubble(msg);
    state.log(msg, 'log-info');
    await doAction(state, line);
  },

  // ---- Consultas (devuelven valor lógico) ----
  frentelibre(args, state){
    const {x,y} = frontCell(state.world);
    // Una casilla es libre si no hay pared (las cajas son caminables)
    return !isWall(state.world, x, y);
  },
  hayobjeto(args, state){
    const {x,y} = frontCell(state.world);
    return hasBoxAt(state.world, x, y) || hasItemAt(state.world, x, y);
  },
  haycaja(args, state){
    const {x,y} = frontCell(state.world);
    return hasBoxAt(state.world, x, y);
  },
  hayitem(args, state){
    const {x,y} = frontCell(state.world);
    return !!hasItemAt(state.world, x, y);
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
  puertabloqueada(args, state){
    const {x,y} = frontCell(state.world);
    const d = hasDoorAt(state.world, x, y);
    return d ? !!d.locked : false;
  },
  puertaprotegida(args, state){
    const {x,y} = frontCell(state.world);
    const d = hasDoorAt(state.world, x, y);
    if(!d) return false;
    // Una puerta se considera "protegida" (controlada por señal) si es bloqueada y tiene targets
    return d.locked && _doorHasSignalTargets(state.world, d);
  },
  hayenemigo(){ return false; },
  hayswitch(args, state){
    const p = state.world.player;
    return !!hasSwitchAt(state.world, p.x, p.y);
  },
  haynpc(args, state){
    const {x,y} = frontCell(state.world);
    return !!hasNPCAt(state.world, x, y);
  },
  inventariolleno(args, state){ return !!state.world.player.carrying || (state.world.inventory||[]).length > 0; },
  llevoobjeto(args, state){ return !!state.world.player.carrying || (state.world.inventory||[]).length > 0; },
  llevocaja(args, state){ return !!state.world.player.carrying; },
  llevollave(args, state){
    return (state.world.inventory||[]).some(it => it.type === 'llave');
  },
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
  hayitemen(args, state){
    const x = Number(args[0]), y = Number(args[1]);
    if(isNaN(x)||isNaN(y)) return false;
    return !!hasItemAt(state.world, x, y);
  },

  // ---- Utilidades matemáticas ----
  azar(args){ return Math.floor(Math.random() * (Number(args[0])||1)); },
  abs(args){ return Math.abs(Number(args[0])); },
  raiz(args){ return Math.sqrt(Number(args[0])); }
};

// Helper: encontrar último índice con condición
function findLastIndex(arr, fn){
  for(let i=arr.length-1; i>=0; i--){
    if(fn(arr[i])) return i;
  }
  return -1;
}

// Verificar si un NPC completó sus requisitos
function checkNPCCompletion(world, npc, state){
  const itemsDone = npc.received.items.length >= npc.requiredItems.length;
  const boxesDone = npc.received.boxes >= npc.requiredBoxes;
  if(itemsDone && boxesDone && !npc.completed){
    npc.completed = true;
    state.log('NPC satisfecho. Activando mecanismos...', 'log-info');
    if(npc.targets) applySignal(world, npc.targets, true);
  }
}

// Exponer lista de funciones built-in del juego
global.GAME_BUILTINS = Object.keys(BUILTINS);
global.GAME_BUILTINS_OBJ = BUILTINS;

global.GameRuntime = { run, BUILTINS };

})(window);

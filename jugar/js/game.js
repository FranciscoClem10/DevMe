/* ============================================================
 * game.js — Controlador del juego integrado en DevMe
 * Soporta: ui.read(), reinicio de nivel tras error,
 * verificación de objetivos con NPCs, llaves, ítems, etc.
 * ============================================================ */
(function(){
'use strict';

const $ = id => document.getElementById(id);
const gameCanvas = $('game-canvas');
const gameOverlay = $('game-overlay');
const gameSpeed = $('game-speed');
const gameSpeedLbl = $('game-speed-lbl');

let currentLevelIdx = parseInt(localStorage.getItem('cq_level')||'0',10);
if(currentLevelIdx >= LEVELS.length) currentLevelIdx = 0;
let world = null;
let initialWorld = null; // copia del estado inicial para reinicio
let controller = null;
const renderer = makeRenderer(gameCanvas);
let highlightLine = -1;
let userCodeBackup = null;
let enemyPatrolInterval = null; // idle enemy patrol timer

function tradError(msg){
  const map = {
    'Expected': 'Se esperaba',
    'Unexpected': 'No se esperaba',
    'Undefined variable': 'Variable no definida',
    'Division by zero': 'Division entre cero',
    'Maximum recursion depth': 'Se excedio la recursion maxima',
    'Unknown command': 'Comando no reconocido',
    'Missing': 'Falta',
    'Unexpected end': 'Fin inesperado',
    'Expected end': 'Se esperaba el cierre',
    'Cannot advance': 'No se puede avanzar',
    'wall': 'pared',
    'No box': 'No hay caja',
    'Already carrying': 'Ya llevas un objeto',
    'Not carrying': 'No llevas ningun objeto',
    'No switch': 'No hay interruptor',
    'No door': 'No hay puerta',
    'Invalid direction': 'Direccion no valida',
  };
  let result = msg;
  for(const [en, es] of Object.entries(map)){
    result = result.replace(new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), es);
  }
  return result;
}

// -------------- Carga de niveles --------------
function loadLevel(idx, isReset){
  currentLevelIdx = idx;
  localStorage.setItem('cq_level', String(idx));
  const def = LEVELS[idx];
  world = buildLevel(def);
  initialWorld = cloneWorld(world);
  highlightLine = -1;
  $('game-level-title').textContent = `Nivel ${def.id}: ${def.name}`;
  $('game-level-label').textContent = def.id;
  $('game-desc').textContent = def.desc;
  const levelNameTab = $('game-level-name-tab');
  if (levelNameTab) levelNameTab.textContent = def.name;
  renderGoals();
  renderHints();
  updateStarsDisplay();
  renderer.setWorld(world);
  setGameStatus('idle','Listo');
  updateInstrCount(0);
  hideGameOverlay();

  // Start enemy idle patrol
  startEnemyPatrol();

  if (!isReset && def.starter && typeof window.loadStarterCode === 'function') {
    window.loadStarterCode(def.starter);
  }
}

function renderGoals(){
  const c = $('game-goals');
  if(!c) return;
  c.innerHTML = '';
  world.def.goals.forEach((g,i)=>{
    const d = document.createElement('div');
    d.className = 'game-goal-item';
    d.innerHTML = `<span class="material-symbols-outlined">radio_button_unchecked</span><span>${g}</span>`;
    d.dataset.goal = i;
    c.appendChild(d);
  });
}

function renderHints(){
  const c = $('game-hints');
  if(!c) return;
  c.innerHTML = '';
  (world.def.hints||[]).forEach((h,i)=>{
    const d = document.createElement('details');
    d.style.cssText = 'background:rgba(244,192,37,0.1);border-radius:0.4rem;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.75rem;';
    d.innerHTML = `<summary style="cursor:pointer;font-weight:600;color:#b8860b;">Pista ${i+1}</summary><p style="margin:0.3rem 0 0;color:#6b5a2e;">${h}</p>`;
    c.appendChild(d);
  });
}

function updateGoalsUI(){
  const items = $('game-goals') ? $('game-goals').querySelectorAll('.game-goal-item') : [];
  const st = getGoalsState();
  items.forEach((it,i)=>{
    if(st[i]){
      it.classList.add('done');
      it.querySelector('.material-symbols-outlined').textContent = 'check_circle';
    } else {
      it.classList.remove('done');
      it.querySelector('.material-symbols-outlined').textContent = 'radio_button_unchecked';
    }
  });
}

function getGoalsState(){
  if(!world || !world.def) return [];
  const def = world.def;
  const st = [];
  for(let i=0;i<def.goals.length;i++){
    const g = def.goals[i].toLowerCase();
    if(g.includes('tomar la caja') || g.includes('tomar caja')){
      st[i] = !!world.player.carrying || world.delivered>0 || (world.inventory && world.inventory.length > 0);
    } else if(g.includes('recoger la llave') || g.includes('recoger llave')){
      st[i] = (world.inventory||[]).some(it => it.type === 'llave') || world.delivered > 0;
    } else if(g.includes('recoger el') && g.includes('item')){
      st[i] = (world.inventory||[]).some(it => it.type === 'item') || world.delivered > 0;
    } else if(g.includes('activar') && g.includes('interruptor')){
      st[i] = world.switches.some(s=>s.active);
    } else if(g.includes('activar') && g.includes('placa')){
      st[i] = (world.pressurePlates||[]).some(pp=>pp.active);
    } else if((g.includes('desactivar') || g.includes('desactivar')) && g.includes('laser')){
      st[i] = world.lasers.length > 0 && (world.lasers||[]).every(l=>!l.active);
    } else if(g.includes('entregar') && (g.includes('npc') || g.includes('al npc'))){
      st[i] = (world.npcs||[]).some(n=>n.completed);
    } else if(g.includes('abrir') && g.includes('bloqueada')){
      st[i] = world.doors.some(d => d.locked && d.open);
    } else if(g.includes('activar')){
      st[i] = world.switches.some(s=>s.active) || (world.pressurePlates||[]).some(pp=>pp.active);
    } else if(g.includes('recoger') && g.match(/\d+/)){
      const n = parseInt(g.match(/\d+/)[0],10);
      st[i] = (world.boxesToCollect - world.boxes.length) >= n || world.delivered >= n;
    } else if(g.includes('depositar') || g.includes('con la caja')){
      if(g.match(/\d+/)){
        const n = parseInt(g.match(/\d+/)[0],10);
        st[i] = world.delivered >= n;
      } else if(g.includes('todas')){
        st[i] = world.delivered >= world.boxesToCollect;
      } else {
        st[i] = world.delivered >= 1;
      }
    } else if(g.includes('llegar') || g.includes('meta')){
      st[i] = world.targets.some(t=>t.x===world.player.x && t.y===world.player.y);
    } else if(g.includes('empujar') && g.includes('placa')){
      st[i] = (world.pressurePlates||[]).some(pp=>pp.active);
    } else if(g.includes('derrotar') && g.includes('enemigo')){
      st[i] = (world.enemies||[]).length > 0 && (world.enemies||[]).every(e=>e.defeated || !e.active);
    } else if(g.includes('activar') && g.includes('piston')){
      st[i] = (world.pistons||[]).some(p=>p.active);
    } else {
      st[i] = false;
    }
  }
  return st;
}

function checkGoalsSilent(){
  if(!world || !world.def) return false;
  const st = getGoalsState();
  return st.length > 0 && st.every(Boolean);
}

// -------------- UI helpers --------------
function setGameStatus(cls, txt){
  const chip = $('game-status-chip');
  if(!chip) return;
  chip.className = 'game-chip game-chip-'+cls;
  chip.textContent = txt;
}
function updateInstrCount(n){ const el=$('game-instr-count'); if(el) el.textContent=n; }
function hideGameOverlay(){ gameOverlay.classList.add('hidden'); gameOverlay.classList.remove('error'); gameOverlay.innerHTML=''; }

function showGameOverlay(txt, err, extra){
  gameOverlay.classList.remove('hidden');
  gameOverlay.classList.toggle('error', !!err);
  let html = '';
  if(err){
    html += '<span class="err-icon material-symbols-outlined">error</span>';
    html += `<div>${esc(txt)}</div>`;
    if(extra && extra.fix) html += `<div class="err-fix">${esc(extra.fix)}</div>`;
    if(extra && extra.line) html += `<div class="err-line">Linea ${extra.line}</div>`;
  } else {
    html = txt;
  }
  gameOverlay.innerHTML = html;
}

function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function gameLog(msg, cls){
  const c = $('console');
  if(!c) return;
  const d = document.createElement('span');
  d.className = cls||'';
  d.textContent = msg + '\n';
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

// -------------- Ejecucion del juego --------------
async function runGameProgram(){
  if(controller) return;
  
  // ==== LEER MODO PASO A PASO ====
  const stepMode = document.getElementById('step-mode')?.checked || false;

  // Stop enemy patrol and reset enemies to original positions
  stopEnemyPatrol();
  resetEnemiesToOrigin();
  await new Promise(r => setTimeout(r, 350));
  
  const consoleEl = $('console');
  if(consoleEl) consoleEl.innerHTML = '';
  
  // Reiniciar mundo desde estado inicial
  world = cloneWorld(initialWorld);
  renderer.setWorld(world);
  updateGoalsUI();

  const editorEl = $('editor');
  const src = editorEl ? editorEl.value : '';
  if(!src.trim()){
    gameLog('El editor esta vacio. Escribe tu algoritmo.', 'info');
    return;
  }

  let ast;
  try {
    ast = GameParser.parse(src);
  } catch(e){
    const msg = tradError(e.message);
    gameLog(`Linea ${e.line}: ${msg}`, 'err');
    setGameStatus('err','Error de sintaxis');
    showGameOverlay(msg, true, { line: e.line, fix: e.fix });
    return;
  }

  // ===== SI MODO PASO A PASO: sincronizar bloques y cambiar de pestaña =====
  if (stepMode && typeof BlockEditor !== 'undefined' && BlockEditor.isReady()) {
    try {
      BlockEditor.syncFromCode(src);
    } catch (e) {
      console.warn('Error sincronizando bloques en modo paso a paso:', e);
    }
    // Cambiar a la pestaña de bloques (usando applyLayout o click en el tab)
    const blocksTab = document.querySelector('.main-tab[data-main-tab="blocks"]');
    if (blocksTab) blocksTab.click();
  }

  controller = new AbortController();
  setGameStatus('running','Ejecutando...');
  $('btn-run').disabled = true;
  $('btn-stop').style.display = 'inline-flex';
  $('btn-pause').style.display = 'inline-flex';
  $('btn-pause').dataset.paused = 'false';
  $('btn-pause').querySelector('.material-symbols-outlined').textContent = 'pause';
  hideGameOverlay();
  updateInstrCount(0);

  const ui = {
    getStepDelay: ()=> (850 - parseInt(gameSpeed.value,10)),
    // ===== onStep mejorado: resalta el bloque si estamos en modo paso a paso =====
    onStep: (line)=>{
      highlightLine = line;
      if (stepMode && typeof BlockEditor !== 'undefined') {
        BlockEditor.highlightLine(line);
      }
    },
    render: ()=>{ renderer.render(); updateGoalsUI(); },
    updateCounter: (n)=>{ updateInstrCount(n); },
    log: gameLog,
    checkGoals: ()=>{ updateGoalsUI(); return checkGoalsSilent(); },
    checkGoalsSilent: ()=> checkGoalsSilent(),
    sayBubble: (m)=>{ renderer.sayBubble(m); },
    animateEntity: (entity, fromX, fromY)=>{
      const delay = 850 - parseInt(gameSpeed.value,10);
      const duration = Math.max(50, Math.min(350, delay * 0.65));
      renderer.setAnimDuration(duration);
      renderer.animateEntity(entity, fromX, fromY, duration);
    },
    read: (varName)=>{
      // ... (sin cambios, mantén el código original de read) ...
      return new Promise((resolve, reject) => {
        const inputLine = $('input-line');
        const stdinInput = $('stdin');
        const promptEl = $('input-prompt');
        const btnSend = $('btn-send');
        if(!inputLine || !stdinInput) { resolve(''); return; }

        const consoleTab = document.querySelector('.tab[data-tab="console"]');
        if(consoleTab && !consoleTab.classList.contains('active')) consoleTab.click();

        inputLine.style.display = 'flex';
        promptEl.textContent = `Leer ${varName || 'valor'}:`;
        stdinInput.value = '';
        stdinInput.focus();

        const abortHandler = () => {
          cleanup();
          reject(new Error('Ejecucion cancelada'));
        };
        controller.signal.addEventListener('abort', abortHandler);

        const send = () => {
          const val = stdinInput.value;
          const c = $('console');
          if(c){
            const d = document.createElement('span');
            d.className = 'in';
            d.textContent = '> ' + val + '\n';
            c.appendChild(d);
            c.scrollTop = c.scrollHeight;
          }
          cleanup();
          resolve(val);
        };
        const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };

        const cleanup = () => {
          inputLine.style.display = 'none';
          btnSend.removeEventListener('click', send);
          stdinInput.removeEventListener('keydown', onKey);
          controller.signal.removeEventListener('abort', abortHandler);
        };

        btnSend.addEventListener('click', send);
        stdinInput.addEventListener('keydown', onKey);
      });
    },
    onPause: ()=>{
      setGameStatus('running','Pausado');
      $('btn-pause').dataset.paused = 'true';
      $('btn-pause').querySelector('.material-symbols-outlined').textContent = 'play_arrow';
    },
    onResume: ()=>{
      setGameStatus('running','Ejecutando...');
      $('btn-pause').dataset.paused = 'false';
      $('btn-pause').querySelector('.material-symbols-outlined').textContent = 'pause';
    }
  };

  try {
    const res = await GameRuntime.run(ast, world, ui, controller.signal);
    if(res && res.cancelled){
      setGameStatus('idle','Detenido');
      gameLog('--- Ejecucion cancelada ---', 'info');
    } else {
      renderer.render();
      updateGoalsUI();
      if(checkGoalsSilent()){
        onGameWin(res.instrCount);
      } else {
        setGameStatus('idle','Fin del programa');
        gameLog(`Programa terminado (${res.instrCount} instrucciones). Objetivo no alcanzado.`, 'info');
      }
    }
  } catch(e){
    if(e.message==='__WIN__'){
      renderer.render();
      updateGoalsUI();
      onGameWin(parseInt($('game-instr-count').textContent,10)||0);
    } else if(e.message==='Ejecucion cancelada'){
      setGameStatus('idle','Detenido');
      gameLog('--- Ejecucion cancelada ---', 'info');
    } else {
      const msg = tradError(e.message);
      gameLog(`Linea ${e.line||'?'}: ${msg}`, 'err');
      setGameStatus('err','Error');
      showGameOverlay(msg, true, { line: e.line, fix: e.fix });
      world = cloneWorld(initialWorld);
      renderer.setWorld(world);
      updateGoalsUI();
    }
  } finally {
    controller = null;
    $('btn-run').disabled = false;
    $('btn-stop').style.display = 'none';
    $('btn-pause').style.display = 'none';
    $('btn-pause').querySelector('.material-symbols-outlined').textContent = 'pause';
    $('btn-pause').dataset.paused = 'false';
    window.__gameState = null;
    startEnemyPatrol();
    // Al finalizar, si estábamos en modo paso a paso, limpiar el resaltado
    if (stepMode && typeof BlockEditor !== 'undefined') {
      BlockEditor.clearHighlight();
    }
  }
}

function stopGameProgram(){
  if(controller) controller.abort();
  if(window.__gameState && window.__gameState.paused) window.__gameState.resume();
}

function togglePauseGame(){
  if(window.__gameState) window.__gameState.togglePause();
}

function resetGame(){
  if(controller) controller.abort();
  if(window.__gameState && window.__gameState.paused) window.__gameState.resume();
  stopEnemyPatrol();
  loadLevel(currentLevelIdx, true);
}

// ============= ENEMY IDLE PATROL =============
function startEnemyPatrol(){
  stopEnemyPatrol();
  if(!world || !world.enemies || world.enemies.length === 0) return;
  // Store original positions if not already stored
  for(const e of world.enemies){
    if(e.origX === undefined){ e.origX = e.x; e.origY = e.y; e.origDir = e.dir; }
  }
  const DELTAS_PATROL = { arriba:[0,-1], derecha:[1,0], abajo:[0,1], izquierda:[-1,0] };
  enemyPatrolInterval = setInterval(()=>{
    if(!world || !world.enemies) return;
    for(const enemy of world.enemies){
      if(!enemy.active || enemy.defeated) continue;
      const [dx,dy] = DELTAS_PATROL[enemy.dir] || [1,0];
      const nx = enemy.x + dx;
      const ny = enemy.y + dy;
      // Check if blocked
      let blocked = false;
      if(nx<0 || ny<0 || nx>=world.W || ny>=world.H) blocked = true;
      if(!blocked && world.walls.some(w => w.x===nx && w.y===ny)) blocked = true;
      if(!blocked){ const d = world.doors.find(d => d.x===nx && d.y===ny); if(d && !d.open) blocked = true; }
      if(!blocked && (world.npcs||[]).some(n => n.x===nx && n.y===ny)) blocked = true;
      if(!blocked && world.boxes.some(b => b.x===nx && b.y===ny)) blocked = true;
      if(!blocked && (world.pistons||[]).some(p => { if(p.x===nx && p.y===ny) return true; if(p.extended && p.extendX===nx && p.extendY===ny) return true; return false; })) blocked = true;
      
      if(blocked){
        if(enemy.patrolMode === 'bounce'){
          const opp = {arriba:'abajo', abajo:'arriba', izquierda:'derecha', derecha:'izquierda'};
          enemy.dir = opp[enemy.dir] || enemy.dir;
        }
      } else {
        renderer.animateEntity(enemy, enemy.x, enemy.y, 300);
        enemy.x = nx;
        enemy.y = ny;
      }
    }
    renderer.render();
  }, 450);
}

function stopEnemyPatrol(){
  if(enemyPatrolInterval){
    clearInterval(enemyPatrolInterval);
    enemyPatrolInterval = null;
  }
}

function resetEnemiesToOrigin(){
  if(!world || !world.enemies) return;
  for(const e of world.enemies){
    if(e.origX !== undefined){
      renderer.animateEntity(e, e.x, e.y, 300);
      e.x = e.origX;
      e.y = e.origY;
      e.dir = e.origDir || e.dir;
    }
  }
}

function onGameWin(n){
  const def = world.def;
  setGameStatus('ok','Completado!');
  gameLog(`Nivel completado en ${n} instrucciones!`, 'info');
  const {gold, silver} = def.starThresholds || {gold:999,silver:999};
  let stars = 1;
  if(n <= gold) stars = 3;
  else if(n <= silver) stars = 2;
  const prog = JSON.parse(localStorage.getItem('cq_progress')||'{}');
  prog[def.id] = Math.max(stars, prog[def.id]||0);
  localStorage.setItem('cq_progress', JSON.stringify(prog));
  $('game-win-stats').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:0.75rem 1rem;background:#f5f3ee;border-radius:0.5rem;">
      <div style="font-size:1.5rem;font-weight:700;color:#f4c025;">${n}</div>
      <div style="font-size:0.7rem;color:#9c8749;text-transform:uppercase;">Instrucciones</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;padding:0.75rem 1rem;background:#f5f3ee;border-radius:0.5rem;">
      <div style="font-size:1.5rem;font-weight:700;color:#f4c025;">${gold}</div>
      <div style="font-size:0.7rem;color:#9c8749;text-transform:uppercase;">Meta oro</div>
    </div>
  `;
  $('game-win-stars').innerHTML = [1,2,3].map(i => i<=stars?'<span style="color:#f4c025;text-shadow:0 0 12px rgba(244,192,37,0.4);">\u2605</span>':'<span>\u2605</span>').join('');
  $('game-win-modal').style.display = 'flex';
}

// -------------- Modal de niveles --------------
function renderLevelsGrid(){
  const grid = $('game-levels-grid');
  if(!grid) return;
  grid.innerHTML = '';
  const prog = JSON.parse(localStorage.getItem('cq_progress')||'{}');
  LEVELS.forEach((lvl,i)=>{
    const d = document.createElement('div');
    d.className = 'game-level-card';
    const stars = prog[lvl.id]||0;
    const prevStars = i===0 ? 1 : (prog[LEVELS[i-1].id]||0);
    const locked = i>0 && prevStars===0;
    if(locked) d.classList.add('locked');
    d.innerHTML = `
      <div style="font-size:0.7rem;color:#9c8749;font-weight:600;">Nivel ${lvl.id}</div>
      <div style="font-weight:700;font-size:0.9rem;color:#1c180d;">${lvl.name}</div>
      <div style="display:flex;gap:0.15rem;font-size:14px;color:#9c8749;">
        ${[1,2,3].map(n=>`<span style="${n<=stars?'color:#f4c025':''}">\u2605</span>`).join('')}
      </div>
    `;
    if(!locked) d.addEventListener('click',()=>{
      loadLevel(i);
      $('game-levels-modal').style.display = 'none';
    });
    grid.appendChild(d);
  });
}

// -------------- Event listeners --------------
//$('btn-run').addEventListener('click', runGameProgram);
$('btn-stop').addEventListener('click', stopGameProgram);
$('btn-pause').addEventListener('click', togglePauseGame);
$('btn-reset').addEventListener('click', resetGame);
$('btn-levels').addEventListener('click', ()=>{ renderLevelsGrid(); $('game-levels-modal').style.display='flex'; });
$('game-close-levels').addEventListener('click', ()=>{ $('game-levels-modal').style.display='none'; });

function updateStarsDisplay() {
  const starsEl = $('game-stars-display');
  if (!starsEl || !world || !world.def) return;
  const prog = JSON.parse(localStorage.getItem('cq_progress') || '{}');
  const stars = prog[world.def.id] || 0;
  starsEl.innerHTML = 'Progreso: ' + [1,2,3].map(n =>
    n <= stars ? '<span style="color:#f4c025;font-size:18px;">\u2605</span>' : '<span style="color:#e8e2ce;font-size:18px;">\u2605</span>'
  ).join('');
}

function openLevelSelector() {
  renderLevelsGrid();
  $('game-levels-modal').style.display = 'flex';
}

window.openLevelSelector = openLevelSelector;
$('game-win-retry').addEventListener('click', ()=>{ $('game-win-modal').style.display='none'; loadLevel(currentLevelIdx); });
$('game-win-next').addEventListener('click', ()=>{
  $('game-win-modal').style.display='none';
  const next = currentLevelIdx+1;
  if(next<LEVELS.length) loadLevel(next);
  else { renderLevelsGrid(); $('game-levels-modal').style.display='flex'; }
});
gameSpeed.addEventListener('input', ()=>{
  const inverted = 850 - parseInt(gameSpeed.value, 10);
  gameSpeedLbl.textContent=inverted+'ms';
});

// -------------- Inicio --------------
// Check for custom level from editor
(function loadCustomLevel(){
  const params = new URLSearchParams(window.location.search);
  if(params.get('custom')!=='1') return false;
  console.log('Custom level parameter detected, attempting to load...');
  try{
    const raw = localStorage.getItem('devme_custom_level');
    if(!raw){
      console.error('No custom level data found in localStorage');
      alert('No se encontro ningun nivel personalizado. Asegurate de haber creado un nivel en el editor primero.');
      return false;
    }
    console.log('Custom level data found, size:', raw.length);
    const data = JSON.parse(raw);
    console.log('Custom level parsed:', data);
    // Add as a temporary level at the end
    data.id = data.id || 999;
    data.name = data.name || 'Nivel Personalizado';
    data.desc = data.desc || 'Nivel creado en el editor';
    data.goals = data.goals || ['Llegar a la meta'];
    data.hints = data.hints || [];
    data.starThresholds = data.starThresholds || {gold:10, silver:20};
    data.starter = data.starter || 'Algoritmo Nivel\n    // Escribe tu codigo aqui\nFinAlgoritmo';
    LEVELS.push(data);
    currentLevelIdx = LEVELS.length - 1;
    console.log('Loading level at index:', currentLevelIdx);
    loadLevel(currentLevelIdx);
    // Switch to game tab
    const gameTab = document.querySelector('[data-main-tab="game"]');
    if(gameTab) gameTab.click();
    window.__customLevelLoaded = true;
    console.log('Custom level loaded successfully');
    return true;
  }catch(e){
    console.error('Error loading custom level:', e);
    alert('Error al cargar el nivel personalizado: '+e.message);
    return false;
  }
})();
// Only load default level if no custom level was loaded
if(!window.__customLevelLoaded){
  loadLevel(currentLevelIdx);
}
gameSpeedLbl.textContent = (850 - parseInt(gameSpeed.value,10))+'ms';

window.resetGame = resetGame;
window.runGameProgram = runGameProgram;
window.stopGameProgram = stopGameProgram;
window.renderLevelsGrid = renderLevelsGrid;

})();

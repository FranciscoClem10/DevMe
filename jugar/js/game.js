/* ============================================================
 * game.js — Controlador del juego integrado en DevMe
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
let controller = null;
const renderer = makeRenderer(gameCanvas);
let highlightLine = -1;

// Errores traducidos al espanol
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

// -------------- Sidebar switching --------------
function switchSidebar(tabName){
  $('sidebar-code').style.display = (tabName === 'game') ? 'none' : 'flex';
  $('sidebar-game').style.display = (tabName === 'game') ? 'flex' : 'none';
}

// Listen to main tab changes
document.querySelectorAll('.main-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.mainTab;
    switchSidebar(tabName);
    if(tabName === 'game'){
      setTimeout(()=>{ renderer.resize(); renderer.render(); }, 50);
    }
  });
});

// -------------- Carga de niveles --------------
function loadLevel(idx){
  currentLevelIdx = idx;
  localStorage.setItem('cq_level', String(idx));
  const def = LEVELS[idx];
  world = buildLevel(def);
  highlightLine = -1;
  $('game-level-title').textContent = `Nivel ${def.id}: ${def.name}`;
  $('game-level-label').textContent = def.id;
  $('game-desc').textContent = def.desc;
  renderGoals();
  renderHints();
  renderer.setWorld(world);
  // Exponer mundo para el renderer de split view
  window.__gameWorld = world;
  if (window.__splitRenderer) {
    window.__splitRenderer.setWorld(world);
  }
  // Actualizar título en split view
  const splitGameTitle = $('split-game-title');
  if (splitGameTitle) splitGameTitle.textContent = `Nivel ${def.id}: ${def.name}`;
  setGameStatus('idle','Listo');
  updateInstrCount(0);
  hideGameOverlay();

  // Cargar código starter en el editor de código y sincronizar bloques
  if (def.starter && typeof window.loadStarterCode === 'function') {
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
      st[i] = !!world.player.carrying || world.delivered>0;
    } else if(g.includes('activar')){
      st[i] = world.switches.some(s=>s.active);
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
    if(extra && extra.fix) html += `<div class="err-fix">💡 ${esc(extra.fix)}</div>`;
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
  world = buildLevel(world.def);
  renderer.setWorld(world);
  updateGoalsUI();

  // Obtener codigo del editor principal
  const editorEl = $('editor');
  const src = editorEl ? editorEl.value : '';
  if(!src.trim()){
    gameLog('⚠ El editor esta vacio. Escribe tu algoritmo en la pestana "Editor de Codigo".', 'info');
    return;
  }

  let ast;
  try {
    ast = GameParser.parse(src);
  } catch(e){
    const msg = tradError(e.message);
    gameLog(`✗ Linea ${e.line}: ${msg}`, 'err');
    setGameStatus('err','Error de sintaxis');
    showGameOverlay(msg, true, { line: e.line, fix: e.fix });
    return;
  }

  controller = new AbortController();
  setGameStatus('running','Ejecutando...');
  $('game-btn-run').disabled = true;
  $('game-btn-stop').style.display = 'inline-flex';
  $('game-btn-pause').style.display = 'inline-flex';
  $('game-btn-pause').dataset.paused = 'false';
  hideGameOverlay();
  updateInstrCount(0);

  const ui = {
    getStepDelay: ()=> parseInt(gameSpeed.value,10),
    onStep: (line)=>{ highlightLine=line; },
    render: ()=>{ renderer.render(); if(window.__splitRenderer) window.__splitRenderer.render(); updateGoalsUI(); },
    updateCounter: (n)=>{ updateInstrCount(n); },
    log: gameLog,
    checkGoals: ()=>{ updateGoalsUI(); return checkGoalsSilent(); },
    checkGoalsSilent: ()=> checkGoalsSilent(),
    sayBubble: (m)=>{ renderer.sayBubble(m); if(window.__splitRenderer) window.__splitRenderer.sayBubble(m); },
    onPause: ()=>{
      setGameStatus('running','Pausado');
      $('game-btn-pause').dataset.paused = 'true';
      $('game-btn-pause').querySelector('.material-symbols-outlined').textContent = 'play_arrow';
    },
    onResume: ()=>{
      setGameStatus('running','Ejecutando...');
      $('game-btn-pause').dataset.paused = 'false';
      $('game-btn-pause').querySelector('.material-symbols-outlined').textContent = 'pause';
    }
  };

  try {
    const res = await GameRuntime.run(ast, world, ui, controller.signal);
    if(res && res.cancelled){
      setGameStatus('idle','Detenido');
      gameLog('--- Ejecucion cancelada ---', 'info');
    } else if(checkGoalsSilent()){
      onGameWin(res.instrCount);
    } else {
      setGameStatus('idle','Fin del programa');
      gameLog(`Programa terminado (${res.instrCount} instrucciones). Objetivo no alcanzado.`, 'info');
    }
  } catch(e){
    if(e.message==='__WIN__'){
      onGameWin(parseInt($('game-instr-count').textContent,10)||0);
    } else if(e.message==='Ejecucion cancelada'){
      setGameStatus('idle','Detenido');
      gameLog('--- Ejecucion cancelada ---', 'info');
    } else {
      const msg = tradError(e.message);
      gameLog(`✗ Linea ${e.line||'?'}: ${msg}`, 'err');
      setGameStatus('err','Error');
      showGameOverlay(msg, true, { line: e.line, fix: e.fix });
    }
  } finally {
    controller = null;
    $('game-btn-run').disabled = false;
    $('game-btn-stop').style.display = 'none';
    $('game-btn-pause').style.display = 'none';
    $('game-btn-pause').querySelector('.material-symbols-outlined').textContent = 'pause';
    $('game-btn-pause').dataset.paused = 'false';
    window.__gameState = null;
  }
}

function stopGameProgram(){
  if(controller) controller.abort();
  // Also resume if paused so the abort can propagate
  if(window.__gameState && window.__gameState.paused) window.__gameState.resume();
}

function togglePauseGame(){
  if(window.__gameState) window.__gameState.togglePause();
}

function onGameWin(n){
  const def = world.def;
  setGameStatus('ok','¡Completado!');
  gameLog(`¡Nivel completado en ${n} instrucciones!`, 'ok');
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
  $('game-win-stars').innerHTML = [1,2,3].map(i => i<=stars?'<span style="color:#f4c025;text-shadow:0 0 12px rgba(244,192,37,0.4);">★</span>':'<span>★</span>').join('');
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
        ${[1,2,3].map(n=>`<span style="${n<=stars?'color:#f4c025':''}">★</span>`).join('')}
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
$('game-btn-run').addEventListener('click', runGameProgram);
$('game-btn-stop').addEventListener('click', stopGameProgram);
$('game-btn-pause').addEventListener('click', togglePauseGame);
$('game-btn-reset').addEventListener('click', ()=>{
  if(controller) controller.abort();
  if(window.__gameState && window.__gameState.paused) window.__gameState.resume();
  loadLevel(currentLevelIdx);
});
$('game-btn-levels').addEventListener('click', ()=>{ renderLevelsGrid(); $('game-levels-modal').style.display='flex'; });
$('game-close-levels').addEventListener('click', ()=>{ $('game-levels-modal').style.display='none'; });
$('game-win-retry').addEventListener('click', ()=>{ $('game-win-modal').style.display='none'; loadLevel(currentLevelIdx); });
$('game-win-next').addEventListener('click', ()=>{
  $('game-win-modal').style.display='none';
  const next = currentLevelIdx+1;
  if(next<LEVELS.length) loadLevel(next);
  else { renderLevelsGrid(); $('game-levels-modal').style.display='flex'; }
});
gameSpeed.addEventListener('input', ()=>{ gameSpeedLbl.textContent=gameSpeed.value+'ms'; });

// -------------- Inicio --------------
loadLevel(currentLevelIdx);
gameSpeedLbl.textContent = gameSpeed.value+'ms';

})();

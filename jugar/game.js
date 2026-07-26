/* ============================================================
 * game.js — Controlador principal del juego
 * ============================================================ */
(function(){
'use strict';

const $ = id => document.getElementById(id);
const editor = $('editor');
const highlight = $('editor-highlight');
const lineNumbers = $('line-numbers');
const btnRun = $('btn-run');
const btnStop = $('btn-stop');
const btnReset = $('btn-reset');
const btnStep = $('btn-step');
const canvas = $('game');
const overlay = $('overlay');
const speed = $('speed');
const speedLbl = $('speed-lbl');

let currentLevelIdx = parseInt(localStorage.getItem('cq_level')||'0',10);
if(currentLevelIdx >= LEVELS.length) currentLevelIdx = 0;
let world = null;
let controller = null;
const renderer = makeRenderer(canvas);

// Modo sandbox: sin niveles, editor libre
const isSandbox = !!document.body.dataset.sandbox;

// -------------- Editor con resaltado --------------
const KW_RE = /\b(Algoritmo|FinAlgoritmo|Definir|Como|Entero|Real|Caracter|Logico|Constante|Leer|Escribir|Si|Entonces|Sino|FinSi|Segun|Hacer|Caso|FinSegun|Mientras|FinMientras|Repetir|Hasta|Que|Para|FinPara|SubProceso|FinSubProceso|Funcion|FinFuncion|Y|O|NO|MOD|Con|Paso|De|Otro|Modo)\b/gi;
const BOOL_RE = /\b(Verdadero|Falso)\b/gi;
const FN_RE = /\b(avanzar|mover|girar|tomar|soltar|usar|abrir|cerrar|activar|desactivar|esperar|decir|frenteLibre|hayObjeto|hayCaja|hayPuerta|puertaAbierta|hayEnemigo|haySwitch|inventarioLleno|llevoObjeto|objetivoCompleto|azar|abs|raiz)\b/g;

let highlightLine = -1;

function renderEditor(){
  const src = editor.value;
  const lines = src.split('\n');
  lineNumbers.textContent = lines.map((_,i)=>i+1).join('\n');
  let html = esc(src);
  html = html.replace(/(\/\/[^\n]*)/g, '<span class="tok-cmt">$1</span>');
  html = html.replace(/(&quot;[^&\n]*&quot;|'[^'\n]*')/g, '<span class="tok-str">$1</span>');
  html = html.replace(KW_RE, '<span class="tok-kw">$1</span>');
  html = html.replace(BOOL_RE, '<span class="tok-bool">$1</span>');
  html = html.replace(FN_RE, '<span class="tok-fn">$1</span>');
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
  if(highlightLine > 0){
    const arr = html.split('\n');
    const idx = highlightLine - 1;
    if(idx >= 0 && idx < arr.length) arr[idx] = `<span class="line-highlight">${arr[idx]||' '}</span>`;
    html = arr.join('\n');
  }
  highlight.innerHTML = html + '\n';
}
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

editor.addEventListener('input', renderEditor);
editor.addEventListener('scroll', ()=>{
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
  lineNumbers.scrollTop = editor.scrollTop;
});
editor.addEventListener('keydown', e=>{
  if(e.key==='Tab'){
    e.preventDefault();
    const s=editor.selectionStart, en=editor.selectionEnd;
    editor.value = editor.value.substring(0,s)+'    '+editor.value.substring(en);
    editor.selectionStart = editor.selectionEnd = s+4;
    renderEditor();
  }
});

// -------------- Carga de niveles --------------
function loadLevel(idx){
  currentLevelIdx = idx;
  localStorage.setItem('cq_level', String(idx));
  const def = LEVELS[idx];
  world = buildLevel(def);
  editor.value = def.starter;
  highlightLine = -1;
  renderEditor();
  $('level-title').textContent = `Nivel ${def.id}: ${def.name}`;
  $('level-goal').textContent = def.goals[0] || '';
  $('level-desc').textContent = def.desc;
  renderGoals();
  renderHints();
  renderer.setWorld(world);
  setStatus('idle','Listo');
  updateCounter(0);
  clearConsole();
  hideOverlay();
}

function renderGoals(){
  if(isSandbox) return;
  const c = $('goals-list');
  if(!c) return;
  c.innerHTML = '';
  world.def.goals.forEach((g,i)=>{
    const d = document.createElement('div');
    d.className = 'goal-item';
    d.innerHTML = `<span class="material-symbols-outlined">radio_button_unchecked</span><span>${g}</span>`;
    d.dataset.goal = i;
    c.appendChild(d);
  });
}

function renderHints(){
  if(isSandbox) return;
  const c = $('level-hints');
  if(!c) return;
  c.innerHTML = '';
  (world.def.hints||[]).forEach((h,i)=>{
    const d = document.createElement('details');
    d.innerHTML = `<summary>Pista ${i+1}</summary><p>${h}</p>`;
    c.appendChild(d);
  });
}

function updateGoalsUI(){
  if(isSandbox) return;
  const items = $('goals-list') ? $('goals-list').querySelectorAll('.goal-item') : [];
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

// -------------- Ejecución --------------
function setStatus(cls, txt){
  const chip = $('status-chip');
  if(!chip) return;
  chip.className = 'chip chip-'+cls;
  chip.textContent = txt;
}
function updateCounter(n){ const el=$('instr-count'); if(el) el.textContent=n; }
function hideOverlay(){ overlay.classList.add('hidden'); overlay.classList.remove('error'); }
function showOverlay(txt, err){ overlay.textContent=txt; overlay.classList.remove('hidden'); overlay.classList.toggle('error',!!err); }

function log(msg, cls){
  const c = $('console');
  if(!c) return;
  const d = document.createElement('div');
  d.className = cls||'';
  d.textContent = msg;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}
function clearConsole(){ const c=$('console'); if(c) c.innerHTML=''; }

async function runProgram(stepMode){
  if(controller) return;
  // Reconstruir mundo al inicio de cada ejecución
  if(!isSandbox){
    world = buildLevel(world.def);
  } else {
    // En modo sandbox, construir un mundo vacío
    world = { def:{ goals:[] }, W:10, H:8, walls:[], player:{x:0,y:0,dir:'derecha',carrying:null}, boxes:[], targets:[], switches:[], doors:[], delivered:0, boxesToCollect:0, deliveredAt:[] };
  }
  renderer.setWorld(world);
  updateGoalsUI();

  const src = editor.value;
  let ast;
  try {
    ast = GameParser.parse(src);
  } catch(e){
    log(`✗ Línea ${e.line}: ${e.message}`, 'log-err');
    setStatus('err','Error de sintaxis');
    showOverlay(`Error en línea ${e.line}: ${e.message}`, true);
    highlightLine = e.line; renderEditor();
    return;
  }

  controller = new AbortController();
  setStatus('running','Ejecutando…');
  btnRun.disabled = true; btnStep.disabled = true; btnStop.disabled = false;
  hideOverlay();
  updateCounter(0);

  const ui = {
    getStepDelay: ()=> parseInt(speed.value,10),
    onStep: (line)=>{ highlightLine=line; renderEditor(); scrollToLine(line); },
    render: ()=>{ renderer.render(); updateGoalsUI(); },
    updateCounter,
    log,
    checkGoals: ()=>{
      updateGoalsUI();
      return !isSandbox && checkGoalsSilent();
    },
    checkGoalsSilent: ()=> !isSandbox && checkGoalsSilent(),
    sayBubble: (m)=> renderer.sayBubble(m)
  };

  try {
    const res = await GameRuntime.run(ast, world, ui, controller.signal);
    if(res && res.cancelled){
      setStatus('idle','Detenido');
    } else if(!isSandbox && checkGoalsSilent()){
      onWin(res.instrCount);
    } else {
      setStatus('idle','Fin del programa');
      if(!isSandbox){
        log(`Programa terminado (${res.instrCount} instrucciones). Objetivo no alcanzado.`, 'log-info');
      } else {
        log(`Programa terminado (${res.instrCount} instrucciones).`, 'log-info');
      }
    }
  } catch(e){
    if(e.message==='__WIN__'){
      onWin(parseInt($('instr-count').textContent,10)||0);
    } else if(e.message==='Ejecución cancelada'){
      setStatus('idle','Detenido');
    } else {
      log(`✗ Línea ${e.line||'?'}: ${e.message}`, 'log-err');
      setStatus('err','Error');
      showOverlay(`Error en línea ${e.line||'?'}: ${e.message}`, true);
      highlightLine = e.line||highlightLine;
      renderEditor();
    }
  } finally {
    controller = null;
    btnRun.disabled = false; btnStep.disabled = false; btnStop.disabled = true;
  }
}

function stopProgram(){ if(controller) controller.abort(); }

function onWin(n){
  const def = world.def;
  setStatus('ok','¡Completado!');
  log(`¡Nivel completado en ${n} instrucciones!`, 'log-ok');
  const {gold, silver} = def.starThresholds || {gold:999,silver:999};
  let stars = 1;
  if(n <= gold) stars = 3;
  else if(n <= silver) stars = 2;
  const prog = JSON.parse(localStorage.getItem('cq_progress')||'{}');
  prog[def.id] = Math.max(stars, prog[def.id]||0);
  localStorage.setItem('cq_progress', JSON.stringify(prog));
  $('win-stats').innerHTML = `
    <div><div class="val">${n}</div><div class="lbl">Instrucciones</div></div>
    <div><div class="val">${gold}</div><div class="lbl">Meta oro</div></div>
  `;
  $('win-stars').innerHTML = [1,2,3].map(i => i<=stars?'<span class="filled">★</span>':'<span>★</span>').join('');
  $('win-modal').classList.remove('hidden');
}

function scrollToLine(line){
  const lh = 21;
  editor.scrollTop = Math.max(0,(line-3)*lh);
  highlight.scrollTop = editor.scrollTop;
  lineNumbers.scrollTop = editor.scrollTop;
}

// -------------- Comandos en la barra lateral --------------
const CMD_CATS = [
  { title:'Movimiento', cmds:[
    { name:'avanzar()', desc:'Avanza una casilla en la dirección actual' },
    { name:'mover(derecha)', desc:'Se mueve en una dirección: arriba/abajo/izquierda/derecha' },
    { name:'girar(-90)', desc:'Gira 90° a la derecha (usa 90 para izquierda)' },
  ]},
  { title:'Objetos', cmds:[
    { name:'tomar()', desc:'Recoge el objeto que tienes al frente' },
    { name:'soltar()', desc:'Suelta el objeto que llevas' },
    { name:'activar()', desc:'Activa un interruptor' },
    { name:'abrir()', desc:'Abre una puerta que tienes al frente' },
    { name:'usar()', desc:'Interactúa con puerta o interruptor' },
    { name:'decir("Hola")', desc:'Muestra un mensaje en el escenario' },
  ]},
  { title:'Consultas', cmds:[
    { name:'frenteLibre()', desc:'¿La casilla de enfrente está libre?' },
    { name:'hayCaja()', desc:'¿Hay una caja adelante?' },
    { name:'hayPuerta()', desc:'¿Hay una puerta adelante?' },
    { name:'puertaAbierta()', desc:'¿La puerta de enfrente está abierta?' },
    { name:'llevoObjeto()', desc:'¿Llevo algo en el inventario?' },
    { name:'objetivoCompleto()', desc:'¿Se completó el nivel?' },
  ]}
];

function renderCmdList(){
  const c = $('cmd-list');
  if(!c) return;
  c.innerHTML = '';
  for(const cat of CMD_CATS){
    const t = document.createElement('div');
    t.className = 'cmd-cat-title';
    t.textContent = cat.title;
    c.appendChild(t);
    for(const cmd of cat.cmds){
      const d = document.createElement('div');
      d.className = 'cmd-item';
      d.innerHTML = `<span class="cmd-name">${cmd.name}</span><span class="cmd-desc">${cmd.desc}</span>`;
      d.addEventListener('click',()=>{
        const s=editor.selectionStart, e=editor.selectionEnd;
        editor.value = editor.value.substring(0,s)+cmd.name+editor.value.substring(e);
        editor.selectionStart = editor.selectionEnd = s+cmd.name.length;
        editor.focus();
        renderEditor();
      });
      c.appendChild(d);
    }
  }
}

// -------------- Pestañas laterales --------------
document.querySelectorAll('.side-tab').forEach(t=>{
  t.addEventListener('click',()=>{
    document.querySelectorAll('.side-tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.side-panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const panel = document.querySelector(`.side-panel[data-panel="${t.dataset.tab}"]`);
    if(panel) panel.classList.add('active');
  });
});

// -------------- Modal de niveles --------------
function renderLevelsGrid(){
  const grid = $('levels-grid');
  if(!grid) return;
  grid.innerHTML = '';
  const prog = JSON.parse(localStorage.getItem('cq_progress')||'{}');
  LEVELS.forEach((lvl,i)=>{
    const d = document.createElement('div');
    d.className = 'level-card';
    const stars = prog[lvl.id]||0;
    const prevStars = i===0 ? 1 : (prog[LEVELS[i-1].id]||0);
    const locked = i>0 && prevStars===0;
    if(locked) d.classList.add('locked');
    d.innerHTML = `
      <div class="lvl-num">Nivel ${lvl.id}</div>
      <div class="lvl-name">${lvl.name}</div>
      <div class="lvl-stars">
        ${[1,2,3].map(n=>`<span class="${n<=stars?'filled':''}">★</span>`).join('')}
      </div>
    `;
    if(!locked) d.addEventListener('click',()=>{
      loadLevel(i);
      $('levels-modal').classList.add('hidden');
    });
    grid.appendChild(d);
  });
}

const btnLevels = $('btn-levels');
if(btnLevels) btnLevels.addEventListener('click',()=>{ renderLevelsGrid(); $('levels-modal').classList.remove('hidden'); });
const closeLevels = $('close-levels');
if(closeLevels) closeLevels.addEventListener('click',()=>$('levels-modal').classList.add('hidden'));
const btnHelp = $('btn-help');
if(btnHelp) btnHelp.addEventListener('click',()=>$('help-modal').classList.remove('hidden'));
const closeHelp = $('close-help');
if(closeHelp) closeHelp.addEventListener('click',()=>$('help-modal').classList.add('hidden'));

// Win modal
const winRetry = $('win-retry');
if(winRetry) winRetry.addEventListener('click',()=>{ $('win-modal').classList.add('hidden'); loadLevel(currentLevelIdx); });
const winNext = $('win-next');
if(winNext) winNext.addEventListener('click',()=>{
  $('win-modal').classList.add('hidden');
  const next = currentLevelIdx+1;
  if(next<LEVELS.length) loadLevel(next);
  else { renderLevelsGrid(); $('levels-modal').classList.remove('hidden'); }
});

// Botones de control
btnRun.addEventListener('click',()=>runProgram(false));
btnStep.addEventListener('click',()=>runProgram(true));
btnStop.addEventListener('click',stopProgram);
btnReset.addEventListener('click',()=>{
  if(controller) controller.abort();
  if(!isSandbox) loadLevel(currentLevelIdx);
  else {
    world = { def:{goals:[]}, W:10, H:8, walls:[], player:{x:0,y:0,dir:'derecha',carrying:null}, boxes:[], targets:[], switches:[], doors:[], delivered:0, boxesToCollect:0, deliveredAt:[] };
    renderer.setWorld(world);
    clearConsole();
    setStatus('idle','Listo');
    updateCounter(0);
  }
});

speed.addEventListener('input',()=>{ speedLbl.textContent=speed.value+'ms'; });

// -------------- Inicio --------------
renderCmdList();
if(!isSandbox){
  loadLevel(currentLevelIdx);
} else {
  // Modo sandbox: mundo vacío con grid básico
  world = { def:{goals:[]}, W:10, H:8, walls:buildWalls(10,8), player:{x:0,y:0,dir:'derecha',carrying:null}, boxes:[], targets:[{x:9,y:7}], switches:[], doors:[], delivered:0, boxesToCollect:0, deliveredAt:[] };
  renderer.setWorld(world);
  clearConsole();
  setStatus('idle','Listo');
  updateCounter(0);
}
speedLbl.textContent = speed.value+'ms';

function buildWalls(W,H){
  const w=[];
  for(let x=0;x<W;x++){ w.push({x,y:0}); w.push({x,y:H-1}); }
  for(let y=1;y<H-1;y++){ w.push({x:0,y}); w.push({x:W-1,y}); }
  return w;
}

})();

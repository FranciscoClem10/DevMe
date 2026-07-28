/* ============================================================
 * main.js — Conecta la UI con el compilador, bloques y diagrama.
 * ============================================================ */
(function () {
  'use strict';

  const editor = Editor.init();
  const btnRun = document.getElementById('btn-run');
  const btnStop = document.getElementById('btn-stop');
  const btnPause = document.getElementById('btn-pause');
  const btnReset = document.getElementById('btn-reset');
  const btnClear = document.getElementById('btn-clear');
  const btnExample = document.getElementById('btn-example');
  const exampleSelect = document.getElementById('example-select');
  const inputLine = document.getElementById('input-line');
  const stdinInput = document.getElementById('stdin');
  const btnSend = document.getElementById('btn-send');
  const promptEl = document.getElementById('input-prompt');
  const diagramContainer = document.getElementById('diagram-container');
  const consoleEl = document.getElementById('console');
  const errorsEl = document.getElementById('errors');
  
  
  // ====== Poblar el select con los ejemplos ======
  exampleSelect.innerHTML = ''; // limpiar por si acaso
  const exampleKeys = Object.keys(EXAMPLES);
  exampleKeys.sort(); // opcional, orden alfabético
  for (const key of exampleKeys) {
    const option = document.createElement('option');
    option.value = key;
    // Crear una etiqueta legible
    let label = key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
    option.textContent = label;
    exampleSelect.appendChild(option);
  }
  // Seleccionar 'hola' por defecto si existe, o el primero
  if (EXAMPLES.hola) {
    exampleSelect.value = 'hola';
  } else if (exampleKeys.length > 0) {
    exampleSelect.value = exampleKeys[0];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // === Flag to prevent sync loops ===
  let syncingFromCode = false;
  let syncingFromBlocks = false;
  
  // Layout state
  let currentLayout = 'split-code';

  // === Init Block Editor ===
  (async () => {
    await BlockEditor.init();
    
    BlockEditor.setOnChange(() => {
      if (syncingFromCode) return; // don't sync back if we just synced from code
      syncingFromBlocks = true;
      const blockCode = BlockEditor.getCode();
      if (blockCode.trim()) {
        editor.textarea.value = blockCode;
      }
      editor.update();
      syncingFromBlocks = false;
      
      // Feature 6: Save shared state when blocks change
      if (typeof saveSharedState === 'function') {
        saveSharedState();
      }
    });

    // Only load default example if the editor is still empty
    // (game.js may have already loaded starter code for the current level)
    if (!editor.textarea.value.trim()) {
      syncingFromCode = true;
      editor.textarea.value = EXAMPLES.hola;
      editor.update();
      try { BlockEditor.syncFromCode(EXAMPLES.hola); } catch (e) {}
      syncingFromCode = false;
    }
  })();

  // === Setup execution highlighting callback ===
  window.__blockHighlightByLine = function (lineNum) {
    BlockEditor.highlightLine(lineNum);
  };

  // === Main Tabs ===
  const mainTabs = document.querySelectorAll('.main-tab');
  const editorPanel = document.getElementById('editor-panel');
  const gamePanel = document.getElementById('game-panel');

  mainTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.mainTab;
      // If clicking game tab, switch to game layout
      if (tabName === 'game') {
        applyLayout('game');
        return;
      }
      // If clicking diagram tab, switch to diagram layout
      if (tabName === 'diagram') {
        applyLayout('diagram');
        return;
      }
      // If clicking code/blocks, show that panel in editor area
      // In split mode, the editor panel shows either code or blocks
      mainTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const allPanels = document.querySelectorAll('.main-tab-panel');
      allPanels.forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
      });
      
      const panel = document.querySelector('.main-tab-panel[data-panel="' + tabName + '"]');
      if (panel) {
        panel.style.display = 'flex';
        panel.classList.add('active');
      }
      
      // Update layout buttons and state
      if (tabName === 'code') {
        currentLayout = 'split-code';
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === 'split-code'));
        // Ensure split mode is active
        editorPanel.style.display = 'flex';
        editorPanel.style.flex = '1';
        gamePanel.style.display = 'flex';
        gamePanel.style.flex = '1';
        document.getElementById('split-divider-v').style.display = 'block';
      } else if (tabName === 'blocks') {
        currentLayout = 'split-blocks';
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === 'split-blocks'));
        editorPanel.style.display = 'flex';
        editorPanel.style.flex = '1';
        gamePanel.style.display = 'flex';
        gamePanel.style.flex = '1';
        document.getElementById('split-divider-v').style.display = 'block';
      }
      
      // Resize canvas after layout change
      setTimeout(() => {
        if (window.__renderer) {
          window.__renderer.resize();
          window.__renderer.render();
        }
      }, 60);
    });
  });

  function switchToMainTab(name) {
    mainTabs.forEach(t => t.classList.remove('active'));
    const tab = document.querySelector('.main-tab[data-main-tab="' + name + '"]');
    if (tab) tab.click();
  }

  // === Console sub-tabs ===
  const consoleTabs = document.querySelectorAll('.tab');
  consoleTabs.forEach(t => {
    t.addEventListener('click', () => {
      consoleTabs.forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('tab-' + t.dataset.tab).classList.add('active');
    });
  });

  function switchToConsoleTab(tabName) {
    consoleTabs.forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    const tab = document.querySelector('.tab[data-tab="' + tabName + '"]');
    if (tab) tab.classList.add('active');
    const content = document.getElementById('tab-' + tabName);
    if (content) content.classList.add('active');
  }

  // === Console resize (Feature 3: More flexible) ===
  const consolePanel = document.getElementById('console-panel');
  const divider = document.getElementById('split-divider');
  let isResizing = false, startY = 0, startHeight = 0;

  const savedHeight = localStorage.getItem('consoleHeight');
  if (savedHeight) {
    const h = parseInt(savedHeight, 10);
    if (!isNaN(h) && h >= 40) consolePanel.style.height = h + 'px';
  }

  divider.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = consolePanel.offsetHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    divider.classList.add('active');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = startY - e.clientY;
    let newHeight = startHeight + delta;
    // Feature 3: Allow much more flexible resizing
    // Min: 40px (just tab bar visible)
    // Max: window.innerHeight - 100px (almost full screen)
    const minHeight = 40;
    const maxHeight = window.innerHeight - 100;
    newHeight = Math.min(Math.max(newHeight, minHeight), maxHeight);
    consolePanel.style.height = newHeight + 'px';
    e.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      divider.classList.remove('active');
      localStorage.setItem('consoleHeight', consolePanel.offsetHeight);
    }
  });

  // === Console IO ===
  function writeOut(text, cls) {
    const span = document.createElement('span');
    span.className = cls || 'out';
    span.textContent = text;
    consoleEl.appendChild(span);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  function writelnOut(text, cls) { writeOut(text + '\n', cls); }
  function clearConsole() { consoleEl.innerHTML = ''; }
  function clearErrors() { errorsEl.innerHTML = ''; }

  function showError(err) {
    const div = document.createElement('div');
    div.className = 'err-line';
    const loc = err.line ? ' (linea ' + err.line + (err.col ? ', col ' + err.col : '') + ')' : '';
    div.innerHTML = '<span class="err-phase">[' + err.phase + ']</span> ' + err.message + loc;
    errorsEl.appendChild(div);
  }

  function showOk(msg) {
    const div = document.createElement('div');
    div.className = 'err-line err-ok';
    div.textContent = msg;
    errorsEl.appendChild(div);
  }

  // === User Input ===
  function waitForInput(prompt) {
    return new Promise((resolve, reject) => {
      const abortHandler = () => {
        reject(new Error('Ejecucion cancelada'));
        cleanup();
      };
      if (abortController) abortController.signal.addEventListener('abort', abortHandler);

      inputLine.style.display = 'flex';
      promptEl.textContent = prompt || 'Entrada:';
      stdinInput.value = '';
      stdinInput.focus();

      const send = () => {
        const val = stdinInput.value;
        writelnOut('> ' + val, 'in');
        inputLine.style.display = 'none';
        cleanup();
        resolve(val);
      };
      const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };

      const cleanup = () => {
        btnSend.removeEventListener('click', send);
        stdinInput.removeEventListener('keydown', onKey);
        if (abortController) abortController.signal.removeEventListener('abort', abortHandler);
      };

      btnSend.addEventListener('click', send);
      stdinInput.addEventListener('keydown', onKey);
    });
  }

  const io = {
    write: (t) => writeOut(t),
    writeln: (t) => writelnOut(t),
    read: () => waitForInput('Entrada:'),
    waitKey: () => waitForInput('Presione Enter para continuar...'),
    sleep: (sec) => {
      return new Promise((resolve, reject) => {
        if (abortController && abortController.signal.aborted) { reject(new Error('Ejecucion cancelada')); return; }
        let timer = setTimeout(() => resolve(), sec * 1000);
        const abortHandler = () => { clearTimeout(timer); reject(new Error('Ejecucion cancelada')); };
        if (abortController) abortController.signal.addEventListener('abort', abortHandler);
        const origResolve = resolve, origReject = reject;
        resolve = (val) => { if (abortController) abortController.signal.removeEventListener('abort', abortHandler); origResolve(val); };
        reject = (err) => { if (abortController) abortController.signal.removeEventListener('abort', abortHandler); origReject(err); };
      });
    },
    clear: () => clearConsole()
  };

  let abortController = null;
  let isRunning = false;
  let executionTimeoutId = null;

  // === Diagram ===
  let diagramData = null;
  let mermaidInitialized = false;

  function initMermaid() {
    if (typeof mermaid !== 'undefined' && !mermaidInitialized) {
      mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { primaryColor: '#dbeafe', primaryTextColor: '#1e3a5f', lineColor: '#64748b', fontSize: '13px' } });
      mermaidInitialized = true;
    }
  }

  // Pan/Zoom
  let currentZoom = 1, panX = 0, panY = 0;
  let isDraggingDiagram = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

  function setupPanZoom(container) {
    let wrapper = container.querySelector('.diagram-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'diagram-wrapper';
      wrapper.style.transformOrigin = '0 0';
      while (container.firstChild) wrapper.appendChild(container.firstChild);
      container.appendChild(wrapper);
    }

    function updateTransform() {
      wrapper.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + currentZoom + ')';
    }

    container.addEventListener('wheel', function (e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      currentZoom = Math.min(Math.max(currentZoom + delta, 0.1), 5);
      updateTransform();
    }, { passive: false });

    container.addEventListener('mousedown', function (e) {
      isDraggingDiagram = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      panStartX = panX; panStartY = panY;
      container.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      if (!isDraggingDiagram) return;
      panX = panStartX + (e.clientX - dragStartX);
      panY = panStartY + (e.clientY - dragStartY);
      updateTransform();
    });

    window.addEventListener('mouseup', function () {
      if (isDraggingDiagram) { isDraggingDiagram = false; container.style.cursor = 'grab'; }
    });

    container.style.cursor = 'grab';
    updateTransform();
    container._updateTransform = updateTransform;
    container._setupDone = true;
  }

  async function renderMermaid(mermaidCode) {
    if (!mermaidCode) return;
    initMermaid();
    const container = diagramContainer;
    let wrapper = container.querySelector('.diagram-wrapper');
    if (wrapper) { while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild); }
    else { container.innerHTML = ''; }

    try {
      const { svg } = await mermaid.render('mermaid-diagram', mermaidCode);
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'diagram-wrapper';
        wrapper.style.transformOrigin = '0 0';
        container.appendChild(wrapper);
      }
      wrapper.innerHTML = svg;
      if (!container._setupDone) setupPanZoom(container);
      else if (container._updateTransform) container._updateTransform();
    } catch (e) {
      console.error('Error al renderizar diagrama:', e);
      container.innerHTML = '<div style="padding:20px;color:#b31d28;">Error al generar el diagrama. Verifica que el codigo sea correcto.</div>';
    }
  }

  function downloadSVG() {
    const svg = diagramContainer.querySelector('svg');
    if (!svg) { alert('No hay diagrama. Ejecuta el codigo primero.'); return; }
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'diagrama.svg';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeURL(url);
  }

  // === Main execution ===
  async function runProgram() {
    if (isRunning) return;
    clearConsole();
    clearErrors();
    switchToConsoleTab('console');

    const src = editor.textarea.value;
    const stepMode = document.getElementById('step-mode').checked;
    const stepDelay = stepMode ? 500 : 0; // 500ms for step-by-step, 0 for normal
	
    const { tokens, errors: lexErrors } = Lexer.tokenize(src);
    if (lexErrors.length) {
      lexErrors.forEach(showError);
      switchToConsoleTab('errors');
      return;
    }

    const { ast, errors: parseErrors } = Parser.parse(tokens);
    if (parseErrors.length) {
      parseErrors.forEach(showError);
      switchToConsoleTab('errors');
      return;
    }

    const { errors: semErrors } = Semantic.analyze(ast);
    if (semErrors.length) {
      semErrors.forEach(showError);
      switchToConsoleTab('errors');
      return;
    }

    showOk('Analisis lexico, sintactico y semantico correcto. Ejecutando...');

    // Generate and render diagram
    try {
      const mermaidCode = DiagramGenerator.generateDiagram(ast);
      diagramData = mermaidCode;
      await renderMermaid(mermaidCode);
    } catch (e) {
      console.warn('Error al generar diagrama:', e);
    }

    // In fast execution, avoid block sync and tab switching so the program runs
    // as quickly as possible. Sync only when step-by-step highlighting needs it.
    if (stepMode && BlockEditor.isReady()) {
      syncingFromCode = true;
      try {
        BlockEditor.syncFromCode(src);
      } catch (e) {
        console.warn('Error al sincronizar bloques:', e);
        //debugLog('run.syncBlocks.error', { message: e.message });
      }
      syncingFromCode = false;
    }

    if (stepMode) {
      switchToMainTab('blocks');
    }

    isRunning = true;
    btnRun.disabled = true;
    btnStop.style.display = 'inline-flex';
    abortController = new AbortController();
    executionTimeoutId = setTimeout(() => {
      if (isRunning) writelnOut('La ejecucion esta tomando mas de 3 segundos. Use "Detener" si es necesario.', 'info');
    }, 3000);

    try {
      writelnOut('--- Inicio de ejecucion ---', 'info');
      await Interpreter.run(ast, io, abortController.signal, { stepDelay, stepHighlight: stepMode });
      writelnOut('--- Fin de ejecucion ---', 'info');
    } catch (err) {
      if (err.message === 'Ejecucion cancelada') writelnOut('--- Ejecucion cancelada ---', 'info');
      else {
        showError({ phase: err.phase || 'Ejecucion', message: err.message, line: err.line || 0 });
        switchToConsoleTab('errors');
      }
    } finally {
      clearTimeout(executionTimeoutId);
      isRunning = false;
      btnRun.disabled = false;
      btnStop.style.display = 'none';
      abortController = null;
      // Clear execution highlight
      BlockEditor.clearHighlight();
    }
  }

  function stopProgram() { if (abortController) abortController.abort(); }

  // === Event listeners ===
  btnRun.addEventListener('click', () => {
    // If in game layout or split mode, run the game
    if (currentLayout === 'game' || currentLayout === 'split-code' || currentLayout === 'split-blocks') {
      if (typeof window.runGameProgram === 'function') window.runGameProgram();
    } else {
      runProgram();
    }
  });
  btnStop.addEventListener('click', () => {
    stopProgram();
    if (typeof window.stopGameProgram === 'function') window.stopGameProgram();
  });
  btnReset.addEventListener('click', () => {
    if (typeof window.resetGame === 'function') window.resetGame();
  });
  btnClear.addEventListener('click', () => {
    clearConsole();
    clearErrors();
  });

  btnExample.addEventListener('click', () => {
    const key = exampleSelect.value;
    if (EXAMPLES[key] && BlockEditor.isReady()) {
      syncingFromCode = true;
      editor.textarea.value = EXAMPLES[key];
      editor.update();
      try { BlockEditor.syncFromCode(EXAMPLES[key]); } catch (e) {}
      syncingFromCode = false;
    }
  });

  document.getElementById('zoom-in').addEventListener('click', () => {
    currentZoom = Math.min(currentZoom + 0.2, 5);
    if (diagramContainer._updateTransform) diagramContainer._updateTransform();
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    currentZoom = Math.max(currentZoom - 0.2, 0.1);
    if (diagramContainer._updateTransform) diagramContainer._updateTransform();
  });
  document.getElementById('zoom-reset').addEventListener('click', () => {
    currentZoom = 1; panX = 0; panY = 0;
    if (diagramContainer._updateTransform) diagramContainer._updateTransform();
  });
  document.getElementById('btn-download-svg').addEventListener('click', downloadSVG);

  // Sync code editor changes to blocks (debounced) — only if not syncing from blocks
  let syncTimeout = null;
  editor.textarea.addEventListener('input', () => {
    if (syncingFromBlocks) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      if (!BlockEditor.isReady()) return;
      syncingFromCode = true;
      try { BlockEditor.syncFromCode(editor.textarea.value); } catch (e) {}
      syncingFromCode = false;
    }, 1000);
  });

  // ============================================================
  // Feature 6: Shared Undo/Redo between Code and Block editors
  // ============================================================
  const sharedUndoStack = [];
  const sharedRedoStack = [];
  const MAX_SHARED_UNDO = 100;
  let lastSavedState = null;
  let sharedUndoEnabled = true;

  function saveSharedState() {
    if (!sharedUndoEnabled) return;
    
    const codeState = editor.textarea.value;
    const blocksState = BlockEditor.isReady() ? JSON.stringify(BlockEditor.getBlocks()) : '[]';
    const cursorPos = editor.textarea.selectionStart;
    
    const state = {
      code: codeState,
      blocks: blocksState,
      cursor: cursorPos,
      timestamp: Date.now()
    };
    
    // Don't save if state hasn't changed
    if (lastSavedState && lastSavedState.code === state.code && lastSavedState.blocks === state.blocks) {
      return;
    }
    
    sharedUndoStack.push(state);
    if (sharedUndoStack.length > MAX_SHARED_UNDO) {
      sharedUndoStack.shift();
    }
    sharedRedoStack.length = 0; // Clear redo stack on new change
    lastSavedState = state;
  }

  function sharedUndo() {
    if (sharedUndoStack.length === 0) return;
    
    // Save current state to redo stack
    const currentState = {
      code: editor.textarea.value,
      blocks: BlockEditor.isReady() ? JSON.stringify(BlockEditor.getBlocks()) : '[]',
      cursor: editor.textarea.selectionStart
    };
    sharedRedoStack.push(currentState);
    
    // Restore previous state
    const prevState = sharedUndoStack.pop();
    lastSavedState = prevState;
    
    // Apply state without triggering more undo saves
    sharedUndoEnabled = false;
    syncingFromCode = true;
    
    editor.textarea.value = prevState.code;
    editor.textarea.selectionStart = editor.textarea.selectionEnd = prevState.cursor;
    editor.update();
    
    if (BlockEditor.isReady()) {
      try {
        const blocks = JSON.parse(prevState.blocks);
        BlockEditor.setBlocks(blocks);
      } catch (e) {
        console.warn('Error restoring blocks from undo:', e);
      }
    }
    
    syncingFromCode = false;
    sharedUndoEnabled = true;
  }

  function sharedRedo() {
    if (sharedRedoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState = {
      code: editor.textarea.value,
      blocks: BlockEditor.isReady() ? JSON.stringify(BlockEditor.getBlocks()) : '[]',
      cursor: editor.textarea.selectionStart
    };
    sharedUndoStack.push(currentState);
    
    // Restore next state from redo stack
    const nextState = sharedRedoStack.pop();
    lastSavedState = nextState;
    
    // Apply state
    sharedUndoEnabled = false;
    syncingFromCode = true;
    
    editor.textarea.value = nextState.code;
    editor.textarea.selectionStart = editor.textarea.selectionEnd = nextState.cursor;
    editor.update();
    
    if (BlockEditor.isReady()) {
      try {
        const blocks = JSON.parse(nextState.blocks);
        BlockEditor.setBlocks(blocks);
      } catch (e) {
        console.warn('Error restoring blocks from redo:', e);
      }
    }
    
    syncingFromCode = false;
    sharedUndoEnabled = true;
  }

  // Save state before changes (debounced)
  let saveTimeout = null;
  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveSharedState, 300);
  }

  // Listen to code editor changes
  editor.textarea.addEventListener('input', scheduleSave);
  editor.textarea.addEventListener('keydown', (e) => {
    // Save state before major operations
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete' || 
        ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'x'))) {
      saveSharedState();
    }
  });

  // Override Ctrl+Z and Ctrl+Y for shared undo/redo
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    
    // Only handle undo/redo when code editor is active
    const activePanel = document.querySelector('.main-tab-panel.active');
    if (!activePanel || activePanel.dataset.panel !== 'code') return;
    
    // Don't interfere if search bar is open
    const searchBar = document.getElementById('search-bar');
    if (searchBar && searchBar.classList.contains('active')) return;
    
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      sharedUndo();
    } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      e.preventDefault();
      sharedRedo();
    }
  });

  // Initial state save
  setTimeout(() => {
    saveSharedState();
  }, 500);

	// ============================================================
// Zoom para el editor de código y el editor de bloques
// ============================================================

let codeZoom = 1;
let blockZoom = 1;
const CODE_BASE_FONT_SIZE = 14;

// Aplicar zoom al editor de código (cambia tamaño de fuente)
function applyCodeZoom() {
    const editorEl = document.getElementById('editor');
    const highlightEl = document.getElementById('editor-highlight');
    const lineNums = document.getElementById('line-numbers');
    if (!editorEl || !highlightEl || !lineNums) return;
    
    const size = CODE_BASE_FONT_SIZE * codeZoom;
    const lineHeight = size * 1.6; // mantiene proporción
    
    editorEl.style.fontSize = size + 'px';
    editorEl.style.lineHeight = lineHeight + 'px';
    highlightEl.style.fontSize = size + 'px';
    highlightEl.style.lineHeight = lineHeight + 'px';
    lineNums.style.fontSize = size + 'px';
    lineNums.style.lineHeight = lineHeight + 'px';
    
    // Forzar actualización del editor (resincroniza scroll y resaltado)
    if (window.Editor && window.Editor.update) {
        window.Editor.update();
    } else {
        // Si no existe el método update, disparar evento input
        editorEl.dispatchEvent(new Event('input'));
    }
}

// Aplicar zoom al editor de bloques (escala el workspace)
function applyBlockZoom() {
    const workspace = document.getElementById('block-workspace');
    if (!workspace) return;
    
    // Buscar o crear el wrapper interno para escalar
    let wrapper = workspace.querySelector('.block-zoom-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'block-zoom-wrapper';
        wrapper.style.transformOrigin = 'top left';
        wrapper.style.display = 'inline-block';
        wrapper.style.width = 'auto';
        wrapper.style.height = 'auto';
        // Mover todos los hijos actuales dentro del wrapper
        while (workspace.firstChild) {
            wrapper.appendChild(workspace.firstChild);
        }
        workspace.appendChild(wrapper);
    }
    wrapper.style.transform = 'scale(' + blockZoom + ')';
}

// Funciones para cambiar el zoom
function changeCodeZoom(delta) {
    codeZoom = Math.min(Math.max(codeZoom + delta, 0.5), 3);
    applyCodeZoom();
}

function changeBlockZoom(delta) {
    blockZoom = Math.min(Math.max(blockZoom + delta, 0.3), 3);
    applyBlockZoom();
}

// --- Listeners de teclado (Ctrl + +, Ctrl + -, Ctrl + 0) ---
document.addEventListener('keydown', function(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key;
    
    // Determinar qué panel está activo
    const activePanel = document.querySelector('.main-tab-panel.active');
    if (!activePanel) return;
    const panelName = activePanel.dataset.panel;
    
    if (key === '=' || key === '+') {
        e.preventDefault();
        if (panelName === 'code') {
            changeCodeZoom(0.1);
        } else if (panelName === 'blocks') {
            changeBlockZoom(0.1);
        }
    } else if (key === '-') {
        e.preventDefault();
        if (panelName === 'code') {
            changeCodeZoom(-0.1);
        } else if (panelName === 'blocks') {
            changeBlockZoom(-0.1);
        }
    } else if (key === '0') {
        e.preventDefault();
        if (panelName === 'code') {
            codeZoom = 1;
            applyCodeZoom();
        } else if (panelName === 'blocks') {
            blockZoom = 1;
            applyBlockZoom();
        }
    }
});

// --- Listener de rueda con Ctrl (zoom con scroll) ---
document.addEventListener('wheel', function(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    
    const target = e.target;
    const codeEditor = document.getElementById('editor-container');
    const blockWorkspace = document.getElementById('block-workspace');
    
    // Si el evento ocurre dentro del editor de código
    if (codeEditor && codeEditor.contains(target)) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        changeCodeZoom(delta);
    }
    // Si ocurre dentro del editor de bloques
    else if (blockWorkspace && blockWorkspace.contains(target)) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        changeBlockZoom(delta);
    }
    // Si no está en ninguno, no hacemos nada (dejamos que otros listeners, como el del diagrama, manejen el evento)
}, { passive: false });

// --- Inicializar zoom al cargar ---
// Aplicar zoom inicial (se ejecuta después de que el DOM esté listo)
setTimeout(function() {
    applyCodeZoom();
    applyBlockZoom();
}, 100);

// También reaplicar zoom cuando se cambie de pestaña (por si el wrapper no existe aún)
document.querySelectorAll('.main-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        setTimeout(function() {
            if (document.querySelector('.main-tab-panel[data-panel="blocks"]').classList.contains('active')) {
                applyBlockZoom();
            }
            if (document.querySelector('.main-tab-panel[data-panel="code"]').classList.contains('active')) {
                applyCodeZoom();
            }
        }, 50);
    });
});
  // ============================================================
  // Función global para cargar código desde el juego (starter de niveles)
  // ============================================================
  window.loadStarterCode = function(code) {
    if (!code) return;
    syncingFromCode = true;
    editor.textarea.value = code;
    editor.update();
    if (BlockEditor.isReady()) {
      try { BlockEditor.syncFromCode(code); } catch (e) { console.warn('Error sync blocks from starter:', e); }
    }
    syncingFromCode = false;
  };

  // ============================================================
  // Layout Manager: Split View con canvas funcional
  // ============================================================

  function applyLayout(mode) {
    currentLayout = mode;
    const edPanel = document.getElementById('editor-panel');
    const gmPanel = document.getElementById('game-panel');
    const splitDiv = document.getElementById('split-divider-v');

    // Actualizar botones de layout
    document.querySelectorAll('.layout-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.layout === mode);
    });

    // Actualizar tabs
    const allPanels = document.querySelectorAll('.main-tab-panel');
    allPanels.forEach(p => {
      p.style.display = 'none';
      p.classList.remove('active');
    });

    // Actualizar tabs principales
    const mTabs = document.querySelectorAll('.main-tab');
    mTabs.forEach(t => t.classList.remove('active'));

    if (mode === 'game') {
      edPanel.style.display = 'none';
      gmPanel.style.display = 'flex';
      gmPanel.style.flex = '1';
      splitDiv.style.display = 'none';
      const gameTab = document.querySelector('.main-tab[data-main-tab="game"]');
      if (gameTab) gameTab.classList.add('active');
    } else if (mode === 'diagram') {
      edPanel.style.display = 'flex';
      edPanel.style.flex = '1';
      gmPanel.style.display = 'none';
      splitDiv.style.display = 'none';
      const diagramPanel = document.querySelector('.main-tab-panel[data-panel="diagram"]');
      diagramPanel.style.display = 'flex';
      diagramPanel.classList.add('active');
      const diagramTab = document.querySelector('.main-tab[data-main-tab="diagram"]');
      if (diagramTab) diagramTab.classList.add('active');
    } else if (mode === 'split-code') {
      edPanel.style.display = 'flex';
      edPanel.style.flex = '1';
      edPanel.style.width = '';
      gmPanel.style.display = 'flex';
      gmPanel.style.flex = '1';
      gmPanel.style.width = '';
      splitDiv.style.display = 'block';
      const codePanel = document.querySelector('.main-tab-panel[data-panel="code"]');
      codePanel.style.display = 'flex';
      codePanel.classList.add('active');
      const codeTab = document.querySelector('.main-tab[data-main-tab="code"]');
      if (codeTab) codeTab.classList.add('active');
    } else if (mode === 'split-blocks') {
      edPanel.style.display = 'flex';
      edPanel.style.flex = '1';
      edPanel.style.width = '';
      gmPanel.style.display = 'flex';
      gmPanel.style.flex = '1';
      gmPanel.style.width = '';
      splitDiv.style.display = 'block';
      const blocksPanel = document.querySelector('.main-tab-panel[data-panel="blocks"]');
      blocksPanel.style.display = 'flex';
      blocksPanel.classList.add('active');
      const blocksTab = document.querySelector('.main-tab[data-main-tab="blocks"]');
      if (blocksTab) blocksTab.classList.add('active');
    }

    // Redimensionar canvas del juego después de cambiar el layout
    setTimeout(() => {
      if (window.__renderer) {
        window.__renderer.resize();
        window.__renderer.render();
      }
    }, 60);
  }

  // Event listeners para botones de layout
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyLayout(btn.dataset.layout);
    });
  });

  // Exponer applyLayout globalmente
  window.__applyLayout = applyLayout;

  // ============================================================
  // Vertical Split Divider Resize (between editor and game)
  // ============================================================
  const splitDividerV = document.getElementById('split-divider-v');
  let isVSplitResizing = false;
  let vSplitStartX = 0;
  let vSplitEditorStartFlex = 0;

  splitDividerV.addEventListener('mousedown', (e) => {
    isVSplitResizing = true;
    vSplitStartX = e.clientX;
    const edPanel = document.getElementById('editor-panel');
    vSplitEditorStartFlex = edPanel.offsetWidth;
    splitDividerV.style.background = '#f4c025';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isVSplitResizing) return;
    const delta = e.clientX - vSplitStartX;
    const edPanel = document.getElementById('editor-panel');
    const gmPanel = document.getElementById('game-panel');
    const container = document.getElementById('content-wrapper');
    const containerWidth = container.offsetWidth;
    let newEditorWidth = vSplitEditorStartFlex + delta;
    const minPane = 200;
    const maxEditor = containerWidth - minPane - 4; // 4px for divider
    newEditorWidth = Math.min(Math.max(newEditorWidth, minPane), maxEditor);
    const gameWidth = containerWidth - newEditorWidth - 4;
    edPanel.style.flex = 'none';
    edPanel.style.width = newEditorWidth + 'px';
    gmPanel.style.flex = 'none';
    gmPanel.style.width = gameWidth + 'px';
    e.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    if (isVSplitResizing) {
      isVSplitResizing = false;
      splitDividerV.style.background = '#e8e2ce';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Resize canvas after split resize
      setTimeout(() => {
        if (window.__renderer) {
          window.__renderer.resize();
          window.__renderer.render();
        }
      }, 60);
    }
  });

  // ============================================================
  // Sidebar Resize & Collapse
  // ============================================================
  const sidebar = document.getElementById('sidebar');
  const sidebarResizeHandle = document.getElementById('sidebar-resize-handle');
  const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
  const sidebarExpandBtn = document.getElementById('sidebar-expand-btn');

  let sidebarWidth = parseInt(localStorage.getItem('sidebarWidth') || '220', 10);
  if (sidebarWidth < 140) sidebarWidth = 140;
  if (sidebarWidth > 400) sidebarWidth = 400;
  sidebar.style.width = sidebarWidth + 'px';

  let isSidebarResizing = false;
  let sidebarStartX = 0;
  let sidebarStartWidth = 0;

  sidebarResizeHandle.addEventListener('mousedown', (e) => {
    isSidebarResizing = true;
    sidebarStartX = e.clientX;
    sidebarStartWidth = sidebar.offsetWidth;
    sidebarResizeHandle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isSidebarResizing) return;
    const delta = e.clientX - sidebarStartX;
    let newWidth = sidebarStartWidth + delta;
    newWidth = Math.min(Math.max(newWidth, 140), 400);
    sidebar.style.width = newWidth + 'px';
    e.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    if (isSidebarResizing) {
      isSidebarResizing = false;
      sidebarResizeHandle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('sidebarWidth', sidebar.offsetWidth);
    }
  });

  // Collapse sidebar
  let sidebarCollapsed = false;
  function collapseSidebar() {
    sidebarCollapsed = true;
    sidebar.style.width = '0px';
    sidebar.style.minWidth = '0px';
    sidebar.style.opacity = '0';
    sidebar.style.pointerEvents = 'none';
    sidebarResizeHandle.style.display = 'none';
    sidebarExpandBtn.style.display = 'flex';
    localStorage.setItem('sidebarCollapsed', 'true');
  }

  function expandSidebar() {
    sidebarCollapsed = false;
    const savedWidth = parseInt(localStorage.getItem('sidebarWidth') || '220', 10);
    sidebar.style.width = savedWidth + 'px';
    sidebar.style.minWidth = '140px';
    sidebar.style.opacity = '1';
    sidebar.style.pointerEvents = '';
    sidebarResizeHandle.style.display = '';
    sidebarExpandBtn.style.display = 'none';
    localStorage.setItem('sidebarCollapsed', 'false');
  }

  sidebarCollapseBtn.addEventListener('click', collapseSidebar);
  sidebarExpandBtn.addEventListener('click', expandSidebar);

  // Double-click on resize handle to collapse/expand
  sidebarResizeHandle.addEventListener('dblclick', () => {
    if (!sidebarCollapsed) collapseSidebar();
  });

  // Restore collapsed state
  if (localStorage.getItem('sidebarCollapsed') === 'true') {
    collapseSidebar();
  }

  // ============================================================
  // Console Clear Button
  // ============================================================
  const btnClearConsole = document.getElementById('btn-clear-console');
  if (btnClearConsole) {
    btnClearConsole.addEventListener('click', () => {
      clearConsole();
    });
  }

  // ============================================================
  // Nivel tab button for level selector
  // ============================================================
  const btnLevelsTab = document.getElementById('btn-levels-tab');
  if (btnLevelsTab) {
    btnLevelsTab.addEventListener('click', () => {
      if (typeof window.openLevelSelector === 'function') window.openLevelSelector();
      else {
        const modal = document.getElementById('game-levels-modal');
        if (modal) {
          if (typeof renderLevelsGrid === 'function') renderLevelsGrid();
          modal.style.display = 'flex';
        }
      }
    });
  }

  // ============================================================
  // Apply initial layout: Code + Game (split view)
  // ============================================================
  setTimeout(() => {
    applyLayout('split-code');
  }, 50);

})();

/* ============================================================
 * Editor con resaltado de sintaxis y numeración de líneas
 * ============================================================ */
(function (global) {
  'use strict';

  const KW_SINGLE = ['algoritmo','finalgoritmo','definir','como','constante','dimension','leer','escribir',
    'si','entonces','sino','finsi','segun','hacer','caso','finsegun','mientras','finmientras',
    'repetir','hasta','que','para','finpara','subproceso','finsubproceso','funcion','finfuncion',
    'esperar','segundos','y','o','no','mod','en','otro','de','modo'];
  const KW_COMPOUND = ['limpiar pantalla','esperar tecla','por referencia','sin saltar','con paso','hasta que','de otro modo','sino si'];
  const TYPES = ['entero','real','caracter','logico'];
  const BOOLS = ['verdadero','falso'];

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ========== Extracción de declaraciones (variables y nombres) ==========
  function extractDefinitions(source) {
    const variables = new Set();
    const names = new Set();
    const { tokens, errors } = Lexer.tokenize(source);
    if (errors.length) return { variables, names };

    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];

      if (tok.type === 'KEYWORD' && tok.value === 'algoritmo') {
        i++;
        if (i < tokens.length && tokens[i].type === 'IDENT') {
          names.add(tokens[i].value.toLowerCase());
        }
        i++;
        continue;
      }

      if (tok.type === 'KEYWORD' && tok.value === 'definir') {
        i++;
        const ids = [];
        while (i < tokens.length) {
          if (tokens[i].type === 'IDENT') {
            ids.push(tokens[i].value);
          } else if (tokens[i].type === 'KEYWORD' && tokens[i].value === 'como') {
            break;
          }
          i++;
        }
        for (const id of ids) variables.add(id.toLowerCase());
        continue;
      }

      if (tok.type === 'KEYWORD' && tok.value === 'constante') {
        i++;
        if (i < tokens.length && tokens[i].type === 'IDENT') {
          variables.add(tokens[i].value.toLowerCase());
        }
        continue;
      }

      if (tok.type === 'KEYWORD' && tok.value === 'dimension') {
        i++;
        while (i < tokens.length) {
          if (tokens[i].type === 'IDENT') {
            variables.add(tokens[i].value.toLowerCase());
            while (i < tokens.length && tokens[i].type !== 'LBRACK' && tokens[i].type !== 'COMMA' && tokens[i].type !== 'NEWLINE') i++;
          } else {
            i++;
          }
        }
        continue;
      }

      if (tok.type === 'KEYWORD' && (tok.value === 'subproceso' || tok.value === 'funcion')) {
        i++;
        if (i < tokens.length && tokens[i].type === 'IDENT') {
          names.add(tokens[i].value.toLowerCase());
          if (i + 1 < tokens.length && tokens[i + 1].type === 'LPAREN') {
            i += 2;
            while (i < tokens.length && tokens[i].type !== 'RPAREN') {
              if (tokens[i].type === 'IDENT') {
                variables.add(tokens[i].value.toLowerCase());
              }
              i++;
            }
            if (i < tokens.length && tokens[i].type === 'RPAREN') i++;
          }
        }
        continue;
      }

      i++;
    }
    return { variables, names };
  }

  // ========== Resaltado ==========
  function highlight(source, variablesSet, namesSet) {
    let out = '';
    let i = 0;
    const s = source;

    while (i < s.length) {
      const ch = s[i];

      if (ch === '/' && s[i+1] === '/') {
        let end = s.indexOf('\n', i);
        if (end === -1) end = s.length;
        out += '<span class="tok-cmt">' + escapeHtml(s.substring(i, end)) + '</span>';
        i = end; continue;
      }
      if (ch === '{') {
        let end = s.indexOf('}', i);
        if (end === -1) end = s.length; else end += 1;
        out += '<span class="tok-cmt">' + escapeHtml(s.substring(i, end)) + '</span>';
        i = end; continue;
      }
      if (ch === '"' || ch === '\'') {
        const q = ch;
        let j = i + 1;
        while (j < s.length && s[j] !== q && s[j] !== '\n') j++;
        if (s[j] === q) j++;
        out += '<span class="tok-str">' + escapeHtml(s.substring(i, j)) + '</span>';
        i = j; continue;
      }
      if (/[0-9]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
        if (s[j] === '.' && /[0-9]/.test(s[j+1])) { j++; while (j < s.length && /[0-9]/.test(s[j])) j++; }
        out += '<span class="tok-num">' + escapeHtml(s.substring(i, j)) + '</span>';
        i = j; continue;
      }
      if (/[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_]/.test(ch)) {
        let j = i;
        while (j < s.length && /[a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_]/.test(s[j])) j++;
        const word = s.substring(i, j);
        const lower = word.toLowerCase();

        let matched = null;
        for (const kw of KW_COMPOUND) {
          const parts = kw.split(' ');
          if (parts[0] !== lower) continue;
          let k = j;
          let ok = true;
          for (let x = 1; x < parts.length; x++) {
            while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++;
            let m = k;
            while (m < s.length && /[a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_]/.test(s[m])) m++;
            const w = s.substring(k, m);
            if (w.toLowerCase() !== parts[x]) { ok = false; break; }
            k = m;
          }
          if (ok) { matched = { end: k, text: s.substring(i, k) }; break; }
        }
        if (matched) {
          out += '<span class="tok-kw">' + escapeHtml(matched.text) + '</span>';
          i = matched.end; continue;
        }

        if (TYPES.includes(lower)) {
          out += '<span class="tok-type">' + escapeHtml(word) + '</span>';
        } else if (BOOLS.includes(lower)) {
          out += '<span class="tok-bool">' + escapeHtml(word) + '</span>';
        } else if (KW_SINGLE.includes(lower)) {
          out += '<span class="tok-kw">' + escapeHtml(word) + '</span>';
        } else if (window.GAME_BUILTINS && window.GAME_BUILTINS.some(function(gb){ return gb.toLowerCase() === lower; })) {
          out += '<span class="tok-game">' + escapeHtml(word) + '</span>';
        } else {
          if (namesSet && namesSet.has(lower)) {
            out += '<span class="tok-name">' + escapeHtml(word) + '</span>';
          } else if (variablesSet && variablesSet.has(lower)) {
            out += '<span class="tok-var">' + escapeHtml(word) + '</span>';
          } else {
            out += escapeHtml(word);
          }
        }
        i = j; continue;
      }
      if (ch === '<' && s[i+1] === '-') {
        out += '<span class="tok-op">&lt;-</span>';
        i += 2; continue;
      }
      if ('+-*/^%<>=,()[]:.;'.includes(ch)) {
        out += '<span class="tok-op">' + escapeHtml(ch) + '</span>';
        i++; continue;
      }
      out += escapeHtml(ch);
      i++;
    }
    return out;
  }

  // ========== Inicialización del editor ==========
  function initEditor() {
    const textarea = document.getElementById('editor');
    const highlightEl = document.getElementById('editor-highlight');
    const lineNums = document.getElementById('line-numbers');
    const INDENT = '    ';

    const INCREASE_INDENT = /^(algoritmo|subproceso|funcion|si\s+.*\s+entonces|sino|sino\s+si\s+.*\s+entonces|segun\s+.*\s+hacer|mientras\s+.*\s+hacer|repetir|para\s+.*\s+hacer|caso\s+.+:|de\s+otro\s+modo\s*:)\s*$/i;
    const DECREASE_INDENT = /^(finsi|finsegun|finmientras|finpara|finsubproceso|finfuncion|finalgoritmo|sino|sino\s+si|de\s+otro\s+modo|caso\s+.+:|hasta\s+que)\s*$/i;

    function update() {
      const src = textarea.value;
      const { variables, names } = extractDefinitions(src);
      highlightEl.innerHTML = highlight(src, variables, names) + '\n';
      highlightEl.style.height = textarea.scrollHeight + 'px';
      const lines = src.split('\n').length;
      let nums = '';
      for (let i = 1; i <= lines; i++) nums += i + '\n';
      lineNums.textContent = nums;
      // Actualizar posición de los overlays al cambiar el contenido
      updateOverlays();
    }

    function syncScroll() {
      highlightEl.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
      lineNums.scrollTop = textarea.scrollTop;
      // Mover overlays con el scroll
      updateOverlays();
    }

    // ========== Unified Highlight Manager ==========
    const highlightManager = {
      overlays: new Map(),
      
      createOverlay(id) {
        this.removeOverlay(id);
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;';
        document.getElementById('editor-container').appendChild(overlay);
        this.overlays.set(id, overlay);
        this.updateOverlayPosition(overlay);
        return overlay;
      },
      
      removeOverlay(id) {
        const overlay = this.overlays.get(id);
        if (overlay) {
          overlay.remove();
          this.overlays.delete(id);
        }
      },
      
      clearAll() {
        for (const [id, overlay] of this.overlays) {
          overlay.remove();
        }
        this.overlays.clear();
      },
      
      // Actualiza la posición de un overlay según el scroll actual
      updateOverlayPosition(overlay) {
        overlay.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
      },
      
      // Actualiza todos los overlays
      updateAllPositions() {
        for (const [id, overlay] of this.overlays) {
          this.updateOverlayPosition(overlay);
        }
      },
      
      // Medir posición exacta de un carácter
      measurePosition(text, charIndex) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const style = getComputedStyle(textarea);
        ctx.font = style.font;
        
        const padLeft = parseFloat(style.paddingLeft) || 0;
        const padTop = parseFloat(style.paddingTop) || 0;
        
        const lines = text.split('\n');
        let currentPos = 0;
        const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.6);
        
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          if (charIndex <= currentPos + line.length) {
            const col = charIndex - currentPos;
            const textBefore = line.substring(0, col);
            const width = ctx.measureText(textBefore).width;
            return {
              top: padTop + lineIdx * lineHeight,
              left: padLeft + width,
              lineHeight: lineHeight
            };
          }
          currentPos += line.length + 1;
        }
        return { top: padTop, left: padLeft, lineHeight: lineHeight };
      },
      
      // Medir ancho de un texto
      measureText(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const style = getComputedStyle(textarea);
        ctx.font = style.font;
        return ctx.measureText(text).width;
      }
    };

    // Función para actualizar todos los overlays desde fuera
    function updateOverlays() {
      highlightManager.updateAllPositions();
    }

    // ========== Feature 1: Word Highlight on Double-Click ==========
    let wordHighlightTimeout = null;
    
    function highlightWordOccurrences() {
      highlightManager.removeOverlay('word-highlight-overlay');
      
      const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      if (!selectedText || /\s/.test(selectedText) || selectedText.length < 2) return;
      if (!/^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_][a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_]*$/.test(selectedText)) return;

      const text = textarea.value;
      const regex = new RegExp('\\b' + selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      const highlights = [];
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        highlights.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
      }

      if (highlights.length === 0) return;

      const overlay = highlightManager.createOverlay('word-highlight-overlay');
      
      for (const hl of highlights) {
        const startPos = highlightManager.measurePosition(text, hl.start);
        const width = highlightManager.measureText(hl.text);
        
        const mark = document.createElement('div');
        mark.style.cssText = `position:absolute;top:${startPos.top}px;left:${startPos.left}px;width:${width}px;height:${startPos.lineHeight}px;background:rgba(0,211,255,0.15);border:1px solid rgba(0,211,255,0.3);border-radius:2px;box-sizing:border-box;`;
        overlay.appendChild(mark);
      }
      // Asegurar que el overlay se posicione correctamente
      highlightManager.updateOverlayPosition(overlay);
    }

    textarea.addEventListener('dblclick', () => {
      if (wordHighlightTimeout) clearTimeout(wordHighlightTimeout);
      wordHighlightTimeout = setTimeout(highlightWordOccurrences, 100);
    });

    textarea.addEventListener('mouseup', () => {
      if (wordHighlightTimeout) clearTimeout(wordHighlightTimeout);
      wordHighlightTimeout = setTimeout(highlightWordOccurrences, 300);
    });

    textarea.addEventListener('mousedown', (e) => {
      if (textarea.selectionStart === textarea.selectionEnd) {
        highlightManager.removeOverlay('word-highlight-overlay');
      }
    });

    // ========== Feature 2: Search Bar (Ctrl+F) ==========
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const searchInfo = document.getElementById('search-info');
    const searchPrev = document.getElementById('search-prev');
    const searchNext = document.getElementById('search-next');
    const searchClose = document.getElementById('search-close');
    let searchMatches = [];
    let searchCurrentIndex = -1;

    function openSearchBar() {
      searchBar.classList.add('active');
      searchInput.focus();
      const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      if (selected && !/\s/.test(selected)) {
        searchInput.value = selected;
        performSearch();
      }
    }

    function closeSearchBar() {
      searchBar.classList.remove('active');
      searchInput.value = '';
      searchMatches = [];
      searchCurrentIndex = -1;
      searchInfo.textContent = '';
      highlightManager.removeOverlay('search-highlight-overlay');
      textarea.focus();
    }

    function performSearch() {
      const query = searchInput.value;
      if (!query) {
        searchMatches = [];
        searchCurrentIndex = -1;
        searchInfo.textContent = '';
        highlightManager.removeOverlay('search-highlight-overlay');
        return;
      }

      const text = textarea.value;
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      searchMatches = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        searchMatches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
      }

      searchCurrentIndex = searchMatches.length > 0 ? 0 : -1;
      updateSearchInfo();
      highlightSearchMatches();
    }

    function updateSearchInfo() {
      if (searchMatches.length === 0) {
        searchInfo.textContent = 'Sin resultados';
      } else {
        searchInfo.textContent = `${searchCurrentIndex + 1} de ${searchMatches.length}`;
      }
    }

    function highlightSearchMatches() {
      highlightManager.removeOverlay('search-highlight-overlay');
      if (searchMatches.length === 0) return;

      const overlay = highlightManager.createOverlay('search-highlight-overlay');
      const text = textarea.value;
      
      for (let i = 0; i < searchMatches.length; i++) {
        const match = searchMatches[i];
        const startPos = highlightManager.measurePosition(text, match.start);
        const width = highlightManager.measureText(match.text);
        const isCurrent = i === searchCurrentIndex;
        
        const mark = document.createElement('div');
        mark.style.cssText = `position:absolute;top:${startPos.top}px;left:${startPos.left}px;width:${width}px;height:${startPos.lineHeight}px;background:${isCurrent ? 'rgba(255,213,0,0.4)' : 'rgba(255,213,0,0.2)'};border:${isCurrent ? '2px solid rgba(255,213,0,0.8)' : '1px solid rgba(255,213,0,0.4)'};border-radius:2px;box-sizing:border-box;`;
        overlay.appendChild(mark);
      }
      highlightManager.updateOverlayPosition(overlay);
    }

    function navigateSearch(direction) {
      if (searchMatches.length === 0) return;
      searchCurrentIndex = (searchCurrentIndex + direction + searchMatches.length) % searchMatches.length;
      updateSearchInfo();
      highlightSearchMatches();
      
      const match = searchMatches[searchCurrentIndex];
      const pos = highlightManager.measurePosition(textarea.value, match.start);
      textarea.scrollTop = pos.top - textarea.clientHeight / 2;
    }

    searchInput.addEventListener('input', performSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigateSearch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchBar();
      }
    });
    searchPrev.addEventListener('click', () => navigateSearch(-1));
    searchNext.addEventListener('click', () => navigateSearch(1));
    searchClose.addEventListener('click', closeSearchBar);

    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        openSearchBar();
      }
    });

    // ========== Feature 4: Text Drag & Drop ==========
    let dragStartPos = null;
    let dragText = null;
    let dragOriginalRange = null;
    let dropIndicator = null;

    textarea.addEventListener('mousedown', (e) => {
      if (textarea.selectionStart !== textarea.selectionEnd) {
        dragStartPos = { x: e.clientX, y: e.clientY };
        dragOriginalRange = {
          start: textarea.selectionStart,
          end: textarea.selectionEnd
        };
      }
    });

    textarea.addEventListener('mousemove', (e) => {
      if (dragStartPos && textarea.selectionStart !== textarea.selectionEnd) {
        const dx = Math.abs(e.clientX - dragStartPos.x);
        const dy = Math.abs(e.clientY - dragStartPos.y);
        if (dx > 5 || dy > 5) {
          dragText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
        }
      }
    });

    textarea.addEventListener('dragstart', (e) => {
      if (dragText) {
        e.dataTransfer.setData('text/plain', dragText);
        e.dataTransfer.setData('application/x-internal-drag', 'true');
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    textarea.addEventListener('dragover', (e) => {
      const isInternalDrag = e.dataTransfer.types.includes('application/x-internal-drag');
      e.preventDefault();
      e.dataTransfer.dropEffect = isInternalDrag ? 'move' : 'copy';
      
      const rect = textarea.getBoundingClientRect();
      const style = getComputedStyle(textarea);
      const lineHeight = parseFloat(style.lineHeight);
      const y = e.clientY - rect.top - parseFloat(style.paddingTop) + textarea.scrollTop;
      const lineIdx = Math.floor(y / lineHeight);
      
      if (dropIndicator) dropIndicator.remove();
      dropIndicator = document.createElement('div');
      const topPos = lineIdx * lineHeight;
      dropIndicator.style.cssText = `position:absolute;top:${topPos}px;left:0;right:0;height:2px;background:rgba(255,213,0,0.6);pointer-events:none;z-index:100;`;
      document.getElementById('editor-container').appendChild(dropIndicator);
    });

    textarea.addEventListener('dragleave', () => {
      if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
      }
    });

    textarea.addEventListener('drop', (e) => {
      if (window.BlockEditor && window.BlockEditor.isPaletteDrag()) {
        if (dropIndicator) {
          dropIndicator.remove();
          dropIndicator = null;
        }
        return;
      }
      
      e.preventDefault();
      if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
      }
      
      const text = e.dataTransfer.getData('text/plain');
      if (!text) return;

      const isInternalDrag = e.dataTransfer.getData('application/x-internal-drag') === 'true';

      const rect = textarea.getBoundingClientRect();
      const style = getComputedStyle(textarea);
      const lineHeight = parseFloat(style.lineHeight);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = style.font;
      const charWidth = ctx.measureText('M').width;
      
      const x = e.clientX - rect.left - parseFloat(style.paddingLeft) + textarea.scrollLeft;
      const y = e.clientY - rect.top - parseFloat(style.paddingTop) + textarea.scrollTop;
      
      const lines = textarea.value.split('\n');
      const lineIdx = Math.floor(y / lineHeight);
      const col = Math.round(x / charWidth);
      
      let pos = 0;
      for (let i = 0; i < Math.min(lineIdx, lines.length); i++) {
        pos += lines[i].length + 1;
      }
      pos += Math.min(col, lines[Math.min(lineIdx, lines.length - 1)]?.length || 0);

      if (isInternalDrag && dragOriginalRange) {
        const start = dragOriginalRange.start;
        const end = dragOriginalRange.end;
        textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
        if (pos > start) {
          pos -= (end - start);
        }
      }

      textarea.value = textarea.value.substring(0, pos) + text + textarea.value.substring(pos);
      textarea.selectionStart = textarea.selectionEnd = pos + text.length;
      update();
      
      dragText = null;
      dragStartPos = null;
      dragOriginalRange = null;
    });

    textarea.addEventListener('dragend', () => {
      dragText = null;
      dragStartPos = null;
      dragOriginalRange = null;
      if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
      }
    });

    // ========== Feature 5: Autocomplete ==========
    const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
    let autocompleteItems = [];
    let autocompleteSelectedIndex = -1;
    let autocompleteVisible = false;

    // ========== Auto-indentación inteligente (estilo VS Code) ==========
    const INDENT_UNIT = '    ';

    // Palabras que aumentan la indentación en la SIGUIENTE línea
    const INCREASE_NEXT = /^(algoritmo|subproceso|funcion|si\s+.*\s+entonces|sino\s+si\s+.*\s+entonces|sino|mientras\s+.*\s+hacer|para\s+.*\s+hacer|repetir|segun\s+.*\s+hacer|caso\s+.+:|de\s+otro\s+modo\s*:)\s*$/i;
    // Palabras que disminuyen la indentación de la línea actual
    const DECREASE_CURRENT = /^(finsi|finsegun|finmientras|finpara|finsubproceso|finfuncion|finalgoritmo|sino|sino\s+si|de\s+otro\s+modo|caso\s+.+:|hasta\s+que)\s*$/i;

    function getLineIndent(line) {
      const m = line.match(/^(\s*)/);
      return m ? m[1] : '';
    }

    // Calcular indentación basada en toda la estructura del código
    function computeSmartIndent(lines, lineIdx) {
      let depth = 0;
      for (let i = 0; i < lineIdx; i++) {
        const trimmed = lines[i].trim().toLowerCase();
        if (INCREASE_NEXT.test(trimmed)) depth++;
        // Las líneas de cierre no aumentan depth (ya se reducen al escribir)
        if (DECREASE_CURRENT.test(trimmed)) depth = Math.max(0, depth - 1);
      }
      return INDENT_UNIT.repeat(depth);
    }

    textarea.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      if (autocompleteVisible) return;

      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      // Si hay selección, reemplazarla primero
      if (start !== end) {
        textarea.value = value.substring(0, start) + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start;
      }

      // Encontrar la línea actual
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.substring(lineStart, start);
      const currentIndent = getLineIndent(currentLine);
      const cursorInLine = start - lineStart;
      const textBeforeCursor = currentLine.substring(0, cursorInLine);
      const textAfterCursor = currentLine.substring(cursorInLine);

      // Todo el texto después del cursor en la línea actual
      const remainingOnLine = textAfterCursor.trim();

      // Calcular nueva indentación
      let newIndent;
      if (remainingOnLine.length > 0) {
        // Si hay texto después del cursor, simplemente insertar newline + misma indentación
        newIndent = currentIndent;
      } else {
        // Calcular indentación inteligente
        const allLines = value.split('\n');
        const currentLineIdx = value.substring(0, start).split('\n').length - 1;
        newIndent = computeSmartIndent(allLines, currentLineIdx);

        // Si la línea actual es una palabra de cierre, usar indentación reducida
        const trimmedCurrent = textBeforeCursor.trim();
        if (DECREASE_CURRENT.test(trimmedCurrent)) {
          if (currentIndent.length >= INDENT_UNIT.length) {
            newIndent = currentIndent.substring(INDENT_UNIT.length);
          } else {
            newIndent = '';
          }
        }
        // Si la línea actual aumenta indentación pero no hay texto después, mantener la nueva indentación
        else if (INCREASE_NEXT.test(trimmedCurrent)) {
          newIndent = currentIndent + INDENT_UNIT;
        }
        // Si no hay texto antes del cursor (línea vacía), mantener indentación inteligente
        else if (trimmedCurrent.length === 0) {
          newIndent = computeSmartIndent(allLines, currentLineIdx);
        }
      }

      // Insertar newline + indentación
      const insertion = '\n' + newIndent;
      textarea.value = value.substring(0, start) + insertion + value.substring(start);
      textarea.selectionStart = textarea.selectionEnd = start + insertion.length;

      update();
      if (window.Editor && window.Editor.updateLineCounter) {
        window.Editor.updateLineCounter();
      }
    });

    // Re-indentar línea actual al escribir (ajustar indentación al detectar keywords)
    textarea.addEventListener('keyup', function(e) {
      if (e.key === 'Enter' || e.key === 'Tab') return;
      // No re-indentar automáticamente al escribir (solo en Enter/Tab)
      // para no interferir con la edición libre del usuario
    });
	
	// ========== Indentación con Tab / Shift+Tab ==========
textarea.addEventListener('keydown', function (e) {
  if (e.key !== 'Tab') return;
  if (autocompleteVisible) return; // el autocompletado ya maneja Tab

  e.preventDefault();

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const INDENT = '    ';

  // Si NO hay selección (solo cursor), insertar/eliminar espacios en la posición del cursor
  if (start === end) {
    if (e.shiftKey) {
      // Shift+Tab: eliminar hasta 4 espacios antes del cursor en la misma línea
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const textBefore = value.substring(lineStart, start);
      // Count spaces/tabs at beginning of text before cursor
      let spacesToRemove = 0;
      for (let i = textBefore.length - 1; i >= 0 && i >= textBefore.length - 4; i--) {
        if (textBefore[i] === ' ') spacesToRemove++;
        else break;
      }
      if (spacesToRemove > 0) {
        const removeStart = start - spacesToRemove;
        textarea.value = value.substring(0, removeStart) + value.substring(start);
        textarea.selectionStart = textarea.selectionEnd = removeStart;
      }
    } else {
      // Tab: insertar 4 espacios en la posición del cursor
      textarea.value = value.substring(0, start) + INDENT + value.substring(start);
      textarea.selectionStart = textarea.selectionEnd = start + INDENT.length;
    }
    update();
    if (window.Editor && window.Editor.updateLineCounter) {
      window.Editor.updateLineCounter();
    }
    return;
  }

  // Si HAY selección, operar en las líneas seleccionadas
  const lines = value.split('\n');
  let lineStartIdx = value.lastIndexOf('\n', Math.max(start - 1, 0)) + 1;
  let lineEndIdx = value.indexOf('\n', end);
  if (lineEndIdx === -1) lineEndIdx = value.length;

  // Obtener el número de línea de inicio y fin (0-based)
  let lineStart = 0;
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pos >= start) break;
    pos += lines[i].length + 1;
    lineStart++;
  }
  let lineEnd = lineStart;
  pos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pos >= end) break;
    pos += lines[i].length + 1;
    lineEnd = i;
  }
  // Si la selección termina justo al inicio de una línea, no la incluimos
  if (pos === end && end > 0 && value[end - 1] === '\n') {
    lineEnd = Math.max(0, lineEnd - 1);
  }
  // Asegurar que al menos se procese la línea donde está el cursor
  if (lineEnd < lineStart) lineEnd = lineStart;

  if (e.shiftKey) {
    // Desindentar: eliminar 4 espacios al inicio de cada línea afectada
    const newLines = lines.map((line, idx) => {
      if (idx < lineStart || idx > lineEnd) return line;
      if (line.startsWith(INDENT)) {
        return line.substring(INDENT.length);
      } else if (line.startsWith('\t')) {
        return line.substring(1);
      } else {
        return line;
      }
    });
    const newValue = newLines.join('\n');
    textarea.value = newValue;
    // Ajustar la selección: mover el cursor al final de la desindentación
    const newStart = start - (lines[lineStart].length - newLines[lineStart].length);
    const newEnd = end - (lines.slice(lineStart, lineEnd + 1).reduce((acc, l, i) => acc + (l.length - newLines[lineStart + i].length), 0));
    textarea.selectionStart = Math.max(0, newStart);
    textarea.selectionEnd = Math.max(0, newEnd);
  } else {
    // Indentar: añadir 4 espacios al inicio de cada línea afectada
    const newLines = lines.map((line, idx) => {
      if (idx < lineStart || idx > lineEnd) return line;
      return INDENT + line;
    });
    const newValue = newLines.join('\n');
    textarea.value = newValue;
    const newStart = start + INDENT.length;
    const newEnd = end + (lineEnd - lineStart + 1) * INDENT.length;
    textarea.selectionStart = newStart;
    textarea.selectionEnd = newEnd;
  }

  // Actualizar resaltado y líneas
  update();
  // Actualizar el contador de líneas
  if (window.Editor && window.Editor.updateLineCounter) {
    window.Editor.updateLineCounter();
  }
});

    const PSEINT_KEYWORDS = [
      'Algoritmo', 'FinAlgoritmo', 'Definir', 'Como', 'Entero', 'Real', 'Caracter', 'Logico',
      'Constante', 'Dimension', 'Leer', 'Escribir', 'Si', 'Entonces', 'Sino', 'FinSi',
      'Segun', 'Hacer', 'Caso', 'FinSegun', 'Mientras', 'FinMientras', 'Repetir', 'Hasta',
      'Que', 'Para', 'FinPara', 'SubProceso', 'FinSubProceso', 'Funcion', 'FinFuncion',
      'Verdadero', 'Falso', 'Y', 'O', 'No', 'Mod', 'Limpiar', 'Pantalla', 'Esperar', 'Tecla'
    ];

    function showAutocomplete() {
      const cursorPos = textarea.selectionStart;
      const textBefore = textarea.value.substring(0, cursorPos);
      const wordMatch = textBefore.match(/([a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_][a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_]*)$/);
      
      if (!wordMatch) {
        hideAutocomplete();
        return;
      }

      const partialWord = wordMatch[1].toLowerCase();
      if (partialWord.length < 2) {
        hideAutocomplete();
        return;
      }

      const { variables, names } = extractDefinitions(textarea.value);
      const suggestions = [];

      for (const kw of PSEINT_KEYWORDS) {
        if (kw.toLowerCase().startsWith(partialWord)) {
          suggestions.push({ label: kw, type: 'keyword', icon: '⚡' });
        }
      }
      for (const v of variables) {
        if (v.toLowerCase().startsWith(partialWord)) {
          suggestions.push({ label: v, type: 'variable', icon: '📦' });
        }
      }
      for (const n of names) {
        if (n.toLowerCase().startsWith(partialWord)) {
          suggestions.push({ label: n, type: 'function', icon: '⚙️' });
        }
      }

      if (suggestions.length === 0) {
        hideAutocomplete();
        return;
      }

      autocompleteItems = suggestions.slice(0, 10);
      autocompleteSelectedIndex = 0;
      renderAutocomplete();
      positionAutocomplete();
      autocompleteDropdown.classList.add('active');
      autocompleteVisible = true;
    }

    function hideAutocomplete() {
      autocompleteDropdown.classList.remove('active');
      autocompleteVisible = false;
      autocompleteItems = [];
      autocompleteSelectedIndex = -1;
    }

    function renderAutocomplete() {
      autocompleteDropdown.innerHTML = '';
      autocompleteItems.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item' + (idx === autocompleteSelectedIndex ? ' selected' : '');
        div.innerHTML = `
          <span class="ac-icon">${item.icon}</span>
          <span class="ac-label">${item.label}</span>
          <span class="ac-type">${item.type}</span>
        `;
        div.addEventListener('click', () => {
          autocompleteSelectedIndex = idx;
          applyAutocomplete();
        });
        div.addEventListener('mouseenter', () => {
          autocompleteSelectedIndex = idx;
          renderAutocomplete();
        });
        autocompleteDropdown.appendChild(div);
      });
    }

    function positionAutocomplete() {
      const cursorPos = textarea.selectionStart;
      const textBefore = textarea.value.substring(0, cursorPos);
      const lines = textBefore.split('\n');
      const lineIdx = lines.length - 1;
      const col = lines[lineIdx].length;
      
      const style = getComputedStyle(textarea);
      const lineHeight = parseFloat(style.lineHeight);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = style.font;
      const left = ctx.measureText(lines[lineIdx]).width;
      
      const top = (lineIdx + 1) * lineHeight + 8;
      
      autocompleteDropdown.style.top = top + 'px';
      autocompleteDropdown.style.left = Math.min(left + 10, textarea.offsetWidth - 250) + 'px';
    }

    function applyAutocomplete() {
      if (autocompleteSelectedIndex < 0 || autocompleteSelectedIndex >= autocompleteItems.length) return;
      
      const item = autocompleteItems[autocompleteSelectedIndex];
      const cursorPos = textarea.selectionStart;
      const textBefore = textarea.value.substring(0, cursorPos);
      const wordMatch = textBefore.match(/([a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_][a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_]*)$/);
      
      if (wordMatch) {
        const start = cursorPos - wordMatch[1].length;
        textarea.value = textarea.value.substring(0, start) + item.label + textarea.value.substring(cursorPos);
        textarea.selectionStart = textarea.selectionEnd = start + item.label.length;
        update();
      }
      
      hideAutocomplete();
    }

    textarea.addEventListener('input', (e) => {
      update();
      if (e.inputType === 'insertText' || e.inputType === 'insertFromPaste') {
        setTimeout(showAutocomplete, 50);
      } else {
        hideAutocomplete();
      }
    });

    textarea.addEventListener('keydown', (e) => {
      if (autocompleteVisible) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          autocompleteSelectedIndex = (autocompleteSelectedIndex + 1) % autocompleteItems.length;
          renderAutocomplete();
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          autocompleteSelectedIndex = (autocompleteSelectedIndex - 1 + autocompleteItems.length) % autocompleteItems.length;
          renderAutocomplete();
          return;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          applyAutocomplete();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          hideAutocomplete();
          return;
        }
      }
    }, true);

    textarea.addEventListener('blur', (e) => {
      const relatedTarget = e.relatedTarget;
      if (relatedTarget && relatedTarget.closest && relatedTarget.closest('.autocomplete-dropdown')) {
        return;
      }
      setTimeout(hideAutocomplete, 200);
    });

    // ========== Feature 3: Line Counter ==========
    const lineCounter = document.getElementById('line-counter');
    
    function updateLineCounter() {
      const cursorPos = textarea.selectionStart;
      const textBefore = textarea.value.substring(0, cursorPos);
      const lines = textBefore.split('\n');
      const lineNum = lines.length;
      const colNum = lines[lines.length - 1].length + 1;
      const totalLines = textarea.value.split('\n').length;
      
      lineCounter.textContent = `Ln ${lineNum}, Col ${colNum} | ${totalLines} líneas`;
    }

    textarea.addEventListener('click', updateLineCounter);
    textarea.addEventListener('keyup', updateLineCounter);
    textarea.addEventListener('select', updateLineCounter);
    updateLineCounter();

    // ========== Keyword Structure Matching (por tipo de estructura, case-insensitive) ==========
const STRUCTURE_PAIRS = [
  { opener: 'algoritmo',     closer: 'finalgoritmo'  },
  { opener: 'subproceso',    closer: 'finsubproceso' },
  { opener: 'funcion',       closer: 'finfuncion'    },
  { opener: 'si',            closer: 'finsi'         },
  { opener: 'mientras',      closer: 'finmientras'   },
  { opener: 'para',          closer: 'finpara'       },
  { opener: 'segun',         closer: 'finsegun'      },
  { opener: 'repetir',       closer: 'hasta que'     }
];

const ALL_STRUCT_KW = [];
STRUCTURE_PAIRS.forEach(p => { ALL_STRUCT_KW.push(p.opener); ALL_STRUCT_KW.push(p.closer); });
['entonces', 'sino', 'caso', 'sino si', 'hacer'].forEach(kw => ALL_STRUCT_KW.push(kw));

function getStructType(word) {
  const w = word.toLowerCase();
  for (const p of STRUCTURE_PAIRS) {
    if (p.opener === w) return { type: 'opener', pair: p };
    if (p.closer === w) return { type: 'closer', pair: p };
  }
  if (w === 'entonces') return { type: 'intermediate', structName: 'si' };
  if (w === 'sino')     return { type: 'intermediate', structName: 'si' };
  if (w === 'caso')     return { type: 'intermediate', structName: 'segun' };
  return null;
}

function findStructByName(name) {
  return STRUCTURE_PAIRS.find(p => p.opener === name);
}

function isWordChar(ch) {
  return ch && /[a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_]/.test(ch);
}

// Busqueda case-insensitive de una keyword en el texto, con word boundaries
// lowerText = text.toLowerCase() (pre-calculado para eficiencia)
function findKeywordCI(text, lowerText, keyword, fromIndex) {
  const kw = keyword.toLowerCase();
  let idx = lowerText.indexOf(kw, fromIndex || 0);
  while (idx !== -1) {
    const before = idx > 0 ? text[idx - 1] : '';
    const after = text[idx + kw.length] || '';
    if (!isWordChar(before) && !isWordChar(after)) {
      return idx;
    }
    idx = lowerText.indexOf(kw, idx + 1);
  }
  return -1;
}

function getWordAtCursor(text, pos) {
  const lower = text.toLowerCase();

  // 1) Compuestos primero: "sino si", "hasta que"
  const compounds = ['sino si', 'hasta que'];
  for (const kw of compounds) {
    let idx = findKeywordCI(text, lower, kw, 0);
    while (idx !== -1) {
      if (pos >= idx && pos < idx + kw.length) {
        return { word: text.substring(idx, idx + kw.length), start: idx, end: idx + kw.length };
      }
      idx = findKeywordCI(text, lower, kw, idx + 1);
    }
  }

  // 2) Simples: verificar si el cursor esta sobre alguna keyword
  for (const kw of ALL_STRUCT_KW) {
    if (kw.includes(' ')) continue;
    let idx = findKeywordCI(text, lower, kw, 0);
    while (idx !== -1) {
      if (pos >= idx && pos < idx + kw.length) {
        return { word: text.substring(idx, idx + kw.length), start: idx, end: idx + kw.length };
      }
      idx = findKeywordCI(text, lower, kw, idx + 1);
    }
  }

  // 3) Fallback: extraer palabra bajo el cursor
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const startMatch = before.match(/([a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_]+)$/);
  const endMatch = after.match(/^([a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_]+)/);
  if (startMatch && endMatch) {
    const start = pos - startMatch[1].length;
    const end = pos + endMatch[1].length;
    return { word: text.substring(start, end), start, end };
  }
  return null;
}

// Encuentra todas las ocurrencias clasificadas (case-insensitive), "sino si" como compuesto
function findAllClassifiedOccurrences(text) {
  const occ = [];
  const used = new Set();
  const lower = text.toLowerCase();

  // Primero: "sino si" como compuesto
  let idx = findKeywordCI(text, lower, 'sino si', 0);
  while (idx !== -1) {
    occ.push({ word: 'sino si', index: idx, length: 7, structType: 'sino_si' });
    for (let j = idx; j < idx + 7; j++) used.add(j);
    idx = findKeywordCI(text, lower, 'sino si', idx + 1);
  }

  // Luego: palabras simples
  for (const kw of ALL_STRUCT_KW) {
    if (kw.includes(' ')) continue;
    idx = findKeywordCI(text, lower, kw, 0);
    while (idx !== -1) {
      if (!used.has(idx)) {
        const info = getStructType(kw);
        let structType = 'unknown';
        if (info) {
          if (info.type === 'opener') structType = 'opener';
          else if (info.type === 'closer') structType = 'closer';
          else if (info.type === 'intermediate') structType = info.structName;
        }
        occ.push({ word: kw, index: idx, length: kw.length, structType });
        for (let j = idx; j < idx + kw.length; j++) used.add(j);
      }
      idx = findKeywordCI(text, lower, kw, idx + 1);
    }
  }
  occ.sort((a, b) => a.index - b.index);
  return occ;
}

// Busca la palabra pareja correcta usando profundidad SOLO del tipo de estructura
function findMatchingKeyword(text, cursorPos, wordLower) {
  const info = getStructType(wordLower);
  if (!info) return null;

  const occ = findAllClassifiedOccurrences(text);
  let currentIdx = -1;
  for (let i = 0; i < occ.length; i++) {
    const m = occ[i];
    if (cursorPos >= m.index && cursorPos < m.index + m.length) {
      currentIdx = i;
      break;
    }
  }
  if (currentIdx === -1) return null;

  if (info.type === 'opener') {
    // Desde opener hacia adelante: depth empieza en 1 (ya estamos dentro del bloque)
    const openerKw = info.pair.opener;
    const closerKw = info.pair.closer;
    let depth = 1;
    for (let i = currentIdx + 1; i < occ.length; i++) {
      const m = occ[i];
      if (m.structType === 'opener' && m.word === openerKw) depth++;
      else if (m.structType === 'closer' && m.word === closerKw) {
        depth--;
        if (depth === 0) return { index: m.index, length: m.length };
      }
    }
  } else if (info.type === 'closer') {
    // Desde closer hacia atras: depth empieza en 1 (ya estamos dentro del bloque)
    const openerKw = info.pair.opener;
    const closerKw = info.pair.closer;
    let depth = 1;
    for (let i = currentIdx - 1; i >= 0; i--) {
      const m = occ[i];
      if (m.structType === 'closer' && m.word === closerKw) depth++;
      else if (m.structType === 'opener' && m.word === openerKw) {
        depth--;
        if (depth === 0) return { index: m.index, length: m.length };
      }
    }
  } else if (info.type === 'intermediate') {
    if (info.structName === 'si') {
      const pair = findStructByName('si');
      const openerKw = pair.opener;
      const closerKw = pair.closer;

      if (wordLower === 'entonces') {
        // Estamos dentro del bloque si (depth=1). Buscar hacia adelante:
        // sino/sino si al mismo nivel (depth=1), o finsi (depth llega a 0)
        let depth = 1;
        for (let i = currentIdx + 1; i < occ.length; i++) {
          const m = occ[i];
          if (m.structType === 'opener' && m.word === openerKw) depth++;
          else if (m.structType === 'closer' && m.word === closerKw) {
            depth--;
            if (depth === 0) return { index: m.index, length: m.length };
          }
          else if (depth === 1 && (m.word === 'sino' || m.structType === 'sino_si')) {
            return { index: m.index, length: m.length };
          }
        }
      } else if (wordLower === 'sino') {
        // PARTE 1: Buscar hacia atras el "entonces" del mismo nivel
        // depth=1 porque estamos dentro del bloque si
        let depth = 1;
        let entoncesFound = false;
        for (let i = currentIdx - 1; i >= 0; i--) {
          const m = occ[i];
          if (m.structType === 'closer' && m.word === closerKw) depth++;
          else if (m.structType === 'opener' && m.word === openerKw) {
            depth--;
            if (depth === 0) break; // Salimos del si sin encontrar entonces (no deberia pasar)
          }
          else if (m.word === 'entonces' && depth === 1) {
            entoncesFound = true;
            break;
          }
        }

        if (entoncesFound) {
          // PARTE 2: Buscar hacia adelante el finsi o siguiente sino/sino si al mismo nivel
          let fwdDepth = 1;
          for (let j = currentIdx + 1; j < occ.length; j++) {
            const f = occ[j];
            if (f.structType === 'opener' && f.word === openerKw) fwdDepth++;
            else if (f.structType === 'closer' && f.word === closerKw) {
              fwdDepth--;
              if (fwdDepth === 0) return { index: f.index, length: f.length };
            }
            else if (fwdDepth === 1 && (f.word === 'sino' || f.structType === 'sino_si')) {
              return { index: f.index, length: f.length };
            }
          }
        }
      }
    } else if (info.structName === 'segun' && wordLower === 'caso') {
      const pair = findStructByName('segun');
      const openerKw = pair.opener;
      const closerKw = pair.closer;
      // depth=1 porque estamos dentro del segun
      let depth = 1;
      for (let i = currentIdx + 1; i < occ.length; i++) {
        const m = occ[i];
        if (m.structType === 'opener' && m.word === openerKw) depth++;
        else if (m.structType === 'closer' && m.word === closerKw) {
          depth--;
          if (depth === 0) return { index: m.index, length: m.length };
        }
        else if (depth === 1 && m.word === 'caso') {
          return { index: m.index, length: m.length };
        }
      }
    }
  }
  return null;
}

let keywordMatchTimeout = null;

function addHighlightRect(overlay, top, left, width, height, isCurrent) {
  const mark = document.createElement('div');
  const bg = isCurrent ? 'rgba(0, 150, 255, 0.25)' : 'rgba(0, 150, 255, 0.15)';
  const border = isCurrent ? '2px solid rgba(0, 150, 255, 0.9)' : '1px solid rgba(0, 150, 255, 0.5)';
  mark.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${width}px;height:${height}px;background:${bg};border:${border};border-radius:2px;box-sizing:border-box;pointer-events:none;`;
  overlay.appendChild(mark);
}

function highlightMatchingKeyword() {
  highlightManager.removeOverlay('keyword-match-overlay');

  const text = textarea.value;
  const pos = textarea.selectionStart;
  const wordInfo = getWordAtCursor(text, pos);
  if (!wordInfo) return;

  const wordLower = wordInfo.word.toLowerCase();
  const info = getStructType(wordLower);
  if (!info) return;

  const result = findMatchingKeyword(text, wordInfo.start, wordLower);
  if (!result) return;

  const overlay = highlightManager.createOverlay('keyword-match-overlay');

  // Resaltar palabra actual (con el texto real del source)
  const curPos = highlightManager.measurePosition(text, wordInfo.start);
  const curWidth = highlightManager.measureText(text.substring(wordInfo.start, wordInfo.end));
  addHighlightRect(overlay, curPos.top, curPos.left, curWidth, curPos.lineHeight, true);

  // Resaltar palabra pareja
  const matchPosMeas = highlightManager.measurePosition(text, result.index);
  const matchWidth = highlightManager.measureText(text.substring(result.index, result.index + result.length));
  addHighlightRect(overlay, matchPosMeas.top, matchPosMeas.left, matchWidth, matchPosMeas.lineHeight, false);

  highlightManager.updateOverlayPosition(overlay);
}

textarea.addEventListener('click', () => {
  if (keywordMatchTimeout) clearTimeout(keywordMatchTimeout);
  keywordMatchTimeout = setTimeout(highlightMatchingKeyword, 100);
});

textarea.addEventListener('keyup', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
    if (keywordMatchTimeout) clearTimeout(keywordMatchTimeout);
    keywordMatchTimeout = setTimeout(highlightMatchingKeyword, 100);
  }
});

    // ========== Unified ESC Handler ==========
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const searchBar = document.getElementById('search-bar');
        if (searchBar && searchBar.classList.contains('active')) {
          closeSearchBar();
          return;
        }
        if (autocompleteVisible) {
          hideAutocomplete();
          return;
        }
        highlightManager.clearAll();
      }
    });

    // ========== Inicialización final ==========
    textarea.addEventListener('scroll', syncScroll);
    window.addEventListener('resize', update);
    update();

    // Exponer funciones de actualización de overlays
    const publicAPI = {
      update,
      textarea,
      updateLineCounter,
      openSearchBar,
      closeSearchBar,
      highlightManager,
      updateOverlays // para uso externo si es necesario
    };

    return publicAPI;
  }

  global.Editor = { init: initEditor, highlight };

})(window);
/* ============================================================
 * blockEditor.js — Editor de bloques mejorado
 * - Definiciones desde blocks.json
 * - Bloques Si/Sino con rama else separada
 * - Inputs editables con seleccion de texto correcta
 * - Drag & drop funcional entre contenedores
 * - Parsing correcto de "Por Referencia" en parametros
 * - Resaltado de bloque en ejecucion
 * - Mapeo linea→bloque para sincronizacion
 * ============================================================ */
(function (global) {
  'use strict';

  /* ───── Undo / Redo ───── */
  const undoStack = [], redoStack = [], MAX_UNDO = 50;
  function saveUndo() {
    undoStack.push(JSON.stringify(blocks));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(blocks));
    blocks = JSON.parse(undoStack.pop());
    fullRender(); fireChange();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(blocks));
    blocks = JSON.parse(redoStack.pop());
    fullRender(); fireChange();
  }
  document.addEventListener('keydown', e => {
    const bp = document.querySelector('.main-tab-panel[data-panel="blocks"]');
    if (!bp || !bp.classList.contains('active')) return;
    if ((e.ctrlKey||e.metaKey) && e.key==='z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey||e.metaKey) && (e.key==='y'||(e.key==='z'&&e.shiftKey))) { e.preventDefault(); redo(); }
  });

  /* ───── State ───── */
  let BLOCK_DEFS = {};
  let CATEGORIES = {};
  let CAT_ORDER = [];
  let blocks = [];
  let blockIdCounter = 0;
  let dragData = null;
  let selectedBlockId = null;
  let collapsedCats = {};
  let changeCallback = null;
  let lineToBlockMap = [];   // [{line, blockId}]
  let highlightedBlockId = null;

  function newId() { return 'b' + (++blockIdCounter); }

  function cloneForDebug(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return String(obj); }
  }

  function describeArr(arr) {
    if (arr === blocks) return { path: 'root' };
    function walk(list, path) {
      for (const b of list || []) {
        if (b.children === arr) return { path: path + '/' + b.type + '#' + b.id + '/then', parentId: b.id, branch: 'then' };
        if (b.elseChildren === arr) return { path: path + '/' + b.type + '#' + b.id + '/else', parentId: b.id, branch: 'else' };
        if (b.elseIfs === arr) return { path: path + '/' + b.type + '#' + b.id + '/elseif', parentId: b.id, branch: 'elseif' };
        const r1 = walk(b.children, path + '/' + b.type + '#' + b.id);
        if (r1) return r1;
        const r2 = walk(b.elseChildren, path + '/' + b.type + '#' + b.id);
        if (r2) return r2;
        const r3 = walk(b.elseIfs, path + '/' + b.type + '#' + b.id);
        if (r3) return r3;
      }
      return null;
    }
    return walk(blocks, 'root') || { path: 'unknown' };
  }

  function incomingDragType() {
    if (!dragData) return null;
    if (dragData.source === 'palette') return dragData.type;
    const info = findBlockDeep(dragData.blockId);
    return info && info.blk ? info.blk.type : null;
  }

  function wordBeforeAt(text, pos) {
    const before = text.slice(0, Math.max(0, pos));
    const m = before.match(/(\S+)\s*$/);
    return m ? m[1] : '(inicio)';
  }

  function lineBoundsAt(text, pos) {
    const safePos = Math.max(0, Math.min(text.length, pos));
    const start = text.lastIndexOf('\n', Math.max(0, safePos - 1)) + 1;
    let end = text.indexOf('\n', safePos);
    if (end === -1) end = text.length;
    return { start, end, line: text.slice(start, end) };
  }

  function leadingSpaces(line) {
    const m = String(line || '').match(/^[ \t]*/);
    return m ? m[0] : '';
  }

  function isOpeningLine(line) {
    const l = String(line || '').trim().toLowerCase();
    return /^algoritmo\b/.test(l) ||
      /^subproceso\b/.test(l) ||
      /^funcion\b/.test(l) ||
      /^si\b.*\bentonces$/.test(l) ||
      /^sino\s+si\b.*\bentonces$/.test(l) ||
      /^sino$/.test(l) ||
      /^mientras\b.*\bhacer$/.test(l) ||
      /^para\b.*\bhacer$/.test(l) ||
      /^segun\b.*\bhacer$/.test(l) ||
      /^repetir$/.test(l);
  }

  function isClosingOrBranchLine(line) {
    const l = String(line || '').trim().toLowerCase();
    return /^fin(algoritmo|si|mientras|para|segun|subproceso|funcion)\b/.test(l) ||
      /^hasta\s+que\b/.test(l) ||
      /^sino(\s+si\b.*\bentonces)?$/.test(l);
  }

  function previousNonEmptyLine(text, pos) {
    const before = text.slice(0, Math.max(0, pos));
    const lines = before.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) return lines[i];
    }
    return '';
  }

  function detectIndentForInsertion(text, pos) {
    const bounds = lineBoundsAt(text, pos);
    const current = bounds.line;
    const previous = previousNonEmptyLine(text, bounds.start);
    let reason = 'current-line';
    let indent = leadingSpaces(current);

    if (!current.trim() && previous) {
      indent = isOpeningLine(previous) ? leadingSpaces(previous) + '    ' : leadingSpaces(previous);
      reason = isOpeningLine(previous) ? 'blank-after-opening-line' : 'blank-after-previous-line';
    } else if (isClosingOrBranchLine(current)) {
      indent = leadingSpaces(current) + '    ';
      reason = 'before-closing-or-branch-line';
    } else if (isOpeningLine(previous) && bounds.start === pos) {
      indent = leadingSpaces(previous) + '    ';
      reason = 'line-start-after-opening-line';
    }

    return { indent, reason, currentLine: current, previousLine: previous };
  }

  function applyIndentToSnippet(snippet, indent) {
    return String(snippet || '')
      .split('\n')
      .map(line => line ? indent + line : line)
      .join('\n');
  }

  function textareaCaretFromPoint(textarea, clientX, clientY) {
    const rect = textarea.getBoundingClientRect();
    const style = getComputedStyle(textarea);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padT = parseFloat(style.paddingTop) || 0;
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 14) * 1.5;
    const canvas = textareaCaretFromPoint._canvas || (textareaCaretFromPoint._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    ctx.font = style.font || [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
    const charW = Math.max(1, ctx.measureText('M').width || 8);
    const x = clientX - rect.left - padL + textarea.scrollLeft;
    const y = clientY - rect.top - padT + textarea.scrollTop;
    const lines = textarea.value.split('\n');
    const lineIdx = Math.max(0, Math.min(lines.length - 1, Math.floor(y / lineHeight)));
    const col = Math.max(0, Math.min(lines[lineIdx].length, Math.round(x / charW)));
    let pos = col;
    for (let i = 0; i < lineIdx; i++) pos += lines[i].length + 1;
    return pos;
  }

  /* ───── Load definitions from JSON ───── */
	function loadDefinitions(json) {
		CATEGORIES = json.categories;
		CAT_ORDER = Object.keys(CATEGORIES);
		
		// Inicializar todas las categorías como colapsadas (cerradas)
		collapsedCats = {};
		for (const cat of CAT_ORDER) {
			collapsedCats[cat] = true;
		}

		const raw = json.blocks;
		BLOCK_DEFS = {};
		for (const [type, def] of Object.entries(raw)) {
			const fields = {};
			if (def.fields) {
				for (const [k, v] of Object.entries(def.fields)) {
					fields[k] = v.default;
				}
			}
			BLOCK_DEFS[type] = {
				category: def.category,
				label: def.label,
				icon: def.icon,
				isContainer: !!def.isContainer,
				isStructure: !!def.isStructure,
				hasElse: !!def.hasElse,
				endLabel: def.endLabel || '',
				fieldDefs: def.fields || {},
				defaults: fields
			};
		}
	}

  function createBlock(type, overrides) {
    const def = BLOCK_DEFS[type];
    if (!def) return null;
    const fields = Object.assign({}, def.defaults, overrides || {});
    const blk = { id: newId(), type, fields, children: [] };
    if (def.hasElse) {
      blk.elseChildren = [];
      // Initialize elseIfs for Si blocks
      if (type === 'si') {
        blk.elseIfs = [];
      }
    }
    return blk;
  }

  /* ───── Find blocks by id (returns {blk, parentArr, index}) ───── */
  function findBlock(id, arr) {
    arr = arr || blocks;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return { blk: arr[i], arr, index: i };
      if (arr[i].children) {
        const r = findBlock(id, arr[i].children);
        if (r) return r;
      }
      if (arr[i].elseChildren) {
        const r = findBlock(id, arr[i].elseChildren);
        if (r) return r;
      }
      if (arr[i].elseIfs) {
        const r = findBlock(id, arr[i].elseIfs);
        if (r) return r;
      }
    }
    return null;
  }

  function findBlockDeep(id) { return findBlock(id, blocks); }

  /* ───── Remove block ───── */
  function removeBlock(id) {
    saveUndo();
    function removeFrom(arr) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].id === id) { arr.splice(i, 1); continue; }
        if (arr[i].children) removeFrom(arr[i].children);
        if (arr[i].elseChildren) removeFrom(arr[i].elseChildren);
        if (arr[i].elseIfs) removeFrom(arr[i].elseIfs);
      }
    }
    removeFrom(blocks);
    if (selectedBlockId === id) selectedBlockId = null;
    fullRender(); fireChange();
  }

  /* ───── Code generation with line mapping ───── */
  function generateCode(arr, indent) {
    indent = indent || '';
    let code = '';
    for (const blk of (arr || blocks)) {
      const def = BLOCK_DEFS[blk.type];
      if (!def) continue;
      if (def.isContainer || def.isStructure) {
        code += genContainer(blk, indent);
      } else {
        const lineNum = code.split('\n').length;
        let line = simpleLine(blk);
        code += indent + line + '\n';
        lineToBlockMap.push({ line: lineNum, blockId: blk.id });
      }
    }
    return code;
  }

  function simpleLine(blk) {
    const def = BLOCK_DEFS[blk.type];
    switch (blk.type) {
      case 'definir': return 'Definir ' + blk.fields.name + ' Como ' + blk.fields.type;
      case 'constante': return 'Constante ' + blk.fields.name + ' = ' + blk.fields.value;
      case 'dimension': return 'Dimension ' + blk.fields.name + '[' + blk.fields.range + ']';
      case 'asignar': return blk.fields.target + ' <- ' + blk.fields.value;
      case 'escribir': return 'Escribir ' + blk.fields.msg;
      case 'escribir_sin': return 'Escribir Sin Saltar ' + blk.fields.msg;
      case 'leer': return 'Leer ' + blk.fields.var;
      case 'limpiar': return 'Limpiar Pantalla';
      case 'asignar_math': return blk.fields.target + ' <- ' + blk.fields.expr;
      case 'llamar': return blk.fields.name + '(' + blk.fields.args + ')';
      case 'asignar_arr': return blk.fields.name + '[' + blk.fields.idx + '] <- ' + blk.fields.value;
      case 'comentario': return '//' + blk.fields.text;
      // --- Bloques del juego ---
      case 'game_avanzar': return 'avanzar()';
      case 'game_girar': return 'girar(' + (blk.fields.angle || '90') + ')';
      case 'game_mover': return 'mover(' + (blk.fields.dir || 'derecha') + ')';
      case 'game_tomar': return 'tomar()';
      case 'game_soltar': return 'soltar()';
      case 'game_activar': return 'activar()';
      case 'game_desactivar': return 'desactivar()';
      case 'game_abrir': return 'abrir()';
      case 'game_cerrar': return 'cerrar()';
      case 'game_usar': return 'usar()';
      case 'game_esperar_accion': return 'esperar(' + (blk.fields.tiempo || '1') + ')';
      case 'game_decir': return 'decir(' + (blk.fields.msg || '"Hola"') + ')';
      case 'game_frentelibre': return 'frenteLibre()';
      case 'game_haycaja': return 'hayCaja()';
      case 'game_haypuerta': return 'hayPuerta()';
      case 'game_puertaabierta': return 'puertaAbierta()';
      case 'game_hayswitch': return 'haySwitch()';
      case 'game_llevoobjeto': return 'llevoObjeto()';
      case 'game_objetivocompleto': return 'objetivoCompleto()';
      case 'game_posicionx': return 'posicionX()';
      case 'game_posiciony': return 'posicionY()';
      case 'game_direccionj': return 'direccionJ()';
      default: return '// bloque desconocido';
    }
  }

  function genContainer(blk, indent) {
    const def = BLOCK_DEFS[blk.type];
    let code = '';
    const ln = code.split('\n').length;

    switch (blk.type) {
      case 'algoritmo_inicio':
        code += 'Algoritmo ' + blk.fields.name + '\n';
        lineToBlockMap.push({ line: ln, blockId: blk.id });
        code += generateCode(blk.children, indent + '    ');
        code += 'FinAlgoritmo\n';
        break;
      case 'si':
        code += indent + 'Si ' + blk.fields.cond + ' Entonces\n';
        lineToBlockMap.push({ line: code.split('\n').length - 1, blockId: blk.id });
        code += generateCode(blk.children, indent + '    ');
        // Generate else-if branches
        if (blk.elseIfs && blk.elseIfs.length > 0) {
          for (const elseIf of blk.elseIfs) {
            code += indent + 'Sino Si ' + elseIf.fields.cond + ' Entonces\n';
            lineToBlockMap.push({ line: code.split('\n').length - 1, blockId: elseIf.id });
            code += generateCode(elseIf.children, indent + '    ');
          }
        }
        // Generate final else branch
        if (blk.elseChildren && blk.elseChildren.length > 0) {
          code += indent + 'Sino\n';
          code += generateCode(blk.elseChildren, indent + '    ');
        }
        code += indent + 'FinSi\n';
        break;
      case 'sino_si':
        code += indent + 'Sino Si ' + blk.fields.cond + ' Entonces\n';
        lineToBlockMap.push({ line: code.split('\n').length - 1, blockId: blk.id });
        code += generateCode(blk.children, indent + '    ');
        break;
      case 'segun':
        code += indent + 'Segun ' + blk.fields.var + ' Hacer\n';
        lineToBlockMap.push({ line: code.split('\n').length - 1, blockId: blk.id });
        code += generateCode(blk.children, indent + '    ');
        code += indent + 'FinSegun\n';
        break;
      case 'mientras':
        code += indent + 'Mientras ' + blk.fields.cond + ' Hacer\n';
        lineToBlockMap.push({ line: code.split('\n').length - 1, blockId: blk.id });
        code += generateCode(blk.children, indent + '    ');
        code += indent + 'FinMientras\n';
        break;
      case 'repetir':
        code += indent + 'Repetir\n';
        lineToBlockMap.push({ line: code.split('\n').length - 1, blockId: blk.id });
        code += generateCode(blk.children, indent + '    ');
        code += indent + 'Hasta Que ' + blk.fields.cond + '\n';
        break;
      case 'para':
        code += indent + 'Para ' + blk.fields.var + ' <- ' + blk.fields.start + ' Hasta ' + blk.fields.end;
        if (blk.fields.step && blk.fields.step !== '1') code += ' Con Paso ' + blk.fields.step;
        code += ' Hacer\n';
        lineToBlockMap.push({ line: code.split('\n').length - 1, blockId: blk.id });
        code += generateCode(blk.children, indent + '    ');
        code += indent + 'FinPara\n';
        break;
      case 'subproceso': {
        const p = formatParamsForCode(blk.fields.params);
        code += 'SubProceso ' + blk.fields.name + (p ? '(' + p + ')' : '') + '\n';
        lineToBlockMap.push({ line: 0, blockId: blk.id });
        code += generateCode(blk.children, '    ');
        code += 'FinSubProceso\n';
        break;
      }
      case 'funcion': {
        const p = formatParamsForCode(blk.fields.params);
        code += 'Funcion ' + blk.fields.name + (p ? '(' + p + ')' : '') + '\n';
        lineToBlockMap.push({ line: 0, blockId: blk.id });
        code += generateCode(blk.children, '    ');
        code += 'FinFuncion\n';
        break;
      }
      default: {
        let line = simpleLine(blk);
        code += indent + line + '\n';
      }
    }
    return code;
  }

  /* ───── Parameter helpers ───── */
  // Parse "a Por Referencia, b Por Referencia" → "a, b" (display)
  function displayParams(raw) {
    if (!raw || !raw.trim()) return '';
    return raw.split(',').map(p => {
      let s = p.trim();
      s = s.replace(/\s+[Pp]or\s+[Rr]eferencia\s*$/i, '').trim();
      return s;
    }).join(', ');
  }

  // For code generation: keep "Por Referencia" as-is
  function formatParamsForCode(raw) {
    if (!raw || !raw.trim()) return '';
    return raw.split(',').map(p => p.trim()).join(', ');
  }

  /* ───── Palette ───── */
  function renderPalette(container) {
    container.innerHTML = '';
    const grouped = {};
    for (const [type, def] of Object.entries(BLOCK_DEFS)) {
      if (!grouped[def.category]) grouped[def.category] = [];
      grouped[def.category].push({ type, ...def });
    }
    for (const cat of CAT_ORDER) {
      const items = grouped[cat];
      if (!items || !items.length) continue;
      const catInfo = CATEGORIES[cat] || {};
      const section = document.createElement('div');
      section.className = 'category-section';

      const header = document.createElement('div');
      header.className = 'category-header';
      const collapsed = !!collapsedCats[cat];
      header.innerHTML =
        '<span class="cat-arrow material-symbols-outlined" style="font-size:14px;transition:transform .2s;' +
        (collapsed ? 'transform:rotate(-90deg)' : '') + '">expand_more</span>' +
        '<span class="material-symbols-outlined" style="font-size:14px">' + (catInfo.icon||'') + '</span> ' +
        '<span style="flex:1">' + (catInfo.name||cat) + '</span>' +
        '<span style="font-size:10px;opacity:.5">' + items.length + '</span>';

      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'category-items';
      itemsDiv.style.display = collapsed ? 'none' : 'block';

      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'block-palette-item block-cat-' + item.category;
        el.setAttribute('draggable', 'true');
        el.dataset.blockType = item.type;
        el.innerHTML = '<span class="material-symbols-outlined">' + item.icon + '</span> ' + item.label;
        el.addEventListener('dragstart', e => {
          dragData = { source: 'palette', type: item.type };
          e.dataTransfer.setData('text/plain', item.type);
          e.dataTransfer.effectAllowed = 'copy';
        });
        itemsDiv.appendChild(el);
      }

      header.addEventListener('click', () => {
        collapsedCats[cat] = !collapsedCats[cat];
        itemsDiv.style.display = collapsedCats[cat] ? 'none' : 'block';
        const arrow = header.querySelector('.cat-arrow');
        arrow.style.transform = collapsedCats[cat] ? 'rotate(-90deg)' : 'rotate(0deg)';
      });

      section.appendChild(header);
      section.appendChild(itemsDiv);
      container.appendChild(section);
    }
  }

  /* ───── Workspace rendering ───── */
  function fullRender() {
    const list = document.getElementById('block-list');
    const dropZone = document.getElementById('block-drop-zone');
    list.innerHTML = '';
    dropZone.style.display = blocks.length === 0 ? 'flex' : 'none';
    for (let i = 0; i < blocks.length; i++) {
      list.appendChild(renderBlock(blocks[i], 0, blocks, i));
    }
  }

  function renderBlock(blk, depth, parentArr, indexInParent) {
		const def = BLOCK_DEFS[blk.type];
		if (!def) return document.createElement('div');

		const wrapper = document.createElement('div');
		wrapper.className = 'block-wrapper';
		wrapper.dataset.blockId = blk.id;
		if (depth > 0) wrapper.classList.add('block-nested');
		wrapper.style.marginLeft = (depth * 24) + 'px';

		// Highlight
		if (blk.id === highlightedBlockId) wrapper.classList.add('block-executing');
		if (blk.id === selectedBlockId) wrapper.classList.add('block-selected-wrapper');

		// ── Main row ──
		const row = document.createElement('div');
		row.className = 'block-row';
		row.dataset.blockId = blk.id;
		row.dataset.arrContext = getArrContext(parentArr, blk);

		const item = document.createElement('div');
		item.className = 'block-item block-cat-' + def.category;
		if (def.isContainer || def.isStructure) item.classList.add('block-container-type');
		item.dataset.blockId = blk.id;
		item.setAttribute('draggable', 'true');

		// ── Build HTML ──
		let html = '';
		let addRemoveButton = true; // Bandera: ¿agregar botón al final?

		if (def.isStructure) {
			// Estructura (Algoritmo, SubProceso, Funcion): botón en la cabecera
			html += '<div class="block-struct-head">';
			html += '<span class="material-symbols-outlined" style="font-size:18px">' + def.icon + '</span>';
			html += '<span class="block-struct-title">' + def.label + '</span>';
			html += '<span class="block-rm" title="Eliminar">&times;</span>'; // <--- Botón aquí
			html += '</div>';
			html += '<div class="block-struct-fields">';
			for (const [key, fdef] of Object.entries(def.fieldDefs)) {
				const val = blk.fields[key] || '';
				const displayVal = (key === 'params') ? displayParams(val) : val;
				html += '<span class="block-field-lbl">' + (fdef.label || key) + ':</span>';
				html += '<input class="block-input block-input-lg" data-field="' + key + '" data-raw-value="' + escapeAttr(val) + '" value="' + escapeAttr(displayVal) + '" />';
			}
			html += '</div>';
			addRemoveButton = false; // No se agrega otro botón al final
		} else if (def.isContainer) {
			// Contenedor normal (Si, Mientras, etc.)
			html += '<span class="material-symbols-outlined" style="font-size:16px">' + def.icon + '</span>';
			html += '<span class="block-lbl">' + def.label + '</span>';
			for (const [key, fdef] of Object.entries(def.fieldDefs)) {
				const val = blk.fields[key] || '';
				html += '<span class="block-field-lbl">' + (fdef.label || key) + ':</span>';
				html += '<input class="block-input" data-field="' + key + '" value="' + escapeAttr(val) + '" />';
			}
			html += '<span class="block-badge">&#9660;</span>';
			// addRemoveButton permanece true
		} else {
			// Bloques simples
			html += '<span class="material-symbols-outlined" style="font-size:16px">' + def.icon + '</span>';
			html += '<span class="block-lbl">' + def.label + '</span>';
			for (const [key, fdef] of Object.entries(def.fieldDefs)) {
				const val = blk.fields[key] || '';
				html += '<span class="block-field-lbl">' + (fdef.label || key) + ':</span>';
				html += '<input class="block-input" data-field="' + key + '" value="' + escapeAttr(val) + '" />';
			}
			// addRemoveButton permanece true
		}

		// Solo se agrega el botón al final si no es una estructura
		if (addRemoveButton) {
			html += '<span class="block-rm" title="Eliminar">&times;</span>';
		}
		item.innerHTML = html;

		// ── Input handling (FIXED: no preventDefault, proper cursor) ──
		setupInputs(item, blk, parentArr);

		// ── Remove button ──
		const rm = item.querySelector('.block-rm');
		rm.addEventListener('mousedown', e => e.stopPropagation());
		rm.addEventListener('click', e => { e.stopPropagation(); removeBlock(blk.id); });

		// ── Select ──
		item.addEventListener('click', e => {
			if (e.target.tagName === 'INPUT') return;
			selectedBlockId = blk.id;
			fullRender();
		});

		// ── Drag start (only from item, not inputs) ──
		item.addEventListener('dragstart', e => {
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
				e.preventDefault(); return;
			}
			dragData = { source: 'workspace', blockId: blk.id, fromArr: parentArr };
			e.dataTransfer.setData('text/plain', blk.id);
			e.dataTransfer.effectAllowed = 'move';
			item.style.opacity = '0.4';
		});
		item.addEventListener('dragend', () => { item.style.opacity = '1'; });

		row.appendChild(item);
		wrapper.appendChild(row);

		// ── Children (for containers) ──
		if (def.isContainer || def.isStructure) {
			const childBox = document.createElement('div');
			childBox.className = 'block-children';
			childBox.dataset.parentId = blk.id;
			childBox.dataset.childType = 'then';

			// Drop zone at top of children
			childBox.appendChild(makeInnerDrop(blk.id, 'then', 0));

			if (blk.children) {
				for (let ci = 0; ci < blk.children.length; ci++) {
					childBox.appendChild(renderBlock(blk.children[ci], depth + 1, blk.children, ci));
					// Drop zone after each child
					childBox.appendChild(makeInnerDrop(blk.id, 'then', ci + 1));
				}
			}

			// Empty placeholder
			if (!blk.children || blk.children.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'block-empty-hint';
				empty.textContent = 'Arrastra bloques aqui';
				setupEmptyDrop(empty, blk.id, 'then', 0);
				childBox.appendChild(empty);
			}

			wrapper.appendChild(childBox);

			// Else-if branches (Sino Si): explicit branch drop zones and no extra indentation.
			if (blk.type === 'si') {
				if (!blk.elseIfs) blk.elseIfs = [];
				wrapper.appendChild(makeElseIfDrop(blk.id, 0));
				for (let eii = 0; eii < blk.elseIfs.length; eii++) {
					const elseIfBlk = blk.elseIfs[eii];
					const elseIfWrapper = renderBlock(elseIfBlk, 0, blk.elseIfs, eii);
					elseIfWrapper.classList.add('block-elseif-wrapper');
					wrapper.appendChild(elseIfWrapper);
					wrapper.appendChild(makeElseIfDrop(blk.id, eii + 1));
				}
			}

			// Else branch (Si...Sino)
			if (def.hasElse) {
				const elseSep = document.createElement('div');
				elseSep.className = 'block-else-sep block-cat-' + def.category;
				elseSep.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">alt_route</span> Sino';
				wrapper.appendChild(elseSep);

				if (!blk.elseChildren) blk.elseChildren = [];

				const elseBox = document.createElement('div');
				elseBox.className = 'block-children';
				elseBox.dataset.parentId = blk.id;
				elseBox.dataset.childType = 'else';

				// Drop zone at top of Sino branch.
				elseBox.appendChild(makeInnerDrop(blk.id, 'else', 0));

				for (let ei = 0; ei < blk.elseChildren.length; ei++) {
					elseBox.appendChild(renderBlock(blk.elseChildren[ei], depth + 1, blk.elseChildren, ei));
					elseBox.appendChild(makeInnerDrop(blk.id, 'else', ei + 1));
				}

				if (blk.elseChildren.length === 0) {
					const emptyE = document.createElement('div');
					emptyE.className = 'block-empty-hint';
					emptyE.textContent = 'Arrastra bloques aqui (Sino)';
					setupEmptyDrop(emptyE, blk.id, 'else', 0);
					elseBox.appendChild(emptyE);
				}

				wrapper.appendChild(elseBox);
			}

			// End cap (only for blocks that have an endLabel, not for sino_si)
			if (def.endLabel && blk.type !== 'sino_si') {
				const endCap = document.createElement('div');
				endCap.className = 'block-endcap block-cat-' + def.category;
				endCap.style.marginLeft = (depth * 24) + 'px';
				endCap.innerHTML = '<span>' + (def.endLabel || '') + '</span>';
				wrapper.appendChild(endCap);
			}
		}

		// ── Drop zones on row (above/below) ──
		setupRowDrop(row, parentArr, indexInParent);

		return wrapper;
	}

  function getArrContext(arr, blk) {
    // Return a string identifier for the array
    if (arr === blocks) return 'root';
    // Find parent block
    function find(arr2, target) {
      for (const b of arr2) {
        if (b.children === target) return b.id + ':then';
        if (b.elseChildren === target) return b.id + ':else';
        if (b.elseIfs === target) return b.id + ':elseif';
        const r = find(b.children || [], target);
        if (r) return r;
        const r2 = find(b.elseChildren || [], target);
        if (r2) return r2;
        const r3 = find(b.elseIfs || [], target);
        if (r3) return r3;
      }
      return null;
    }
    return find(blocks, arr) || 'unknown';
  }

  function resolveArr(contextStr) {
    if (contextStr === 'root') return blocks;
    const parts = contextStr.split(':');
    const parentId = parts[0];
    const branch = parts[1];
    const info = findBlockDeep(parentId);
    if (!info) return blocks;
    if (branch === 'else') return info.blk.elseChildren || (info.blk.elseChildren = []);
    if (branch === 'elseif') return info.blk.elseIfs || (info.blk.elseIfs = []);
    return info.blk.children;
  }

  function makeInnerDrop(parentId, childType, index) {
    const dz = document.createElement('div');
    dz.className = 'block-inner-dz';
    dz.dataset.parentId = parentId;
    dz.dataset.childType = childType;
    dz.dataset.dropIndex = index;
    dz.dataset.hint = childType === 'else'
      ? 'Soltar dentro de Sino en posicion ' + index
      : 'Soltar dentro de Entonces en posicion ' + index;
    dz.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = dragData && dragData.source === 'palette' ? 'copy' : 'move';
      dz.classList.add('block-inner-dz-active');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('block-inner-dz-active'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.remove('block-inner-dz-active');
      
      // Find the parent block
      const parentInfo = findBlockDeep(parentId);
      if (!parentInfo) {
        console.warn('Parent block not found:', parentId);
        return;
      }

      const draggedType = incomingDragType();
      
      // Get the correct target array based on childType
      let targetArr;
      if (childType === 'else') {
        if (!parentInfo.blk.elseChildren) parentInfo.blk.elseChildren = [];
        targetArr = parentInfo.blk.elseChildren;
      } else if (childType === 'then') {
        // Sino Si is a branch of Si, not a child inside Entonces.
        if (parentInfo.blk.type === 'si' && draggedType === 'sino_si') {
          if (!parentInfo.blk.elseIfs) parentInfo.blk.elseIfs = [];
          targetArr = parentInfo.blk.elseIfs;
        } else {
          targetArr = parentInfo.blk.children;
        }
      } else {
        targetArr = parentInfo.blk.children;
      }
      
      handleDrop(targetArr, index);
    });
    return dz;
  }

  function setupEmptyDrop(el, parentId, childType, index) {
    el.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('block-inner-dz-active');
      e.dataTransfer.dropEffect = dragData && dragData.source === 'palette' ? 'copy' : 'move';
    });
    el.addEventListener('dragleave', () => el.classList.remove('block-inner-dz-active'));
    el.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('block-inner-dz-active');
      const parentInfo = findBlockDeep(parentId);
      if (!parentInfo) return;
      const draggedType = incomingDragType();
      let targetArr;
      if (childType === 'else') {
        targetArr = parentInfo.blk.elseChildren || (parentInfo.blk.elseChildren = []);
      } else if (parentInfo.blk.type === 'si' && draggedType === 'sino_si') {
        targetArr = parentInfo.blk.elseIfs || (parentInfo.blk.elseIfs = []);
      } else {
        targetArr = parentInfo.blk.children;
      }
    });
  }

  function makeElseIfDrop(parentId, index) {
    const dz = document.createElement('div');
    dz.className = 'block-inner-dz block-elseif-dz';
    dz.dataset.parentId = parentId;
    dz.dataset.childType = 'elseif';
    dz.dataset.dropIndex = index;
    dz.dataset.hint = 'Soltar Sino Si como rama en posicion ' + index;

    dz.addEventListener('dragover', e => {
      const type = incomingDragType();
      if (type !== 'sino_si') return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = dragData && dragData.source === 'palette' ? 'copy' : 'move';
      dz.classList.add('block-inner-dz-active');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('block-inner-dz-active'));
    dz.addEventListener('drop', e => {
      const type = incomingDragType();
      if (type !== 'sino_si') return;
      e.preventDefault(); e.stopPropagation();
      dz.classList.remove('block-inner-dz-active');
      const parentInfo = findBlockDeep(parentId);
      if (!parentInfo) return;
      if (!parentInfo.blk.elseIfs) parentInfo.blk.elseIfs = [];     
      handleDrop(parentInfo.blk.elseIfs, index);
    });
    return dz;
  }

  function handleDrop(targetArr, insertIdx) {
    if (dragData.source === 'palette') {
      const nb = createBlock(dragData.type);
      if (nb) {
        saveUndo();
        targetArr.splice(insertIdx, 0, nb);
        fullRender(); fireChange();
      }
    } else if (dragData.source === 'workspace') {
      const fromInfo = findBlockDeep(dragData.blockId);
      if (fromInfo) {
        saveUndo();
        const [moved] = fromInfo.arr.splice(fromInfo.index, 1);
        // Adjust index if moving within same array
        let adjIdx = insertIdx;
        if (fromInfo.arr === targetArr && fromInfo.index < insertIdx) adjIdx--;
        targetArr.splice(adjIdx, 0, moved);
        fullRender(); fireChange();
      }
    }
    dragData = null;
  }

  function setupRowDrop(row, parentArr, indexInParent) {
    row.addEventListener('dragover', e => {
      if (e.target.closest('.block-inner-dz')) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = dragData?.source === 'palette' ? 'copy' : 'move';
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.toggle('block-drop-top', e.clientY < mid);
      row.classList.toggle('block-drop-bot', e.clientY >= mid);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('block-drop-top', 'block-drop-bot');
    });
    row.addEventListener('drop', e => {
      if (e.target.closest('.block-inner-dz')) return;
      e.preventDefault(); e.stopPropagation();
      row.classList.remove('block-drop-top', 'block-drop-bot');
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const idx = before ? indexInParent : indexInParent + 1;
      const rowBlockId = row.dataset.blockId;
      const rowInfo = rowBlockId ? findBlockDeep(rowBlockId) : null;
      const draggedType = incomingDragType();
      if (!before && rowInfo && rowInfo.blk.type === 'si' && draggedType === 'sino_si') {
        if (!rowInfo.blk.elseIfs) rowInfo.blk.elseIfs = [];
        handleDrop(rowInfo.blk.elseIfs, rowInfo.blk.elseIfs.length);
        return;
      }
      handleDrop(parentArr, idx);
    });
  }

  /* ───── Input setup (FIXED) ───── */
  function setupInputs(item, blk, parentArr) {
    item.querySelectorAll('.block-input').forEach(input => {
      // Do NOT preventDefault on mousedown — allow native cursor placement
      // Do NOT stopPropagation on click — let it bubble for selection

      // When focusing an input, disable drag on the parent item
      input.addEventListener('focus', () => {
        item.setAttribute('draggable', 'false');
        input._undoState = JSON.stringify(blocks);
      });

      input.addEventListener('input', () => {
        const field = input.dataset.field;
        // For params field, store raw value (not display value)
        if (input.dataset.rawValue !== undefined && field === 'params') {
          blk.fields[field] = input.value;
        } else {
          blk.fields[field] = input.value;
        }
        fireChange(); // update code without re-render
      });

      input.addEventListener('blur', () => {
        item.setAttribute('draggable', 'true');
        // Save undo state if value changed
        if (input._undoState) {
          try {
            const old = JSON.parse(input._undoState);
            const oldBlk = findBlockInArr(old, blk.id);
            if (oldBlk && oldBlk.fields[input.dataset.field] !== input.value) {
              undoStack.push(input._undoState);
              if (undoStack.length > MAX_UNDO) undoStack.shift();
              redoStack.length = 0;
            }
          } catch (_) {}
          input._undoState = null;
        }
        fireChange();
      });

      // Prevent drag from starting when interacting with inputs
      input.addEventListener('dragstart', e => { e.preventDefault(); e.stopPropagation(); });

      // Keyboard shortcuts inside inputs
      input.addEventListener('keydown', e => {
        e.stopPropagation(); // prevent undo/redo shortcuts from firing while typing
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
          // Restore original value
          input.value = blk.fields[input.dataset.field] || '';
          input.blur();
        }
      });
    });
  }

  function findBlockInArr(arr, id) {
    for (const b of arr) {
      if (b.id === id) return b;
      if (b.children) { const r = findBlockInArr(b.children, id); if (r) return r; }
      if (b.elseChildren) { const r = findBlockInArr(b.elseChildren, id); if (r) return r; }
      if (b.elseIfs) { const r = findBlockInArr(b.elseIfs, id); if (r) return r; }
    }
    return null;
  }

  /* ───── Workspace drop zone ───── */
  function setupWorkspaceDrop() {
    const ws = document.getElementById('block-workspace');
    const dz = document.getElementById('block-drop-zone');

    ws.addEventListener('dragover', e => {
      if (e.target.closest('.block-inner-dz') || e.target.closest('.block-row')) return;
      e.preventDefault();
      ws.classList.add('drag-over');
    });
    ws.addEventListener('dragleave', e => {
      if (!ws.contains(e.relatedTarget)) ws.classList.remove('drag-over');
    });
    ws.addEventListener('drop', e => {
      if (e.target.closest('.block-inner-dz') || e.target.closest('.block-row')) return;
      e.preventDefault();
      ws.classList.remove('drag-over');
      handleDrop(blocks, blocks.length);
    });

    dz.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    dz.addEventListener('drop', e => { e.preventDefault(); handleDrop(blocks, blocks.length); });
  }

  /* ───── Code editor drop ───── */
  let savedCursorPos = null;
  let blockDropIndicator = null;

  function setupCodeDrop() {
    const ed = document.getElementById('editor');
    
    // Save cursor position when user clicks or types in editor
    ed.addEventListener('mousedown', () => {
      setTimeout(() => { savedCursorPos = { start: ed.selectionStart, end: ed.selectionEnd }; }, 0);
    });
    ed.addEventListener('keyup', () => {
      savedCursorPos = { start: ed.selectionStart, end: ed.selectionEnd };
    });
    ed.addEventListener('click', () => {
      savedCursorPos = { start: ed.selectionStart, end: ed.selectionEnd };
    });
    
    ed.addEventListener('dragover', e => {
      // Only handle block palette drops
      if (!dragData || dragData.source !== 'palette') return;
      
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      
      // Show translucent drop indicator instead of opaque background
      const rect = ed.getBoundingClientRect();
      const style = getComputedStyle(ed);
      const lineHeight = parseFloat(style.lineHeight);
      const y = e.clientY - rect.top - parseFloat(style.paddingTop) + ed.scrollTop;
      const lineIdx = Math.floor(y / lineHeight);
      
      // Remove old indicator
      if (blockDropIndicator) {
        blockDropIndicator.remove();
      }
      
      // Create new indicator - translucent line
      blockDropIndicator = document.createElement('div');
      const topPos = lineIdx * lineHeight;
      blockDropIndicator.style.cssText = `position:absolute;top:${topPos}px;left:0;right:0;height:2px;background:rgba(244,192,37,0.6);pointer-events:none;z-index:100;`;
      document.getElementById('editor-container').appendChild(blockDropIndicator);
    });
    
    ed.addEventListener('dragleave', () => { 
      // Remove indicator
      if (blockDropIndicator) {
        blockDropIndicator.remove();
        blockDropIndicator = null;
      }
    });
    
    ed.addEventListener('drop', e => {
      // Only handle block palette drops
      if (!dragData || dragData.source !== 'palette') return;
      
      e.preventDefault();
      e.stopPropagation(); // Prevent other drop handlers from running
      
      // Remove indicator
      if (blockDropIndicator) {
        blockDropIndicator.remove();
        blockDropIndicator = null;
      }
      
      if (dragData.source === 'palette') {
        const tmp = createBlock(dragData.type);
        if (tmp) {
          const snippet = generateCode([tmp], '');
          
          // Prefer the real drop point. Fallback to the saved/current caret.
          let dropPos = textareaCaretFromPoint(ed, e.clientX, e.clientY);
          if (dropPos === null || dropPos === undefined || Number.isNaN(dropPos)) {
            const pos = savedCursorPos || { start: ed.selectionStart, end: ed.selectionEnd };
            dropPos = pos.start;
          }
          const selectedEnd = (savedCursorPos && savedCursorPos.start === dropPos) ? savedCursorPos.end : dropPos;
          const s = Math.max(0, Math.min(ed.value.length, dropPos));
          const end = Math.max(s, Math.min(ed.value.length, selectedEnd));
          const txt = ed.value;
          const beforeWord = wordBeforeAt(txt, s);
          const indentInfo = detectIndentForInsertion(txt, s);
          const indentedSnippet = applyIndentToSnippet(snippet, indentInfo.indent);
          const insertion = (s > 0 && txt[s - 1] !== '\n' ? '\n' : '') +
            indentedSnippet +
            (end < txt.length && txt[end] !== '\n' ? '\n' : '');
          
          // Insert snippet at cursor position
          ed.value = txt.substring(0, s) + insertion + txt.substring(end);
          ed.selectionStart = ed.selectionEnd = s + insertion.length;
          savedCursorPos = { start: ed.selectionStart, end: ed.selectionEnd };
          ed.dispatchEvent(new Event('input'));
          
          // Important: do not push the temporary block at the end of the block model.
          // The text editor is the source of truth here; parse it back so the visual
          // editor mirrors the actual insertion position.
          saveUndo();
          syncFromCode(ed.value);
        }
      }
      dragData = null;
    });
  }
  /* ───── Execution highlighting ───── */
  function highlightBlock(blockId) {
    // Remove previous highlight
    const prev = document.querySelector('.block-executing');
    if (prev) prev.classList.remove('block-executing');
    highlightedBlockId = blockId;
    if (!blockId) return;
    const el = document.querySelector('.block-wrapper[data-block-id="' + blockId + '"]');
    if (el) {
      el.classList.add('block-executing');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function highlightLine(lineNum) {
    let chosen = null;
    for (let i = lineToBlockMap.length - 1; i >= 0; i--) {
      if (lineToBlockMap[i].line <= lineNum) {
        chosen = lineToBlockMap[i];
        break;
      }
    }
    if (chosen) highlightBlock(chosen.blockId);
  }

  function clearHighlight() {
    const prev = document.querySelector('.block-executing');
    if (prev) prev.classList.remove('block-executing');
    highlightedBlockId = null;
  }

  /* ───── Parse code → blocks ───── */
  function parseCodeToBlocks(code) {
    const lines = code.split('\n');
    const newBlocks = [];
    lineToBlockMap = [];
    const stack = [{ children: newBlocks, key: 'children' }];

    function markSource(blk, lineNo) {
      if (!blk) return blk;
      blk._sourceLine = lineNo;
      lineToBlockMap.push({ line: lineNo, blockId: blk.id, type: blk.type });
      return blk;
    }

    function addParsedBlock(target, type, overrides, lineNo) {
      const blk = markSource(createBlock(type, overrides), lineNo);
      if (blk) target.push(blk);
      return blk;
    }

    function currentTarget() {
      const top = stack[stack.length - 1];
      if (top.key === 'else' && top.blk.elseChildren) return top.blk.elseChildren;
      return top.children;
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const rawLine = lines[lineIndex];
      const sourceLine = lineIndex + 1;
      const line = rawLine.trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      // Algoritmo
      if (lower.startsWith('algoritmo ')) {
        const name = line.substring(10).trim();
        const blk = addParsedBlock(newBlocks, 'algoritmo_inicio', { name }, sourceLine);
        stack.push({ children: blk.children, key: 'children', blk });
        continue;
      }
      if (lower === 'finalgoritmo') { if (stack.length > 1) stack.pop(); continue; }

      let matched = false;

      // Si ... Entonces
      if (lower.startsWith('si ') && lower.includes(' entonces')) {
        const cond = line.substring(3, lower.indexOf(' entonces')).trim();
        const blk = addParsedBlock(currentTarget(), 'si', { cond }, sourceLine);
        stack.push({ children: blk.children, key: 'children', blk });
        matched = true;
      }
      // Sino Si ... Entonces
      else if (lower.startsWith('sino si ') && lower.includes(' entonces')) {
        const cond = line.substring(8, lower.indexOf(' entonces')).trim();
        const blk = markSource(createBlock('sino_si', { cond }), sourceLine);
        // Find the parent Si block in the stack (the one that has elseIfs property)
        let parentSi = null;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].blk && stack[i].blk.type === 'si' && stack[i].blk.elseIfs !== undefined) {
            parentSi = stack[i].blk;
            // Pop all sino_si blocks from stack to get back to the si level
            while (stack.length > i + 1) {
              stack.pop();
            }
            break;
          }
        }
        if (parentSi) {
          if (blk) parentSi.elseIfs.push(blk);
          // Push to stack so children go into this sino_si
          stack.push({ children: blk.children, key: 'children', blk });
        }
        matched = true;
      }
      else if (lower === 'sino') {
        // Find the parent Si block in the stack
        let parentSi = null;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].blk && stack[i].blk.type === 'si' && stack[i].blk.elseIfs !== undefined) {
            parentSi = stack[i].blk;
            // Pop all sino_si blocks from stack to get back to the si level
            while (stack.length > i + 1) {
              stack.pop();
            }
            break;
          }
        }
        if (parentSi) {
          // Change the stack top to point to elseChildren
          stack[stack.length - 1].key = 'else';
          stack[stack.length - 1].children = parentSi.elseChildren;
        }
        matched = true;
      }
      else if (lower === 'finsi') { if (stack.length > 1) stack.pop(); matched = true; }

      else if (lower.startsWith('mientras ') && lower.includes(' hacer')) {
        const cond = line.substring(9, lower.lastIndexOf(' hacer')).trim();
        const blk = addParsedBlock(currentTarget(), 'mientras', { cond }, sourceLine);
        stack.push({ children: blk.children, key: 'children', blk });
        matched = true;
      }
      else if (lower === 'finmientras') { if (stack.length > 1) stack.pop(); matched = true; }

      else if (lower.startsWith('para ') && lower.includes(' hacer')) {
        const inner = line.substring(5, lower.indexOf(' hacer')).trim();
        const arrowIdx = inner.indexOf('<-');
        const hastaIdx = inner.toLowerCase().indexOf(' hasta ');
        if (arrowIdx !== -1 && hastaIdx !== -1) {
          const v = inner.substring(0, arrowIdx).trim();
          const s = inner.substring(arrowIdx + 2, hastaIdx).trim();
          let e = inner.substring(hastaIdx + 7).trim();
          let step = '1';
          const pasoIdx = e.toLowerCase().indexOf(' con paso ');
          if (pasoIdx !== -1) { step = e.substring(pasoIdx + 10).trim(); e = e.substring(0, pasoIdx).trim(); }
          const blk = addParsedBlock(currentTarget(), 'para', { var: v, start: s, end: e, step }, sourceLine);
          stack.push({ children: blk.children, key: 'children', blk });
        }
        matched = true;
      }
      else if (lower === 'finpara') { if (stack.length > 1) stack.pop(); matched = true; }

      else if (lower === 'repetir') {
        const blk = addParsedBlock(currentTarget(), 'repetir', { cond: 'condicion' }, sourceLine);
        stack.push({ children: blk.children, key: 'children', blk });
        matched = true;
      }
      else if (lower.startsWith('hasta que ')) {
        const cond = line.substring(10).trim();
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].blk && stack[i].blk.type === 'repetir') { stack[i].blk.fields.cond = cond; break; }
        }
        if (stack.length > 1) stack.pop();
        matched = true;
      }

      else if (lower.startsWith('segun ') && lower.includes(' hacer')) {
        const v = line.substring(6, lower.indexOf(' hacer')).trim();
        const blk = addParsedBlock(currentTarget(), 'segun', { var: v }, sourceLine);
        stack.push({ children: blk.children, key: 'children', blk });
        matched = true;
      }
      else if (lower === 'finsegun') { if (stack.length > 1) stack.pop(); matched = true; }

      else if (lower.startsWith('subproceso ')) {
        const rest = line.substring(11).trim();
        const parenIdx = rest.indexOf('(');
        let name = rest, params = '';
        if (parenIdx !== -1) {
          name = rest.substring(0, parenIdx).trim();
          params = rest.substring(parenIdx + 1, rest.lastIndexOf(')')).trim();
        }
        const blk = addParsedBlock(newBlocks, 'subproceso', { name, params }, sourceLine);
        stack.push({ children: blk.children, key: 'children', blk });
        matched = true;
      }
      else if (lower === 'finsubproceso') { if (stack.length > 1) stack.pop(); matched = true; }

      else if (lower.startsWith('funcion ')) {
        const rest = line.substring(8).trim();
        const parenIdx = rest.indexOf('(');
        let name = rest, params = '';
        if (parenIdx !== -1) {
          name = rest.substring(0, parenIdx).trim();
          params = rest.substring(parenIdx + 1, rest.lastIndexOf(')')).trim();
        }
        const blk = addParsedBlock(newBlocks, 'funcion', { name, params }, sourceLine);
        stack.push({ children: blk.children, key: 'children', blk });
        matched = true;
      }
      else if (lower === 'finfuncion') { if (stack.length > 1) stack.pop(); matched = true; }

      else if (lower.startsWith('de otro modo') || lower.startsWith('caso ')) { matched = true; }

      if (!matched) {
        if (lower.startsWith('definir ')) {
          const rest = line.substring(8);
          const comoIdx = rest.toLowerCase().indexOf(' como ');
          if (comoIdx !== -1) {
            const names = rest.substring(0, comoIdx).trim();
            const type = rest.substring(comoIdx + 6).trim();
            addParsedBlock(currentTarget(), 'definir', { name: names, type }, sourceLine);
          }
        } else if (lower.startsWith('constante ')) {
          const rest = line.substring(10);
          const eq = rest.indexOf('=');
          if (eq !== -1) addParsedBlock(currentTarget(), 'constante', { name: rest.substring(0, eq).trim(), value: rest.substring(eq + 1).trim() }, sourceLine);
        } else if (lower.startsWith('dimension ')) {
          const rest = line.substring(10).trim();
          const br = rest.indexOf('[');
          if (br !== -1) addParsedBlock(currentTarget(), 'dimension', { name: rest.substring(0, br).trim(), range: rest.substring(br + 1, rest.lastIndexOf(']')).trim() }, sourceLine);
        } else if (lower.startsWith('escribir sin saltar ')) {
          addParsedBlock(currentTarget(), 'escribir_sin', { msg: line.substring(20).trim() }, sourceLine);
        } else if (lower.startsWith('escribir ')) {
          addParsedBlock(currentTarget(), 'escribir', { msg: line.substring(9).trim() }, sourceLine);
        } else if (lower.startsWith('leer ')) {
          addParsedBlock(currentTarget(), 'leer', { var: line.substring(5).trim() }, sourceLine);
        } else if (lower.includes('<-')) {
          const ai = line.indexOf('<-');
          const target = line.substring(0, ai).trim();
          const value = line.substring(ai + 2).trim();
          if (target.includes('[')) {
            const br = target.indexOf('[');
            addParsedBlock(currentTarget(), 'asignar_arr', {
              name: target.substring(0, br).trim(),
              idx: target.substring(br + 1, target.lastIndexOf(']')).trim(),
              value
            }, sourceLine);
          } else {
            addParsedBlock(currentTarget(), 'asignar', { target, value }, sourceLine);
          }
        } else if (lower.startsWith('//')) {
          addParsedBlock(currentTarget(), 'comentario', { text: line.substring(2) }, sourceLine);
        } else if (lower.startsWith('limpiar pantalla')) {
          addParsedBlock(currentTarget(), 'limpiar', undefined, sourceLine);
        } else if (lower.match(/^[a-z_áéíóúñ]\w*\s*\(/)) {
          // Detectar llamadas a funciones y mapearlas a bloques específicos si corresponde
          const pi = line.indexOf('(');
          const fnName = line.substring(0, pi).trim().toLowerCase();
          const argsStr = line.substring(pi + 1, line.lastIndexOf(')')).trim();
          // Mapeo de funciones del juego a bloques específicos
          const GAME_FN_MAP = {
            'avanzar': 'game_avanzar',
            'tomar': 'game_tomar',
            'soltar': 'game_soltar',
            'activar': 'game_activar',
            'desactivar': 'game_desactivar',
            'abrir': 'game_abrir',
            'cerrar': 'game_cerrar',
            'usar': 'game_usar',
            'frentelibre': 'game_frentelibre',
            'haycaja': 'game_haycaja',
            'hayobjeto': 'game_haycaja',
            'haypuerta': 'game_haypuerta',
            'puertaabierta': 'game_puertaabierta',
            'hayswitch': 'game_hayswitch',
            'llevoobjeto': 'game_llevoobjeto',
            'llevoobjeto': 'game_llevoobjeto',
            'objetivocompleto': 'game_objetivocompleto',
            'posicionx': 'game_posicionx',
            'posiciony': 'game_posiciony',
            'direccionj': 'game_direccionj'
          };
          if (GAME_FN_MAP[fnName]) {
            addParsedBlock(currentTarget(), GAME_FN_MAP[fnName], undefined, sourceLine);
          } else if (fnName === 'girar') {
            addParsedBlock(currentTarget(), 'game_girar', { angle: argsStr || '90' }, sourceLine);
          } else if (fnName === 'mover') {
            addParsedBlock(currentTarget(), 'game_mover', { dir: argsStr || 'derecha' }, sourceLine);
          } else if (fnName === 'esperar' && argsStr) {
            addParsedBlock(currentTarget(), 'game_esperar_accion', { tiempo: argsStr }, sourceLine);
          } else if (fnName === 'decir') {
            addParsedBlock(currentTarget(), 'game_decir', { msg: argsStr || '"..."' }, sourceLine);
          } else {
            addParsedBlock(currentTarget(), 'llamar', {
              name: line.substring(0, pi).trim(),
              args: argsStr
            }, sourceLine);
          }
        }
      }
    }
    return newBlocks;
  }

  /* ───── Helpers ───── */
  function escapeAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fireChange() { if (changeCallback) changeCallback(); }
  function setOnChange(cb) { changeCallback = cb; }

  /* ───── Public API ───── */
  let initPromise = null;

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      // Load block definitions from JSON
      try {
        const resp = await fetch('js/blocks.json');
        const json = await resp.json();
        loadDefinitions(json);
      } catch (e) {
        console.warn('Could not load blocks.json, using fallback', e);
        loadDefinitions(fallbackDefs);
      }
      const palette = document.getElementById('block-palette');
      renderPalette(palette);
      setupWorkspaceDrop();
      setupCodeDrop();
      fullRender();
    })();
    return initPromise;
  }

  function isReady() { return Object.keys(BLOCK_DEFS).length > 0; }

  function getBlocks() { return blocks; }
  function setBlocks(b) { blocks = b; fullRender(); }
  function getCode() { lineToBlockMap = []; return generateCode(blocks, ''); }
  function syncFromCode(code) {
    blocks = parseCodeToBlocks(code);
    fullRender();
  }
  function getLineMap() { return lineToBlockMap; }
  
  // Check if a block palette drag is in progress
  function isPaletteDrag() {
    return dragData && dragData.source === 'palette';
  }

  global.BlockEditor = {
    init, getBlocks, setBlocks, getCode, syncFromCode,
    BLOCK_DEFS, createBlock, setOnChange, undo, redo, isReady,
    highlightBlock, highlightLine, clearHighlight, getLineMap, isPaletteDrag
  };

  /* ───── Fallback definitions (if JSON fails to load) ───── */
  const fallbackDefs = {
    categories: {
      structure: { name: "Estructura", icon: "account_tree" },
      var: { name: "Variables", icon: "variable_insert" },
      io: { name: "Entrada/Salida", icon: "import_export" },
      condition: { name: "Condiciones", icon: "fork_right" },
      loop: { name: "Bucles", icon: "repeat" },
      math: { name: "Matematicas", icon: "calculate" },
      function: { name: "Funciones", icon: "settings_applications" },
      array: { name: "Arreglos", icon: "view_list" },
      comment: { name: "Comentarios", icon: "comment" }
    },
    blocks: {
      algoritmo_inicio: { category:"structure",label:"Algoritmo",icon:"play_circle",isStructure:true,isContainer:true,endLabel:"FinAlgoritmo",fields:{name:{label:"Nombre",default:"MiAlgoritmo"}} },
      subproceso: { category:"structure",label:"SubProceso",icon:"settings_applications",isStructure:true,isContainer:true,endLabel:"FinSubProceso",fields:{name:{label:"Nombre",default:"miSub"},params:{label:"Parametros",default:""}} },
      funcion: { category:"structure",label:"Funcion",icon:"functions",isStructure:true,isContainer:true,endLabel:"FinFuncion",fields:{name:{label:"Nombre",default:"miFunc"},params:{label:"Parametros",default:"n"}} },
      definir: { category:"var",label:"Definir",icon:"variable_insert",fields:{name:{label:"Nombre",default:"x"},type:{label:"Tipo",default:"Entero"}} },
      constante: { category:"var",label:"Constante",icon:"lock",fields:{name:{label:"Nombre",default:"PI"},value:{label:"Valor",default:"3.1416"}} },
      dimension: { category:"var",label:"Dimension",icon:"grid_on",fields:{name:{label:"Nombre",default:"arr"},range:{label:"Rango",default:"1..10"}} },
      asignar: { category:"var",label:"Asignar",icon:"arrow_right_alt",fields:{target:{label:"Variable",default:"x"},value:{label:"Valor",default:"0"}} },
      escribir: { category:"io",label:"Escribir",icon:"print",fields:{msg:{label:"Mensaje",default:"\"Hola\""}} },
      escribir_sin: { category:"io",label:"Escribir Sin Saltar",icon:"print",fields:{msg:{label:"Mensaje",default:"\"Hola\""}} },
      leer: { category:"io",label:"Leer",icon:"input",fields:{var:{label:"Variable",default:"x"}} },
      limpiar: { category:"io",label:"Limpiar Pantalla",icon:"cleaning_services",fields:{} },
      si: { category:"condition",label:"Si...Entonces",icon:"fork_right",isContainer:true,hasElse:true,endLabel:"FinSi",fields:{cond:{label:"Condicion",default:"x > 0"}} },
      sino_si: { category:"condition",label:"Sino Si",icon:"alt_route",isContainer:true,hasElse:false,endLabel:"",fields:{cond:{label:"Condicion",default:"x < 0"}} },
      segun: { category:"condition",label:"Segun",icon:"alt_route",isContainer:true,endLabel:"FinSegun",fields:{var:{label:"Variable",default:"opcion"}} },
      mientras: { category:"loop",label:"Mientras",icon:"repeat",isContainer:true,endLabel:"FinMientras",fields:{cond:{label:"Condicion",default:"x < 10"}} },
      repetir: { category:"loop",label:"Repetir",icon:"replay",isContainer:true,endLabel:"Hasta Que",fields:{cond:{label:"Condicion",default:"x > 0"}} },
      para: { category:"loop",label:"Para",icon:"loop",isContainer:true,endLabel:"FinPara",fields:{var:{label:"Variable",default:"i"},start:{label:"Desde",default:"1"},end:{label:"Hasta",default:"10"},step:{label:"Paso",default:"1"}} },
      asignar_math: { category:"math",label:"Operacion",icon:"calculate",fields:{target:{label:"Variable",default:"resultado"},expr:{label:"Expresion",default:"a + b"}} },
      llamar: { category:"function",label:"Llamar",icon:"call",fields:{name:{label:"Nombre",default:"miSub"},args:{label:"Args",default:""}} },
      asignar_arr: { category:"array",label:"Asignar Arreglo",icon:"view_list",fields:{name:{label:"Arreglo",default:"arr"},idx:{label:"Indice",default:"i"},value:{label:"Valor",default:"0"}} },
      comentario: { category:"comment",label:"Comentario",icon:"comment",fields:{text:{label:"Texto",default:" mi comentario"}} }
    }
  };

})(window);

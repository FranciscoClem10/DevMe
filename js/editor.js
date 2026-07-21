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

      // Algoritmo nombre
      if (tok.type === 'KEYWORD' && tok.value === 'algoritmo') {
        i++;
        if (i < tokens.length && tokens[i].type === 'IDENT') {
          names.add(tokens[i].value.toLowerCase());
        }
        i++;
        continue;
      }

      // Definir lista de variables Como tipo
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

      // Constante nombre = valor
      if (tok.type === 'KEYWORD' && tok.value === 'constante') {
        i++;
        if (i < tokens.length && tokens[i].type === 'IDENT') {
          variables.add(tokens[i].value.toLowerCase());
        }
        continue;
      }

      // Dimension nombre[...]
      if (tok.type === 'KEYWORD' && tok.value === 'dimension') {
        i++;
        while (i < tokens.length) {
          if (tokens[i].type === 'IDENT') {
            variables.add(tokens[i].value.toLowerCase());
            // saltar hasta '[' o ',' o fin
            while (i < tokens.length && tokens[i].type !== 'LBRACK' && tokens[i].type !== 'COMMA' && tokens[i].type !== 'NEWLINE') i++;
          } else {
            i++;
          }
        }
        continue;
      }

      // SubProceso / Funcion nombre (parametros)
      if (tok.type === 'KEYWORD' && (tok.value === 'subproceso' || tok.value === 'funcion')) {
        i++;
        if (i < tokens.length && tokens[i].type === 'IDENT') {
          names.add(tokens[i].value.toLowerCase());
          // parámetros
          if (i + 1 < tokens.length && tokens[i + 1].type === 'LPAREN') {
            i += 2; // saltar '('
            while (i < tokens.length && tokens[i].type !== 'RPAREN') {
              if (tokens[i].type === 'IDENT') {
                variables.add(tokens[i].value.toLowerCase());
              }
              i++;
            }
            // saltar ')'
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

      // Comentario de línea
      if (ch === '/' && s[i+1] === '/') {
        let end = s.indexOf('\n', i);
        if (end === -1) end = s.length;
        out += '<span class="tok-cmt">' + escapeHtml(s.substring(i, end)) + '</span>';
        i = end; continue;
      }
      // Comentario bloque
      if (ch === '{') {
        let end = s.indexOf('}', i);
        if (end === -1) end = s.length; else end += 1;
        out += '<span class="tok-cmt">' + escapeHtml(s.substring(i, end)) + '</span>';
        i = end; continue;
      }
      // Cadena
      if (ch === '"' || ch === '\'') {
        const q = ch;
        let j = i + 1;
        while (j < s.length && s[j] !== q && s[j] !== '\n') j++;
        if (s[j] === q) j++;
        out += '<span class="tok-str">' + escapeHtml(s.substring(i, j)) + '</span>';
        i = j; continue;
      }
      // Número
      if (/[0-9]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
        if (s[j] === '.' && /[0-9]/.test(s[j+1])) { j++; while (j < s.length && /[0-9]/.test(s[j])) j++; }
        out += '<span class="tok-num">' + escapeHtml(s.substring(i, j)) + '</span>';
        i = j; continue;
      }
      // Identificador / palabra clave
      if (/[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_]/.test(ch)) {
        let j = i;
        while (j < s.length && /[a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_]/.test(s[j])) j++;
        const word = s.substring(i, j);
        const lower = word.toLowerCase();

        // Palabras compuestas
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

        // Clasificación individual
        if (TYPES.includes(lower)) {
          out += '<span class="tok-type">' + escapeHtml(word) + '</span>';
        } else if (BOOLS.includes(lower)) {
          out += '<span class="tok-bool">' + escapeHtml(word) + '</span>';
        } else if (KW_SINGLE.includes(lower)) {
          out += '<span class="tok-kw">' + escapeHtml(word) + '</span>';
        } else {
          // Identificador no reservado
          // ¿Es nombre de definición?
          if (namesSet && namesSet.has(lower)) {
            out += '<span class="tok-name">' + escapeHtml(word) + '</span>';
          } else if (variablesSet && variablesSet.has(lower)) {
            out += '<span class="tok-var">' + escapeHtml(word) + '</span>';
          } else {
            // Texto normal (sin color)
            out += escapeHtml(word);
          }
        }
        i = j; continue;
      }
      // Operador de asignación <-
      if (ch === '<' && s[i+1] === '-') {
        out += '<span class="tok-op">&lt;-</span>';
        i += 2; continue;
      }
      // Otros operadores y signos
      if ('+-*/^%<>=,()[]:.;'.includes(ch)) {
        out += '<span class="tok-op">' + escapeHtml(ch) + '</span>';
        i++; continue;
      }
      // Texto normal (espacios, saltos, etc.)
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
    const INDENT = '    '; // 4 spaces

    // Palabras que aumentan indentación en la siguiente línea
    const INCREASE_INDENT = /^(algoritmo|subproceso|funcion|si\s+.*\s+entonces|sino|sino\s+si\s+.*\s+entonces|segun\s+.*\s+hacer|mientras\s+.*\s+hacer|repetir|para\s+.*\s+hacer|caso\s+.+:|de\s+otro\s+modo\s*:)\s*$/i;
    // Palabras que desindentan la línea actual
    const DECREASE_INDENT = /^(finsi|finsegun|finmientras|finpara|finsubproceso|finfuncion|finalgoritmo|sino|sino\s+si|de\s+otro\s+modo|caso\s+.+:|hasta\s+que)\s*$/i;

    function getLineIndent(line) {
      const match = line.match(/^(\s*)/);
      return match ? match[1] : '';
    }

    function update() {
      const src = textarea.value;
      const { variables, names } = extractDefinitions(src);
      highlightEl.innerHTML = highlight(src, variables, names) + '\n';
      highlightEl.style.height = textarea.scrollHeight + 'px';
      const lines = src.split('\n').length;
      let nums = '';
      for (let i = 1; i <= lines; i++) nums += i + '\n';
      lineNums.textContent = nums;
    }

    function syncScroll() {
      highlightEl.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
      lineNums.scrollTop = textarea.scrollTop;
    }

    // Indentar líneas dentro de un rango (para selección múltiple)
    function indentLines(start, end) {
      const val = textarea.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const before = val.substring(0, lineStart);
      const selected = val.substring(lineStart, end);
      const after = val.substring(end);
      const indented = selected.split('\n').map(l => INDENT + l).join('\n');
      textarea.value = before + indented + after;
      textarea.selectionStart = lineStart;
      textarea.selectionEnd = lineStart + indented.length;
      update();
    }

    // Desindentar líneas dentro de un rango
    function unindentLines(start, end) {
      const val = textarea.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const before = val.substring(0, lineStart);
      const selected = val.substring(lineStart, end);
      const after = val.substring(end);
      let removed = 0;
      const unindented = selected.split('\n').map(l => {
        if (l.startsWith(INDENT)) { removed += INDENT.length; return l.substring(INDENT.length); }
        // Also handle partial tab (1-3 spaces)
        const m = l.match(/^( {1,4})/);
        if (m) { removed += m[1].length; return l.substring(m[1].length); }
        return l;
      }).join('\n');
      textarea.value = before + unindented + after;
      textarea.selectionStart = Math.max(lineStart, start - Math.min(INDENT.length, removed));
      textarea.selectionEnd = Math.max(lineStart, end - removed);
      update();
    }

    textarea.addEventListener('input', update);
    textarea.addEventListener('scroll', syncScroll);

    textarea.addEventListener('keydown', function (e) {
      const val = textarea.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // === TAB ===
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Tab: desindentar
          if (start === end) {
            // Sin selección: desindentar línea actual
            const lineStart = val.lastIndexOf('\n', start - 1) + 1;
            const line = val.substring(lineStart);
            const m = line.match(/^( {1,4}|\t)/);
            if (m) {
              textarea.value = val.substring(0, lineStart) + line.substring(m[0].length);
              textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - m[0].length);
            }
          } else {
            unindentLines(start, end);
          }
        } else {
          if (start === end) {
            // Sin selección: insertar espacios (tab)
            textarea.value = val.substring(0, start) + INDENT + val.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + INDENT.length;
          } else {
            // Con selección: indentar todas las líneas
            indentLines(start, end);
          }
        }
        update();
        return;
      }

      // === ENTER ===
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const currentLine = val.substring(lineStart, start);
        const currentIndent = getLineIndent(currentLine);
        const trimmed = currentLine.trim();

        // Determinar indentación
        let newIndent = currentIndent;

        // Si la línea actual abre un bloque, aumentar indentación
        if (INCREASE_INDENT.test(trimmed)) {
          newIndent = currentIndent + INDENT;
        }

        // Verificar si la línea de cierre ya existe después del cursor (para "partir" bloques)
        const afterCursor = val.substring(start);
        const nextLineEnd = afterCursor.indexOf('\n');
        const nextLine = nextLineEnd !== -1 ? afterCursor.substring(0, nextLineEnd).trim() : afterCursor.trim();

        // Si justo después del cursor hay una palabra de cierre, desindentarla
        if (DECREASE_INDENT.test(nextLine)) {
          // Insertar nueva línea con indentación actual, y la línea de cierre se queda donde está
          const insert = '\n' + newIndent;
          textarea.value = val.substring(0, start) + insert + val.substring(start);
          textarea.selectionStart = textarea.selectionEnd = start + insert.length;
          update();
          return;
        }

        // Si la línea actual es de cierre, desindentar
        if (DECREASE_INDENT.test(trimmed)) {
          // Calcular cuánto desindentar
          newIndent = currentIndent.length >= INDENT.length
            ? currentIndent.substring(0, currentIndent.length - INDENT.length)
            : '';
        }

        const insert = '\n' + newIndent;
        textarea.value = val.substring(0, start) + insert + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + insert.length;
        update();
        return;
      }

      // === Ctrl+D: duplicar línea ===
      if (e.key === 'd' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = val.indexOf('\n', start);
        if (lineEnd === -1) lineEnd = val.length;
        const line = val.substring(lineStart, lineEnd);
        textarea.value = val.substring(0, lineEnd) + '\n' + line + val.substring(lineEnd);
        textarea.selectionStart = textarea.selectionEnd = start + line.length + 1;
        update();
        return;
      }

      // === Ctrl+Shift+K: borrar línea ===
      if (e.key === 'k' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = val.indexOf('\n', start);
        if (lineEnd === -1) lineEnd = val.length;
        else lineEnd += 1; // include the newline
        textarea.value = val.substring(0, lineStart) + val.substring(lineEnd);
        textarea.selectionStart = textarea.selectionEnd = Math.min(lineStart, textarea.value.length);
        update();
        return;
      }

      // === Ctrl+/: comentar/descomentar línea ===
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (start === end) {
          // Una sola línea
          const lineStart = val.lastIndexOf('\n', start - 1) + 1;
          let lineEnd = val.indexOf('\n', start);
          if (lineEnd === -1) lineEnd = val.length;
          const line = val.substring(lineStart, lineEnd);
          const trimmedLine = line.trimStart();
          let newLine;
          if (trimmedLine.startsWith('//')) {
            // Descomentar
            const commentIdx = line.indexOf('//');
            newLine = line.substring(0, commentIdx) + trimmedLine.substring(2).trimStart();
            // Si quedó vacío el espacio, mantener indentación original
            if (newLine.trim() === '') newLine = getLineIndent(line);
          } else {
            // Comentar
            newLine = getLineIndent(line) + '// ' + trimmedLine;
          }
          textarea.value = val.substring(0, lineStart) + newLine + val.substring(lineEnd);
          textarea.selectionStart = textarea.selectionEnd = start + (newLine.length - line.length);
        } else {
          // Selección múltiple
          const lineStart = val.lastIndexOf('\n', start - 1) + 1;
          let lineEnd = val.indexOf('\n', end);
          if (lineEnd === -1) lineEnd = val.length;
          const selected = val.substring(lineStart, lineEnd);
          const lines = selected.split('\n');
          const allCommented = lines.every(l => l.trimStart().startsWith('//'));
          const newLines = lines.map(l => {
            const indent = getLineIndent(l);
            const content = l.trimStart();
            if (allCommented && content.startsWith('//')) {
              return indent + content.substring(2).trimStart();
            } else {
              return indent + '// ' + content;
            }
          });
          const result = newLines.join('\n');
          textarea.value = val.substring(0, lineStart) + result + val.substring(lineEnd);
          textarea.selectionStart = lineStart;
          textarea.selectionEnd = lineStart + result.length;
        }
        update();
        return;
      }

      // === Auto-cerrar comillas ===
      if ((e.key === '"' || e.key === "'") && !e.ctrlKey && !e.metaKey) {
        if (start === end) {
          // Si el cursor está entre comillas del mismo tipo, saltar
          if (val[start] === e.key) {
            e.preventDefault();
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            return;
          }
          // Auto-cerrar
          e.preventDefault();
          const q = e.key;
          textarea.value = val.substring(0, start) + q + q + val.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 1;
          update();
          return;
        }
      }

      // === Auto-cerrar paréntesis/corches ===
      if ((e.key === '(' || e.key === '[') && !e.ctrlKey && !e.metaKey) {
        if (start === end) {
          e.preventDefault();
          const close = e.key === '(' ? ')' : ']';
          textarea.value = val.substring(0, start) + e.key + close + val.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 1;
          update();
          return;
        }
      }
      if ((e.key === ')' || e.key === ']') && !e.ctrlKey && !e.metaKey) {
        if (start === end && val[start] === e.key) {
          e.preventDefault();
          textarea.selectionStart = textarea.selectionEnd = start + 1;
          return;
        }
      }

      // === Backspace: borrar indentación completa ===
      if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && start === end) {
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const beforeCursor = val.substring(lineStart, start);
        // Si solo hay espacios antes del cursor en la línea, borrar hasta el tab stop anterior
        if (/^ {1,4}$/.test(beforeCursor) || (beforeCursor.length > 0 && /^ +$/.test(beforeCursor) && beforeCursor.length % 4 === 0)) {
          e.preventDefault();
          const removeCount = Math.min(4, beforeCursor.length);
          textarea.value = val.substring(0, start - removeCount) + val.substring(start);
          textarea.selectionStart = textarea.selectionEnd = start - removeCount;
          update();
          return;
        }
      }
    });

    window.addEventListener('resize', update);
    update();

    return { update, textarea };
  }

  global.Editor = { init: initEditor, highlight };

})(window);
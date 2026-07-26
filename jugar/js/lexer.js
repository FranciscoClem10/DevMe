/* ============================================================
 * Analizador Léxico (Lexer) — PSeInt en español
 * Convierte código fuente en una lista de tokens.
 * ============================================================ */
(function (global) {
  'use strict';

  // Palabras reservadas (se comparan en minúsculas: insensible a mayúsculas)
  // Algunas son compuestas (varias palabras) y se tratan por lookahead
  const SINGLE_KEYWORDS = new Set([
    'algoritmo','finalgoritmo','definir','como','entero','real','caracter','logico',
    'constante','dimension','leer','escribir','si','entonces','sino','finsi',
    'segun','hacer','caso','finsegun','mientras','finmientras','repetir','hasta',
    'que','para','finpara','subproceso','finsubproceso','funcion','finfuncion',
    'verdadero','falso','esperar','segundos','y','o','no','mod','en','otro','de','modo'
  ]);

  // Palabras clave compuestas (secuencias)
  const COMPOUND_KEYWORDS = [
    ['limpiar','pantalla'],
    ['esperar','tecla'],
    ['por','referencia'],
    ['sin','saltar'],
    ['con','paso'],
    ['hasta','que'],
    ['de','otro','modo'],
    ['sino','si']
  ];

  // Tipos de datos
  const TYPES = new Set(['entero','real','caracter','logico']);

  // Booleanos
  const BOOLEANS = new Set(['verdadero','falso']);

  // Operadores lógicos (palabra)
  const LOGIC_OPS = new Set(['y','o','no','mod']);

  // Todas las palabras reservadas (para el analizador semántico)
  const RESERVED_ALL = new Set([
    ...SINGLE_KEYWORDS,
    'limpiar pantalla','esperar tecla','por referencia','sin saltar','con paso',
    'hasta que','de otro modo','sino si'
  ]);

  function isLetter(ch) { return /[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_]/.test(ch); }
  function isDigit(ch) { return /[0-9]/.test(ch); }
  function isAlnum(ch) { return isLetter(ch) || isDigit(ch); }

  function LexError(msg, line, col) {
    return { phase: 'Léxico', message: msg, line, col };
  }

  function tokenize(source) {
    const tokens = [];
    const errors = [];
    let i = 0;
    let line = 1;
    let col = 1;
    const src = source;

    function peek(offset = 0) { return src[i + offset]; }
    function advance() {
      const ch = src[i++];
      if (ch === '\n') { line++; col = 1; } else { col++; }
      return ch;
    }
    function pushTok(type, value, startLine, startCol, extra) {
      const tok = { type, value, line: startLine, col: startCol };
      if (extra) Object.assign(tok, extra);
      tokens.push(tok);
    }

    while (i < src.length) {
      const ch = src[i];
      const startLine = line, startCol = col;

      // Espacios en blanco
      if (ch === ' ' || ch === '\t' || ch === '\r') { advance(); continue; }

      // Salto de línea = separador
      if (ch === '\n') {
        // Producir NEWLINE (útil para el parser)
        pushTok('NEWLINE', '\n', startLine, startCol);
        advance();
        continue;
      }

      // Comentario de línea //
      if (ch === '/' && peek(1) === '/') {
        while (i < src.length && src[i] !== '\n') advance();
        continue;
      }

      // Comentario de bloque { ... }
      if (ch === '{') {
        advance();
        let closed = false;
        while (i < src.length) {
          if (src[i] === '}') { advance(); closed = true; break; }
          advance();
        }
        if (!closed) errors.push(LexError('Comentario de bloque sin cerrar "}"', startLine, startCol));
        continue;
      }

      // Cadenas: "..." o '...'
      if (ch === '"' || ch === '\'') {
        const quote = ch;
        advance();
        let str = '';
        let closed = false;
        while (i < src.length) {
          if (src[i] === '\n') break;
          if (src[i] === quote) { advance(); closed = true; break; }
          str += advance();
        }
        if (!closed) errors.push(LexError(`Cadena sin cerrar (falta ${quote})`, startLine, startCol));
        pushTok('STRING', str, startLine, startCol);
        continue;
      }

      // Números (Entero o Real)
      if (isDigit(ch)) {
        let num = '';
        while (i < src.length && isDigit(src[i])) num += advance();
        let isReal = false;
        if (src[i] === '.' && isDigit(src[i + 1])) {
          isReal = true;
          num += advance(); // '.'
          while (i < src.length && isDigit(src[i])) num += advance();
        }
        pushTok('NUMBER', isReal ? parseFloat(num) : parseInt(num, 10), startLine, startCol, { isReal });
        continue;
      }

      // Identificadores y palabras clave
      if (isLetter(ch)) {
        let ident = '';
        while (i < src.length && isAlnum(src[i])) ident += advance();
        const lower = ident.toLowerCase();

        // ¿Es palabra reservada compuesta? Mirar siguientes tokens (después de espacios)
        let matchedCompound = null;
        for (const seq of COMPOUND_KEYWORDS) {
          if (seq[0] !== lower) continue;
          // Mirar hacia adelante para las siguientes palabras
          let save = i, saveLine = line, saveCol = col;
          let matched = true;
          const consumedWords = [ident];
          for (let k = 1; k < seq.length; k++) {
            // Saltar espacios/tabs (no newlines)
            while (i < src.length && (src[i] === ' ' || src[i] === '\t')) advance();
            if (i >= src.length || !isLetter(src[i])) { matched = false; break; }
            let word = '';
            while (i < src.length && isAlnum(src[i])) word += advance();
            if (word.toLowerCase() !== seq[k]) { matched = false; break; }
            consumedWords.push(word);
          }
          if (matched) {
            matchedCompound = seq.join(' ');
            break;
          } else {
            i = save; line = saveLine; col = saveCol;
          }
        }

        if (matchedCompound) {
          pushTok('KEYWORD', matchedCompound, startLine, startCol);
          continue;
        }

        if (SINGLE_KEYWORDS.has(lower)) {
          if (TYPES.has(lower)) pushTok('TYPE', lower, startLine, startCol);
          else if (BOOLEANS.has(lower)) pushTok('BOOLEAN', lower === 'verdadero', startLine, startCol);
          else if (LOGIC_OPS.has(lower)) pushTok('OP', lower.toUpperCase(), startLine, startCol);
          else pushTok('KEYWORD', lower, startLine, startCol);
          continue;
        }

        pushTok('IDENT', ident, startLine, startCol);
        continue;
      }

      // Operador de asignación <-
      if (ch === '<' && peek(1) === '-') { advance(); advance(); pushTok('ASSIGN', '<-', startLine, startCol); continue; }

      // Operadores multi-char: <=, >=, <>
      if (ch === '<' && peek(1) === '=') { advance(); advance(); pushTok('OP', '<=', startLine, startCol); continue; }
      if (ch === '>' && peek(1) === '=') { advance(); advance(); pushTok('OP', '>=', startLine, startCol); continue; }
      if (ch === '<' && peek(1) === '>') { advance(); advance(); pushTok('OP', '<>', startLine, startCol); continue; }

      // Símbolos simples
      switch (ch) {
        case '+': case '-': case '*': case '/': case '^': case '%':
        case '<': case '>': case '=':
          pushTok('OP', ch, startLine, startCol); advance(); continue;
        case '(': pushTok('LPAREN', ch, startLine, startCol); advance(); continue;
        case ')': pushTok('RPAREN', ch, startLine, startCol); advance(); continue;
        case '[': pushTok('LBRACK', ch, startLine, startCol); advance(); continue;
        case ']': pushTok('RBRACK', ch, startLine, startCol); advance(); continue;
        case ',': pushTok('COMMA', ch, startLine, startCol); advance(); continue;
        case ':': pushTok('COLON', ch, startLine, startCol); advance(); continue;
        case '.':
          if (peek(1) === '.') { advance(); advance(); pushTok('DOTDOT', '..', startLine, startCol); continue; }
          errors.push(LexError(`Punto suelto no permitido`, startLine, startCol));
          advance(); continue;
      }

      errors.push(LexError(`Carácter no reconocido: '${ch}'`, startLine, startCol));
      advance();
    }

    pushTok('EOF', null, line, col);
    return { tokens, errors };
  }

  global.Lexer = { tokenize, RESERVED_ALL };

})(window);

/* ============================================================
 * Analizador Sintáctico (Parser) — PSeInt en español
 * Recibe una lista de tokens (del lexer) y construye un AST.
 * ============================================================ */
(function (global) {
  'use strict';

  function ParseError(msg, tok) {
    return { phase: 'Sintáctico', message: msg, line: tok ? tok.line : 0, col: tok ? tok.col : 0 };
  }

  function parse(tokens) {
    let pos = 0;
    const errors = [];

    // Filtrar EOF quedará al final
    function peek(offset = 0) { return tokens[pos + offset]; }
    function current() { return tokens[pos]; }
    function isAtEnd() { return current().type === 'EOF'; }

    function skipNewlines() {
      while (!isAtEnd() && current().type === 'NEWLINE') pos++;
    }

    function expectNewlineOrEnd() {
      if (current().type === 'NEWLINE') { pos++; skipNewlines(); return true; }
      if (current().type === 'EOF') return true;
      errors.push(ParseError(`Se esperaba un salto de línea al finalizar la instrucción`, current()));
      // Avanzar hasta próximo NEWLINE para recuperación
      while (!isAtEnd() && current().type !== 'NEWLINE') pos++;
      skipNewlines();
      return false;
    }

    function match(type, value) {
      const t = current();
      if (t.type !== type) return false;
      if (value !== undefined) {
        if (Array.isArray(value)) { if (!value.includes(t.value)) return false; }
        else if (t.value !== value) return false;
      }
      return true;
    }

    function consume(type, value, errMsg) {
      if (match(type, value)) {
        const t = current(); pos++; return t;
      }
      const tk = current();
      errors.push(ParseError(errMsg || `Se esperaba ${value || type} pero se encontró '${tk.value !== undefined ? tk.value : tk.type}'`, tk));
      return null;
    }

    // === Programa ===
    function parseProgram() {
      skipNewlines();
      const subprograms = [];
      // Los SubProceso/Funcion pueden estar antes o después de Algoritmo
      // Recolectamos todo hasta EOF
      let algorithm = null;

      while (!isAtEnd()) {
        skipNewlines();
        if (isAtEnd()) break;
        const t = current();
        if (t.type === 'KEYWORD' && t.value === 'algoritmo') {
          if (algorithm) errors.push(ParseError('Solo puede haber un bloque Algoritmo', t));
          algorithm = parseAlgorithm();
        } else if (t.type === 'KEYWORD' && (t.value === 'subproceso' || t.value === 'funcion')) {
          subprograms.push(parseSubprogram(t.value));
        } else {
          errors.push(ParseError(`Se esperaba 'Algoritmo', 'SubProceso' o 'Funcion' pero se encontró '${t.value}'`, t));
          pos++;
        }
      }

      if (!algorithm) errors.push(ParseError('El programa debe contener un bloque Algoritmo ... FinAlgoritmo', tokens[0]));

      return { type: 'Program', algorithm, subprograms };
    }

    function parseAlgorithm() {
      consume('KEYWORD', 'algoritmo', "Se esperaba 'Algoritmo'");
      let name = 'SinNombre';
      if (current().type === 'IDENT') { name = current().value; pos++; }
      else errors.push(ParseError('Se esperaba nombre del algoritmo', current()));
      expectNewlineOrEnd();
      const body = parseBlock(['finalgoritmo']);
      consume('KEYWORD', 'finalgoritmo', "Se esperaba 'FinAlgoritmo'");
      expectNewlineOrEnd();
      return { type: 'Algorithm', name, body };
    }

    function parseSubprogram(kind) {
      const kw = current(); pos++;
      const nameTok = consume('IDENT', undefined, 'Se esperaba nombre del subprograma');
      const params = [];
      if (match('LPAREN')) {
        pos++;
        if (!match('RPAREN')) {
          do {
            const pname = consume('IDENT', undefined, 'Se esperaba nombre de parámetro');
            let byRef = false;
            if (match('KEYWORD', 'por referencia')) { pos++; byRef = true; }
            if (pname) params.push({ name: pname.value, byRef, line: pname.line });
            if (match('COMMA')) { pos++; continue; }
            break;
          } while (true);
        }
        consume('RPAREN', undefined, "Se esperaba ')'");
      }
      expectNewlineOrEnd();
      const endKw = kind === 'subproceso' ? 'finsubproceso' : 'finfuncion';
      const body = parseBlock([endKw]);
      consume('KEYWORD', endKw, `Se esperaba '${endKw === 'finsubproceso' ? 'FinSubProceso' : 'FinFuncion'}'`);
      expectNewlineOrEnd();
      return {
        type: kind === 'subproceso' ? 'SubProcess' : 'Function',
        name: nameTok ? nameTok.value : '<err>',
        params, body, line: kw.line
      };
    }

    // Bloque: instrucciones hasta encontrar alguna de las keywords terminadoras
    function parseBlock(stopKeywords) {
      const stmts = [];
      while (!isAtEnd()) {
        skipNewlines();
        if (isAtEnd()) break;
        const t = current();
        if (t.type === 'KEYWORD' && stopKeywords.includes(t.value)) break;
        // También parar en 'sino', 'sino si', 'de otro modo', 'caso' cuando corresponda
        if (t.type === 'KEYWORD' && ['sino','sino si','de otro modo','caso'].includes(t.value) && stopKeywords.includes('__ELSE__')) break;

        const before = pos;
        const stmt = parseStatement();
        if (stmt) stmts.push(stmt);
        if (pos === before) { pos++; } // evitar bucle infinito
      }
      return stmts;
    }

    function parseStatement() {
      const t = current();

      if (t.type === 'KEYWORD') {
        switch (t.value) {
          case 'definir': return parseDefinir();
          case 'constante': return parseConstante();
          case 'dimension': return parseDimension();
          case 'leer': return parseLeer();
          case 'escribir': return parseEscribir();
          case 'si': return parseSi();
          case 'segun': return parseSegun();
          case 'mientras': return parseMientras();
          case 'repetir': return parseRepetir();
          case 'para': return parsePara();
          case 'limpiar pantalla': pos++; expectNewlineOrEnd(); return { type: 'ClearScreen', line: t.line };
          case 'esperar tecla': pos++; expectNewlineOrEnd(); return { type: 'WaitKey', line: t.line };
          case 'esperar': return parseEsperar();
        }
      }

      // Asignación o llamada (IDENT ...)
      if (t.type === 'IDENT') return parseAssignmentOrCall();

      errors.push(ParseError(`Instrucción no reconocida (token '${t.value !== undefined ? t.value : t.type}')`, t));
      pos++;
      return null;
    }

    function parseDefinir() {
      const kw = current(); pos++;
      const names = [];
      const first = consume('IDENT', undefined, 'Se esperaba nombre de variable');
      if (first) names.push({ name: first.value, line: first.line, col: first.col });
      while (match('COMMA')) {
        pos++;
        const n = consume('IDENT', undefined, 'Se esperaba nombre de variable');
        if (n) names.push({ name: n.value, line: n.line, col: n.col });
      }
      consume('KEYWORD', 'como', "Se esperaba 'Como'");
      const typeTok = current();
      if (typeTok.type !== 'TYPE') {
        errors.push(ParseError(`Se esperaba un tipo (Entero, Real, Caracter, Logico)`, typeTok));
      } else pos++;
      expectNewlineOrEnd();
      return { type: 'Definir', names, dataType: typeTok.type === 'TYPE' ? typeTok.value : 'entero', line: kw.line };
    }

    function parseConstante() {
      const kw = current(); pos++;
      const nameTok = consume('IDENT', undefined, 'Se esperaba nombre de la constante');
      consume('OP', '=', "Se esperaba '='");
      const value = parseExpression();
      expectNewlineOrEnd();
      return { type: 'Constant', name: nameTok ? nameTok.value : '<err>', value, line: kw.line };
    }

    function parseDimension() {
      const kw = current(); pos++;
      const arrays = [];
      do {
        const nameTok = consume('IDENT', undefined, 'Se esperaba nombre del arreglo');
        consume('LBRACK', undefined, "Se esperaba '['");
        const dims = [];
        do {
          const start = parseExpression();
          consume('DOTDOT', undefined, "Se esperaba '..'");
          const end = parseExpression();
          dims.push({ start, end });
          if (match('COMMA')) { pos++; continue; }
          break;
        } while (true);
        consume('RBRACK', undefined, "Se esperaba ']'");
        arrays.push({ name: nameTok ? nameTok.value : '<err>', dims });
        if (match('COMMA')) { pos++; continue; }
        break;
      } while (true);
      expectNewlineOrEnd();
      return { type: 'Dimension', arrays, line: kw.line };
    }

    function parseLeer() {
      const kw = current(); pos++;
      const targets = [];
      targets.push(parseLValue());
      while (match('COMMA')) { pos++; targets.push(parseLValue()); }
      expectNewlineOrEnd();
      return { type: 'Read', targets, line: kw.line };
    }

    function parseEscribir() {
      const kw = current(); pos++;
      let noNewline = false;
      if (match('KEYWORD', 'sin saltar')) { pos++; noNewline = true; }
      const args = [];
      args.push(parseExpression());
      while (match('COMMA')) { pos++; args.push(parseExpression()); }
      expectNewlineOrEnd();
      return { type: 'Write', args, noNewline, line: kw.line };
    }

    function parseSi() {
      const kw = current(); pos++;
      const condition = parseExpression();
      consume('KEYWORD', 'entonces', "Se esperaba 'Entonces'");
      expectNewlineOrEnd();
      const thenBlock = parseBlock(['finsi','sino','sino si']);
      const elseIfs = [];
      let elseBlock = null;
      while (match('KEYWORD', 'sino si')) {
        pos++;
        const c = parseExpression();
        consume('KEYWORD', 'entonces', "Se esperaba 'Entonces'");
        expectNewlineOrEnd();
        const body = parseBlock(['finsi','sino','sino si']);
        elseIfs.push({ condition: c, body });
      }
      if (match('KEYWORD', 'sino')) {
        pos++;
        expectNewlineOrEnd();
        elseBlock = parseBlock(['finsi']);
      }
      consume('KEYWORD', 'finsi', "Se esperaba 'FinSi'");
      expectNewlineOrEnd();
      return { type: 'If', condition, thenBlock, elseIfs, elseBlock, line: kw.line };
    }

    function parseSegun() {
      const kw = current(); pos++;
      const discriminant = parseExpression();
      consume('KEYWORD', 'hacer', "Se esperaba 'Hacer'");
      expectNewlineOrEnd();
      const cases = [];
      let defaultBlock = null;
      while (!isAtEnd() && !match('KEYWORD', 'finsegun')) {
        skipNewlines();
        if (match('KEYWORD', 'de otro modo')) {
          pos++;
          consume('COLON', undefined, "Se esperaba ':'");
          expectNewlineOrEnd();
          defaultBlock = parseBlock(['finsegun']);
          break;
        } else if (match('KEYWORD', 'caso')) {
          pos++;
          const values = [];
          values.push(parseExpression());
          while (match('COMMA')) { pos++; values.push(parseExpression()); }
          consume('COLON', undefined, "Se esperaba ':'");
          expectNewlineOrEnd();
          const body = parseBlock(['finsegun','caso','de otro modo']);
          cases.push({ values, body });
        } else {
          errors.push(ParseError(`Se esperaba 'caso' o 'De Otro Modo'`, current()));
          pos++;
        }
      }
      consume('KEYWORD', 'finsegun', "Se esperaba 'FinSegun'");
      expectNewlineOrEnd();
      return { type: 'Switch', discriminant, cases, defaultBlock, line: kw.line };
    }

    function parseMientras() {
      const kw = current(); pos++;
      const cond = parseExpression();
      consume('KEYWORD', 'hacer', "Se esperaba 'Hacer'");
      expectNewlineOrEnd();
      const body = parseBlock(['finmientras']);
      consume('KEYWORD', 'finmientras', "Se esperaba 'FinMientras'");
      expectNewlineOrEnd();
      return { type: 'While', condition: cond, body, line: kw.line };
    }

    function parseRepetir() {
      const kw = current(); pos++;
      expectNewlineOrEnd();
      const body = parseBlock(['hasta que']);
      consume('KEYWORD', 'hasta que', "Se esperaba 'Hasta Que'");
      const cond = parseExpression();
      expectNewlineOrEnd();
      return { type: 'Repeat', body, condition: cond, line: kw.line };
    }

    function parsePara() {
      const kw = current(); pos++;
      const varTok = consume('IDENT', undefined, 'Se esperaba variable de control');
      consume('ASSIGN', undefined, "Se esperaba '<-'");
      const start = parseExpression();
      consume('KEYWORD', 'hasta', "Se esperaba 'Hasta'");
      const end = parseExpression();
      let step = null;
      if (match('KEYWORD', 'con paso')) {
        pos++;
        step = parseExpression();
      }
      consume('KEYWORD', 'hacer', "Se esperaba 'Hacer'");
      expectNewlineOrEnd();
      const body = parseBlock(['finpara']);
      consume('KEYWORD', 'finpara', "Se esperaba 'FinPara'");
      expectNewlineOrEnd();
      return { type: 'For', variable: varTok ? varTok.value : '<err>', start, end, step, body, line: kw.line };
    }

    function parseEsperar() {
      const kw = current(); pos++;
      const time = parseExpression();
      consume('KEYWORD', 'segundos', "Se esperaba 'Segundos'");
      expectNewlineOrEnd();
      return { type: 'Sleep', time, line: kw.line };
    }

    function parseAssignmentOrCall() {
      const startTok = current();
      const lval = parseLValue();
      if (match('ASSIGN')) {
        pos++;
        const value = parseExpression();
        expectNewlineOrEnd();
        return { type: 'Assign', target: lval, value, line: startTok.line };
      }
      // Es una llamada a subproceso: nombre(args) o solo nombre
      if (lval.type === 'Call') {
        expectNewlineOrEnd();
        return { type: 'CallStmt', call: lval, line: startTok.line };
      }
      if (lval.type === 'Variable') {
        // Llamada sin paréntesis (a un subproceso sin argumentos)
        expectNewlineOrEnd();
        return { type: 'CallStmt', call: { type: 'Call', name: lval.name, args: [], line: startTok.line }, line: startTok.line };
      }
      errors.push(ParseError('Se esperaba asignación o llamada', startTok));
      expectNewlineOrEnd();
      return null;
    }

    // LValue: variable, arr[idx], arr[i,j], o llamada nombre(args)
    function parseLValue() {
      const tok = current();
      if (tok.type !== 'IDENT') {
        errors.push(ParseError('Se esperaba un identificador', tok));
        return { type: 'Variable', name: '<err>', line: tok.line };
      }
      pos++;
      const name = tok.value;
      if (match('LBRACK')) {
        pos++;
        const indices = [];
        indices.push(parseExpression());
        while (match('COMMA')) { pos++; indices.push(parseExpression()); }
        consume('RBRACK', undefined, "Se esperaba ']'");
        return { type: 'Index', name, indices, line: tok.line };
      }
      if (match('LPAREN')) {
        pos++;
        const args = [];
        if (!match('RPAREN')) {
          args.push(parseExpression());
          while (match('COMMA')) { pos++; args.push(parseExpression()); }
        }
        consume('RPAREN', undefined, "Se esperaba ')'");
        return { type: 'Call', name, args, line: tok.line };
      }
      return { type: 'Variable', name, line: tok.line };
    }

    // === Expresiones (precedencia) ===
    // 7. O
    // 6. Y
    // 5. NO (unario)
    // 4. relacionales: < > <= >= = <>
    // 3. + -
    // 2. * / %  (MOD)
    // 1. ^ (derecha a izquierda)
    // 0. unario -, paréntesis, primary

    function parseExpression() { return parseOr(); }

    function parseOr() {
      let left = parseAnd();
      while (match('OP', 'O')) { const op = current().value; pos++; const right = parseAnd(); left = { type: 'Binary', op, left, right, line: left.line }; }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (match('OP', 'Y')) { const op = current().value; pos++; const right = parseNot(); left = { type: 'Binary', op, left, right, line: left.line }; }
      return left;
    }
    function parseNot() {
      if (match('OP', 'NO')) { const t = current(); pos++; const arg = parseNot(); return { type: 'Unary', op: 'NO', arg, line: t.line }; }
      return parseRelational();
    }
    function parseRelational() {
      let left = parseAddSub();
      while (current().type === 'OP' && ['<','>','<=','>=','=','<>'].includes(current().value)) {
        const op = current().value; pos++; const right = parseAddSub();
        left = { type: 'Binary', op, left, right, line: left.line };
      }
      return left;
    }
    function parseAddSub() {
      let left = parseMulDiv();
      while (current().type === 'OP' && ['+','-'].includes(current().value)) {
        const op = current().value; pos++; const right = parseMulDiv();
        left = { type: 'Binary', op, left, right, line: left.line };
      }
      return left;
    }
    function parseMulDiv() {
      let left = parsePow();
      while (current().type === 'OP' && ['*','/','%','MOD'].includes(current().value)) {
        const op = current().value === 'MOD' ? '%' : current().value; pos++; const right = parsePow();
        left = { type: 'Binary', op, left, right, line: left.line };
      }
      return left;
    }
    function parsePow() {
      const left = parseUnary();
      if (current().type === 'OP' && current().value === '^') {
        pos++;
        const right = parsePow(); // derecha a izquierda
        return { type: 'Binary', op: '^', left, right, line: left.line };
      }
      return left;
    }
    function parseUnary() {
      if (current().type === 'OP' && current().value === '-') {
        const t = current(); pos++;
        return { type: 'Unary', op: '-', arg: parseUnary(), line: t.line };
      }
      if (current().type === 'OP' && current().value === '+') { pos++; return parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary() {
      const t = current();
      if (t.type === 'NUMBER') { pos++; return { type: 'Number', value: t.value, isReal: t.isReal, line: t.line }; }
      if (t.type === 'STRING') { pos++; return { type: 'String', value: t.value, line: t.line }; }
      if (t.type === 'BOOLEAN') { pos++; return { type: 'Boolean', value: t.value, line: t.line }; }
      if (t.type === 'LPAREN') {
        pos++;
        const expr = parseExpression();
        consume('RPAREN', undefined, "Se esperaba ')'");
        return expr;
      }
      if (t.type === 'IDENT') {
        return parseLValue();
      }
      errors.push(ParseError(`Se esperaba una expresión (encontrado '${t.value !== undefined ? t.value : t.type}')`, t));
      pos++;
      return { type: 'Number', value: 0, isReal: false, line: t.line };
    }

    const ast = parseProgram();
    return { ast, errors };
  }

  global.Parser = { parse };

})(window);

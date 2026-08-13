/* ============================================================
 * parser.js — Compilador de pseudocódigo español (estilo PSeInt)
 * Genera un AST para el runtime del juego.
 * ============================================================ */
(function(global){
'use strict';

// ---------- LEXER ----------
const KEYWORDS = new Set([
  'algoritmo','finalgoritmo','definir','como','entero','real','caracter','logico',
  'constante','leer','escribir','si','entonces','sino','finsi',
  'segun','hacer','caso','finsegun','mientras','finmientras','repetir','hasta','que',
  'para','finpara','subproceso','finsubproceso','funcion','finfuncion',
  'y','o','no','mod','de','otro','modo','con','paso'
]);
const COMPOUND = [
  ['sino','si'],
  ['hasta','que'],
  ['de','otro','modo'],
  ['con','paso']
];
const BOOL = new Set(['verdadero','falso']);
const TYPES = new Set(['entero','real','caracter','logico']);

function tokenize(src){
  const toks = [];
  let i=0, line=1, col=1;
  const isL = c => /[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ_]/.test(c);
  const isD = c => /[0-9]/.test(c);
  const isA = c => isL(c) || isD(c);
  function adv(){ const c=src[i++]; if(c==='\n'){line++;col=1;} else col++; return c; }
  function push(t,v,l,cc){ toks.push({type:t,value:v,line:l,col:cc}); }

  while(i<src.length){
    const c = src[i];
    const sl=line, sc=col;
    if(c===' '||c==='\t'||c==='\r'){ adv(); continue; }
    if(c==='\n'){ push('NL','\n',sl,sc); adv(); continue; }
    // comentarios
    if(c==='/'&&src[i+1]==='/'){ while(i<src.length&&src[i]!=='\n')adv(); continue; }
    if(c==='{'){ adv(); while(i<src.length&&src[i]!=='}'){ if(src[i]==='\n'){line++;col=0;} adv(); } if(src[i]==='}')adv(); continue; }
    // cadenas
    if(c==='"'||c==="'"){
      const q=c; adv(); let s='';
      while(i<src.length && src[i]!==q && src[i]!=='\n'){ s+=adv(); }
      if(src[i]===q) adv();
      push('STR',s,sl,sc); continue;
    }
    // números
    if(isD(c)){
      let n=''; while(i<src.length&&isD(src[i]))n+=adv();
      let real=false;
      if(src[i]==='.'&&isD(src[i+1])){ real=true; n+=adv(); while(i<src.length&&isD(src[i]))n+=adv(); }
      push('NUM', real?parseFloat(n):parseInt(n,10), sl, sc); continue;
    }
    // identificadores y palabras clave
    if(isL(c)){
      let s=''; while(i<src.length&&isA(src[i]))s+=adv();
      const low=s.toLowerCase();
      // compuestas: "Sino Si", "Hasta Que", "De Otro Modo", "Con Paso"
      let matched=null;
      for(const seq of COMPOUND){
        if(seq[0]!==low) continue;
        const save=i, sL=line, sC=col;
        let ok=true;
        for(let k=1;k<seq.length;k++){
          while(i<src.length && (src[i]===' '||src[i]==='\t')) adv();
          if(!isL(src[i])){ ok=false; break; }
          let w=''; while(i<src.length&&isA(src[i]))w+=adv();
          if(w.toLowerCase()!==seq[k]){ ok=false; break; }
        }
        if(ok){ matched=seq.join(' '); break; }
        else { i=save; line=sL; col=sC; }
      }
      if(matched){ push('KW', matched, sl, sc); continue; }
      if(BOOL.has(low)){ push('BOOL', low==='verdadero', sl, sc); continue; }
      if(TYPES.has(low)){ push('TYPE', low, sl, sc); continue; }
      if(low==='y'||low==='o'||low==='no'||low==='mod'){ push('OP', low.toUpperCase(), sl, sc); continue; }
      if(KEYWORDS.has(low)){ push('KW', low, sl, sc); continue; }
      push('IDENT', s, sl, sc); continue;
    }
    // operadores compuestos
    if(c==='<'&&src[i+1]==='-'){ adv();adv(); push('ASSIGN','<-',sl,sc); continue; }
    if(c==='<'&&src[i+1]==='='){ adv();adv(); push('OP','<=',sl,sc); continue; }
    if(c==='>'&&src[i+1]==='='){ adv();adv(); push('OP','>=',sl,sc); continue; }
    if(c==='<'&&src[i+1]==='>'){ adv();adv(); push('OP','<>',sl,sc); continue; }
    if('+-*/%^<>='.includes(c)){ push('OP',c,sl,sc); adv(); continue; }
    if(c==='('){ push('LP','(',sl,sc); adv(); continue; }
    if(c===')'){ push('RP',')',sl,sc); adv(); continue; }
    if(c===','){ push('COMMA',',',sl,sc); adv(); continue; }
    if(c===':'){ push('COLON',':',sl,sc); adv(); continue; }
    adv();
  }
  push('EOF',null,line,col);
  return toks;
}

// ---------- PARSER ----------
function ParseError(msg, line){
  const e = new Error(msg);
  e.line = line||0;
  e.phase = 'Sintaxis';
  return e;
}

function parse(src){
  const toks = tokenize(src);
  let p = 0;
  const skipNL = () => { while(toks[p].type==='NL') p++; };
  const peek = (o=0) => toks[p+o];
  const eat = () => toks[p++];
  const expect = (t,v) => {
    const tk = toks[p];
    if(tk.type!==t || (v!==undefined && String(tk.value).toLowerCase()!==String(v).toLowerCase()))
      throw ParseError(`Se esperaba ${v||t}, se encontró '${tk.value!==null&&tk.value!==undefined?tk.value:tk.type}'`, tk.line);
    return eat();
  };
  const isKW = (v) => toks[p].type==='KW' && String(toks[p].value).toLowerCase()===v.toLowerCase();
  const eatKW = (v) => { if(!isKW(v)) throw ParseError(`Se esperaba '${v}'`, toks[p].line); return eat(); };

  const ast = { algorithm:null, subprograms:[] };

  skipNL();
  while(toks[p].type!=='EOF'){
    skipNL();
    if(toks[p].type==='EOF') break;
    if(isKW('algoritmo')){
      eat();
      const name = toks[p].type==='IDENT' ? eat().value : 'Principal';
      skipNL();
      const body = parseBlock(['finalgoritmo']);
      eatKW('finalgoritmo');
      ast.algorithm = { name, body };
    } else if(isKW('subproceso') || isKW('funcion')){
      ast.subprograms.push(parseSubprogram());
    } else {
      throw ParseError(`Token inesperado: '${toks[p].value||toks[p].type}'`, toks[p].line);
    }
    skipNL();
  }
  if(!ast.algorithm) throw ParseError('Falta el bloque Algoritmo', 1);
  return ast;

  function parseSubprogram(){
    const isFunc = isKW('funcion');
    eat();
    let retVar = null;
    if(isFunc){
      if(peek().type==='IDENT' && peek(1).type==='ASSIGN'){
        retVar = eat().value;
        expect('ASSIGN');
      }
    }
    const name = expect('IDENT').value;
    const params = [];
    if(toks[p].type==='LP'){
      eat();
      while(toks[p].type!=='RP' && toks[p].type!=='EOF'){
        const pname = expect('IDENT').value;
        params.push({ name:pname, byRef:false });
        if(toks[p].type==='COMMA') eat();
      }
      eat(); // )
    }
    skipNL();
    const endKW = isFunc ? 'finfuncion' : 'finsubproceso';
    const body = parseBlock([endKW]);
    eatKW(endKW);
    return { type: isFunc?'Function':'SubProcess', name, params, body, retVar };
  }

  function parseBlock(enders){
    const stmts = [];
    skipNL();
    while(toks[p].type!=='EOF'){
      if(toks[p].type==='KW' && enders.includes(String(toks[p].value).toLowerCase())) break;
      const s = parseStmt();
      if(s) stmts.push(s);
      skipNL();
    }
    return stmts;
  }

  function parseStmt(){
    const t = toks[p];
    if(t.type==='KW'){
      const kw = String(t.value).toLowerCase();
      switch(kw){
        case 'definir': return parseDefinir();
        case 'si': return parseIf();
        case 'mientras': return parseWhile();
        case 'repetir': return parseRepeat();
        case 'para': return parseFor();
        case 'escribir': return parseWrite();
        case 'segun': return parseSegun();
      }
    }
    // Leer variable (entrada por consola)
    if(isKW('leer')){
      const tk = eat();
      const targets = [];
      const targetName = expect('IDENT').value;
      targets.push({ type:'Variable', name:targetName, line:tk.line });
      while(toks[p].type==='COMMA'){ eat(); targets.push({ type:'Variable', name:expect('IDENT').value, line:tk.line }); }
      return { type:'Read', targets, line:tk.line };
    }
    // asignación: variable <- expresión
    if(t.type==='IDENT' && peek(1).type==='ASSIGN'){
      const name = eat().value;
      eat(); // <-
      const val = parseExpr();
      return { type:'Assign', name, value:val, line:t.line };
    }
    // llamada a función: nombre(args)
    if(t.type==='IDENT' && peek(1).type==='LP'){
      const call = parseCall();
      return { type:'CallStmt', call, line:t.line };
    }
    throw ParseError(`Sentencia no reconocida: '${t.value||t.type}'`, t.line);
  }

  function parseDefinir(){
    const tk = eat(); // definir
    const names = [expect('IDENT').value];
    while(toks[p].type==='COMMA'){ eat(); names.push(expect('IDENT').value); }
    eatKW('como');
    const type = expect('TYPE').value;
    return { type:'Define', names, dataType:type, line:tk.line };
  }

  function parseIf(){
    const tk = eat(); // si
    const cond = parseExpr();
    eatKW('entonces');
    skipNL();
    const then = [];
    const elseIfs = [];
    let elseBlock = null;
    while(!(toks[p].type==='KW' && ['finsi','sino','sino si'].includes(String(toks[p].value).toLowerCase()))){
      if(toks[p].type==='EOF') throw ParseError('Falta FinSi', tk.line);
      const s = parseStmt(); if(s) then.push(s);
      skipNL();
    }
    while(isKW('sino si')){
      eat();
      const c = parseExpr(); eatKW('entonces'); skipNL();
      const body = [];
      while(!(toks[p].type==='KW' && ['finsi','sino','sino si'].includes(String(toks[p].value).toLowerCase()))){
        if(toks[p].type==='EOF') throw ParseError('Falta FinSi', tk.line);
        const s = parseStmt(); if(s) body.push(s); skipNL();
      }
      elseIfs.push({ condition:c, body });
    }
    if(isKW('sino')){
      eat(); skipNL();
      elseBlock = [];
      while(!isKW('finsi')){
        if(toks[p].type==='EOF') throw ParseError('Falta FinSi', tk.line);
        const s = parseStmt(); if(s) elseBlock.push(s); skipNL();
      }
    }
    eatKW('finsi');
    return { type:'If', condition:cond, then, elseIfs, elseBlock, line:tk.line };
  }

  function parseWhile(){
    const tk = eat();
    const cond = parseExpr();
    eatKW('hacer'); skipNL();
    const body = parseBlock(['finmientras']);
    eatKW('finmientras');
    return { type:'While', condition:cond, body, line:tk.line };
  }

  function parseRepeat(){
    const tk = eat(); skipNL();
    const body = [];
    while(!(toks[p].type==='KW' && String(toks[p].value).toLowerCase()==='hasta que')){
      if(toks[p].type==='EOF') throw ParseError('Falta "Hasta Que"', tk.line);
      const s = parseStmt(); if(s) body.push(s); skipNL();
    }
    eatKW('hasta que');
    const cond = parseExpr();
    return { type:'Repeat', body, condition:cond, line:tk.line };
  }

  function parseFor(){
    const tk = eat();
    const v = expect('IDENT').value;
    expect('ASSIGN');
    const start = parseExpr();
    eatKW('hasta');
    const end = parseExpr();
    let step = null;
    if(isKW('con paso')){ eat(); step = parseExpr(); }
    eatKW('hacer'); skipNL();
    const body = parseBlock(['finpara']);
    eatKW('finpara');
    return { type:'For', variable:v, start, end, step, body, line:tk.line };
  }

  function parseWrite(){
    const tk = eat();
    const args = [parseExpr()];
    while(toks[p].type==='COMMA'){ eat(); args.push(parseExpr()); }
    return { type:'Write', args, line:tk.line };
  }

  function parseSegun(){
    const tk = eat();
    const disc = parseExpr();
    eatKW('hacer'); skipNL();
    const cases = [];
    let defBlock = null;
    while(!isKW('finsegun')){
      if(toks[p].type==='EOF') throw ParseError('Falta FinSegun', tk.line);
      if(isKW('de otro modo')){
        eat();
        if(toks[p].type==='COLON') eat();
        skipNL();
        defBlock = [];
        while(!isKW('finsegun')){
          if(toks[p].type==='EOF') throw ParseError('Falta FinSegun', tk.line);
          const s = parseStmt(); if(s) defBlock.push(s); skipNL();
        }
        break;
      }
      const vals = [parseExpr()];
      while(toks[p].type==='COMMA'){ eat(); vals.push(parseExpr()); }
      expect('COLON'); skipNL();
      const body = [];
      while(!(toks[p].type==='KW' && ['finsegun','de otro modo'].includes(String(toks[p].value).toLowerCase())) && !isCaseStart()){
        if(toks[p].type==='EOF') throw ParseError('Falta FinSegun', tk.line);
        const s = parseStmt(); if(s) body.push(s); skipNL();
      }
      cases.push({ values:vals, body });
    }
    eatKW('finsegun');
    return { type:'Switch', discriminant:disc, cases, defaultBlock:defBlock, line:tk.line };
  }

  function isCaseStart(){
    let q = p, depth=0;
    while(q<toks.length && toks[q].type!=='NL' && toks[q].type!=='EOF'){
      if(toks[q].type==='LP') depth++;
      else if(toks[q].type==='RP') depth--;
      else if(toks[q].type==='COLON' && depth===0) return true;
      q++;
    }
    return false;
  }

  function parseCall(){
    const nameTok = eat();
    const name = nameTok.value;
    expect('LP');
    const args = [];
    if(toks[p].type!=='RP'){
      args.push(parseExpr());
      while(toks[p].type==='COMMA'){ eat(); args.push(parseExpr()); }
    }
    expect('RP');
    return { type:'Call', name, args, line:nameTok.line };
  }

  // ---- Expresiones (precedencia ascendente) ----
  function parseExpr(){ return parseOr(); }
  function parseOr(){
    let l = parseAnd();
    while(isOp('O')){ eat(); const r=parseAnd(); l={type:'Binary',op:'O',left:l,right:r,line:l.line}; }
    return l;
  }
  function parseAnd(){
    let l = parseNot();
    while(isOp('Y')){ eat(); const r=parseNot(); l={type:'Binary',op:'Y',left:l,right:r,line:l.line}; }
    return l;
  }
  function parseNot(){
    if(isOp('NO')){ const tk=eat(); const a=parseNot(); return {type:'Unary',op:'NO',arg:a,line:tk.line}; }
    return parseCmp();
  }
  function parseCmp(){
    let l = parseAdd();
    while(isOp('=')||isOp('<>')||isOp('<')||isOp('>')||isOp('<=')||isOp('>=')){
      const o=eat().value; const r=parseAdd();
      l={type:'Binary',op:o,left:l,right:r,line:l.line};
    }
    return l;
  }
  function parseAdd(){
    let l = parseMul();
    while(isOp('+')||isOp('-')){ const o=eat().value; const r=parseMul(); l={type:'Binary',op:o,left:l,right:r,line:l.line}; }
    return l;
  }
  function parseMul(){
    let l = parsePow();
    while(isOp('*')||isOp('/')||isOp('MOD')||isOp('%')){ const o=eat().value; const r=parsePow(); l={type:'Binary',op:o,left:l,right:r,line:l.line}; }
    return l;
  }
  function parsePow(){
    let l = parseUnary();
    if(isOp('^')){ eat(); const r=parsePow(); return {type:'Binary',op:'^',left:l,right:r,line:l.line}; }
    return l;
  }
  function parseUnary(){
    if(isOp('-')){ const tk=eat(); const a=parseUnary(); return {type:'Unary',op:'-',arg:a,line:tk.line}; }
    return parsePrimary();
  }
  function parsePrimary(){
    const t = toks[p];
    if(t.type==='NUM'){ eat(); return {type:'Number', value:t.value, line:t.line}; }
    if(t.type==='STR'){ eat(); return {type:'String', value:t.value, line:t.line}; }
    if(t.type==='BOOL'){ eat(); return {type:'Boolean', value:t.value, line:t.line}; }
    if(t.type==='LP'){ eat(); const e=parseExpr(); expect('RP'); return e; }
    if(t.type==='IDENT'){
      if(peek(1).type==='LP') return parseCall();
      const name = eat().value;
      return {type:'Variable', name, line:t.line};
    }
    throw ParseError(`Expresión no válida cerca de '${t.value||t.type}'`, t.line);
  }
  function isOp(v){ return toks[p].type==='OP' && String(toks[p].value).toUpperCase()===String(v).toUpperCase(); }
}

global.GameParser = { parse, tokenize };
})(window);

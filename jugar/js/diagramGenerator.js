/* ============================================================
 * Generador de Diagramas de Flujo (Mermaid) mejorado
 * con organizacion jerarquica, subgraficos y estilos.
 * ============================================================ */
(function (global) {
  'use strict';

  let nodeCounter = 0;
  let indentLevel = 0;
  const output = [];

  function getId(prefix) {
    return (prefix || 'n') + (nodeCounter++);
  }

	function escapeLabel(text) {
		if (text === undefined || text === null) return '';
		return String(text)
			.replace(/"/g, '#quot;')
			.replace(/\[/g, '#91;')
			.replace(/\]/g, '#93;')
			.replace(/</g, '#60;')
			.replace(/>/g, '#62;');
	}
  function exprToString(expr) {
    if (!expr) return '';
    switch (expr.type) {
      case 'Number': return String(expr.value);
      case 'String': return '"' + expr.value + '"';
      case 'Boolean': return expr.value ? 'Verdadero' : 'Falso';
      case 'Variable': return expr.name;
      case 'Index': return expr.name + '[' + expr.indices.map(i => exprToString(i)).join(', ') + ']';
      case 'Call': return expr.name + '(' + expr.args.map(a => exprToString(a)).join(', ') + ')';
      case 'Unary':
        if (expr.op === 'NO') return 'NO ' + exprToString(expr.arg);
        return expr.op + exprToString(expr.arg);
      case 'Binary': return exprToString(expr.left) + ' ' + expr.op + ' ' + exprToString(expr.right);
      default: return '?';
    }
  }

  function addLine(line) {
    const spaces = '  '.repeat(indentLevel);
    output.push(spaces + line);
  }

  function indent() { indentLevel++; }
  function dedent() { if (indentLevel > 0) indentLevel--; }

  function addClassDefs() {
    addLine('classDef processNode fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e3a5f');
    addLine('classDef decisionNode fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#78350f');
    addLine('classDef ioNode fill:#d1fae5,stroke:#10b981,stroke-width:2px,color:#064e3b');
    addLine('classDef loopNode fill:#ede9fe,stroke:#8b5cf6,stroke-width:2px,color:#4c1d95');
    addLine('classDef declarationNode fill:#fce7f3,stroke:#ec4899,stroke-width:2px,color:#831843');
    addLine('classDef callNode fill:#e0e7ff,stroke:#6366f1,stroke-width:2px,color:#312e81');
    addLine('classDef startendNode fill:#f0fdf4,stroke:#22c55e,stroke-width:3px,color:#14532d');
    addLine('classDef subgraphStyle fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,color:#334155');
  }

  function processBlock(stmts, context) {
    let firstId = null;
    let lastId = null;

    for (const stmt of stmts) {
      const result = processStatement(stmt, context);
      if (!result) continue;

      if (!firstId) {
        firstId = result.id;
      } else if (lastId) {
        addLine(`${lastId} --> ${result.id}`);
      }
      lastId = result.endId || result.id;
    }

    return { startId: firstId, endId: lastId };
  }

  function processStatement(stmt, context) {
    const id = getId();
    let label = '';
    let type = 'process';
    let endId = id;
    let className = 'processNode';

    switch (stmt.type) {
      case 'Definir': {
        const names = stmt.names.map(n => n.name).join(', ');
        const dtype = (stmt.dataType || 'Entero').charAt(0).toUpperCase() + (stmt.dataType || 'entero').slice(1);
        label = 'Definir ' + names + ' como ' + dtype;
        type = 'declaration';
        className = 'declarationNode';
        break;
      }
      case 'Constant':
        label = 'Constante ' + stmt.name + ' = ' + exprToString(stmt.value);
        type = 'declaration';
        className = 'declarationNode';
        break;
      case 'Dimension':
        label = 'Dimensionar ' + stmt.arrays.map(a =>
          a.name + '[' + a.dims.map(d => exprToString(d.start) + '..' + exprToString(d.end)).join(', ') + ']'
        ).join(', ');
        type = 'declaration';
        className = 'declarationNode';
        break;
      case 'Read':
        label = 'Leer ' + stmt.targets.map(t => t.name || exprToString(t)).join(', ');
        type = 'io';
        className = 'ioNode';
        break;
      case 'Write':
        label = 'Escribir' + (stmt.noNewline ? ' (sin saltar)' : '') + ': ' + stmt.args.map(a => exprToString(a)).join(', ');
        type = 'io';
        className = 'ioNode';
        break;
      case 'Assign':
		label = exprToString(stmt.target) + ' = ' + exprToString(stmt.value);
		type = 'process';
		className = 'processNode';
		break;
      case 'If': {
        const condStr = exprToString(stmt.condition);
        label = 'Si ' + condStr + '?';
        type = 'decision';
        className = 'decisionNode';

        const thenId = getId('then');
        const elseId = stmt.elseBlock || stmt.elseIfs.length ? getId('else') : null;
        const endIfId = getId('endIf');

        // Then subgraph
        addLine(`subgraph ${thenId}["Entonces"]`);
        indent();
        const thenResult = processBlock(stmt.thenBlock);
        dedent();
        addLine('end');

        // ElseIfs
        const elseIfResults = [];
        for (let i = 0; i < stmt.elseIfs.length; i++) {
          const ei = stmt.elseIfs[i];
          const eiId = getId('elseif');
          addLine(`subgraph ${eiId}["Sino Si ${exprToString(ei.condition)}"]`);
          indent();
          const eiResult = processBlock(ei.body);
          dedent();
          addLine('end');
          elseIfResults.push({ id: eiId, result: eiResult });
        }

        // Else subgraph
        let elseResult = null;
        if (stmt.elseBlock) {
          const elseBlockId = getId('elseBlock');
          addLine(`subgraph ${elseBlockId}["Sino"]`);
          indent();
          elseResult = processBlock(stmt.elseBlock);
          dedent();
          addLine('end');
          elseResult = { id: elseBlockId, result: elseResult };
        }

        // Decision node
        addLine(`${id}{"${escapeLabel(label)}"}:::decisionNode`);

        // Connect Then
        addLine(`${id} -->|Si| ${thenId}`);
        if (thenResult.endId) addLine(`${thenResult.endId} --> ${endIfId}`);
        else addLine(`${thenId} --> ${endIfId}`);

        // Connect ElseIfs
        for (let i = 0; i < elseIfResults.length; i++) {
          const ei = elseIfResults[i];
          addLine(`${id} -->|${escapeLabel(exprToString(stmt.elseIfs[i].condition))}| ${ei.id}`);
          if (ei.result.endId) addLine(`${ei.result.endId} --> ${endIfId}`);
          else addLine(`${ei.id} --> ${endIfId}`);
        }

        // Connect Else
        if (elseResult) {
          addLine(`${id} -->|No| ${elseResult.id}`);
          if (elseResult.result.endId) addLine(`${elseResult.result.endId} --> ${endIfId}`);
          else addLine(`${elseResult.id} --> ${endIfId}`);
        } else if (!stmt.elseIfs.length) {
          addLine(`${id} -->|No| ${endIfId}`);
        }

        addLine(`${endIfId}([" "])`);
        addLine(`style ${endIfId} fill:transparent,stroke:transparent`);
        endId = endIfId;
        break;
      }
      case 'Switch': {
        label = 'Segun ' + exprToString(stmt.discriminant);
        type = 'decision';
        className = 'decisionNode';
        const continueId = getId('swEnd');
        const caseResults = [];

        for (let i = 0; i < stmt.cases.length; i++) {
          const c = stmt.cases[i];
          const caseId = getId('case');
          const values = c.values.map(v => exprToString(v)).join(', ');
          addLine(`subgraph ${caseId}["Caso ${values}"]`);
          indent();
          const res = processBlock(c.body);
          dedent();
          addLine('end');
          caseResults.push({ id: caseId, result: res, values });
        }

        let defaultResult = null;
        if (stmt.defaultBlock) {
          const defaultId = getId('default');
          addLine(`subgraph ${defaultId}["De Otro Modo"]`);
          indent();
          const defRes = processBlock(stmt.defaultBlock);
          dedent();
          addLine('end');
          defaultResult = { id: defaultId, result: defRes };
        }

        addLine(`${id}{"${escapeLabel(label)}"}:::decisionNode`);

        for (const cr of caseResults) {
          addLine(`${id} -->|${escapeLabel(cr.values)}| ${cr.id}`);
          if (cr.result.endId) addLine(`${cr.result.endId} --> ${continueId}`);
          else addLine(`${cr.id} --> ${continueId}`);
        }

        if (defaultResult) {
          addLine(`${id} -->|Otro| ${defaultResult.id}`);
          if (defaultResult.result.endId) addLine(`${defaultResult.result.endId} --> ${continueId}`);
          else addLine(`${defaultResult.id} --> ${continueId}`);
        } else {
          addLine(`${id} -->|defecto| ${continueId}`);
        }

        addLine(`${continueId}([" "])`);
        addLine(`style ${continueId} fill:transparent,stroke:transparent`);
        endId = continueId;
        break;
      }
      case 'While': {
        label = 'Mientras ' + exprToString(stmt.condition) + '?';
        type = 'loop';
        className = 'loopNode';
        const bodyId = getId('wBody');
        addLine(`subgraph ${bodyId}["Cuerpo del Mientras"]`);
        indent();
        const bodyResult = processBlock(stmt.body);
        dedent();
        addLine('end');

        addLine(`${id}{"${escapeLabel(label)}"}:::loopNode`);
        addLine(`${id} -->|Si| ${bodyId}`);
        if (bodyResult.endId) addLine(`${bodyResult.endId} --> ${id}`);
        else addLine(`${bodyId} --> ${id}`);
        const exitId = getId('wExit');
        addLine(`${id} -->|No| ${exitId}`);
        addLine(`${exitId}([" "])`);
        addLine(`style ${exitId} fill:transparent,stroke:transparent`);
        endId = exitId;
        break;
      }
      case 'Repeat': {
        label = 'Repetir';
        type = 'loop';
        className = 'loopNode';
        const bodyId = getId('rBody');
        addLine(`subgraph ${bodyId}["Cuerpo Repetir"]`);
        indent();
        const bodyResult = processBlock(stmt.body);
        dedent();
        addLine('end');

        const condId = getId('rCond');
        addLine(`${condId}{"Hasta Que ${exprToString(stmt.condition)}?"}:::loopNode`);

        addLine(`${bodyId} --> ${condId}`);
        addLine(`${condId} -->|No| ${bodyId}`);
        const exitId = getId('rExit');
        addLine(`${condId} -->|Si| ${exitId}`);
        addLine(`${exitId}([" "])`);
        addLine(`style ${exitId} fill:transparent,stroke:transparent`);
        endId = exitId;
        return { id: bodyId, endId };
      }
      case 'For': {
        const stepStr = stmt.step ? ' Paso ' + exprToString(stmt.step) : '';
        label = 'Para ' + stmt.variable + ' = ' + exprToString(stmt.start) + ' Hasta ' + exprToString(stmt.end) + stepStr;
        type = 'loop';
        className = 'loopNode';
        const bodyId = getId('fBody');
        addLine(`subgraph ${bodyId}["Cuerpo Para"]`);
        indent();
        const bodyResult = processBlock(stmt.body);
        dedent();
        addLine('end');

        addLine(`${id}["${escapeLabel(label)}"]:::loopNode`);
        addLine(`${id} --> ${bodyId}`);
        if (bodyResult.endId) addLine(`${bodyResult.endId} --> ${id}`);
        else addLine(`${bodyId} --> ${id}`);
        const exitId = getId('fExit');
        addLine(`${id} -->|Fin| ${exitId}`);
        addLine(`${exitId}([" "])`);
        addLine(`style ${exitId} fill:transparent,stroke:transparent`);
        endId = exitId;
        break;
      }
      case 'CallStmt':
        label = 'Llamar ' + stmt.call.name + '(' + stmt.call.args.map(a => exprToString(a)).join(', ') + ')';
        type = 'call';
        className = 'callNode';
        break;
      case 'ClearScreen':
        label = 'Limpiar Pantalla';
        type = 'io';
        className = 'ioNode';
        break;
      case 'WaitKey':
        label = 'Esperar Tecla';
        type = 'io';
        className = 'ioNode';
        break;
      case 'Sleep':
        label = 'Esperar ' + exprToString(stmt.time) + ' segundos';
        type = 'io';
        className = 'ioNode';
        break;
      default:
        label = 'Instruccion';
        type = 'unknown';
        className = 'processNode';
    }

    // Simple statements
    if (!['If', 'Switch', 'While', 'Repeat', 'For'].includes(stmt.type)) {
      let nodeDef;
      if (type === 'io') {
        nodeDef = `${id}[/"${escapeLabel(label)}"/]:::${className}`;
      } else if (type === 'call') {
        nodeDef = `${id}[["${escapeLabel(label)}"]]:::${className}`;
      } else {
        nodeDef = `${id}["${escapeLabel(label)}"]:::${className}`;
      }
      addLine(nodeDef);
      return { id, endId: id };
    }

    return { id, endId };
  }

  function generateDiagram(ast) {
    nodeCounter = 0;
    indentLevel = 0;
    output.length = 0;

    const algo = ast.algorithm;
    if (!algo) return '';

    addLine('graph TD');
    addClassDefs();

    // Main algorithm
    const algoId = getId('algo');
    addLine(`subgraph ${algoId}["Algoritmo: ${escapeLabel(algo.name || 'SinNombre')}"]`);
    indent();

    const startId = getId('start');
    const endId = getId('end');
    addLine(`${startId}((Inicio)):::startendNode`);
    addLine(`${endId}((Fin)):::startendNode`);

    const result = processBlock(algo.body);

    if (result.startId) addLine(`${startId} --> ${result.startId}`);
    else addLine(`${startId} --> ${endId}`);
    if (result.endId) addLine(`${result.endId} --> ${endId}`);
    else if (!result.startId) addLine(`${startId} --> ${endId}`);

    dedent();
    addLine('end');

    // Subprograms
    for (const sp of ast.subprograms) {
      const spId = getId('sp');
      const spName = sp.name || 'SubProceso';
      const spType = sp.type === 'Function' ? 'Funcion' : 'SubProceso';
      addLine(`subgraph ${spId}["${spType}: ${escapeLabel(spName)}"]`);
      indent();

      if (sp.params.length > 0) {
        const paramsStr = sp.params.map(p => p.name + (p.byRef ? ' (ref)' : '')).join(', ');
        const paramId = getId('param');
        addLine(`${paramId}["Parametros: ${escapeLabel(paramsStr)}"]`);
        addLine(`style ${paramId} fill:#f1f5f9,stroke:#94a3b8,stroke-width:1px`);
      }

      const startSp = getId('spStart');
      const endSp = getId('spEnd');
      addLine(`${startSp}((Inicio)):::startendNode`);
      addLine(`${endSp}((Fin)):::startendNode`);

      const spResult = processBlock(sp.body);
      if (spResult.startId) addLine(`${startSp} --> ${spResult.startId}`);
      else addLine(`${startSp} --> ${endSp}`);
      if (spResult.endId) addLine(`${spResult.endId} --> ${endSp}`);
      else if (!spResult.startId) addLine(`${startSp} --> ${endSp}`);

      dedent();
      addLine('end');
    }

    return output.join('\n');
  }

  global.DiagramGenerator = { generateDiagram };
})(window);

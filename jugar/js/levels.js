/* ============================================================
 * levels.js — Definición de niveles del juego
 * Celdas: '.' vacío, '#' pared, 'B' caja, 'X' meta,
 *         'D' puerta cerrada, 'd' puerta abierta, 'S' switch,
 *         'K' puerta bloqueada (por señal o por llave),
 *         'k' llave, 'i' ítem genérico,
 *         'N' NPC, 'o' placa de presión,
 *         'L' emisor de láser,
 *         'F' enemigo, 'G' pistón
 * ============================================================ */
(function(global){
'use strict';

const LEVELS = [
  {
    id:1,
    name:"Primeros pasos",
    desc:"Mueve al personaje hasta la casilla dorada usando avanzar().",
    goals:["Llegar a la meta"],
    hints:[
      "Usa avanzar() varias veces para llegar a la meta.",
      "El personaje está mirando hacia la derecha por defecto."
    ],
    starThresholds:{ gold: 3, silver: 5 },
    starter:
`Algoritmo Nivel1
    // Avanza hacia la meta dorada
    avanzar()
    avanzar()
    // Escribe más instrucciones...
FinAlgoritmo`,
    grid:[
      ".....",
      ".....",
      ".P..X",
      ".....",
      "....."
    ],
    dir:'derecha'
  },
  {
    id:2,
    name:"Girar y avanzar",
    desc:"Usa girar() o mover() para llegar a la meta. No basta con avanzar recto.",
    goals:["Llegar a la meta"],
    hints:[
      "girar(90) gira a la izquierda; girar(-90) gira a la derecha.",
      "También puedes usar mover(arriba), mover(abajo), mover(izquierda) o mover(derecha)."
    ],
    starThresholds:{ gold: 5, silver: 8 },
    starter:
`Algoritmo Nivel2
    // El personaje empieza en abajo a la izquierda mirando a la derecha
    // La meta está arriba a la derecha

FinAlgoritmo`,
    grid:[
      ".....",
      "....X",
      ".....",
      ".....",
      "P...."
    ],
    dir:'derecha'
  },
  {
    id:3,
    name:"El primer bucle",
    desc:"Un pasillo largo. Usa un ciclo Para para no repetir tantas veces avanzar().",
    goals:["Llegar a la meta"],
    hints:[
      "Para i <- 1 Hasta 8 Hacer ... FinPara",
      "Cada iteración ejecuta el cuerpo una vez."
    ],
    starThresholds:{ gold: 4, silver: 8 },
    starter:
`Algoritmo Nivel3
    Para i <- 1 Hasta 8 Hacer
        // escribe tu instrucción aquí
    FinPara
FinAlgoritmo`,
    grid:[
      "..........",
      "..........",
      ".P.......X",
      "..........",
      ".........."
    ],
    dir:'derecha'
  },
  {
    id:4,
    name:"Recoger la caja",
    desc:"Recoge la caja (marrón) y llévala hasta la meta dorada.",
    goals:["Tomar la caja","Llegar a la meta con la caja"],
    hints:[
      "Avanza hasta estar sobre la caja y usa tomar().",
      "Después de tomarla, avanza hasta la meta y suéltala con soltar()."
    ],
    starThresholds:{ gold: 7, silver: 12 },
    starter:
`Algoritmo Nivel4
    // Llega a la caja, tómala y llévala a la meta

FinAlgoritmo`,
    grid:[
      ".......",
      ".P..B.X",
      ".......",
      "......."
    ],
    dir:'derecha'
  },
  {
    id:5,
    name:"El primer bucle con condición",
    desc:"Usa Mientras para avanzar automáticamente hasta llegar a la meta.",
    goals:["Llegar a la meta"],
    hints:[
      "Mientras frenteLibre() Hacer avanzar() FinMientras",
      "El ciclo se repite mientras haya camino libre al frente."
    ],
    starThresholds:{ gold: 6, silver: 12 },
    starter:
`Algoritmo Nivel5
    Mientras frenteLibre() Hacer
        avanzar()
    FinMientras
FinAlgoritmo`,
    grid:[
      "########",
      "#P....X#",
      "########"
    ],
    dir:'derecha'
  },
  {
    id:6,
    name:"Interruptor y puerta",
    desc:"Activa el interruptor (S) para abrir la puerta (D) y llegar a la meta.",
    goals:["Activar el interruptor","Llegar a la meta"],
    hints:[
      "Camina hasta el interruptor y usa activar().",
      "El interruptor abre la puerta automáticamente.",
      "Luego busca el camino hacia abajo pasando por la puerta."
    ],
    starThresholds:{ gold: 19, silver: 28 },
    starter:
`Algoritmo Nivel6
    // Llega al interruptor, actívalo, y ve a la meta

FinAlgoritmo`,
    grid:[
      "#######",
      "#P...S#",
      "#.....#",
      "#D#####",
      "#.....#",
      "#....X#",
      "#######"
    ],
    switches:[ { x:5, y:1, targets:[{x:1,y:3}] } ],
    dir:'derecha'
  },
  {
    id:7,
    name:"La llave maestra",
    desc:"Recoge la llave (k) y úsala para abrir la puerta bloqueada (K).",
    goals:["Recoger la llave","Abrir la puerta bloqueada","Llegar a la meta"],
    hints:[
      "Recoge la llave con tomar() cuando estés sobre ella.",
      "llevoLlave() devuelve Verdadero si tienes una llave.",
      "abrir() frente a una puerta bloqueada consume la llave."
    ],
    starThresholds:{ gold: 8, silver: 14 },
    starter:
`Algoritmo Nivel7
    // Recoge la llave y abre la puerta bloqueada

FinAlgoritmo`,
    grid:[
      "########",
      "#P.k..K#",
      "#......#",
      "#.....X#",
      "########"
    ],
    dir:'derecha'
  },
  {
    id:8,
    name:"Funciones reutilizables",
    desc:"Define un SubProceso para avanzar varias casillas y reutilízalo.",
    goals:["Llegar a la meta"],
    hints:[
      "SubProceso avanzar3() ... FinSubProceso",
      "Luego llama avanzar3() desde el algoritmo principal."
    ],
    starThresholds:{ gold: 6, silver: 10 },
    starter:
`Algoritmo Nivel8
    avanzar3()
    girar(-90)
    avanzar3()
FinAlgoritmo

SubProceso avanzar3()
    Para i <- 1 Hasta 3 Hacer
        avanzar()
    FinPara
FinSubProceso`,
    grid:[
      ".....",
      ".P...",
      ".....",
      ".....",
      "....X"
    ],
    dir:'derecha'
  },
  {
    id:9,
    name:"Varias cajas",
    desc:"Recoge las 3 cajas y deposítalas en la meta dorada una por una.",
    goals:["Recoger 3 cajas","Depositarlas en la meta"],
    hints:[
      "toma una caja, llévala a la meta, suéltala. Repite.",
      "soltar() sobre la meta dorada cuenta como entrega."
    ],
    starThresholds:{ gold: 22, silver: 35 },
    starter:
`Algoritmo Nivel9
    // Recoge las 3 cajas y llévalas a la meta

FinAlgoritmo`,
    grid:[
      "#########",
      "#P.B.B.B#",
      "#.......#",
      "#.......#",
      "#......X#",
      "#########"
    ],
    dir:'derecha',
    boxesToCollect: 3
  },
  {
    id:10,
    name:"Entrega al NPC",
    desc:"Recoge el ítem (i) y entrégalo al NPC (N).",
    goals:["Recoger el ítem","Entregarlo al NPC","Llegar a la meta"],
    hints:[
      "Recoge el ítem con tomar().",
      "Colócate adyacente al NPC mirando hacia él.",
      "Usa entregar() para dar el ítem al NPC."
    ],
    starThresholds:{ gold: 10, silver: 18 },
    starter:
`Algoritmo Nivel10
    // Recoge el ítem y entrégalo al NPC

FinAlgoritmo`,
    grid:[
      "#######",
      "#P.i..#",
      "#.....#",
      "#..N..#",
      "#.....#",
      "#....X#",
      "#######"
    ],
    npcs:[
      { x:3, y:3, requiredItems:['item'], targets:[] }
    ],
    dir:'derecha'
  },
  {
    id:11,
    name:"Placa de presión",
    desc:"Empuja la caja sobre la placa de presión (o) para abrir la puerta bloqueada.",
    goals:["Activar la placa de presión","Llegar a la meta"],
    hints:[
      "Empuja la caja hasta la placa de presión.",
      "La placa se activa cuando tiene una caja encima.",
      "La placa abre la puerta bloqueada (K) vinculada."
    ],
    starThresholds:{ gold: 14, silver: 24 },
    starter:
`Algoritmo Nivel11
    // Empuja la caja a la placa de presión

FinAlgoritmo`,
    grid:[
      "########",
      "#P....B#",
      "#......#",
      "#..o..K#",
      "#......#",
      "#.....X#",
      "########"
    ],
    pressurePlates:[
      { x:3, y:3, cajasRequeridas:1, targets:[{x:6,y:3}] }
    ],
    dir:'derecha'
  },
  {
    id:12,
    name:"Cuidado con el láser",
    desc:"Evita los haces de láser o desactívalos con el interruptor.",
    goals:["Desactivar el láser","Llegar a la meta"],
    hints:[
      "El emisor de láser (L) proyecta un haz que mata.",
      "Activa el interruptor para desactivar el láser.",
      "El láser se detiene ante paredes y cajas."
    ],
    starThresholds:{ gold: 16, silver: 28 },
    starter:
`Algoritmo Nivel12
    // Desactiva el láser y llega a la meta

FinAlgoritmo`,
    grid:[
      "########",
      "#P....X#",
      "#......#",
      "#.S..L.#",
      "#......#",
      "#......#",
      "########"
    ],
    switches:[ { x:2, y:3, targets:[{x:5,y:3, type:'laser'}] } ],
    lasers:[ { x:5, y:3, dir:'norte', active:true } ],
    dir:'derecha'
  },
  {
    id:13,
    name:"Laberinto",
    desc:"Encuentra tu camino hacia la meta dentro del laberinto.",
    goals:["Llegar a la meta"],
    hints:[
      "Algoritmo mano-derecha: si puedes girar a la derecha, gira y avanza.",
      "girar(-90) es derecha, girar(90) es izquierda."
    ],
    starThresholds:{ gold: 30, silver: 60 },
    starter:
`Algoritmo Nivel13
    Mientras NO objetivoCompleto() Hacer
        Si frenteLibre() Entonces
            avanzar()
        Sino
            girar(90)
        FinSi
    FinMientras
FinAlgoritmo`,
    grid:[
      "#########",
      "#.P#....#",
      "#..#.##.#",
      "#..#.##.#",
      "#..#.##.#",
      "#..#.#..#",
      "#.##.#.##",
      "#....#.X#",
      "#########"
    ],
    dir:'derecha'
  },
  {
    id:14,
    name:"Automatización total",
    desc:"Recoge todas las cajas del laberinto y llévalas de una en una a la meta.",
    goals:["Depositar todas las cajas en la meta"],
    hints:[
      "Usa un SubProceso para llevar una caja a la meta.",
      "Repite hasta que no queden cajas por recoger."
    ],
    starThresholds:{ gold: 28, silver: 45 },
    starter:
`Algoritmo Nivel14
    // Recoge todas las cajas y llévalas a la meta

FinAlgoritmo`,
    grid:[
      "#######",
      "#P.B..#",
      "#.....#",
      "#..B..#",
      "#.....#",
      "#....X#",
      "#######"
    ],
    dir:'derecha',
    boxesToCollect: 2
  },
  {
    id:15,
    name:"El desafio final",
    desc:"Un nivel que combina todos los elementos: llaves, puertas bloqueadas, items, NPCs, interruptores, laseres, cajas y placas de presion. Demuestra que dominas todo.",
    goals:[
      "Recoger la llave",
      "Abrir la puerta bloqueada",
      "Recoger el item",
      "Entregarlo al NPC",
      "Activar el interruptor (desactivar laser)",
      "Empujar la caja a la placa de presion",
      "Llegar a la meta"
    ],
    hints:[
      "Recoge la llave (k) y usala para abrir la puerta bloqueada (K).",
      "Recoge el item (i) y entregalo al NPC (N) colocandote enfrente y mirando hacia el.",
      "Activa el interruptor (S) para desactivar el laser (L).",
      "Empuja la caja (B) hacia abajo hasta la placa de presion (o).",
      "La placa abre la puerta bloqueada (K) vinculada. Luego llega a la meta (X)."
    ],
    starThresholds:{ gold: 40, silver: 60 },
    starter:
`Algoritmo Nivel15
    // El desafio final: combina todos los elementos
    // 1. Recoge la llave y abre la puerta bloqueada
    // 2. Recoge el item y entregalo al NPC
    // 3. Activa el interruptor para el laser
    // 4. Empuja la caja a la placa de presion
    // 5. Llega a la meta

FinAlgoritmo`,
    grid:[
      "##########",
      "#P.k.....#",
      "#........#",
      "#..K..S..#",
      "#........#",
      "#..B.i.N.#",
      "#..o...K.#",
      "#.......X#",
      "##########"
    ],
    switches:[
      { x:6, y:3, targets:[{x:8,y:2, type:'laser'}] }
    ],
    lasers:[
      { x:8, y:2, dir:'este', active:true }
    ],
    pressurePlates:[
      { x:3, y:6, cajasRequeridas:1, targets:[{x:7,y:6}] }
    ],
    npcs:[
      { x:7, y:5, requiredItems:['item'], targets:[{x:7,y:6}] }
    ],
    dir:'derecha'
  },
  {
    id:16,
    name:"Mi nivel",
    desc:"Describe el objetivo de este nivel...",
    goals:["Llegar a la meta"],
    hints:[
      "Usa avanzar() para moverte."
    ],
    starThresholds:{ gold: 10, silver: 20 },
    starter:
`Algoritmo Nivel
    // Escribe tu codigo aqui
FinAlgoritmo`,
    grid:[
      "........",
      "iN......",
      "Pk.....X",
      "S.KKK...",
      "........",
      "..G#.F..",
      "..GB...."
    ],
    dir:'arriba',
    switches:[{'x':0,'y':3,'targets':[{'x':2,'y':5,'type':'piston'},{'x':2,'y':6,'type':'piston'},{'x':4,'y':3}]}],
    npcs:[{'x':1,'y':1,'requiredItems':['item'],'targets':[{'x':3,'y':3}]}],
    enemies:[{'x':5,'y':5,'dir':'norte','active':true,'targets':[],'patrolMode':'bounce','speed':1}],
    pistons:[{'x':2,'y':5,'dir':'este','active':false,'sticky':false,'targets':[{'x':0,'y':3}]},{'x':2,'y':6,'dir':'este','active':false,'sticky':true,'targets':[{'x':0,'y':3}]}],
    keys:[{'x':1,'y':2,'targets':[{'x':2,'y':3}],'displayName':''}]
  }
];

// Normaliza direcciones: norte/sur/este/oeste -> arriba/abajo/derecha/izquierda
function _normalizeDir(d){
  const s = String(d||'').toLowerCase().trim();
  if(['arriba','norte','n','up'].includes(s)) return 'arriba';
  if(['abajo','sur','s','down'].includes(s)) return 'abajo';
  if(['izquierda','oeste','w','left','izq'].includes(s)) return 'izquierda';
  if(['derecha','este','e','right','der'].includes(s)) return 'derecha';
  return 'derecha';
}

// Convierte la definición de un nivel en un objeto mundo ejecutable
function buildLevel(def){
  const grid = def.grid.map(row => row.split(''));
  const H = grid.length, W = grid[0].length;
  let player = null;
  const boxes = [];
  const walls = [];
  const targets = [];
  const switches = [];
  const doors = [];
  const items = [];
  const npcs = [];
  const pressurePlates = [];
  const lasers = [];
  const enemies = [];
  const pistons = [];

  for(let y=0; y<H; y++){
    for(let x=0; x<W; x++){
      const c = grid[y][x];
      if(c === 'P'){ player = {x, y}; grid[y][x] = '.'; }
      else if(c === '#'){ walls.push({x,y}); }
      else if(c === 'B'){ boxes.push({x,y}); grid[y][x]='.'; }
      else if(c === 'X'){ targets.push({x,y}); grid[y][x]='.'; }
      else if(c === 'S'){ switches.push({x,y, active:false, targets:[]}); grid[y][x]='.'; }
      else if(c === 'D'){ doors.push({x,y, open:false, locked:false}); grid[y][x]='.'; }
      else if(c === 'd'){ doors.push({x,y, open:true, locked:false}); grid[y][x]='.'; }
      else if(c === 'K'){ doors.push({x,y, open:false, locked:true}); grid[y][x]='.'; }
      else if(c === 'k'){ items.push({x,y, type:'llave', id:'llave_'+x+'_'+y}); grid[y][x]='.'; }
      else if(c === 'i'){ items.push({x,y, type:'item', id:'item_'+x+'_'+y}); grid[y][x]='.'; }
      else if(c === 'N'){ npcs.push({x,y, requiredItems:[], targets:[], received:{items:[]}, completed:false}); grid[y][x]='.'; }
      else if(c === 'o'){ pressurePlates.push({x,y, cajasRequeridas:1, active:false, targets:[]}); grid[y][x]='.'; }
      else if(c === 'L'){ lasers.push({x,y, dir:'este', active:true, targets:[]}); grid[y][x]='.'; }
      else if(c === 'F'){ enemies.push({x,y, dir:'derecha', active:true, defeated:false, targets:[], patrolMode:'bounce'}); grid[y][x]='.'; }
      else if(c === 'G'){ pistons.push({x,y, dir:'derecha', active:false, sticky:false, targets:[], extended:false, extendX:null, extendY:null}); grid[y][x]='.'; }
    }
  }

  // Asociar los targets de cada switch
  if(def.switches){
    def.switches.forEach((s, i) => {
      if(switches[i] && s.targets) switches[i].targets = s.targets;
    });
  }

  // Asociar NPCs definidos en def.npcs
  if(def.npcs){
    def.npcs.forEach((n, i) => {
      if(npcs[i]){
        npcs[i].requiredItems = n.requiredItems || [];
        npcs[i].targets = n.targets || [];
      }
    });
  }

  // Asociar enemigos definidos en def.enemies
  if(def.enemies){
    def.enemies.forEach((e, i) => {
      if(enemies[i]){
        enemies[i].dir = _normalizeDir(e.dir || 'derecha');
        enemies[i].active = e.active !== undefined ? e.active : true;
        enemies[i].targets = e.targets || [];
        enemies[i].patrolMode = e.patrolMode || 'bounce';
        enemies[i].speed = Math.max(1, Math.min(3, parseInt(e.speed) || 1));
      }
    });
    // Create enemies defined in def.enemies that don't have a matching grid 'F'
    for(let i = enemies.length; i < def.enemies.length; i++){
      const e = def.enemies[i];
      enemies.push({
        x: e.x,
        y: e.y,
        dir: _normalizeDir(e.dir || 'derecha'),
        active: e.active !== undefined ? e.active : true,
        defeated: false,
        targets: e.targets || [],
        patrolMode: e.patrolMode || 'bounce',
        speed: Math.max(1, Math.min(3, parseInt(e.speed) || 1))
      });
    }
  }

  // Asociar pistones definidos en def.pistons
  if(def.pistons){
    def.pistons.forEach((p, i) => {
      if(pistons[i]){
        pistons[i].dir = _normalizeDir(p.dir || 'derecha');
        pistons[i].active = p.active !== undefined ? p.active : false;
        pistons[i].sticky = p.sticky || false;
        pistons[i].targets = p.targets || [];
        pistons[i].extended = false;
        pistons[i].extendX = null;
        pistons[i].extendY = null;
      }
    });
  }

  // Asociar placas de presión
  if(def.pressurePlates){
    def.pressurePlates.forEach((pp, i) => {
      if(pressurePlates[i]){
        pressurePlates[i].cajasRequeridas = pp.cajasRequeridas || 1;
        pressurePlates[i].targets = pp.targets || [];
      }
    });
  }

  // Asociar láseres
  if(def.lasers){
    def.lasers.forEach((l, i) => {
      if(lasers[i]){
        lasers[i].dir = l.dir || 'este';
        lasers[i].active = l.active !== undefined ? l.active : true;
      }
    });
  }

  // Asociar llaves con puertas (key-door linking)
  if(def.keys){
    def.keys.forEach((k) => {
      // Find the item that corresponds to this key position
      const item = items.find(it => it.x === k.x && it.y === k.y && it.type === 'llave');
      if(item && k.targets && k.targets.length > 0){
        item.linkedDoor = { x: k.targets[0].x, y: k.targets[0].y };
      }
      if(item && k.displayName){
        item.displayName = k.displayName;
      }
    });
  }

  // Store original positions for enemies (for idle patrol reset)
  for(const e of enemies){
    e.origX = e.x;
    e.origY = e.y;
    e.origDir = e.dir;
  }

  return {
    def,
    W, H,
    walls,
    player: { x:player.x, y:player.y, dir: def.dir||'derecha', carrying:null },
    boxes,
    targets,
    switches,
    doors,
    items,
    npcs,
    pressurePlates,
    lasers,
    enemies,
    pistons,
    laserBeams: [],
    inventory: [],
    delivered: 0,
    boxesToCollect: def.boxesToCollect || boxes.length,
    deliveredAt: []
  };
}

function cloneWorld(world){
  return JSON.parse(JSON.stringify(world));
}

global.LEVELS = LEVELS;
global.buildLevel = buildLevel;
global.cloneWorld = cloneWorld;

})(window);

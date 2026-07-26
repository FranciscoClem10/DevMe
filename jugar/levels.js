/* ============================================================
 * levels.js — Definición de niveles del juego
 * Celdas: '.' vacío, '#' pared, 'B' caja, 'X' meta,
 *         'D' puerta cerrada, 'd' puerta abierta, 'S' switch
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
      "Avanza hasta estar frente a la caja y usa tomar().",
      "hayCaja() devuelve Verdadero si hay una caja adelante.",
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
      "El ciclo se repite mientras haya camino libre al frente.",
      "Cuando el personaje llegue a la meta, el nivel se completa."
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
    // Pista: girar(-90) = derecha, girar(90) = izquierda

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
    name:"Varias cajas",
    desc:"Recoge las 3 cajas y deposítalas en la meta dorada una por una.",
    goals:["Recoger 3 cajas","Depositarlas en la meta"],
    hints:[
      "toma una caja, llévala a la meta, suéltala. Repite.",
      "Un SubProceso llevarCaja() te ayudaría a no repetir código.",
      "soltar() sobre la meta dorada cuenta como entrega."
    ],
    starThresholds:{ gold: 22, silver: 35 },
    starter:
`Algoritmo Nivel7
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
    id:8,
    name:"Funciones reutilizables",
    desc:"Define un SubProceso para avanzar varias casillas y reutilízalo.",
    goals:["Llegar a la meta"],
    hints:[
      "SubProceso avanzar3() ... FinSubProceso",
      "Luego llama avanzar3() desde el algoritmo principal.",
      "Puedes definir parámetros: SubProceso avanzarN(n)"
    ],
    starThresholds:{ gold: 6, silver: 10 },
    starter:
`Algoritmo Nivel8
    // Define un SubProceso y úsalo para llegar a la meta
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
    name:"Laberinto",
    desc:"Encuentra tu camino hacia la meta dentro del laberinto.",
    goals:["Llegar a la meta"],
    hints:[
      "Algoritmo mano-derecha: si puedes girar a la derecha, gira y avanza; si no, avanza recto; si no, gira a la izquierda.",
      "girar(-90) es derecha, girar(90) es izquierda.",
      "Mientras NO objetivoCompleto() Hacer ... FinMientras"
    ],
    starThresholds:{ gold: 30, silver: 60 },
    starter:
`Algoritmo Nivel9
    Mientras NO objetivoCompleto() Hacer
        // Implementa el algoritmo de mano derecha
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
    id:10,
    name:"Automatización total",
    desc:"Recoge todas las cajas del laberinto y llévalas de una en una a la meta.",
    goals:["Depositar todas las cajas en la meta"],
    hints:[
      "Usa un SubProceso para llevar una caja a la meta.",
      "Repite hasta que no queden cajas por recoger.",
      "Mientras hayCaja() o hay cajas sin recoger..."
    ],
    starThresholds:{ gold: 28, silver: 45 },
    starter:
`Algoritmo Nivel10
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
  }
];

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

  for(let y=0; y<H; y++){
    for(let x=0; x<W; x++){
      const c = grid[y][x];
      if(c === 'P'){ player = {x, y}; grid[y][x] = '.'; }
      else if(c === '#'){ walls.push({x,y}); }
      else if(c === 'B'){ boxes.push({x,y}); grid[y][x]='.'; }
      else if(c === 'X'){ targets.push({x,y}); grid[y][x]='.'; }
      else if(c === 'S'){ switches.push({x,y, active:false, targets:[]}); grid[y][x]='.'; }
      else if(c === 'D'){ doors.push({x,y, open:false}); grid[y][x]='.'; }
      else if(c === 'd'){ doors.push({x,y, open:true}); grid[y][x]='.'; }
    }
  }

  // Asociar los targets de cada switch (definidos en def.switches)
  if(def.switches){
    def.switches.forEach((s, i) => {
      if(switches[i] && s.targets) switches[i].targets = s.targets;
    });
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
    delivered: 0,
    boxesToCollect: def.boxesToCollect || boxes.length,
    deliveredAt: []
  };
}

global.LEVELS = LEVELS;
global.buildLevel = buildLevel;

})(window);

/* ============================================================
 * renderer.js — Dibuja el mundo del juego en el canvas
 * Soporta imágenes opcionales con fallback a Canvas
 * Dibuja: paredes, metas, puertas (cerrada/bloqueada),
 * interruptores, cajas, llaves, ítems, NPCs, placas de presión,
 * láseres, haces de láser, jugador con inventario.
 * ============================================================ */
(function(global){
'use strict';

const COLORS = {
  bg1:'#e5d9a8', bg2:'#c9b976',
  wall:'#4a3818', wallTop:'#6b5423',
  target:'rgba(244,192,37,0.5)', targetBorder:'#f4c025',
  box:'#a56526', boxLight:'#c07f39',
  door:'#5b3a1a', doorOpen:'#a08065',
  doorLocked:'#8b0000',
  switchOff:'#888', switchOn:'#22863a',
  player:'#e53e3e', playerDir:'#fff',
  key:'#ffd700', item:'#4488ff',
  npc:'#4caf50', npcDone:'#81c784',
  plateOff:'#777', plateOn:'#ff9800',
  laser:'#ff0000', laserBeam:'rgba(255,0,0,0.5)',
  laserEmitter:'#cc0000',
  enemy:'#d32f2f', enemyDead:'#888',
  piston:'#607d8b', pistonActive:'#ff9800'
};

const IMAGES = {
  player: null, player_up: null, player_down: null,
  player_left: null, player_right: null,
  wall: null, target: null, box: null,
  box_delivered: null, door: null, door_open: null,
  switch_off: null, switch_on: null, carrying_box: null
};

let imagesLoaded = false;
let imagesChecked = false;

function loadImages() {
  if (imagesChecked) return;
  imagesChecked = true;
  const imgDir = 'imgs/';
  const imgFiles = {
    player: 'player.png', player_up: 'player_up.png',
    player_down: 'player_down.png', player_left: 'player_left.png',
    player_right: 'player_right.png', wall: 'wall.png',
    target: 'target.png', box: 'box.png',
    box_delivered: 'box_delivered.png', door: 'door.png',
    door_open: 'door_open.png', switch_off: 'switch_off.png',
    switch_on: 'switch_on.png', carrying_box: 'carrying_box.png'
  };
  let loadedCount = 0;
  const totalImages = Object.keys(imgFiles).length;
  const onLoad = (key) => {
    loadedCount++;
    if (loadedCount === totalImages) {
      imagesLoaded = true;
      if (window.__renderer) setTimeout(() => window.__renderer.render(), 50);
    }
  };
  for (const [key, filename] of Object.entries(imgFiles)) {
    const img = new Image();
    img.onload = () => { IMAGES[key] = img; onLoad(key); };
    img.onerror = () => { onLoad(key); };
    img.src = imgDir + filename;
  }
}

function makeRenderer(canvas){
  const ctx = canvas.getContext('2d');
  let world = null;
  let cell = 40;
  let sayMsg = null;
  let sayTimer = 0;

  // ============= ANIMATION SYSTEM =============
  const entityAnims = new Map(); // entity -> {fromX, fromY, startTime, duration}
  let animLoopId = null;
  let defaultAnimDuration = 200; // ms

  function setAnimDuration(ms){
    defaultAnimDuration = Math.max(30, ms);
  }

  function animateEntity(entity, fromX, fromY, duration){
    if(!entity) return;
    if(entity.x === fromX && entity.y === fromY) return;
    entityAnims.set(entity, {
      fromX: fromX,
      fromY: fromY,
      startTime: performance.now(),
      duration: duration || defaultAnimDuration
    });
    ensureAnimLoop();
  }

  function ensureAnimLoop(){
    if(animLoopId) return;
    function loop(){
      const now = performance.now();
      let hasActive = false;
      for(const [entity, anim] of entityAnims){
        if(now - anim.startTime >= anim.duration){
          entityAnims.delete(entity);
        } else {
          hasActive = true;
        }
      }
      render();
      if(hasActive){
        animLoopId = requestAnimationFrame(loop);
      } else {
        animLoopId = null;
      }
    }
    animLoopId = requestAnimationFrame(loop);
  }

  function getVisualPos(entity){
    if(!entity) return {x:0, y:0};
    const anim = entityAnims.get(entity);
    if(!anim) return { x: entity.x, y: entity.y };
    const elapsed = performance.now() - anim.startTime;
    const t = Math.min(1, elapsed / anim.duration);
    if(t >= 1){
      entityAnims.delete(entity);
      return { x: entity.x, y: entity.y };
    }
    // Ease out cubic
    const e = 1 - Math.pow(1 - t, 3);
    return {
      x: anim.fromX + (entity.x - anim.fromX) * e,
      y: anim.fromY + (entity.y - anim.fromY) * e
    };
  }

  function stopAllAnims(){
    entityAnims.clear();
    if(animLoopId){
      cancelAnimationFrame(animLoopId);
      animLoopId = null;
    }
  }

  loadImages();

  function setWorld(w){ world = w; stopAllAnims(); resize(); render(); }

  function resize(){
    const parent = canvas.parentElement;
    if(!parent) return;
    const size = Math.min(parent.clientWidth, parent.clientHeight) - 20;
    const s = Math.max(280, Math.min(640, size));
    canvas.width = s; canvas.height = s;
    if(world){ cell = Math.floor(Math.min(s/world.W, s/world.H)); }
  }

  function render(){
    if(!world){
      ctx.fillStyle = '#3a3218';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      return;
    }
    const W = world.W, H = world.H;
    const offX = Math.floor((canvas.width - cell*W)/2);
    const offY = Math.floor((canvas.height - cell*H)/2);

    // fondo
    ctx.fillStyle = '#3a3218';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // tablero ajedrez
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        ctx.fillStyle = (x+y)%2===0 ? COLORS.bg1 : COLORS.bg2;
        ctx.fillRect(offX+x*cell, offY+y*cell, cell, cell);
      }
    }

    // metas (X)
    for(const t of world.targets){
      const px = offX+t.x*cell, py = offY+t.y*cell;
      if(IMAGES.target){
        ctx.drawImage(IMAGES.target, px, py, cell, cell);
      } else {
        ctx.fillStyle = COLORS.target;
        ctx.fillRect(px, py, cell, cell);
        ctx.strokeStyle = COLORS.targetBorder;
        ctx.lineWidth = 3;
        ctx.setLineDash([4,3]);
        ctx.strokeRect(px+2, py+2, cell-4, cell-4);
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.targetBorder;
        ctx.font = `${cell*0.45}px serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('\u2605', px+cell/2, py+cell/2);
      }
    }

    // paredes
    for(const w of world.walls){
      const vp = getVisualPos(w);
      const px = offX+vp.x*cell, py = offY+vp.y*cell;
      if(IMAGES.wall){
        ctx.drawImage(IMAGES.wall, px, py, cell, cell);
      } else {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(px, py, cell, cell);
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(px, py, cell, cell*0.2);
        ctx.strokeStyle = '#2a1e0a';
        ctx.lineWidth = 1;
        ctx.strokeRect(px+0.5, py+0.5, cell-1, cell-1);
      }
    }

    // placas de presión
    if(world.pressurePlates){
      for(const pp of world.pressurePlates){
        const px = offX+pp.x*cell, py = offY+pp.y*cell;
        const cx = px+cell/2, cy = py+cell/2;
        const r = cell*0.35;
        // Anillo exterior
        ctx.strokeStyle = pp.active ? COLORS.plateOn : COLORS.plateOff;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
        // Anillo interior
        ctx.strokeStyle = pp.active ? '#ffb74d' : '#999';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r*0.6, 0, Math.PI*2); ctx.stroke();
        // Centro
        ctx.fillStyle = pp.active ? COLORS.plateOn : '#666';
        ctx.beginPath(); ctx.arc(cx, cy, r*0.25, 0, Math.PI*2); ctx.fill();
        // Texto
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cell*0.18}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('o', cx, cy+1);
      }
    }

    // switches
    for(const s of world.switches){
      const px = offX+s.x*cell, py = offY+s.y*cell;
      const img = s.active ? IMAGES.switch_on : IMAGES.switch_off;
      if(img){
        ctx.drawImage(img, px, py, cell, cell);
      } else {
        const cx = px+cell/2, cy = py+cell/2;
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(cx, cy, cell*0.28, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = s.active ? COLORS.switchOn : '#c94b3b';
        ctx.beginPath(); ctx.arc(cx, cy, cell*0.16, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cell*0.22}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('S', cx, cy+1);
      }
    }

    // puertas
    for(const d of world.doors){
      const px = offX+d.x*cell, py = offY+d.y*cell;
      const img = d.open ? IMAGES.door_open : IMAGES.door;
      if(img && !d.locked){
        ctx.drawImage(img, px, py, cell, cell);
      } else {
        if(d.open){
          ctx.fillStyle = COLORS.doorOpen;
          ctx.fillRect(px+cell*0.1, py+cell*0.1, cell*0.15, cell*0.8);
          ctx.fillRect(px+cell*0.75, py+cell*0.1, cell*0.15, cell*0.8);
        } else if(d.locked){
          // Puerta bloqueada - roja con candado
          ctx.fillStyle = COLORS.doorLocked;
          ctx.fillRect(px+cell*0.05, py+cell*0.05, cell*0.9, cell*0.9);
          ctx.fillStyle = '#5a0000';
          ctx.fillRect(px+cell*0.15, py+cell*0.15, cell*0.7, cell*0.7);
          // Candado
          ctx.fillStyle = '#ffd700';
          ctx.beginPath(); ctx.arc(px+cell*0.5, py+cell*0.4, cell*0.12, Math.PI, 0); ctx.stroke();
          ctx.fillRect(px+cell*0.38, py+cell*0.4, cell*0.24, cell*0.2);
          ctx.fillStyle = '#3a0000';
          ctx.beginPath(); ctx.arc(px+cell*0.5, py+cell*0.5, cell*0.04, 0, Math.PI*2); ctx.fill();
        } else {
          ctx.fillStyle = COLORS.door;
          ctx.fillRect(px+cell*0.05, py+cell*0.05, cell*0.9, cell*0.9);
          ctx.fillStyle = '#3a2410';
          ctx.fillRect(px+cell*0.15, py+cell*0.15, cell*0.7, cell*0.7);
          ctx.fillStyle = '#c99b17';
          ctx.beginPath(); ctx.arc(px+cell*0.75, py+cell*0.5, cell*0.05, 0, Math.PI*2); ctx.fill();
        }
      }
    }

    // items en el suelo (llaves e ítems)
    if(world.items){
      for(const it of world.items){
        const px = offX+it.x*cell, py = offY+it.y*cell;
        const cx = px+cell/2, cy = py+cell/2;
        if(it.type === 'llave'){
          // Llave dorada
          ctx.fillStyle = COLORS.key;
          ctx.beginPath(); ctx.arc(cx-cell*0.1, cy, cell*0.15, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#b8860b';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx-cell*0.1, cy, cell*0.15, 0, Math.PI*2); ctx.stroke();
          // Mango de la llave
          ctx.fillStyle = COLORS.key;
          ctx.fillRect(cx, cy-cell*0.04, cell*0.25, cell*0.08);
          // Dientes
          ctx.fillRect(cx+cell*0.15, cy-cell*0.04, cell*0.04, cell*0.12);
          ctx.fillRect(cx+cell*0.22, cy-cell*0.04, cell*0.04, cell*0.1);
        } else {
          // Ítem genérico azul
          ctx.fillStyle = COLORS.item;
          ctx.beginPath(); ctx.arc(cx, cy, cell*0.2, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#2266cc';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, cell*0.2, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${cell*0.2}px sans-serif`;
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText('i', cx, cy+1);
        }
      }
    }

    // NPCs
    if(world.npcs){
      for(const npc of world.npcs){
        const px = offX+npc.x*cell, py = offY+npc.y*cell;
        const cx = px+cell/2, cy = py+cell/2;
        const color = npc.completed ? COLORS.npcDone : COLORS.npc;
        // Cuerpo
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(cx, cy-cell*0.05, cell*0.25, 0, Math.PI*2); ctx.fill();
        // Cabeza
        ctx.beginPath(); ctx.arc(cx, cy-cell*0.25, cell*0.15, 0, Math.PI*2); ctx.fill();
        // Borde
        ctx.strokeStyle = '#2e7d32';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy-cell*0.05, cell*0.25, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy-cell*0.25, cell*0.15, 0, Math.PI*2); ctx.stroke();
        // Letra N
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cell*0.2}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('N', cx, cy-cell*0.05);
        // Indicador de completado
        if(npc.completed){
          ctx.fillStyle = '#4caf50';
          ctx.font = `${cell*0.18}px sans-serif`;
          ctx.fillText('\u2713', cx+cell*0.25, py+cell*0.15);
        }
      }
    }

    // láseres (emisores)
    if(world.lasers){
      for(const laser of world.lasers){
        const px = offX+laser.x*cell, py = offY+laser.y*cell;
        const cx = px+cell/2, cy = py+cell/2;
        // Emisor
        ctx.fillStyle = laser.active ? COLORS.laserEmitter : '#666';
        ctx.fillRect(px+cell*0.2, py+cell*0.2, cell*0.6, cell*0.6);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(px+cell*0.2, py+cell*0.2, cell*0.6, cell*0.6);
        // Indicador de dirección
        const dirMap = {
          'norte':[0,-1], 'arriba':[0,-1], 'sur':[0,1], 'abajo':[0,1],
          'este':[1,0], 'derecha':[1,0], 'oeste':[-1,0], 'izquierda':[-1,0]
        };
        const [ddx,ddy] = dirMap[laser.dir] || [1,0];
        ctx.fillStyle = laser.active ? '#ff4444' : '#999';
        ctx.beginPath();
        ctx.moveTo(cx+ddx*cell*0.3, cy+ddy*cell*0.3);
        ctx.lineTo(cx+ddy*cell*0.12-ddx*cell*0.1, cy-ddx*cell*0.12-ddy*cell*0.1);
        ctx.lineTo(cx-ddy*cell*0.12-ddx*cell*0.1, cy+ddx*cell*0.12-ddy*cell*0.1);
        ctx.closePath();
        ctx.fill();
        // Letra L
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cell*0.2}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('L', cx, cy);
      }
    }

    // haces de láser - dibujar como líneas continuas
    if(world.lasers && world.lasers.length > 0){
      for(const laser of world.lasers){
        if(!laser.active) continue;
        
        const startX = offX + laser.x * cell + cell/2;
        const startY = offY + laser.y * cell + cell/2;
        
        // Calcular dirección
        const dirMap = {
          'norte': [0,-1], 'arriba': [0,-1],
          'sur': [0,1], 'abajo': [0,1],
          'este': [1,0], 'derecha': [1,0],
          'oeste': [-1,0], 'izquierda': [-1,0]
        };
        const [dx, dy] = dirMap[laser.dir] || [1,0];
        
        // Encontrar el punto final del haz
        let endX = startX;
        let endY = startY;
        let cx = laser.x + dx;
        let cy = laser.y + dy;
        
        while(cx >= 0 && cy >= 0 && cx < world.W && cy < world.H){
          // Detener en pared
          if(world.walls.some(w => w.x === cx && w.y === cy)) break;
          // Detener en caja
          if(world.boxes.some(b => b.x === cx && b.y === cy)) break;
          
          endX = offX + cx * cell + cell/2;
          endY = offY + cy * cell + cell/2;
          cx += dx;
          cy += dy;
        }
        
        // Dibujar línea del haz
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = cell * 0.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Brillo central
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.9)';
        ctx.lineWidth = cell * 0.15;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    }

    // cajas en el suelo
    for(const b of world.boxes){ const vp = getVisualPos(b); drawBox(offX+vp.x*cell, offY+vp.y*cell, false); }
    // cajas entregadas (sobre metas)
    for(const b of world.deliveredAt) drawBox(offX+b.x*cell, offY+b.y*cell, true);

    // enemigos
    if(world.enemies){
      for(const enemy of world.enemies){
        const vp = getVisualPos(enemy);
        const px = offX+vp.x*cell, py = offY+vp.y*cell;
        const cx = px+cell/2, cy = py+cell/2;
        if(enemy.defeated){
          // Enemigo derrotado: gris, tachado
          ctx.fillStyle = COLORS.enemyDead;
          ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.arc(cx, cy, cell*0.3, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px+cell*0.2, py+cell*0.2); ctx.lineTo(px+cell*0.8, py+cell*0.8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px+cell*0.8, py+cell*0.2); ctx.lineTo(px+cell*0.2, py+cell*0.8); ctx.stroke();
        } else {
          // Enemigo activo: rojo con forma de calavera
          ctx.fillStyle = enemy.active ? COLORS.enemy : COLORS.enemyDead;
          ctx.beginPath(); ctx.arc(cx, cy-cell*0.05, cell*0.28, 0, Math.PI*2); ctx.fill();
          // Ojos
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(cx-cell*0.1, cy-cell*0.1, cell*0.07, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx+cell*0.1, cy-cell*0.1, cell*0.07, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.arc(cx-cell*0.1, cy-cell*0.1, cell*0.035, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx+cell*0.1, cy-cell*0.1, cell*0.035, 0, Math.PI*2); ctx.fill();
          // Boca
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx-cell*0.1, cy+cell*0.1); ctx.lineTo(cx+cell*0.1, cy+cell*0.1); ctx.stroke();
          // Letra F
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${cell*0.16}px sans-serif`;
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText('F', cx, cy+cell*0.25);
          // Indicador de dirección
          const dirMap = {arriba:[0,-1],derecha:[1,0],abajo:[0,1],izquierda:[-1,0]};
          const [edx,edy] = dirMap[enemy.dir]||[1,0];
          ctx.fillStyle = 'rgba(255,0,0,0.4)';
          ctx.beginPath();
          ctx.moveTo(cx+edx*cell*0.35, cy+edy*cell*0.35);
          ctx.lineTo(cx+edy*cell*0.08-edx*cell*0.05, cy-edx*cell*0.08-edy*cell*0.05);
          ctx.lineTo(cx-edy*cell*0.08-edx*cell*0.05, cy+edx*cell*0.08-edy*cell*0.05);
          ctx.closePath(); ctx.fill();
        }
      }
    }

    // pistones
    if(world.pistons){
      for(const piston of world.pistons){
        const px = offX+piston.x*cell, py = offY+piston.y*cell;
        const cx = px+cell/2, cy = py+cell/2;
        // Base del pistón
        ctx.fillStyle = piston.active ? COLORS.pistonActive : COLORS.piston;
        ctx.fillRect(px+cell*0.1, py+cell*0.1, cell*0.8, cell*0.8);
        ctx.strokeStyle = '#37474f';
        ctx.lineWidth = 2;
        ctx.strokeRect(px+cell*0.1, py+cell*0.1, cell*0.8, cell*0.8);
        // Flecha de dirección
        const dirMap = {arriba:[0,-1],derecha:[1,0],abajo:[0,1],izquierda:[-1,0]};
        const [pdx,pdy] = dirMap[piston.dir]||[1,0];
        ctx.fillStyle = piston.active ? '#fff' : '#b0bec5';
        ctx.beginPath();
        ctx.moveTo(cx+pdx*cell*0.3, cy+pdy*cell*0.3);
        ctx.lineTo(cx+pdy*cell*0.12-pdx*cell*0.1, cy-pdx*cell*0.12-pdy*cell*0.1);
        ctx.lineTo(cx-pdy*cell*0.12-pdx*cell*0.1, cy+pdx*cell*0.12-pdy*cell*0.1);
        ctx.closePath(); ctx.fill();
        // Letra G
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cell*0.18}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('G', cx, cy+cell*0.02);
        // Indicador pegajoso
        if(piston.sticky){
          ctx.fillStyle = '#ffeb3b';
          ctx.font = `bold ${cell*0.12}px sans-serif`;
          ctx.fillText('~', cx, py+cell*0.18);
        }
        
        // Dibujar extensión del pistón cuando está activo
        if(piston.extended && piston.extendX !== null && piston.extendY !== null){
          const extPx = offX + piston.extendX * cell;
          const extPy = offY + piston.extendY * cell;
          const extCx = extPx + cell/2;
          const extCy = extPy + cell/2;
          
          // Dibujar la extensión (brazo del pistón)
          ctx.fillStyle = COLORS.pistonActive;
          ctx.fillRect(extPx+cell*0.15, extPy+cell*0.15, cell*0.7, cell*0.7);
          ctx.strokeStyle = '#e65100';
          ctx.lineWidth = 2;
          ctx.strokeRect(extPx+cell*0.15, extPy+cell*0.15, cell*0.7, cell*0.7);
          
          // Dibujar líneas de conexión entre la base y la extensión
          ctx.strokeStyle = '#ff9800';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx + pdx*cell*0.4, cy + pdy*cell*0.4);
          ctx.lineTo(extCx - pdx*cell*0.35, extCy - pdy*cell*0.35);
          ctx.stroke();
          
          // Dibujar indicador de empuje en la extensión
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(extCx+pdx*cell*0.25, extCy+pdy*cell*0.25);
          ctx.lineTo(extCx+pdy*cell*0.1-pdx*cell*0.08, extCy-pdx*cell*0.1-pdy*cell*0.08);
          ctx.lineTo(extCx-pdy*cell*0.1-pdx*cell*0.08, extCy+pdx*cell*0.1-pdy*cell*0.08);
          ctx.closePath(); ctx.fill();
        }
      }
    }

    // jugador
    const playerVP = getVisualPos(world.player);
    drawPlayer(offX + playerVP.x*cell, offY + playerVP.y*cell, world.player.dir, world.player.carrying);

    // Indicador de inventario (pila)
    drawInventory(offX, offY, world);

    // burbuja de diálogo
    if(sayMsg && Date.now() < sayTimer){
      const p = world.player;
      const pvp = getVisualPos(p);
      const px = offX + pvp.x*cell + cell/2;
      const py = offY + pvp.y*cell - 8;
      drawBubble(px, py, sayMsg);
    }
  }

  function drawBox(px, py, delivered){
    const img = delivered ? IMAGES.box_delivered : IMAGES.box;
    if(img){
      ctx.drawImage(img, px, py, cell, cell);
    } else {
      const m = cell*0.12;
      ctx.fillStyle = delivered ? '#8e5b25' : COLORS.box;
      ctx.fillRect(px+m, py+m, cell-2*m, cell-2*m);
      ctx.fillStyle = delivered ? '#6b4420' : COLORS.boxLight;
      ctx.fillRect(px+m, py+m, cell-2*m, (cell-2*m)*0.18);
      ctx.strokeStyle = '#5a3812';
      ctx.lineWidth = 2;
      ctx.strokeRect(px+m+0.5, py+m+0.5, cell-2*m-1, cell-2*m-1);
    }
  }

  function drawPlayer(px, py, dir, carrying){
    let playerImg = null;
    if(dir === 'arriba' && IMAGES.player_up) playerImg = IMAGES.player_up;
    else if(dir === 'abajo' && IMAGES.player_down) playerImg = IMAGES.player_down;
    else if(dir === 'izquierda' && IMAGES.player_left) playerImg = IMAGES.player_left;
    else if(dir === 'derecha' && IMAGES.player_right) playerImg = IMAGES.player_right;
    if(!playerImg && IMAGES.player) playerImg = IMAGES.player;

    if(playerImg){
      ctx.drawImage(playerImg, px, py, cell, cell);
      if(carrying && IMAGES.carrying_box){
        const bs = cell*0.5;
        ctx.drawImage(IMAGES.carrying_box, px + (cell-bs)/2, py - bs*0.3, bs, bs);
      } else if(carrying){
        const bs = cell*0.3;
        ctx.fillStyle = COLORS.box;
        ctx.fillRect(px + cell/2 - bs/2, py+cell*0.02, bs, bs*0.7);
        ctx.strokeStyle = '#5a3812';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + cell/2 - bs/2+0.5, py+cell*0.02+0.5, bs-1, bs*0.7-1);
      }
    } else {
      const cx = px + cell/2, cy = py + cell/2;
      const r = cell*0.34;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(cx, cy+r*0.6, r*0.85, r*0.3, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = COLORS.player;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#b52e2e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
      const angle = { arriba:-Math.PI/2, derecha:0, abajo:Math.PI/2, izquierda:Math.PI }[dir] || 0;
      const tipX = cx + Math.cos(angle) * r * 0.85;
      const tipY = cy + Math.sin(angle) * r * 0.85;
      const lx = cx + Math.cos(angle + 2.5) * r * 0.55;
      const ly = cy + Math.sin(angle + 2.5) * r * 0.55;
      const rx = cx + Math.cos(angle - 2.5) * r * 0.55;
      const ry = cy + Math.sin(angle - 2.5) * r * 0.55;
      ctx.fillStyle = COLORS.playerDir;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY); ctx.lineTo(lx, ly); ctx.lineTo(rx, ry);
      ctx.closePath(); ctx.fill();
      if(carrying){
        const bs = cell*0.3;
        ctx.fillStyle = COLORS.box;
        ctx.fillRect(cx-bs/2, py+cell*0.02, bs, bs*0.7);
        ctx.strokeStyle = '#5a3812'; ctx.lineWidth = 1;
        ctx.strokeRect(cx-bs/2+0.5, py+cell*0.02+0.5, bs-1, bs*0.7-1);
      }
    }
  }

  function drawInventory(offX, offY, world){
    if(!world.inventory || world.inventory.length === 0) return;
    // Dibujar indicador de inventario en esquina superior izquierda del canvas
    const invX = offX + 4;
    const invY = offY + 4;
    const invW = cell * 0.6;
    const invH = Math.min(world.inventory.length * (cell*0.25) + cell*0.3, cell*2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(invX, invY, invW, invH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(invX, invY, invW, invH);
    // Dibujar items de la pila
    ctx.font = `${cell*0.15}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for(let i=0; i<world.inventory.length; i++){
      const it = world.inventory[i];
      const iy = invY + invH - (i+1)*(cell*0.25);
      ctx.fillStyle = it.type === 'llave' ? COLORS.key : COLORS.item;
      ctx.beginPath(); ctx.arc(invX+invW/2, iy, cell*0.08, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillText(it.type === 'llave' ? 'k' : 'i', invX+invW/2, iy+1);
    }
  }

  function drawBubble(cx, cy, msg){
    ctx.font = '12px Lexend, sans-serif';
    const pad = 8;
    const w = ctx.measureText(msg).width + pad*2;
    const h = 24;
    const x = cx - w/2, y = cy - h - 6;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 5, true, true);
    ctx.beginPath();
    ctx.moveTo(cx-4, y+h); ctx.lineTo(cx, y+h+5); ctx.lineTo(cx+4, y+h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(msg, cx, y+h/2);
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y, x+w,y+h, r);
    ctx.arcTo(x+w,y+h, x,y+h, r);
    ctx.arcTo(x,y+h, x,y, r);
    ctx.arcTo(x,y, x+w,y, r);
    ctx.closePath();
    if(fill) ctx.fill();
    if(stroke) ctx.stroke();
  }

  function sayBubble(msg){
    sayMsg = msg;
    sayTimer = Date.now() + 1500;
    render();
    setTimeout(()=>render(), 1600);
  }

  window.addEventListener('resize', ()=>{ resize(); render(); });

  const api = { setWorld, render, resize, sayBubble, animateEntity, setAnimDuration, stopAllAnims, getVisualPos };
  window.__renderer = api;
  return api;
}

global.makeRenderer = makeRenderer;
})(window);

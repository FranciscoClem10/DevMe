/* ============================================================
 * renderer.js — Dibuja el mundo del juego en el canvas
 * Soporta imágenes opcionales con fallback a CSS/Canvas
 * ============================================================ */
(function(global){
'use strict';

const COLORS = {
  bg1:'#e5d9a8', bg2:'#c9b976',
  wall:'#4a3818', wallTop:'#6b5423',
  target:'rgba(244,192,37,0.5)', targetBorder:'#f4c025',
  box:'#a56526', boxLight:'#c07f39',
  door:'#5b3a1a', doorOpen:'#a08065',
  switchOff:'#888', switchOn:'#22863a',
  player:'#e53e3e', playerDir:'#fff'
};

// Sistema de carga de imágenes con fallback
const IMAGES = {
  player: null,
  player_up: null,
  player_down: null,
  player_left: null,
  player_right: null,
  wall: null,
  target: null,
  box: null,
  box_delivered: null,
  door: null,
  door_open: null,
  switch_off: null,
  switch_on: null,
  carrying_box: null
};

let imagesLoaded = false;
let imagesChecked = false;

function loadImages() {
  if (imagesChecked) return;
  imagesChecked = true;

  const imgDir = 'imgs/';
  const imgFiles = {
    player: 'player.png',
    player_up: 'player_up.png',
    player_down: 'player_down.png',
    player_left: 'player_left.png',
    player_right: 'player_right.png',
    wall: 'wall.png',
    target: 'target.png',
    box: 'box.png',
    box_delivered: 'box_delivered.png',
    door: 'door.png',
    door_open: 'door_open.png',
    switch_off: 'switch_off.png',
    switch_on: 'switch_on.png',
    carrying_box: 'carrying_box.png'
  };

  let loadedCount = 0;
  const totalImages = Object.keys(imgFiles).length;

  const onLoad = (key) => {
    loadedCount++;
    if (loadedCount === totalImages) {
      imagesLoaded = true;
      console.log('✓ Todas las imágenes cargadas correctamente');
      // Forzar un redibujado del canvas una vez que todas las imágenes estén listas
      if (window.__renderer) {
        // Pequeño retraso para asegurar que el DOM esté actualizado
        setTimeout(() => window.__renderer.render(), 50);
      }
    }
  };

  for (const [key, filename] of Object.entries(imgFiles)) {
    const img = new Image();
    img.onload = () => {
      IMAGES[key] = img;
      onLoad(key);
    };
    img.onerror = () => {
      console.log(`⚠ Imagen no encontrada: ${filename} (usando fallback CSS)`);
      onLoad(key);
    };
    img.src = imgDir + filename;
  }
}

function makeRenderer(canvas){
  const ctx = canvas.getContext('2d');
  let world = null;
  let cell = 40;
  let sayMsg = null;
  let sayTimer = 0;

  // Cargar imágenes al inicio
  loadImages();

  function setWorld(w){
    world = w;
    resize();
    render();
  }

  function resize(){
    const parent = canvas.parentElement;
    if(!parent) return;
    const size = Math.min(parent.clientWidth, parent.clientHeight) - 20;
    const s = Math.max(280, Math.min(640, size));
    canvas.width = s; canvas.height = s;
    if(world){
      cell = Math.floor(Math.min(s/world.W, s/world.H));
    }
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
        ctx.fillText('★', px+cell/2, py+cell/2);
      }
    }

    // paredes
    for(const w of world.walls){
      const px = offX+w.x*cell, py = offY+w.y*cell;
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
      if(img){
        ctx.drawImage(img, px, py, cell, cell);
      } else {
        if(d.open){
          ctx.fillStyle = COLORS.doorOpen;
          ctx.fillRect(px+cell*0.1, py+cell*0.1, cell*0.15, cell*0.8);
          ctx.fillRect(px+cell*0.75, py+cell*0.1, cell*0.15, cell*0.8);
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

    // cajas en el suelo
    for(const b of world.boxes) drawBox(offX+b.x*cell, offY+b.y*cell, false);
    // cajas entregadas (sobre metas)
    for(const b of world.deliveredAt) drawBox(offX+b.x*cell, offY+b.y*cell, true);

    // jugador
    drawPlayer(offX + world.player.x*cell, offY + world.player.y*cell, world.player.dir, world.player.carrying);

    // burbuja de diálogo
    if(sayMsg && Date.now() < sayTimer){
      const p = world.player;
      const px = offX + p.x*cell + cell/2;
      const py = offY + p.y*cell - 8;
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
    // Determinar qué imagen usar según la dirección
    let playerImg = null;
    if(dir === 'arriba' && IMAGES.player_up) playerImg = IMAGES.player_up;
    else if(dir === 'abajo' && IMAGES.player_down) playerImg = IMAGES.player_down;
    else if(dir === 'izquierda' && IMAGES.player_left) playerImg = IMAGES.player_left;
    else if(dir === 'derecha' && IMAGES.player_right) playerImg = IMAGES.player_right;
    
    // Si no hay imagen específica de dirección, usar la genérica
    if(!playerImg && IMAGES.player) playerImg = IMAGES.player;
    
    if(playerImg){
      ctx.drawImage(playerImg, px, py, cell, cell);
      
      // Si lleva caja, dibujar imagen de carrying_box
      if(carrying && IMAGES.carrying_box){
        const bs = cell*0.5;
        ctx.drawImage(IMAGES.carrying_box, px + (cell-bs)/2, py - bs*0.3, bs, bs);
      } else if(carrying){
        // Fallback: dibujar caja pequeña encima
        const bs = cell*0.3;
        ctx.fillStyle = COLORS.box;
        ctx.fillRect(px + cell/2 - bs/2, py+cell*0.02, bs, bs*0.7);
        ctx.strokeStyle = '#5a3812';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + cell/2 - bs/2+0.5, py+cell*0.02+0.5, bs-1, bs*0.7-1);
      }
    } else {
      // Fallback completo: dibujar círculo rojo
      const cx = px + cell/2, cy = py + cell/2;
      const r = cell*0.34;

      // sombra
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(cx, cy+r*0.6, r*0.85, r*0.3, 0, 0, Math.PI*2);
      ctx.fill();

      // cuerpo — círculo rojo
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();

      // borde
      ctx.strokeStyle = '#b52e2e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.stroke();

      // flecha indicadora de dirección
      const angle = { arriba:-Math.PI/2, derecha:0, abajo:Math.PI/2, izquierda:Math.PI }[dir] || 0;
      const tipX = cx + Math.cos(angle) * r * 0.85;
      const tipY = cy + Math.sin(angle) * r * 0.85;
      const lx = cx + Math.cos(angle + 2.5) * r * 0.55;
      const ly = cy + Math.sin(angle + 2.5) * r * 0.55;
      const rx = cx + Math.cos(angle - 2.5) * r * 0.55;
      const ry = cy + Math.sin(angle - 2.5) * r * 0.55;
      ctx.fillStyle = COLORS.playerDir;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.closePath();
      ctx.fill();

      // si lleva caja, dibujarla encima
      if(carrying){
        const bs = cell*0.3;
        ctx.fillStyle = COLORS.box;
        ctx.fillRect(cx-bs/2, py+cell*0.02, bs, bs*0.7);
        ctx.strokeStyle = '#5a3812';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx-bs/2+0.5, py+cell*0.02+0.5, bs-1, bs*0.7-1);
      }
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
    // triángulo
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

  // Creamos la interfaz pública y la guardamos globalmente para poder redibujar desde loadImages
  const api = { setWorld, render, resize, sayBubble };
  window.__renderer = api;
  return api;
}

global.makeRenderer = makeRenderer;
})(window);
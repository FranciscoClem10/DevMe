// Educational messages shown between levels
const LEVEL_MESSAGES = {
    1: 'Los ENTEROS son números sin decimales.\nEjemplos: 25, -8, 0, 1000',
    2: 'Los FLOTANTES tienen punto decimal.\nEjemplos: 3.14, 0.001, -2.5',
    3: 'Las CADENAS son texto entre comillas.\nEjemplos: "Hola", "123", "abc"',
    4: 'Los BOOLEANOS solo pueden ser\nverdadero o falso.',
    5: '¡Todos los tipos mezclados!\nIdentifica cada dato rápidamente.',
    6: '¡Cuidado con los datos engañosos!\n"25" es cadena, no entero. 3.0 es flotante, no entero.'
};

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        this.gameState = 'MENU';
        this.input = new InputManager(this.canvas);

        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('dataAssault_highscore')) || 0;
        this.wave = 1;
        this.lives = 5;
        this.maxLives = 5;

        this.comboMultiplier = 1.0;
        this.comboTimer = 0;
        this.screenShakeIntensity = 0;

        this.escapeAlertTimer = 0;
        this.menuSelectionIndex = 0;

        // Power-up timers
        this.scannerTimer = 0;
        this.freezeTimer = 0;

        // Feedback system
        this.feedbackMessages = [];

        // Level transition
        this.levelTransitionTimer = 0;
        this.levelTransitionMessage = '';

        // Background grid
        this.gridOffset = 0;

        // Background data particles
        this.bgParticles = [];
        for (let i = 0; i < 30; i++) {
            this.bgParticles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                speed: 15 + Math.random() * 30,
                char: ['0', '1', '{}', '<>', 'int', 'str'][Math.floor(Math.random() * 6)],
                alpha: 0.05 + Math.random() * 0.08
            });
        }

        this.initEntitiesAndSystems();
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    initEntitiesAndSystems() {
        this.player = new Player(this);
        this.entities = {
            enemies: [],
            boss: new Boss(this),
            powerups: []
        };
        this.pools = {
            bullets: new ObjectPool(() => new Bullet(), 200)
        };
        this.systems = {
            waves: new WaveManager(this),
            particles: new ParticleSystem()
        };
        this.systems.waves.startWave(this.wave);
    }

    triggerScreenShake(intensity) {
        this.screenShakeIntensity = intensity;
    }

    addScore(pts) {
        this.score += Math.floor(pts * this.comboMultiplier);
        this.comboMultiplier = Math.min(4.0, this.comboMultiplier + 0.05);
        this.comboTimer = 3.0;
    }

    showFeedback(correct, dataType, shotType) {
        let msg;
        if (correct) {
            msg = { text: '✔ ' + TYPE_NAMES[dataType], color: TYPE_COLORS[dataType], timer: 0.6, y: 0 };
        } else {
            msg = { text: '✖ No es ' + WEAPON_CONFIG[shotType].name, color: '#ff3355', timer: 0.8, y: 0 };
        }
        this.feedbackMessages.push(msg);
    }

    levelComplete() {
        let msg = LEVEL_MESSAGES[this.wave] || LEVEL_MESSAGES[6];
        this.levelTransitionMessage = msg;
        this.levelTransitionTimer = 2.5;
        this.gameState = 'LEVEL_TRANSITION';
    }

    nextWave() {
        this.wave++;
        this.systems.waves.startWave(this.wave);
        this.triggerScreenShake(8);
    }

    gameOver() {
        this.gameState = 'GAMEOVER';
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('dataAssault_highscore', this.highScore);
        }
    }

    reset() {
        this.score = 0;
        this.wave = 1;
        this.lives = 5;
        this.comboMultiplier = 1.0;
        this.comboTimer = 0;
        this.escapeAlertTimer = 0;
        this.scannerTimer = 0;
        this.freezeTimer = 0;
        this.feedbackMessages = [];
        this.levelTransitionTimer = 0;
        this.gameState = 'PLAYING';
        this.initEntitiesAndSystems();
    }

    // === UPDATE ===
    update(dt) {
        // Menu input
        if (this.gameState === 'MENU') {
            if (this.input.isPressed('SPACE')) {
                this.input.keys['SPACE'] = false;
                this.reset();
            }
        }

        // Level transition
        if (this.gameState === 'LEVEL_TRANSITION') {
            this.levelTransitionTimer -= dt;
            if (this.levelTransitionTimer <= 0 || this.input.isPressed('SPACE')) {
                this.input.keys['SPACE'] = false;
                this.gameState = 'PLAYING';
                this.nextWave();
            }
            return;
        }

        // Pause
        if (this.input.isPressed('ESC')) {
            this.input.keys['ESC'] = false;
            if (this.gameState === 'PLAYING') this.gameState = 'PAUSE';
            else if (this.gameState === 'PAUSE') this.gameState = 'PLAYING';
        }

        if (this.input.isPressed('SPACE')) {
            if (this.gameState === 'GAMEOVER') {
                this.input.keys['SPACE'] = false;
                this.gameState = 'MENU';
            }
        }

        // Background animation (always)
        this.gridOffset += dt * 20;
        if (this.gridOffset > 40) this.gridOffset -= 40;
        for (let p of this.bgParticles) {
            p.y += p.speed * dt;
            if (p.y > this.height) { p.y = -10; p.x = Math.random() * this.width; }
        }

        if (this.gameState !== 'PLAYING') return;

        // Power-up timers
        if (this.scannerTimer > 0) {
            this.scannerTimer -= dt;
            for (let e of this.entities.enemies) {
                if (e.active) e.showType = true;
            }
            if (this.entities.boss.active) this.entities.boss.showType = true;
        } else {
            for (let e of this.entities.enemies) e.showType = false;
            if (this.entities.boss.active) this.entities.boss.showType = false;
        }
        if (this.freezeTimer > 0) this.freezeTimer -= dt;

        // Combo timer
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.comboMultiplier = 1.0;
        }

        // Screen shake decay
        if (this.screenShakeIntensity > 0) this.screenShakeIntensity *= 0.88;

        // Escape alert
        if (this.escapeAlertTimer > 0) this.escapeAlertTimer -= dt;

        // Feedback messages
        for (let msg of this.feedbackMessages) {
            msg.timer -= dt;
            msg.y -= 40 * dt;
        }
        this.feedbackMessages = this.feedbackMessages.filter(m => m.timer > 0);

        // Update entities
        this.player.update(dt);
        this.systems.waves.update(dt);
        this.systems.particles.update(dt);

        if (this.entities.boss.active) this.entities.boss.update(dt);

        // Update bullets
        let activeBullets = this.pools.bullets.pool.filter(b => b.active);
        for (let b of activeBullets) {
            b.update(dt);
            if (b.y < -30 || b.y > this.height + 30 || b.x < -30 || b.x > this.width + 30) {
                this.pools.bullets.release(b);
            }
        }

        // Update enemies - check if they escape
        for (let enemy of this.entities.enemies) {
            if (!enemy.active) continue;
            enemy.update(dt, this);
            if (enemy.y > this.height - 130) {
                enemy.active = false;
                this.comboMultiplier = 1.0;
                this.player.takeDamage(1);
                this.escapeAlertTimer = 1.5;
            }
        }

        // Update powerups
        for (let pu of this.entities.powerups) {
            if (!pu.active) continue;
            pu.update(dt);
            if (pu.y > this.height - 130) pu.active = false;
        }

        CollisionSystem.update(this);
    }

    // === RENDER ===
    render() {
        this.ctx.save();

        // Screen shake
        if (this.screenShakeIntensity > 1 && this.gameState === 'PLAYING') {
            let dx = (Math.random() - 0.5) * this.screenShakeIntensity;
            let dy = (Math.random() - 0.5) * this.screenShakeIntensity;
            this.ctx.translate(dx, dy);
        }

        // Background
        this.ctx.fillStyle = '#06060f';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Grid
        this.drawGrid();

        // Background data particles
        this.drawBgParticles();

        // Danger zone line
        this.drawDangerLine();

        // Game entities
        for (let pu of this.entities.powerups.filter(p => p.active)) pu.draw(this.ctx);
        this.systems.particles.draw(this.ctx);

        let activeBullets = this.pools.bullets.pool.filter(b => b.active);
        for (let b of activeBullets) b.draw(this.ctx);

        for (let enemy of this.entities.enemies.filter(e => e.active)) enemy.draw(this.ctx);
        if (this.entities.boss.active) this.entities.boss.draw(this.ctx);

        if (this.player.fsm.getCurrent() !== 'DEAD') this.player.draw(this.ctx);

        this.ctx.restore();

        // HUD (not affected by shake)
        this.drawHUD();
        this.drawFeedback();
        this.drawOverlays();
        this.drawCursor();
    }

    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#0e0e2a';
        ctx.lineWidth = 1;
        let spacing = 40;

        // Vertical lines
        for (let x = 0; x < this.width; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }

        // Horizontal lines (scrolling)
        for (let y = -spacing + (this.gridOffset % spacing); y < this.height; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
    }

    drawBgParticles() {
        const ctx = this.ctx;
        ctx.font = '10px "Courier New"';
        ctx.textAlign = 'center';
        for (let p of this.bgParticles) {
            ctx.fillStyle = '#4466aa';
            ctx.globalAlpha = p.alpha;
            ctx.fillText(p.char, p.x, p.y);
        }
        ctx.globalAlpha = 1.0;
    }

    drawDangerLine() {
        const ctx = this.ctx;
        let y = this.height - 130;
        ctx.strokeStyle = '#ff224488';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ff224466';
        ctx.font = '9px "Courier New"';
        ctx.textAlign = 'left';
        ctx.fillText('▼ ZONA DE PELIGRO ▼', 10, y - 5);
    }

    drawHUD() {
        const ctx = this.ctx;

        // Top bar background
        ctx.fillStyle = 'rgba(6, 6, 15, 0.85)';
        ctx.fillRect(0, 0, this.width, 55);
        ctx.strokeStyle = '#1a1a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 55);
        ctx.lineTo(this.width, 55);
        ctx.stroke();

        // Score
        ctx.fillStyle = '#00ffcc';
        ctx.font = 'bold 16px "Courier New"';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${String(this.score).padStart(6, '0')}`, 15, 25);

        // High score
        ctx.fillStyle = '#667799';
        ctx.font = '11px "Courier New"';
        ctx.fillText(`HI: ${String(this.highScore).padStart(6, '0')}`, 15, 44);

        // Level
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText(`NIVEL ${this.wave}`, this.width / 2, 25);

        // Combo
        if (this.comboMultiplier > 1.0) {
            ctx.fillStyle = '#ffff00';
            ctx.font = 'bold 12px "Courier New"';
            ctx.fillText(`COMBO x${this.comboMultiplier.toFixed(2)}`, this.width / 2, 44);
        }

        // Lives
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ff4466';
        ctx.font = 'bold 14px "Courier New"';
        let livesText = '';
        for (let i = 0; i < this.maxLives; i++) {
            livesText += i < this.lives ? '♥ ' : '♡ ';
        }
        ctx.fillText(livesText.trim(), this.width - 15, 25);

        // Active power-ups
        let puY = 44;
        ctx.font = '10px "Courier New"';
        ctx.fillStyle = '#88aacc';
        let puTexts = [];
        if (this.scannerTimer > 0) puTexts.push(`👁${Math.ceil(this.scannerTimer)}s`);
        if (this.freezeTimer > 0) puTexts.push(`❄${Math.ceil(this.freezeTimer)}s`);
        if (this.player.multiShotTimer > 0) puTexts.push(`⋮${Math.ceil(this.player.multiShotTimer)}s`);
        if (this.player.smartSwitchTimer > 0) puTexts.push(`⚡${Math.ceil(this.player.smartSwitchTimer)}s`);
        if (puTexts.length > 0) {
            ctx.fillText(puTexts.join(' '), this.width - 15, puY);
        }

        // Bottom weapon bar
        let barH = 50;
        let barY = this.height - barH;
        ctx.fillStyle = 'rgba(6, 6, 15, 0.9)';
        ctx.fillRect(0, barY, this.width, barH);
        ctx.strokeStyle = '#1a1a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, barY);
        ctx.lineTo(this.width, barY);
        ctx.stroke();

        // Weapon slots
        let slotW = this.width / 4;
        for (let i = 0; i < 4; i++) {
            let wType = WEAPONS[i];
            let wConfig = WEAPON_CONFIG[wType];
            let sx = i * slotW;
            let isSelected = i === this.player.selectedWeapon;

            if (isSelected) {
                ctx.fillStyle = wConfig.color + '22';
                ctx.fillRect(sx, barY, slotW, barH);
                ctx.strokeStyle = wConfig.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 1, barY + 1, slotW - 2, barH - 2);
            }

            ctx.textAlign = 'center';
            ctx.fillStyle = isSelected ? wConfig.color : '#445566';
            ctx.font = isSelected ? 'bold 13px "Courier New"' : '11px "Courier New"';
            ctx.fillText(`[${i + 1}] ${wConfig.icon} ${wConfig.name}`, sx + slotW / 2, barY + 22);

            if (isSelected) {
                ctx.fillStyle = wConfig.color;
                ctx.font = '9px "Courier New"';
                ctx.fillText('▸ ACTIVA ◂', sx + slotW / 2, barY + 38);
            }
        }

        // Boss health bar
        if (this.entities.boss.active && this.entities.boss.state === 'BATTLE') {
            let boss = this.entities.boss;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText('◆ DATO GIGANTE ◆', this.width / 2, 70);
            ctx.fillStyle = '#222';
            ctx.fillRect(this.width / 2 - 120, 78, 240, 10);
            ctx.fillStyle = TYPE_COLORS[boss.dataType];
            ctx.fillRect(this.width / 2 - 120, 78, (boss.hp / boss.maxHp) * 240, 10);
        }
    }

    drawFeedback() {
        const ctx = this.ctx;
        for (let msg of this.feedbackMessages) {
            let alpha = Math.min(1, msg.timer * 2);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = msg.color;
            ctx.font = 'bold 16px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(msg.text, this.width / 2, this.height / 2 + msg.y);
        }
        ctx.globalAlpha = 1.0;
    }

    drawOverlays() {
        const ctx = this.ctx;

        if (this.gameState === 'MENU') {
            this.drawMenuOverlay();
        } else if (this.gameState === 'PAUSE') {
            this.drawOverlay('PAUSA', 'Presiona [ESC] para continuar', '');
        } else if (this.gameState === 'GAMEOVER') {
            this.drawOverlay('GAME OVER', `Puntaje Final: ${this.score}`, 'Presiona [ESPACIO] para volver al menú');
        } else if (this.gameState === 'LEVEL_TRANSITION') {
            this.drawLevelTransition();
        }

        // Escape alert
        if (this.escapeAlertTimer > 0 && this.gameState === 'PLAYING') {
            ctx.fillStyle = `rgba(255, 34, 68, ${Math.min(0.85, this.escapeAlertTimer)})`;
            ctx.font = 'bold 13px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText('¡Un dato ha cruzado la línea!', this.width / 2, this.height - 150);
        }
    }

    drawMenuOverlay() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(6, 6, 15, 0.95)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.textAlign = 'center';

        // Title
        ctx.fillStyle = '#00ffcc';
        ctx.font = 'bold 36px "Courier New"';
        ctx.fillText('DATA ASSAULT', this.width / 2, this.height / 2 - 160);

        ctx.fillStyle = '#667799';
        ctx.font = '12px "Courier New"';
        ctx.fillText('Defiende el ciberespacio clasificando datos', this.width / 2, this.height / 2 - 120);

        // Weapon legend
        let legendY = this.height / 2 - 70;
        ctx.font = 'bold 14px "Courier New"';
        ctx.fillStyle = '#aabbcc';
        ctx.fillText('ARMAS DE CLASIFICACIÓN', this.width / 2, legendY);

        let weapons = [
            { key: '[1]', color: '#4488ff', name: 'Entero',   desc: 'Números sin decimales', icon: '■' },
            { key: '[2]', color: '#44ff88', name: 'Flotante', desc: 'Números con decimales', icon: '●' },
            { key: '[3]', color: '#ffdd44', name: 'Cadena',   desc: 'Texto entre comillas',  icon: '"' },
            { key: '[4]', color: '#aa44ff', name: 'Booleano', desc: 'verdadero o falso',     icon: '✓' }
        ];

        for (let i = 0; i < weapons.length; i++) {
            let w = weapons[i];
            let y = legendY + 30 + i * 28;
            ctx.fillStyle = w.color;
            ctx.font = 'bold 14px "Courier New"';
            ctx.fillText(`${w.key} ${w.icon} ${w.name}`, this.width / 2 - 60, y);
            ctx.fillStyle = '#667788';
            ctx.font = '11px "Courier New"';
            ctx.fillText(w.desc, this.width / 2 + 60, y);
        }

        // Instructions
        let instY = this.height / 2 + 80;
        ctx.fillStyle = '#88aacc';
        ctx.font = '12px "Courier New"';
        ctx.fillText('WASD / Flechas: Mover nave', this.width / 2, instY);
        ctx.fillText('Mouse: Apuntar y disparar (clic)', this.width / 2, instY + 20);
        ctx.fillText('1-4 / Scroll: Cambiar arma', this.width / 2, instY + 40);
        ctx.fillText('ESC: Pausa', this.width / 2, instY + 60);

        // Start prompt
        ctx.fillStyle = '#00ffcc';
        ctx.font = 'bold 18px "Courier New"';
        let blink = Math.sin(Date.now() / 300) > 0;
        if (blink) {
            ctx.fillText('Presiona [ESPACIO] para iniciar', this.width / 2, this.height / 2 + 200);
        }

        // High score
        if (this.highScore > 0) {
            ctx.fillStyle = '#667799';
            ctx.font = '12px "Courier New"';
            ctx.fillText(`HI-SCORE: ${this.highScore}`, this.width / 2, this.height / 2 + 230);
        }
    }

    drawLevelTransition() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(6, 6, 15, 0.92)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffcc';
        ctx.font = 'bold 28px "Courier New"';
        ctx.fillText(`NIVEL ${this.wave} COMPLETADO`, this.width / 2, this.height / 2 - 80);

        // Educational message
        ctx.fillStyle = '#ffffff';
        ctx.font = '15px "Courier New"';
        let lines = this.levelTransitionMessage.split('\n');
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], this.width / 2, this.height / 2 - 20 + i * 25);
        }

        // Continue prompt
        ctx.fillStyle = '#667799';
        ctx.font = '12px "Courier New"';
        let remaining = Math.ceil(this.levelTransitionTimer);
        ctx.fillText(`Continuando en ${remaining}s... (ESPACIO para saltar)`, this.width / 2, this.height / 2 + 80);
    }

    drawOverlay(title, subtitle, extra) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(6, 6, 15, 0.92)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffcc';
        ctx.font = 'bold 26px "Courier New"';
        ctx.fillText(title, this.width / 2, this.height / 2 - 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = '16px "Courier New"';
        ctx.fillText(subtitle, this.width / 2, this.height / 2 + 10);

        ctx.fillStyle = '#667799';
        ctx.font = '12px "Courier New"';
        ctx.fillText(extra, this.width / 2, this.height / 2 + 50);
    }

    drawCursor() {
        const ctx = this.ctx;
        let config = this.player.currentWeaponConfig;
        ctx.save();
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.input.mouse.x, this.input.mouse.y, 10, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = config.color;
        ctx.font = 'bold 10px "Courier New"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.icon, this.input.mouse.x, this.input.mouse.y);
        ctx.restore();
    }

    loop(timestamp) {
        let dt = (timestamp - this.lastTime) / 1000;
        if (dt > 0.1) dt = 0.1;
        this.lastTime = timestamp;

        this.update(dt);
        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }
}

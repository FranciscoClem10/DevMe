const WEAPONS = ['entero', 'flotante', 'cadena', 'booleano'];

const WEAPON_CONFIG = {
    entero:   { color: '#4488ff', name: 'Entero',   icon: '■', key: '1' },
    flotante: { color: '#44ff88', name: 'Flotante', icon: '●', key: '2' },
    cadena:   { color: '#ffdd44', name: 'Cadena',   icon: '"', key: '3' },
    booleano: { color: '#aa44ff', name: 'Booleano', icon: '✓', key: '4' }
};

class Player {
    constructor(game) {
        this.game = game;
        this.w = 44; this.h = 52;
        this.x = game.width / 2;
        this.y = game.height - 200;
        this.vx = 0; this.vy = 0;

        this.maxSpeed = 380;
        this.acceleration = 2400;
        this.friction = 0.85;

        this.selectedWeapon = 0; // index into WEAPONS
        this.fireCooldown = 0;
        this.fireRate = 0.2;
        this.invincibleTimer = 0;

        this.multiShotTimer = 0;
        this.smartSwitchTimer = 0;

        this.fsm = new StateMachine(this);
        this.initFSM();
    }

    get currentWeaponType() {
        return WEAPONS[this.selectedWeapon];
    }

    get currentWeaponConfig() {
        return WEAPON_CONFIG[this.currentWeaponType];
    }

    initFSM() {
        this.fsm.addState('IDLE', {
            enter: () => {},
            update: (p, dt) => p.handleActions(dt)
        });
        this.fsm.addState('HIT', {
            enter: (p) => { p.invincibleTimer = 1.0; },
            update: (p, dt) => {
                p.handleActions(dt);
                p.invincibleTimer -= dt;
                if (p.invincibleTimer <= 0) p.fsm.changeState('IDLE');
            }
        });
        this.fsm.addState('DEAD', {
            enter: (p) => {
                p.vx = 0; p.vy = 0;
                p.game.systems.particles.explode(p.x, p.y, '#00ffff', 60);
            },
            update: () => {}
        });
        this.fsm.changeState('IDLE');
    }

    collectPowerUp(powerUp, game) {
        switch (powerUp.type) {
            case 'SCANNER':
                game.scannerTimer = 10;
                break;
            case 'FREEZE':
                game.freezeTimer = 8;
                break;
            case 'MULTISHOT':
                this.multiShotTimer = 8;
                break;
            case 'SMARTSWITCH':
                this.smartSwitchTimer = 5;
                break;
        }
    }

    switchWeapon(index) {
        if (index >= 0 && index < WEAPONS.length) {
            this.selectedWeapon = index;
        }
    }

    switchWeaponCycle(delta) {
        this.selectedWeapon = (this.selectedWeapon + delta + WEAPONS.length) % WEAPONS.length;
    }

    takeDamage(amount) {
        if (this.fsm.getCurrent() === 'HIT' || this.fsm.getCurrent() === 'DEAD') return;
        this.game.triggerScreenShake(12);
        this.game.lives -= amount;
        if (this.game.lives <= 0) {
            this.game.lives = 0;
            this.fsm.changeState('DEAD');
            this.game.gameOver();
        } else {
            this.fsm.changeState('HIT');
        }
    }

    handleMovement(dt) {
        const input = this.game.input;

        let ax = 0, ay = 0;
        if (input.isPressed('W') || input.isPressed('ARROWUP'))    ay -= this.acceleration;
        if (input.isPressed('S') || input.isPressed('ARROWDOWN'))  ay += this.acceleration;
        if (input.isPressed('A') || input.isPressed('ARROWLEFT'))  ax -= this.acceleration;
        if (input.isPressed('D') || input.isPressed('ARROWRIGHT')) ax += this.acceleration;

        this.vx += ax * dt;
        this.vy += ay * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;

        let speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > this.maxSpeed) {
            this.vx = (this.vx / speed) * this.maxSpeed;
            this.vy = (this.vy / speed) * this.maxSpeed;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Constrain to play area
        if (this.x < 30) { this.x = 30; this.vx = 0; }
        if (this.x > this.game.width - 30) { this.x = this.game.width - 30; this.vx = 0; }
        if (this.y < 80) { this.y = 80; this.vy = 0; }
        if (this.y > this.game.height - 160) { this.y = this.game.height - 160; this.vy = 0; }
    }

    handleActions(dt) {
        this.handleMovement(dt);
        const input = this.game.input;

        // Weapon switching with number keys
        for (let i = 0; i < 4; i++) {
            if (input.consumeNumberKey(i + 1)) {
                this.switchWeapon(i);
            }
        }

	if (input.wheelDelta !== 0) {
		const delta = input.wheelDelta > 0 ? -1 : 1; // Scroll abajo → arma anterior, scroll arriba → siguiente
		this.switchWeaponCycle(delta);
		input.wheelDelta = 0;
	}

        // Smart switch: auto-select correct weapon for nearest enemy
        if (this.smartSwitchTimer > 0) {
            this.smartSwitchTimer -= dt;
            let nearest = this.findNearestEnemy();
            if (nearest) {
                let idx = WEAPONS.indexOf(nearest.dataType);
                if (idx >= 0) this.selectedWeapon = idx;
            }
        }

        // Multi-shot timer
        if (this.multiShotTimer > 0) this.multiShotTimer -= dt;

        // Firing
        if (this.fireCooldown > 0) this.fireCooldown -= dt;
        if (input.mouse.isPressed && this.fireCooldown <= 0) {
            this.fire();
        }
    }

    findNearestEnemy() {
        let enemies = this.game.entities.enemies.filter(e => e.active);
        let nearest = null;
        let minDist = Infinity;
        for (let e of enemies) {
            let dx = e.x - this.x;
            let dy = e.y - this.y;
            let dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                nearest = e;
            }
        }
        return nearest;
    }

    fire() {
        let weaponType = this.currentWeaponType;
        let config = this.currentWeaponConfig;

        let dx = this.game.input.mouse.x - this.x;
        let dy = this.game.input.mouse.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) { dx = 0; dy = -1; dist = 1; }

        let targetVx = (dx / dist) * 700;
        let targetVy = (dy / dist) * 700;

        if (this.multiShotTimer > 0) {
            // Triple shot
            let angleOffset = 0.12;
            let cos0 = Math.cos(0), sin0 = Math.sin(0);
            let cosP = Math.cos(angleOffset), sinP = Math.sin(angleOffset);
            let cosM = Math.cos(-angleOffset), sinM = Math.sin(-angleOffset);

            let b1 = this.game.pools.bullets.get();
            b1.spawn(this.x, this.y - 20, targetVx, targetVy, weaponType, config.color, 1);

            let b2 = this.game.pools.bullets.get();
            b2.spawn(this.x - 8, this.y - 15,
                targetVx * cosP - targetVy * sinP,
                targetVx * sinP + targetVy * cosP,
                weaponType, config.color, 1);

            let b3 = this.game.pools.bullets.get();
            b3.spawn(this.x + 8, this.y - 15,
                targetVx * cosM - targetVy * sinM,
                targetVx * sinM + targetVy * cosM,
                weaponType, config.color, 1);
        } else {
            let b = this.game.pools.bullets.get();
            b.spawn(this.x, this.y - 20, targetVx, targetVy, weaponType, config.color, 1);
        }

        this.fireCooldown = this.fireRate;
    }

    update(dt) {
        this.fsm.update(dt);
    }

    draw(ctx) {
        if (this.fsm.getCurrent() === 'HIT' && Math.floor(Date.now() / 60) % 2 === 0) return;

        let config = this.currentWeaponConfig;
        ctx.save();
        ctx.translate(this.x, this.y);

        // Banking effect
        let bank = Math.min(0.3, Math.max(-0.3, this.vx / 350));
        ctx.rotate(bank * 0.4);

        // Ship body - futuristic chevron
        ctx.shadowBlur = 12;
        ctx.shadowColor = config.color;

        // Main body
        ctx.fillStyle = '#1a1a3a';
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, -this.h / 2);           // nose
        ctx.lineTo(this.w / 2, this.h / 3);   // right wing
        ctx.lineTo(this.w / 4, this.h / 2);   // right tail
        ctx.lineTo(0, this.h / 3);            // center tail
        ctx.lineTo(-this.w / 4, this.h / 2);  // left tail
        ctx.lineTo(-this.w / 2, this.h / 3);  // left wing
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cockpit glow
        ctx.fillStyle = config.color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.ellipse(0, -5, 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Engine glow
        let engineFlicker = 0.6 + Math.random() * 0.4;
        ctx.fillStyle = config.color;
        ctx.globalAlpha = engineFlicker * 0.8;
        ctx.fillRect(-4, this.h / 3, 8, 6 + Math.random() * 8);
        ctx.globalAlpha = 1.0;

        // Weapon indicator on ship
        ctx.fillStyle = config.color;
        ctx.font = 'bold 10px "Courier New"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.icon, 0, 8);

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

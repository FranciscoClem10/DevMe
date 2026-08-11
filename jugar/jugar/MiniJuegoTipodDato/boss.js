const BOSS_DATA = [
    { value: '"Hola Mundo"', type: 'cadena' },
    { value: '123456789', type: 'entero' },
    { value: '3.1415926535', type: 'flotante' },
    { value: 'verdadero', type: 'booleano' },
    { value: '"42"', type: 'cadena' },
    { value: '-999999', type: 'entero' },
    { value: '0.000001', type: 'flotante' },
    { value: 'FALSO', type: 'booleano' },
    { value: '"true"', type: 'cadena' },
    { value: '2.718281828', type: 'flotante' }
];

class Boss {
    constructor(game) {
        this.game = game;
        this.x = game.width / 2;
        this.y = -120;
        this.w = 160; this.h = 80;
        this.active = false;
        this.hp = 100;
        this.maxHp = 100;
        this.phase = 1;
        this.attackTimer = 0;
        this.targetX = game.width / 2;
        this.state = 'ENTERING';
        this.value = '"Hola Mundo"';
        this.dataType = 'cadena';
        this.pulseTimer = 0;
        this.hitFlash = 0;
    }

    spawn() {
        this.x = this.game.width / 2;
        this.y = -120;

        let bossInfo = BOSS_DATA[Math.floor(Math.random() * BOSS_DATA.length)];
        this.value = bossInfo.value;
        this.dataType = bossInfo.type;

        this.hp = 15 + this.game.wave * 5;
        this.maxHp = this.hp;
        this.active = true;
        this.phase = 1;
        this.state = 'ENTERING';
        this.attackTimer = 0;
        this.pulseTimer = 0;
        this.hitFlash = 0;

        // Adjust width to text
        let textLen = this.value.length;
        this.w = Math.max(140, Math.min(220, textLen * 12 + 40));
        this.h = 80;
    }

    update(dt) {
        if (!this.active) return;
        this.pulseTimer += dt * 2;
        if (this.hitFlash > 0) this.hitFlash -= dt;

        switch (this.state) {
            case 'ENTERING':
                this.y += (130 - this.y) * dt * 2.0;
                if (Math.abs(this.y - 130) < 2) {
                    this.state = 'BATTLE';
                }
                break;

            case 'BATTLE':
                if (this.hp < this.maxHp * 0.4) this.phase = 2;

                if (Math.random() < 0.02) {
                    this.targetX = 100 + Math.random() * (this.game.width - 200);
                }
                this.x += (this.targetX - this.x) * dt * (this.phase === 2 ? 2.5 : 1.2);

                this.attackTimer += dt;
                let interval = this.phase === 2 ? 0.8 : 1.5;
                if (this.attackTimer >= interval) {
                    this.attackTimer = 0;
                    this.spawnDataEntities();
                }
                break;

            case 'DEAD':
                if (Math.random() < 0.3) {
                    this.game.systems.particles.digitalDisintegrate(
                        this.x + (Math.random() - 0.5) * this.w,
                        this.y + (Math.random() - 0.5) * this.h,
                        TYPE_COLORS[this.dataType], 5
                    );
                }
                this.y += 40 * dt;
                if (this.y > this.game.height + 100) {
                    this.active = false;
                    this.game.addScore(3000);
                    this.game.nextWave();
                }
                break;
        }
    }

    spawnDataEntities() {
        if (this.state !== 'BATTLE') return;
        let types = ['entero', 'flotante', 'cadena', 'booleano'];
        let count = this.phase === 2 ? 3 : 2;
        for (let i = 0; i < count; i++) {
            let type = types[Math.floor(Math.random() * types.length)];
            let pool = DATA_POOL[type];
            let val = pool[Math.floor(Math.random() * pool.length)];
            let x = this.x + (Math.random() - 0.5) * 120;
            let y = this.y + 40;

            let enemy = this.game.entities.enemies.find(e => !e.active);
            if (!enemy) {
                enemy = new DataEntity();
                this.game.entities.enemies.push(enemy);
            }
            enemy.spawn(x, y, type, 100 + Math.random() * 40);
        }
    }

    takeDamage(amount) {
        if (this.state !== 'BATTLE') return;
        this.hp -= amount;
        this.hitFlash = 0.15;
        this.game.triggerScreenShake(6);
        this.game.systems.particles.spawnSpark(this.x, this.y, TYPE_COLORS[this.dataType]);

        if (this.hp <= 0) {
            this.state = 'DEAD';
            this.game.systems.particles.digitalDisintegrate(this.x, this.y, TYPE_COLORS[this.dataType], 50);
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        let pulse = 1 + Math.sin(this.pulseTimer) * 0.02;
        ctx.scale(pulse, pulse);

        let borderColor = TYPE_COLORS[this.dataType];
        if (this.hitFlash > 0) borderColor = '#ffffff';

        // Background panel
        ctx.fillStyle = '#0a0a2a';
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = borderColor;

        ctx.beginPath();
        ctx.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 10);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Boss label
        ctx.fillStyle = borderColor;
        ctx.font = 'bold 10px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('◆ DATO GIGANTE ◆', 0, -this.h / 2 + 14);

        // Value text
        ctx.fillStyle = '#eeeeff';
        ctx.font = 'bold 18px "Courier New"';
        ctx.fillText(this.value, 0, 5);

        // Health bar
        let barW = this.w - 20;
        let barH = 6;
        let barY = this.h / 2 - 14;
        ctx.fillStyle = '#222';
        ctx.fillRect(-barW / 2, barY, barW, barH);
        ctx.fillStyle = borderColor;
        ctx.fillRect(-barW / 2, barY, (this.hp / this.maxHp) * barW, barH);

        ctx.restore();
    }
}

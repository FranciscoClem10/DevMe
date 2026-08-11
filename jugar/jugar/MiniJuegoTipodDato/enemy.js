// Data pools for each type
const DATA_POOL = {
    entero: [
        '25', '1000', '-8', '0', '-15', '42', '7', '-3', '999', '1',
        '-100', '8', '128', '-1', '512', '64', '-42', '256', '3', '10',
        '2048', '-99', '16', '32', '-7', '100', '3', '50', '-200', '88'
    ],
    flotante: [
        '3.14', '0.001', '2.718', '-0.5', '1.0', '3.0', '9.81', '-2.5',
        '0.333', '1.618', '-7.5', '0.1', '6.28', '-3.14', '2.0', '0.5',
        '4.5', '-1.5', '7.77', '0.99', '2.5', '-0.01', '8.8', '1.414'
    ],
    cadena: [
        '"Hola"', '"DevMe"', '"123"', '"abc"', '"true"', '"25"', '"3.14"',
        '"verdadero"', '"0"', '"false"', '"x"', '"tipo"', '"null"', '" "',
        '"Sky"', '"0.0"', '"-8"', '"42"', '"FALSO"', '"3.0"', '"hi"',
        '"789"', '"0.5"', '"-1"'
    ],
    booleano: [
        'verdadero', 'falso', 'VERDADERO', 'FALSO', 'true', 'false',
        'Verdadero', 'Falso', 'TRUE', 'FALSE'
    ]
};

// Tricky data for level 6+
const TRICKY_DATA = {
    entero: ['0', '-15', '3', '100', '-7', '42', '1', '-1'],
    flotante: ['3.0', '1.0', '0.0', '-2.0', '10.0', '-0.0', '5.0'],
    cadena: ['"25"', '"3.14"', '"verdadero"', '"0"', '"false"', '"-8"', '"FALSO"', '"3.0"', '"0.001"', '"100"'],
    booleano: ['VERDADERO', 'FALSO', 'verdadero', 'falso', 'TRUE', 'FALSE', 'True', 'False']
};

const TYPE_COLORS = {
    entero:   '#4488ff',
    flotante: '#44ff88',
    cadena:   '#ffdd44',
    booleano: '#aa44ff'
};

const TYPE_NAMES = {
    entero:   'Entero',
    flotante: 'Flotante',
    cadena:   'Cadena',
    booleano: 'Booleano'
};

class DataEntity {
    constructor() {
        this.x = 0; this.y = 0;
        this.vy = 80;
        this.width = 70; this.height = 36;
        this.value = '25';
        this.dataType = 'entero';
        this.hp = 2;
        this.maxHp = 2;
        this.scoreValue = 100;
        this.active = false;
        this.timeAlive = 0;
        this.pulseTimer = 0;
        this.hitFlash = 0;
        this.showType = false; // For scanner power-up
    }

    spawn(x, y, dataType, speed, isTricky = false) {
        this.x = x;
        this.y = y;
        this.dataType = dataType;
        this.active = true;
        this.timeAlive = 0;
        this.pulseTimer = Math.random() * Math.PI * 2;
        this.hitFlash = 0;
        this.showType = false;

        let pool = isTricky ? TRICKY_DATA[dataType] : DATA_POOL[dataType];
        this.value = pool[Math.floor(Math.random() * pool.length)];

        this.vy = speed;
        this.hp = 2 + Math.floor(Math.random() * 2); // 2 or 3
        this.maxHp = this.hp;

        // Width based on text length
        let textLen = this.value.length;
        this.width = Math.max(60, Math.min(110, textLen * 10 + 20));
        this.height = 36;

        this.scoreValue = dataType === 'booleano' ? 150 : 100;
    }

    update(dt, game) {
        this.timeAlive += dt;
        this.pulseTimer += dt * 3;

        let speedMult = 1;
        if (game.freezeTimer > 0) speedMult = 0.3;

        this.y += this.vy * speedMult * dt;

        // Slight horizontal drift
        this.x += Math.sin(this.timeAlive * 1.5) * 15 * dt;

        if (this.hitFlash > 0) this.hitFlash -= dt;
    }

    takeDamage(amount, game) {
        this.hp -= amount;
        this.hitFlash = 0.15;
        game.systems.particles.spawnSpark(this.x, this.y, TYPE_COLORS[this.dataType]);

        if (this.hp <= 0) {
            this.active = false;
            game.systems.particles.digitalDisintegrate(this.x, this.y, TYPE_COLORS[this.dataType], 20);
            game.addScore(this.scoreValue);
            game.showFeedback(true, this.dataType);
            game.systems.waves.checkDropPowerUp(this.x, this.y);
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        let pulse = 1 + Math.sin(this.pulseTimer) * 0.03;
        ctx.scale(pulse, pulse);

        let borderColor = '#334466';
        if (this.showType) {
            borderColor = TYPE_COLORS[this.dataType];
        }

        // Hit flash
        if (this.hitFlash > 0) {
            borderColor = '#ffffff';
        }

        // Background panel
        ctx.fillStyle = '#0d0d2a';
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.shadowBlur = this.showType ? 15 : 6;
        ctx.shadowColor = this.showType ? TYPE_COLORS[this.dataType] : '#223355';

        ctx.beginPath();
        ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 6);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Value text
        ctx.fillStyle = '#eeeeff';
        ctx.font = 'bold 14px "Courier New"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.value, 0, -2);

        // Type label (only when scanner active)
        if (this.showType) {
            ctx.fillStyle = TYPE_COLORS[this.dataType];
            ctx.font = '9px "Courier New"';
            ctx.fillText(TYPE_NAMES[this.dataType], 0, 13);
        }

        // Health bar
        if (this.hp < this.maxHp) {
            let barW = this.width - 10;
            let barH = 3;
            let barY = this.height / 2 - 6;
            ctx.fillStyle = '#222';
            ctx.fillRect(-barW / 2, barY, barW, barH);
            ctx.fillStyle = TYPE_COLORS[this.dataType];
            ctx.fillRect(-barW / 2, barY, (this.hp / this.maxHp) * barW, barH);
        }

        ctx.restore();
    }
}

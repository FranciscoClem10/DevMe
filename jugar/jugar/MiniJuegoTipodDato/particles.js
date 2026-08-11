class ParticleSystem {
    constructor() {
        this.particles = [];
        for (let i = 0; i < 400; i++) {
            this.particles.push({
                x: 0, y: 0, vx: 0, vy: 0,
                life: 0, maxLife: 0, color: '#fff',
                size: 2, active: false, text: null
            });
        }
    }

    getFree() {
        return this.particles.find(p => !p.active) || this.particles[0];
    }

    explode(x, y, color, count = 20) {
        const chars = ['0', '1', '{', '}', '<', '>', '/', '*', '#', '0x'];
        for (let i = 0; i < count; i++) {
            let p = this.getFree();
            p.active = true;
            p.x = x; p.y = y;
            let angle = Math.random() * Math.PI * 2;
            let speed = 50 + Math.random() * 200;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.maxLife = 0.3 + Math.random() * 0.5;
            p.life = p.maxLife;
            p.color = color;
            p.size = 2 + Math.random() * 3;
            p.text = Math.random() > 0.5 ? chars[Math.floor(Math.random() * chars.length)] : null;
        }
    }

    digitalDisintegrate(x, y, color, count = 25) {
        const chars = ['0', '1', 'NUL', 'NaN', '""', 'true', 'false', 'int', 'float', 'str', 'bool'];
        for (let i = 0; i < count; i++) {
            let p = this.getFree();
            p.active = true;
            p.x = x + (Math.random() - 0.5) * 30;
            p.y = y + (Math.random() - 0.5) * 20;
            let angle = Math.random() * Math.PI * 2;
            let speed = 30 + Math.random() * 150;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed - 40;
            p.maxLife = 0.4 + Math.random() * 0.6;
            p.life = p.maxLife;
            p.color = color;
            p.size = 10 + Math.random() * 4;
            p.text = chars[Math.floor(Math.random() * chars.length)];
        }
    }

    bounceEffect(x, y) {
        for (let i = 0; i < 6; i++) {
            let p = this.getFree();
            p.active = true;
            p.x = x; p.y = y;
            let angle = Math.random() * Math.PI * 2;
            let speed = 80 + Math.random() * 120;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.maxLife = 0.2 + Math.random() * 0.15;
            p.life = p.maxLife;
            p.color = '#ff3355';
            p.size = 3;
            p.text = '✖';
        }
    }

    spawnSpark(x, y, color) {
        let p = this.getFree();
        p.active = true;
        p.x = x; p.y = y;
        p.vx = (Math.random() - 0.5) * 100;
        p.vy = -130 - Math.random() * 100;
        p.maxLife = 0.2; p.life = p.maxLife;
        p.color = color; p.size = 2;
        p.text = null;
    }

    update(dt) {
        for (let p of this.particles) {
            if (!p.active) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) p.active = false;
        }
    }

    draw(ctx) {
        for (let p of this.particles) {
            if (!p.active) continue;
            let alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            if (p.text) {
                ctx.fillStyle = p.color;
                ctx.font = `bold ${p.size}px "Courier New"`;
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }
        ctx.globalAlpha = 1.0;
    }
}

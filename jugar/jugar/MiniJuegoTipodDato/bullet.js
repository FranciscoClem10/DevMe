class Bullet {
    constructor() {
        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.width = 8; this.height = 8;
        this.color = '#4488ff';
        this.active = false;
        this.shotType = 'entero'; // 'entero', 'flotante', 'cadena', 'booleano'
        this.damage = 1;
        this.angle = 0;
        this.isBouncing = false;
        this.bounceTimer = 0;
    }

    spawn(x, y, vx, vy, shotType, color, damage = 1) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.shotType = shotType;
        this.color = color;
        this.damage = damage;
        this.active = true;
        this.isBouncing = false;
        this.bounceTimer = 0;
        this.angle = Math.atan2(vy, vx) + Math.PI / 2;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.isBouncing) {
            this.bounceTimer -= dt;
            if (this.bounceTimer <= 0) this.active = false;
        }
    }

    bounce() {
        this.isBouncing = true;
        this.bounceTimer = 0.4;
        this.vy = -this.vy * 0.5;
        this.vx = (Math.random() - 0.5) * 200;
        this.color = '#ff3355';
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.isBouncing) {
            ctx.globalAlpha = this.bounceTimer / 0.4;
        }

        ctx.fillStyle = this.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;

        switch (this.shotType) {
            case 'entero':
                // Square projectile
                ctx.fillRect(-5, -5, 10, 10);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.strokeRect(-5, -5, 10, 10);
                break;
            case 'flotante':
                // Circle projectile
                ctx.beginPath();
                ctx.arc(0, 0, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
            case 'cadena':
                // Quote mark projectile
                ctx.font = 'bold 16px "Courier New"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('"', 0, 0);
                break;
            case 'booleano':
                // Checkmark projectile
                ctx.font = 'bold 14px "Courier New"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('✓', 0, 0);
                break;
        }

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }
}

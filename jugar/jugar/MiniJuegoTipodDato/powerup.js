class PowerUp {
    constructor() {
        this.x = 0; this.y = 0;
        this.vy = 80;
        this.w = 22; this.h = 22;
        this.type = 'SCANNER';
        this.active = false;
        this.color = '#00ffff';
        this.pulseTimer = 0;
    }

    spawn(x, y, type) {
        this.x = x; this.y = y;
        this.type = type;
        this.active = true;
        this.pulseTimer = 0;
        switch (type) {
            case 'SCANNER':   this.color = '#00ffff'; break;
            case 'FREEZE':    this.color = '#88ddff'; break;
            case 'MULTISHOT': this.color = '#ff8844'; break;
            case 'SMARTSWITCH': this.color = '#ff44ff'; break;
        }
    }

    update(dt) {
        this.y += this.vy * dt;
        this.pulseTimer += dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        let pulse = 1 + Math.sin(this.pulseTimer * 5) * 0.15;
        ctx.scale(pulse, pulse);

        // Outer glow
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;

        // Background
        ctx.fillStyle = '#0a0a2a';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 4);
        ctx.fill();
        ctx.stroke();

        // Icon
        ctx.fillStyle = this.color;
        ctx.font = 'bold 12px "Courier New"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let icon = '';
        switch (this.type) {
            case 'SCANNER':    icon = '👁'; break;
            case 'FREEZE':     icon = '❄'; break;
            case 'MULTISHOT':  icon = '⋮'; break;
            case 'SMARTSWITCH': icon = '⚡'; break;
        }
        ctx.fillText(icon, 0, 0);

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

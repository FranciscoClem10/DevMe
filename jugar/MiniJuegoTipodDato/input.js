class InputManager {
    constructor(canvas) {
        this.keys = {};
        this.mouse = { x: 0, y: 0, isPressed: false };
        this.wheelDelta = 0;
        this.numberKeys = {};

        window.addEventListener('keydown', e => this.setKey(e, true));
        window.addEventListener('keyup', e => this.setKey(e, false));

        // Eventos de mouse globales (capturan fuera del canvas)
        window.addEventListener('mousemove', e => {
            const rect = canvas.getBoundingClientRect();
            // Escala para convertir coordenadas CSS a coordenadas lógicas del canvas
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            this.mouse.x = (e.clientX - rect.left) * scaleX;
            this.mouse.y = (e.clientY - rect.top) * scaleY;
        });

        window.addEventListener('mousedown', () => {
            this.mouse.isPressed = true;
        });
        window.addEventListener('mouseup', () => {
            this.mouse.isPressed = false;
        });

        window.addEventListener('wheel', e => {
            this.wheelDelta = e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }

    setKey(e, isPressed) {
        let key = e.key.toUpperCase();
        if (e.key === ' ') key = 'SPACE';
        if (e.key === 'Escape') key = 'ESC';
        if (e.key === 'Shift') key = 'SHIFT';
        this.keys[key] = isPressed;

        if (['1', '2', '3', '4'].includes(e.key)) {
            if (isPressed) this.numberKeys[e.key] = true;
        }

        if (['SPACE', 'ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT'].includes(key)) {
            e.preventDefault();
        }
    }

    isPressed(key) {
        return !!this.keys[key.toUpperCase()];
    }

    consumeNumberKey(n) {
        if (this.numberKeys[String(n)]) {
            this.numberKeys[String(n)] = false;
            return true;
        }
        return false;
    }
}
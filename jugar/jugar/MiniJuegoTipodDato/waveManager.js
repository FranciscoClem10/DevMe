class WaveManager {
    constructor(game) {
        this.game = game;
        this.spawnTimer = 0;
        this.dataToSpawn = 0;
        this.bossSpawned = false;
        this.usedIndices = { entero: [], flotante: [], cadena: [], booleano: [] };
    }

    getLevelConfig(level) {
        switch (level) {
            case 1:  return { types: ['entero'],                          count: 8,  speed: 55,  spawnRate: 2.2 };
            case 2:  return { types: ['entero', 'flotante'],              count: 10, speed: 60,  spawnRate: 2.0 };
            case 3:  return { types: ['entero', 'flotante', 'cadena'],    count: 12, speed: 65,  spawnRate: 1.8 };
            case 4:  return { types: ['entero', 'flotante', 'cadena', 'booleano'], count: 14, speed: 70, spawnRate: 1.6 };
            case 5:  return { types: ['entero', 'flotante', 'cadena', 'booleano'], count: 16, speed: 80, spawnRate: 1.4 };
            default: return { types: ['entero', 'flotante', 'cadena', 'booleano'], count: 14 + level * 2, speed: Math.min(130, 75 + level * 5), spawnRate: Math.max(0.6, 1.4 - level * 0.06) };
        }
    }

    startWave(waveNumber) {
        let config = this.getLevelConfig(waveNumber);
        this.dataToSpawn = config.count;
        this.spawnTimer = 0;
        this.bossSpawned = false;
        this.currentConfig = config;
        this.usedIndices = { entero: [], flotante: [], cadena: [], booleano: [] };
    }

    update(dt) {
        // Boss levels: every 5 levels
        if (this.game.wave % 5 === 0) {
            let activeEnemies = this.game.entities.enemies.filter(e => e.active).length;
            if (!this.bossSpawned && activeEnemies === 0) {
                this.game.entities.boss.spawn();
                this.bossSpawned = true;
            }
            return;
        }

        if (this.dataToSpawn > 0) {
            this.spawnTimer += dt;
            let rate = this.currentConfig.spawnRate;
            if (this.spawnTimer >= rate) {
                this.spawnTimer = 0;
                this.spawnRandomData();
                this.dataToSpawn--;
            }
        } else {
            let activeEnemies = this.game.entities.enemies.filter(e => e.active).length;
            if (activeEnemies === 0 && !this.game.entities.boss.active) {
                this.game.levelComplete();
            }
        }
    }

    pickValue(type) {
        let pool = this.game.wave >= 6 ? TRICKY_DATA[type] : DATA_POOL[type];
        let used = this.usedIndices[type];

        // Try to pick an unused value
        let available = [];
        for (let i = 0; i < pool.length; i++) {
            if (!used.includes(i)) available.push(i);
        }

        if (available.length === 0) {
            // Reset if all used
            this.usedIndices[type] = [];
            available = pool.map((_, i) => i);
        }

        let idx = available[Math.floor(Math.random() * available.length)];
        this.usedIndices[type].push(idx);
        return pool[idx];
    }

    spawnRandomData() {
        let x = 60 + Math.random() * (this.game.width - 120);
        let y = -40;

        let types = this.currentConfig.types;
        let type = types[Math.floor(Math.random() * types.length)];

        let enemy = this.game.entities.enemies.find(e => !e.active);
        if (!enemy) {
            enemy = new DataEntity();
            this.game.entities.enemies.push(enemy);
        }

        let isTricky = this.game.wave >= 6;
        enemy.spawn(x, y, type, this.currentConfig.speed, isTricky);

        // Override value with our picker to avoid repeats
        enemy.value = this.pickValue(type);
        let textLen = enemy.value.length;
        enemy.width = Math.max(60, Math.min(110, textLen * 10 + 20));
    }

    checkDropPowerUp(x, y) {
        let dropChance = 0.18;
        if (Math.random() < dropChance) {
            const types = ['SCANNER', 'FREEZE', 'MULTISHOT', 'SMARTSWITCH'];
            const weights = [0.3, 0.25, 0.25, 0.2];
            let r = Math.random();
            let acum = 0;
            let chosen = 'SCANNER';
            for (let i = 0; i < weights.length; i++) {
                acum += weights[i];
                if (r < acum) { chosen = types[i]; break; }
            }

            let p = this.game.entities.powerups.find(pu => !pu.active);
            if (!p) {
                p = new PowerUp();
                this.game.entities.powerups.push(p);
            }
            p.spawn(x, y, chosen);
        }
    }
}

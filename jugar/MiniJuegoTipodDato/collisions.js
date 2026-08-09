class CollisionSystem {
    static checkAABB(rect1, rect2) {
        return rect1.x - rect1.w / 2 < rect2.x + rect2.w / 2 &&
               rect1.x + rect1.w / 2 > rect2.x - rect2.w / 2 &&
               rect1.y - rect1.h / 2 < rect2.y + rect2.h / 2 &&
               rect1.y + rect1.h / 2 > rect2.y - rect2.h / 2;
    }

    static update(game) {
        const player = game.player;
        const bullets = game.pools.bullets.pool.filter(b => b.active && !b.isBouncing);
        const enemies = game.entities.enemies.filter(e => e.active);
        const boss = game.entities.boss;
        const powerups = game.entities.powerups.filter(p => p.active);

        let playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };

        // Bullet vs DataEntity collisions
        for (let b of bullets) {
            if (!b.active || b.isBouncing) continue;
            let bulletBox = { x: b.x, y: b.y, w: 12, h: 12 };

            // Check against enemies
            for (let e of enemies) {
                if (!e.active) continue;
                let enemyBox = { x: e.x, y: e.y, w: e.width, h: e.height };
                if (this.checkAABB(bulletBox, enemyBox)) {
                    if (b.shotType === e.dataType) {
                        // Correct type: deal damage
                        e.takeDamage(b.damage, game);
                        game.pools.bullets.release(b);
                    } else {
                        // Wrong type: bounce
                        game.systems.particles.bounceEffect(b.x, b.y);
                        game.showFeedback(false, e.dataType, b.shotType);
                        b.bounce();
                    }
                    break;
                }
            }

            // Check against boss
            if (b.active && !b.isBouncing && boss.active && boss.state === 'BATTLE') {
                let bossBox = { x: boss.x, y: boss.y, w: boss.w, h: boss.h };
                if (this.checkAABB(bulletBox, bossBox)) {
                    if (b.shotType === boss.dataType) {
                        boss.takeDamage(b.damage);
                        game.pools.bullets.release(b);
                    } else {
                        game.systems.particles.bounceEffect(b.x, b.y);
                        game.showFeedback(false, boss.dataType, b.shotType);
                        b.bounce();
                    }
                }
            }
        }

        // Player vs PowerUp collisions
        for (let p of powerups) {
            let puBox = { x: p.x, y: p.y, w: p.w, h: p.h };
            if (this.checkAABB(playerBox, puBox)) {
                p.active = false;
                game.systems.particles.explode(p.x, p.y, p.color, 15);
                game.player.collectPowerUp(p, game);
                game.addScore(50);
            }
        }
    }
}

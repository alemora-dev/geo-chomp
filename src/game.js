// game.js — Estado del juego: puntuación, vidas, pellets, colisiones

export class GameState {
    constructor(mapData) {
        // Deep copy de los pellets para que el estado sea mutable sin afectar los datos originales
        this.pelletsData = JSON.parse(JSON.stringify(mapData.smallPellets));
        this.powerPelletsData = JSON.parse(JSON.stringify(mapData.powerPellets));
        this.totalPellets = this.pelletsData.features.length;

        this.score = 0;
        this.lives = 3;
        this.pelletsEaten = 0;
        this.powerPelletsEaten = 0;
        this.phase = 'idle';   // 'idle' | 'playing' | 'paused' | 'dead' | 'won'
        this.playerTrail = []; // Array de [lng, lat] para la imagen final
        this.ghostsEaten = 0;
        this.startTime = null;
        this.elapsedTime = 0;
    }

    start() {
        this.phase = 'playing';
        this.startTime = Date.now();
    }

    pause() {
        if (this.phase !== 'playing') return;
        this.phase = 'paused';
        this.elapsedTime += Date.now() - this.startTime;
    }

    resume() {
        if (this.phase !== 'paused') return;
        this.phase = 'playing';
        this.startTime = Date.now();
    }

    // Verificar colisión del jugador con pellets. Retorna array de pellets comidos.
    checkPelletCollision(playerPos, radiusMeters = 8) {
        const playerPoint = turf.point([playerPos.lng, playerPos.lat]);
        const eaten = [];

        this.pelletsData.features.forEach((pellet, i) => {
            if (pellet.properties.eaten) return;
            const dist = turf.distance(playerPoint, pellet, { units: 'meters' });
            if (dist <= radiusMeters) {
                pellet.properties.eaten = true;
                this.score += 10;
                this.pelletsEaten++;
                eaten.push({ type: 'small', index: i });
            }
        });

        this.powerPelletsData.features.forEach((pellet, i) => {
            if (pellet.properties.eaten) return;
            const dist = turf.distance(playerPoint, pellet, { units: 'meters' });
            if (dist <= radiusMeters * 2) {   // Radio doble para power pellets
                pellet.properties.eaten = true;
                this.score += 50;
                this.powerPelletsEaten++;
                eaten.push({ type: 'power', index: i });
            }
        });

        return eaten;
    }

    // Verificar colisión con fantasmas. Retorna evento o null.
    checkGhostCollision(playerPos, ghosts, radiusMeters = 12) {
        const playerPoint = turf.point([playerPos.lng, playerPos.lat]);

        for (const ghost of ghosts) {
            if (ghost.state === 'dead') continue;
            const ghostPoint = turf.point([ghost.position.lng, ghost.position.lat]);
            const dist = turf.distance(playerPoint, ghostPoint, { units: 'meters' });

            if (dist <= radiusMeters) {
                if (ghost.state === 'frightened') {
                    ghost.state = 'dead';
                    this.score += 200;
                    this.ghostsEaten++;
                    return { type: 'eat_ghost', ghost };
                } else if (ghost.state === 'chase' || ghost.state === 'scatter') {
                    this.lives--;
                    return { type: 'player_died' };
                }
            }
        }
        return null;
    }

    addTrailPoint(playerPos) {
        this.playerTrail.push([playerPos.lng, playerPos.lat]);
    }

    // Victoria: 90% de pellets comidos
    isWon() {
        return this.pelletsEaten >= Math.floor(this.totalPellets * 0.9);
    }

    // Porcentaje de completitud para el HUD
    completionPercent() {
        if (this.totalPellets === 0) return 0;
        return Math.floor((this.pelletsEaten / this.totalPellets) * 100);
    }

    pelletsRemaining() {
        return this.totalPellets - this.pelletsEaten;
    }
}

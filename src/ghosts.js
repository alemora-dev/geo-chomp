// ghosts.js — IA de fantasmas que navegan sobre el grafo de calles reales

export class Ghost {
    constructor(id, color, graph, startPosition) {
        this.id = id;              // 'blinky' | 'pinky'
        this.color = color;        // color CSS base
        this.graph = graph;
        this.position = { ...startPosition };  // { lat, lng }
        this.currentNode = graph.nearestNode(startPosition.lat, startPosition.lng);
        this.targetNode = null;
        this.path = [];
        this.state = 'scatter';  // 'chase' | 'scatter' | 'frightened' | 'dead'
        this.moveInterval = null;
        this._frightenedTimeout = null;
        this._phaseTimeout = null;
        this.stepIndex = 0;
    }

    // Inicia el movimiento periódico del fantasma
    startMoving(playerPositionGetter, intervalMs = 2200) {
        // Fase inicial scatter (8 segundos), luego chase
        this._phaseTimeout = setTimeout(() => {
            if (this.state === 'scatter') this.state = 'chase';
        }, 8000);

        this.moveInterval = setInterval(() => {
            const playerPos = playerPositionGetter();
            if (this.state === 'dead') return;
            this._recalculatePath(playerPos);
            this._step();
        }, intervalMs);
    }

    _recalculatePath(playerPos) {
        if (!playerPos) return;
        const playerNode = this.graph.nearestNode(playerPos.lat, playerPos.lng);
        if (!playerNode) return;

        if (this.state === 'frightened') {
            // Huir: ir a un nodo aleatorio lejos del jugador
            const allNodes = this.graph.getAllNodes();
            const farNodes = allNodes.filter(n => {
                const d = turf.distance(
                    turf.point([n.lng, n.lat]),
                    turf.point([playerPos.lng, playerPos.lat]),
                    { units: 'meters' }
                );
                return d > 80;
            });
            const target = farNodes.length > 0
                ? farNodes[Math.floor(Math.random() * farNodes.length)]
                : this.graph.randomNode();
            this.path = this.graph.aStar(this.currentNode, target);

        } else if (this.state === 'scatter') {
            // Scatter: deambular por el mapa (nodo aleatorio)
            if (this.path.length === 0) {
                const target = this.graph.randomNode();
                this.path = this.graph.aStar(this.currentNode, target);
            }

        } else if (this.state === 'chase') {
            if (this.id === 'blinky') {
                // Blinky: persecución directa sobre A*
                this.path = this.graph.aStar(this.currentNode, playerNode);

            } else if (this.id === 'pinky') {
                // Pinky: interceptación — apunta a ~60m adelante del jugador
                // Simplificación: elige nodo cercano al jugador (radio 40-100m)
                const allNodes = this.graph.getAllNodes();
                const nearbyNodes = allNodes.filter(n => {
                    const d = turf.distance(
                        turf.point([n.lng, n.lat]),
                        turf.point([playerPos.lng, playerPos.lat]),
                        { units: 'meters' }
                    );
                    return d >= 30 && d <= 110;
                });
                if (nearbyNodes.length > 0) {
                    const target = nearbyNodes[Math.floor(Math.random() * nearbyNodes.length)];
                    this.path = this.graph.aStar(this.currentNode, target);
                } else {
                    this.path = this.graph.aStar(this.currentNode, playerNode);
                }
            }
        }
    }

    // Avanzar un paso en el camino actual
    _step() {
        if (!this.path || this.path.length === 0) return;
        const nextNode = this.path.shift();
        if (!nextNode) return;
        this.currentNode = nextNode;
        this.position = { lat: nextNode.lat, lng: nextNode.lng };
    }

    setFrightened(durationMs = 8000) {
        if (this.state === 'dead') return;
        const prevState = this.state;
        this.state = 'frightened';
        clearTimeout(this._frightenedTimeout);
        this._frightenedTimeout = setTimeout(() => {
            if (this.state === 'frightened') this.state = prevState === 'scatter' ? 'scatter' : 'chase';
        }, durationMs);
    }

    respawn(startPosition) {
        this.state = 'chase';
        this.position = { ...startPosition };
        this.currentNode = this.graph.nearestNode(startPosition.lat, startPosition.lng);
        this.path = [];
    }

    stop() {
        clearInterval(this.moveInterval);
        clearTimeout(this._frightenedTimeout);
        clearTimeout(this._phaseTimeout);
        this.moveInterval = null;
    }
}

// graph.js — Grafo de calles desde GeoJSON + A* pathfinding para los fantasmas

export class StreetGraph {
    constructor(streetsGeoJSON) {
        this.nodes = new Map();   // "lat,lng" -> { id, lat, lng, neighbors: [] }
        this.edges = [];
        if (streetsGeoJSON && streetsGeoJSON.features) {
            this._buildFromGeoJSON(streetsGeoJSON);
        }
    }

    _buildFromGeoJSON(geojson) {
        geojson.features.forEach(feature => {
            if (feature.geometry.type !== 'LineString') return;
            const coords = feature.geometry.coordinates;

            for (let i = 0; i < coords.length - 1; i++) {
                const a = this._getOrCreateNode(coords[i]);
                const b = this._getOrCreateNode(coords[i + 1]);
                const dist = turf.distance(
                    turf.point(coords[i]),
                    turf.point(coords[i + 1]),
                    { units: 'meters' }
                );
                // Evitar duplicados en neighbors
                if (!a.neighbors.find(n => n.node.id === b.id)) {
                    a.neighbors.push({ node: b, dist });
                }
                if (!b.neighbors.find(n => n.node.id === a.id)) {
                    b.neighbors.push({ node: a, dist });
                }
                this.edges.push({ a, b, dist });
            }
        });
        console.log(`[Graph] ${this.nodes.size} nodos, ${this.edges.length} aristas`);
    }

    _getOrCreateNode(coord) {
        // Redondear a 6 decimales para deduplicar nodos cercanos (~10cm de precisión)
        const key = `${coord[1].toFixed(6)},${coord[0].toFixed(6)}`;
        if (!this.nodes.has(key)) {
            this.nodes.set(key, {
                id: key,
                lat: parseFloat(coord[1].toFixed(6)),
                lng: parseFloat(coord[0].toFixed(6)),
                neighbors: []
            });
        }
        return this.nodes.get(key);
    }

    // Nodo más cercano a una coordenada dada
    nearestNode(lat, lng) {
        let minDist = Infinity;
        let nearest = null;
        const point = turf.point([lng, lat]);

        this.nodes.forEach(node => {
            const d = turf.distance(point, turf.point([node.lng, node.lat]), { units: 'meters' });
            if (d < minDist) {
                minDist = d;
                nearest = node;
            }
        });
        return nearest;
    }

    // Nodo aleatorio del grafo
    randomNode() {
        const keys = [...this.nodes.keys()];
        return this.nodes.get(keys[Math.floor(Math.random() * keys.length)]);
    }

    // A* pathfinding entre dos nodos
    aStar(startNode, goalNode) {
        if (!startNode || !goalNode) return [];
        if (startNode.id === goalNode.id) return [];

        const open = new Set([startNode.id]);
        const cameFrom = new Map();
        const gScore = new Map([[startNode.id, 0]]);

        const h = (node) => turf.distance(
            turf.point([node.lng, node.lat]),
            turf.point([goalNode.lng, goalNode.lat]),
            { units: 'meters' }
        );

        const fScore = new Map([[startNode.id, h(startNode)]]);

        let iterations = 0;
        const maxIterations = 500; // Protección anti-bucle infinito en grafos grandes

        while (open.size > 0 && iterations < maxIterations) {
            iterations++;

            // Nodo con menor fScore
            let currentId = null;
            let bestF = Infinity;
            open.forEach(id => {
                const f = fScore.get(id) ?? Infinity;
                if (f < bestF) { bestF = f; currentId = id; }
            });

            if (currentId === goalNode.id) {
                // Reconstruir camino
                const path = [];
                let curr = currentId;
                while (cameFrom.has(curr)) {
                    path.unshift(this.nodes.get(curr));
                    curr = cameFrom.get(curr);
                }
                return path;
            }

            open.delete(currentId);
            const currentNode = this.nodes.get(currentId);
            if (!currentNode) continue;

            for (const { node: neighbor, dist } of currentNode.neighbors) {
                const tentativeG = (gScore.get(currentId) ?? 0) + dist;
                if (tentativeG < (gScore.get(neighbor.id) ?? Infinity)) {
                    cameFrom.set(neighbor.id, currentId);
                    gScore.set(neighbor.id, tentativeG);
                    fScore.set(neighbor.id, tentativeG + h(neighbor));
                    open.add(neighbor.id);
                }
            }
        }
        return [];  // Sin camino encontrado
    }

    // Para debug: obtener todos los nodos como array
    getAllNodes() {
        return [...this.nodes.values()];
    }
}

// map.js — MapLibre GL JS: inicialización, estilo oscuro arcade, capas dinámicas del juego

export function initMap(containerId) {
    const map = new maplibregl.Map({
        container: containerId,
        style: buildDarkStyle(),
        zoom: 17,
        center: [-3.7037, 40.4226],  // Malasaña, Madrid (fallback antes del GPS)
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        maxZoom: 19,
        minZoom: 14,
    });
    return map;
}

// ── Estilo oscuro arcade ─────────────────────────────────────────────────────────
function buildDarkStyle() {
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            osm: {
                type: 'vector',
                url: 'https://tiles.openfreemap.org/planet',
            }
        },
        layers: [
            // Fondo absolutamente negro
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#000000' }
            },
            // Agua — azul muy oscuro
            {
                id: 'water',
                type: 'fill',
                source: 'osm', 'source-layer': 'water',
                paint: { 'fill-color': '#050d18', 'fill-opacity': 0.95 }
            },
            // Parques / áreas verdes — muy oscuras
            {
                id: 'landuse-park',
                type: 'fill',
                source: 'osm', 'source-layer': 'landuse',
                filter: ['in', 'class', 'park', 'grass', 'pitch', 'garden'],
                paint: { 'fill-color': '#060d08', 'fill-opacity': 0.9 }
            },
            // Edificios — gris muy oscuro, casi invisible
            {
                id: 'buildings',
                type: 'fill',
                source: 'osm', 'source-layer': 'building',
                paint: { 'fill-color': '#0d0d0d', 'fill-opacity': 0.95 }
            },
            // Bordes de edificios — línea sutil
            {
                id: 'buildings-outline',
                type: 'line',
                source: 'osm', 'source-layer': 'building',
                paint: { 'line-color': '#1a1a1a', 'line-width': 0.5 }
            },
            // Calles NO jugables (autopistas, vías rápidas) — apagadas
            {
                id: 'streets-dim',
                type: 'line',
                source: 'osm', 'source-layer': 'transportation',
                filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
                paint: { 'line-color': '#222222', 'line-width': 3, 'line-cap': 'round' }
            },
            // Glow exterior de calles jugables (blur ancho para el halo)
            {
                id: 'streets-glow',
                type: 'line',
                source: 'osm', 'source-layer': 'transportation',
                filter: ['in', 'class', 'secondary', 'tertiary', 'residential', 'living_street', 'service', 'path', 'footway', 'pedestrian'],
                paint: {
                    'line-color': '#FFD700',
                    'line-width': 8,
                    'line-blur': 10,
                    'line-opacity': 0.2
                }
            },
            // Calles JUGABLES — neón amarillo, línea más fina y nítida encima del glow
            {
                id: 'streets-playable',
                type: 'line',
                source: 'osm', 'source-layer': 'transportation',
                filter: ['in', 'class', 'secondary', 'tertiary', 'residential', 'living_street', 'service', 'path', 'footway', 'pedestrian'],
                paint: {
                    'line-color': '#FFD700',
                    'line-width': 1.5,
                    'line-opacity': 0.5,
                    'line-cap': 'round',
                    'line-join': 'round',
                }
            },
        ]
    };
}

// ── Capas dinámicas del juego ────────────────────────────────────────────────────

export function addGameLayers(map, mapData, game) {
    // Fuentes
    map.addSource('small-pellets-source', {
        type: 'geojson',
        data: filterUneaten(game.pelletsData)
    });
    map.addSource('power-pellets-source', {
        type: 'geojson',
        data: filterUneaten(game.powerPelletsData)
    });
    map.addSource('player-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    map.addSource('ghost-blinky-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    map.addSource('ghost-pinky-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    map.addSource('trail-source', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} }
    });

    // Pellets pequeños
    map.addLayer({
        id: 'pellets-small',
        type: 'circle',
        source: 'small-pellets-source',
        paint: {
            'circle-radius': 3,
            'circle-color': '#FFFFFF',
            'circle-opacity': 0.85,
        }
    });

    // Power Pellets (más grandes, dorados con glow)
    map.addLayer({
        id: 'pellets-power',
        type: 'circle',
        source: 'power-pellets-source',
        paint: {
            'circle-radius': 7,
            'circle-color': '#FFD700',
            'circle-blur': 0.5,
            'circle-opacity': 1,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
        }
    });

    // Trail del jugador
    map.addLayer({
        id: 'trail',
        type: 'line',
        source: 'trail-source',
        paint: {
            'line-color': '#FFD700',
            'line-width': 2,
            'line-opacity': 0.4,
            'line-blur': 2,
        }
    });

    // Blinky (rojo)
    map.addLayer({
        id: 'ghost-blinky',
        type: 'circle',
        source: 'ghost-blinky-source',
        paint: {
            'circle-radius': 9,
            'circle-color': '#FF3333',
            'circle-blur': 0.4,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FF9999',
            'circle-opacity': 0.95,
        }
    });

    // Pinky (rosa)
    map.addLayer({
        id: 'ghost-pinky',
        type: 'circle',
        source: 'ghost-pinky-source',
        paint: {
            'circle-radius': 9,
            'circle-color': '#FF88CC',
            'circle-blur': 0.4,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFBBEE',
            'circle-opacity': 0.95,
        }
    });

    // Jugador (encima de todo)
    map.addLayer({
        id: 'player',
        type: 'circle',
        source: 'player-source',
        paint: {
            'circle-radius': 11,
            'circle-color': '#FFD700',
            'circle-blur': 0.3,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#FFFFFF',
            'circle-opacity': 1,
        }
    });
}

function filterUneaten(featureCollection) {
    return {
        type: 'FeatureCollection',
        features: featureCollection.features.filter(f => !f.properties.eaten)
    };
}

// ── Funciones de actualización ───────────────────────────────────────────────────

export function updatePlayerLayer(map, pos) {
    const source = map.getSource('player-source');
    if (!source) return;
    source.setData({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
            properties: {}
        }]
    });
}

export function updatePelletLayers(map, game) {
    const smallSource = map.getSource('small-pellets-source');
    const powerSource = map.getSource('power-pellets-source');
    if (smallSource) smallSource.setData(filterUneaten(game.pelletsData));
    if (powerSource) powerSource.setData(filterUneaten(game.powerPelletsData));
}

export function updateGhostLayers(map, ghosts) {
    ghosts.forEach(ghost => {
        const source = map.getSource(`ghost-${ghost.id}-source`);
        if (!source) return;
        const color = ghost.state === 'frightened' ? '#4488FF' : ghost.color;
        // Actualizar color via setPaintProperty para el estado frightened
        if (map.getLayer(`ghost-${ghost.id}`)) {
            map.setPaintProperty(`ghost-${ghost.id}`, 'circle-color', color);
        }
        if (ghost.state === 'dead') {
            source.setData({ type: 'FeatureCollection', features: [] });
            return;
        }
        source.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [ghost.position.lng, ghost.position.lat] },
                properties: {}
            }]
        });
    });
}

export function updateTrailLayer(map, trail) {
    const source = map.getSource('trail-source');
    if (!source || trail.length < 2) return;
    source.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: trail },
        properties: {}
    });
}

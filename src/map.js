// map.js — MapLibre GL JS: inicialización, estilo oscuro arcade, capas dinámicas del juego

export function initMap(containerId) {
    const map = new maplibregl.Map({
        container: containerId,
        // OpenFreeMap estilo completo — gratis, sin API key, tiles y estilos incluidos
        style: 'https://tiles.openfreemap.org/styles/liberty',
        zoom: 17,
        center: [-3.7037, 40.4226],  // Malasaña, Madrid (fallback antes del GPS)
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        maxZoom: 19,
        minZoom: 14,
        keyboard: false,  // Disable MapLibre's own keyboard panning; game handles arrow keys
    });

    // Aplicar el tema oscuro arcade en cuanto el mapa cargue
    map.once('load', () => addDarkOverrides(map));

    return map;
}

// ── Oscurecer el mapa base de OFM ──────────────────────────────────────────────────
// OFM liberty style tiene capas bien nombradas. Las reemplazamos para el look arcade.
function addDarkOverrides(map) {
    try {
        // Fondo negro
        if (map.getLayer('background')) {
            map.setPaintProperty('background', 'background-color', '#000000');
        }
        // Oscurecer agua
        ['water', 'water_shadow', 'waterway'].forEach(id => {
            if (map.getLayer(id)) map.setPaintProperty(id, 'fill-color', '#050d18');
        });
        // Oscurecer tierra / landuse
        ['landuse_park', 'landuse', 'grass', 'scrub', 'sand', 'farmland'].forEach(id => {
            if (map.getLayer(id)) {
                try { map.setPaintProperty(id, 'fill-color', '#050805'); } catch { }
            }
        });
        // Oscurecer edificios
        ['building', 'buildings', 'building_3d'].forEach(id => {
            if (map.getLayer(id)) {
                try { map.setPaintProperty(id, 'fill-color', '#0d0d0d'); } catch { }
                try { map.setPaintProperty(id, 'fill-extrusion-color', '#0d0d0d'); } catch { }
            }
        });
        // Oscurecer carreteras principales
        ['highway_motorway', 'highway_trunk', 'highway_primary'].forEach(id => {
            if (map.getLayer(id)) {
                try { map.setPaintProperty(id, 'line-color', '#1a1a1a'); } catch { }
            }
        });
        // Resaltar calles secundarias en neón amarillo
        const streetLayers = map.getStyle().layers
            .filter(l => l.type === 'line' && l['source-layer'] === 'transportation')
            .map(l => l.id)
            .filter(id => !['highway_motorway', 'highway_trunk', 'highway_primary'].includes(id));

        streetLayers.forEach(id => {
            try {
                map.setPaintProperty(id, 'line-color', '#FFD700');
                map.setPaintProperty(id, 'line-opacity', 0.5);
            } catch { }
        });

        // Ocultar labels (texto del mapa) para que no distraigan del juego
        map.getStyle().layers
            .filter(l => l.type === 'symbol')
            .forEach(l => {
                try { map.setLayoutProperty(l.id, 'visibility', 'none'); } catch { }
            });

        console.log('[GeoChomp] Tema oscuro arcade aplicado ✓');
    } catch (err) {
        console.warn('[GeoChomp] Error aplicando tema oscuro:', err);
    }
}


// ── Estilo oscuro arcade ─────────────────────────────────────────────────────────
// Usa el estilo de OpenFreeMap como base y lo oscurece con modificaciones post-load
function buildDarkStyle() {
    // Devuelve un estilo completo con fondo negro usando demotiles de MapLibre
    // para evitar depender de API keys o servers externos poco fiables en dev
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            ofm: {
                type: 'vector',
                // OpenFreeMap planet tiles — gratis, sin API key
                tiles: [
                    'https://tiles.openfreemap.org/planet/{z}/{x}/{y}',
                ],
                minzoom: 0, maxzoom: 14,
                attribution: '© OpenMapTiles © OpenStreetMap'
            }
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#000000' }
            },
            // Agua
            {
                id: 'water',
                type: 'fill',
                source: 'ofm', 'source-layer': 'water',
                paint: { 'fill-color': '#050d18' }
            },
            // Edificios
            {
                id: 'buildings',
                type: 'fill',
                source: 'ofm', 'source-layer': 'building',
                paint: { 'fill-color': '#0d0d0d', 'fill-opacity': 0.95 }
            },
            // Carreteras principales — muy oscuras
            {
                id: 'streets-major',
                type: 'line',
                source: 'ofm', 'source-layer': 'transportation',
                filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#1a1a1a', 'line-width': 3 }
            },
            // Glow de calles secundarias (jugables)
            {
                id: 'streets-glow',
                type: 'line',
                source: 'ofm', 'source-layer': 'transportation',
                filter: ['all',
                    ['!=', 'class', 'motorway'],
                    ['!=', 'class', 'trunk'],
                    ['!=', 'class', 'primary']
                ],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': '#FFD700',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 14, 6, 18, 12],
                    'line-blur': 8,
                    'line-opacity': 0.18
                }
            },
            // Calles jugables — neón amarillo
            {
                id: 'streets-playable',
                type: 'line',
                source: 'ofm', 'source-layer': 'transportation',
                filter: ['all',
                    ['!=', 'class', 'motorway'],
                    ['!=', 'class', 'trunk'],
                    ['!=', 'class', 'primary']
                ],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': '#FFD700',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 2.5],
                    'line-opacity': 0.55,
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

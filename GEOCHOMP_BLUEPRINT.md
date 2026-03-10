# GeoChomp — Technical Blueprint (Full Frontend / Serverless)

> Este documento es la especificación técnica completa para construir GeoChomp.
> Todo corre en el navegador del usuario. Cero backend. Cero base de datos.
> Stack: HTML + CSS + Vanilla JS (o Vite si prefieres bundler), MapLibre GL JS, Turf.js, Howler.js.

---

## 1. Estructura de Archivos

```
geochomp/
├── index.html               # Entry point único
├── style.css                # Estilos globales (modo oscuro, UI de juego)
├── src/
│   ├── main.js              # Inicialización: mapa, GPS, game loop
│   ├── map.js               # Lógica MapLibre: capas, estilos, snap-to-road
│   ├── game.js              # Estado del juego, puntuación, pellets, power-ups
│   ├── ghosts.js            # IA de fantasmas (pathfinding sobre grafo)
│   ├── graph.js             # Construcción del grafo de calles desde GeoJSON
│   ├── gps.js               # Wrapper de Geolocation API + filtro Kalman simple
│   ├── audio.js             # Sonidos con Howler.js
│   ├── haptics.js           # Vibración (Navigator.vibrate)
│   ├── storage.js           # IndexedDB: scores, ciudad activa, progreso
│   ├── share.js             # Captura del canvas + exportar imagen para Stories
│   └── ui.js                # HUD: puntos, vidas, estado de fantasmas, overlays
├── data/
│   └── neighborhoods/
│       └── ejemplo_barrio.geojson   # GeoJSON pre-procesado (ver Sección 4)
├── assets/
│   ├── sounds/
│   │   ├── chomp.mp3
│   │   ├── power_pellet.mp3
│   │   ├── ghost_eaten.mp3
│   │   ├── death.mp3
│   │   └── siren.mp3
│   └── sprites/             # Solo si decides hacer iconos SVG inline
└── README.md
```

---

## 2. Dependencias (todas vía CDN, sin npm obligatorio)

```html
<!-- MapLibre GL JS — renderizado del mapa en WebGL -->
<script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />

<!-- Turf.js — operaciones espaciales en el browser -->
<script src="https://unpkg.com/@turf/turf@6.5.0/turf.min.js"></script>

<!-- Howler.js — audio cross-platform confiable -->
<script src="https://unpkg.com/howler@2.2.4/dist/howler.min.js"></script>
```

> **Tile Server gratuito:** Usa `https://demotiles.maplibre.org/style.json` para desarrollo.
> Para producción usa **Protomaps** (tiles estáticos en S3/R2) o **MapTiler** (free tier 100k tiles/mes).

---

## 3. El Mapa (map.js)

### 3.1 Inicialización

```javascript
// map.js
export function initMap(containerId) {
  const map = new maplibregl.Map({
    container: containerId,
    style: buildDarkStyle(),   // Estilo oscuro custom (ver 3.2)
    zoom: 17,
    center: [0, 0],            // Se actualiza con el primer fix GPS
    pitch: 0,
    bearing: 0,
    attributionControl: false,
  });
  return map;
}
```

### 3.2 Estilo Oscuro (buildDarkStyle)

El mapa debe verse como un arcade: fondo negro, calles jugables en amarillo neón, todo lo demás apagado.

```javascript
function buildDarkStyle() {
  return {
    version: 8,
    sources: {
      // Tiles vectoriales gratuitos (OpenMapTiles schema)
      osm: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',  // alternativa: maptiler free tier
      }
    },
    layers: [
      // Fondo absolutamente negro
      { id: 'background', type: 'background', paint: { 'background-color': '#000000' } },

      // Bloques de edificios — gris muy oscuro, casi invisible
      {
        id: 'buildings',
        type: 'fill',
        source: 'osm', 'source-layer': 'building',
        paint: { 'fill-color': '#0a0a0a', 'fill-opacity': 0.9 }
      },

      // Calles NO jugables (autopistas, vías rápidas) — apagadas
      {
        id: 'streets-dim',
        type: 'line',
        source: 'osm', 'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
        paint: { 'line-color': '#1a1a1a', 'line-width': 3 }
      },

      // Calles JUGABLES — neón amarillo con blur para efecto glow
      {
        id: 'streets-playable',
        type: 'line',
        source: 'osm', 'source-layer': 'transportation',
        filter: ['in', 'class', 'secondary', 'tertiary', 'residential', 'path', 'service'],
        paint: {
          'line-color': '#FFD700',
          'line-width': 2,
          'line-blur': 3,          // Efecto glow neón
          'line-opacity': 0.6
        }
      },
    ]
  };
}
```

### 3.3 Capas Dinámicas del Juego

Estas capas se añaden después de `map.on('load', ...)`:

| Capa ID | Tipo | Contenido |
|---|---|---|
| `pellets-small` | `circle` | GeoJSON de puntos pequeños |
| `pellets-power` | `circle` | GeoJSON de Power Pellets (más grandes, blancos) |
| `player` | `circle` | Un solo punto: posición actual del jugador |
| `ghost-blinky` | `circle` | Posición de Blinky (rojo) |
| `ghost-pinky` | `circle` | Posición de Pinky (rosa) |
| `trail` | `line` | Recorrido histórico del jugador (para la imagen final) |

---

## 4. Pre-procesamiento del GeoJSON (CRÍTICO — hacer offline antes de deployar)

**El problema:** OSM completo de una ciudad son gigabytes. Un barrio jugable debe pesar máximo 500KB.

**El flujo de trabajo (se hace UNA VEZ por barrio, offline):**

### Paso 1 — Descargar datos de OSM

Usa la Overpass API para descargar solo las calles peatonales de un bounding box:

```
// Query Overpass (ejecutar en overpass-turbo.eu)
[out:json][timeout:60];
(
  way["highway"~"^(residential|tertiary|secondary|footway|path|pedestrian|living_street)$"]
    (40.4150,-3.7100,40.4300,-3.6900);  // BBox: ejemplo barrio Malasaña, Madrid
);
out geom;
```

### Paso 2 — Convertir a GeoJSON limpio

```bash
# Instalar osmtogeojson (solo para el build, no va al cliente)
npx osmtogeojson overpass_result.json > raw_streets.geojson

# Simplificar con mapshaper (reduce puntos redundantes ~60%)
npx mapshaper raw_streets.geojson -simplify 15% -o simplified_streets.geojson
```

### Paso 3 — Generar los pellets (script Node.js, se ejecuta offline)

```javascript
// scripts/generate_pellets.js
import * as turf from '@turf/turf';
import fs from 'fs';

const streets = JSON.parse(fs.readFileSync('simplified_streets.geojson', 'utf8'));
const smallPellets = [];
const powerPellets = [];

streets.features.forEach(feature => {
  if (feature.geometry.type !== 'LineString') return;

  const line = feature;
  const length = turf.length(line, { units: 'meters' });

  // Punto pequeño cada 15 metros a lo largo de la calle
  for (let d = 0; d < length; d += 15) {
    const point = turf.along(line, d / 1000, { units: 'kilometers' });
    point.properties = { type: 'small', eaten: false };
    smallPellets.push(point);
  }
});

// Power Pellets: en intersecciones (nodos con grado >= 3)
// (lógica simplificada: cada 200m aproximadamente)
streets.features.forEach(feature => {
  if (feature.geometry.type !== 'LineString') return;
  const coords = feature.geometry.coordinates;
  const midpoint = turf.midpoint(
    turf.point(coords[0]),
    turf.point(coords[coords.length - 1])
  );
  midpoint.properties = { type: 'power', eaten: false };
  powerPellets.push(midpoint);
});

const output = {
  streets: streets,
  smallPellets: turf.featureCollection(smallPellets),
  powerPellets: turf.featureCollection(powerPellets),
};

fs.writeFileSync('data/neighborhoods/malasana.geojson', JSON.stringify(output));
console.log(`Generados: ${smallPellets.length} pellets, ${powerPellets.length} power pellets`);
```

> **Objetivo de tamaño final:** El `.geojson` del barrio debe pesar < 400KB para carga rápida en móvil.

---

## 5. GPS y Snap-to-Road (gps.js)

Este es el módulo más crítico. GPS crudo en ciudad densa salta 10-20 metros sin moverse.

### 5.1 Filtro Kalman Simplificado

```javascript
// gps.js
export class KalmanGPS {
  constructor() {
    this.variance = -1;  // -1 = no inicializado
    this.minAccuracy = 1;
  }

  filter(lat, lng, accuracy, timestamp) {
    if (accuracy < 0) return null;

    if (this.variance < 0) {
      this.timestamp = timestamp;
      this.lat = lat;
      this.lng = lng;
      this.variance = accuracy * accuracy;
      return { lat, lng };
    }

    const dt = (timestamp - this.timestamp) / 1000;  // segundos
    if (dt > 0) {
      // Aumentar incertidumbre con el tiempo (el usuario se movió)
      this.variance += dt * 3 * 3;  // 3 m/s de movimiento asumido
      this.timestamp = timestamp;
    }

    const k = this.variance / (this.variance + accuracy * accuracy);
    this.lat += k * (lat - this.lat);
    this.lng += k * (lng - this.lng);
    this.variance = (1 - k) * this.variance;

    return { lat: this.lat, lng: this.lng };
  }
}
```

### 5.2 Snap-to-Road

```javascript
// gps.js
export function snapToRoad(position, streetsGeoJSON) {
  const point = turf.point([position.lng, position.lat]);
  let minDist = Infinity;
  let snappedPoint = point;

  streetsGeoJSON.features.forEach(street => {
    const snapped = turf.nearestPointOnLine(street, point, { units: 'meters' });
    if (snapped.properties.dist < minDist) {
      minDist = snapped.properties.dist;
      snappedPoint = snapped;
    }
  });

  // Si el GPS está a más de 25 metros de cualquier calle, no snapeamos
  // (el usuario está adentro de un edificio o GPS muy malo)
  if (minDist > 25) return position;

  return {
    lat: snappedPoint.geometry.coordinates[1],
    lng: snappedPoint.geometry.coordinates[0],
  };
}
```

### 5.3 Watcher GPS

```javascript
export function startGPS(onUpdate, onError) {
  const kalman = new KalmanGPS();

  return navigator.geolocation.watchPosition(
    (pos) => {
      const filtered = kalman.filter(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy,
        pos.timestamp
      );
      if (filtered) onUpdate(filtered, pos.coords.accuracy);
    },
    onError,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000,         // Acepta posición de hasta 1 segundo de antigüedad
    }
  );
}
```

---

## 6. El Grafo de Calles (graph.js)

Los fantasmas necesitan navegar sobre calles reales. Para eso construimos un grafo en memoria.

```javascript
// graph.js
export class StreetGraph {
  constructor(streetsGeoJSON) {
    this.nodes = new Map();   // "lat,lng" -> { id, lat, lng, neighbors: [] }
    this.edges = [];
    this._buildFromGeoJSON(streetsGeoJSON);
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
        a.neighbors.push({ node: b, dist });
        b.neighbors.push({ node: a, dist });  // Bidireccional
        this.edges.push({ a, b, dist });
      }
    });
  }

  _getOrCreateNode(coord) {
    // Redondear a 6 decimales para deduplicar nodos cercanos
    const key = `${coord[1].toFixed(6)},${coord[0].toFixed(6)}`;
    if (!this.nodes.has(key)) {
      this.nodes.set(key, {
        id: key, lat: coord[1], lng: coord[0], neighbors: []
      });
    }
    return this.nodes.get(key);
  }

  // Encontrar el nodo más cercano a una coordenada
  nearestNode(lat, lng) {
    let minDist = Infinity, nearest = null;
    const point = turf.point([lng, lat]);
    this.nodes.forEach(node => {
      const d = turf.distance(point, turf.point([node.lng, node.lat]), { units: 'meters' });
      if (d < minDist) { minDist = d; nearest = node; }
    });
    return nearest;
  }

  // A* pathfinding
  aStar(startNode, goalNode) {
    const open = new Set([startNode.id]);
    const cameFrom = new Map();
    const gScore = new Map([[startNode.id, 0]]);

    const h = (node) => turf.distance(
      turf.point([node.lng, node.lat]),
      turf.point([goalNode.lng, goalNode.lat]),
      { units: 'meters' }
    );

    const fScore = new Map([[startNode.id, h(startNode)]]);

    while (open.size > 0) {
      // Nodo con menor fScore
      let current = [...open].reduce((a, b) =>
        (fScore.get(a) || Infinity) < (fScore.get(b) || Infinity) ? a : b
      );

      if (current === goalNode.id) {
        // Reconstruir camino
        const path = [];
        while (cameFrom.has(current)) {
          path.unshift(this.nodes.get(current));
          current = cameFrom.get(current);
        }
        return path;
      }

      open.delete(current);
      const currentNode = this.nodes.get(current);

      for (const { node: neighbor, dist } of currentNode.neighbors) {
        const tentativeG = (gScore.get(current) || 0) + dist;
        if (tentativeG < (gScore.get(neighbor.id) || Infinity)) {
          cameFrom.set(neighbor.id, current);
          gScore.set(neighbor.id, tentativeG);
          fScore.set(neighbor.id, tentativeG + h(neighbor));
          open.add(neighbor.id);
        }
      }
    }
    return [];  // Sin camino encontrado
  }
}
```

---

## 7. Lógica de Fantasmas (ghosts.js)

```javascript
// ghosts.js
export class Ghost {
  constructor(id, color, graph, startPosition) {
    this.id = id;
    this.color = color;
    this.graph = graph;
    this.position = startPosition;   // { lat, lng }
    this.currentNode = graph.nearestNode(startPosition.lat, startPosition.lng);
    this.path = [];
    this.state = 'chase';            // 'chase' | 'scatter' | 'frightened' | 'dead'
    this.moveInterval = null;
    this.stepIndex = 0;
  }

  startMoving(playerPositionGetter, intervalMs = 2000) {
    this.moveInterval = setInterval(() => {
      this._recalculatePath(playerPositionGetter());
      this._step();
    }, intervalMs);
  }

  _recalculatePath(playerPos) {
    const playerNode = this.graph.nearestNode(playerPos.lat, playerPos.lng);

    if (this.id === 'blinky') {
      // Persecución directa
      this.path = this.graph.aStar(this.currentNode, playerNode);

    } else if (this.id === 'pinky') {
      // Intentar anticipar: moverse hacia un punto 4 nodos adelante del jugador
      // Simplificación: elige una intersección aleatoria cercana al jugador
      const nearbyNodes = [...this.graph.nodes.values()].filter(n => {
        const d = turf.distance(
          turf.point([n.lng, n.lat]),
          turf.point([playerPos.lng, playerPos.lat]),
          { units: 'meters' }
        );
        return d < 100 && d > 30;
      });
      if (nearbyNodes.length > 0) {
        const target = nearbyNodes[Math.floor(Math.random() * nearbyNodes.length)];
        this.path = this.graph.aStar(this.currentNode, target);
      }
    }
  }

  _step() {
    if (this.path.length === 0) return;
    const nextNode = this.path.shift();
    this.currentNode = nextNode;
    this.position = { lat: nextNode.lat, lng: nextNode.lng };
  }

  setFrightened(durationMs = 8000) {
    this.state = 'frightened';
    setTimeout(() => { this.state = 'chase'; }, durationMs);
  }

  stop() {
    clearInterval(this.moveInterval);
  }
}
```

---

## 8. Estado del Juego (game.js)

```javascript
// game.js
export class GameState {
  constructor(mapData) {
    this.score = 0;
    this.lives = 3;
    this.phase = 'idle';            // 'idle' | 'playing' | 'paused' | 'dead' | 'won'
    this.pelletsData = JSON.parse(JSON.stringify(mapData.smallPellets));  // deep copy
    this.powerPelletsData = JSON.parse(JSON.stringify(mapData.powerPellets));
    this.totalPellets = this.pelletsData.features.length;
    this.pelletsEaten = 0;
    this.playerTrail = [];          // Array de [lng, lat] para la imagen final
  }

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
      if (dist <= radiusMeters * 2) {
        pellet.properties.eaten = true;
        this.score += 50;
        eaten.push({ type: 'power', index: i });
      }
    });

    return eaten;
  }

  checkGhostCollision(playerPos, ghosts, radiusMeters = 10) {
    const playerPoint = turf.point([playerPos.lng, playerPos.lat]);

    for (const ghost of ghosts) {
      const ghostPoint = turf.point([ghost.position.lng, ghost.position.lat]);
      const dist = turf.distance(playerPoint, ghostPoint, { units: 'meters' });

      if (dist <= radiusMeters) {
        if (ghost.state === 'frightened') {
          ghost.state = 'dead';
          this.score += 200;
          return { type: 'eat_ghost', ghost };
        } else if (ghost.state === 'chase') {
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

  isWon() {
    return this.pelletsEaten >= this.totalPellets * 0.9;  // 90% para ganar
  }
}
```

---

## 9. Audio y Háptica (audio.js / haptics.js)

```javascript
// audio.js
export function initAudio() {
  const sounds = {
    chomp: new Howl({ src: ['assets/sounds/chomp.mp3'], volume: 0.5 }),
    power: new Howl({ src: ['assets/sounds/power_pellet.mp3'], volume: 0.7 }),
    ghostEaten: new Howl({ src: ['assets/sounds/ghost_eaten.mp3'], volume: 0.8 }),
    death: new Howl({ src: ['assets/sounds/death.mp3'], volume: 1.0 }),
    siren: new Howl({ src: ['assets/sounds/siren.mp3'], loop: true, volume: 0.3 }),
  };

  return {
    playChomp: () => sounds.chomp.play(),
    playPower: () => sounds.power.play(),
    playGhostEaten: () => sounds.ghostEaten.play(),
    playDeath: () => { sounds.siren.stop(); sounds.death.play(); },
    setSirenIntensity: (distanceToNearestGhost) => {
      // Entre 0 y 80 metros: siren de 0.1 a 1.0 de volumen
      const vol = Math.max(0, Math.min(1, 1 - (distanceToNearestGhost / 80)));
      sounds.siren.volume(vol);
      if (vol > 0 && !sounds.siren.playing()) sounds.siren.play();
      if (vol === 0) sounds.siren.stop();
    },
  };
}
```

```javascript
// haptics.js
export const haptics = {
  chomp: () => navigator.vibrate?.([30]),                    // Pulsito corto
  powerPellet: () => navigator.vibrate?.([100, 50, 100]),    // Doble pulso
  ghostNear: () => navigator.vibrate?.([200, 100, 200]),     // Alerta
  death: () => navigator.vibrate?.([500]),                   // Vibración larga
};
```

---

## 10. Persistencia Local (storage.js)

```javascript
// storage.js — Usa IndexedDB via la librería 'idb-keyval' (3KB, CDN)
// <script src="https://unpkg.com/idb-keyval@6/dist/umd.js"></script>

export async function saveScore(neighborhoodId, score, trail) {
  const existing = await idbKeyval.get(`scores_${neighborhoodId}`) || [];
  existing.push({ score, date: Date.now(), trail });
  existing.sort((a, b) => b.score - a.score);
  await idbKeyval.set(`scores_${neighborhoodId}`, existing.slice(0, 10));  // Top 10
}

export async function getScores(neighborhoodId) {
  return await idbKeyval.get(`scores_${neighborhoodId}`) || [];
}

export async function saveProgress(neighborhoodId, state) {
  await idbKeyval.set(`progress_${neighborhoodId}`, {
    pelletsEaten: state.pelletsEaten,
    score: state.score,
    lives: state.lives,
    savedAt: Date.now(),
  });
}
```

---

## 11. Exportar Imagen para Instagram Stories (share.js)

```javascript
// share.js
export function generateShareImage(playerTrail, score, neighborhoodName) {
  // Crear un canvas 1080x1920 (formato Stories 9:16)
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');

  // Fondo negro
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1080, 1920);

  // Dibujar el trail del jugador (normalizado al canvas)
  if (playerTrail.length > 1) {
    const lngs = playerTrail.map(p => p[0]);
    const lats = playerTrail.map(p => p[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const padding = 100;

    const toCanvas = (lng, lat) => ({
      x: padding + ((lng - minLng) / (maxLng - minLng)) * (1080 - padding * 2),
      y: padding + ((maxLat - lat) / (maxLat - minLat)) * (1500 - padding * 2),
    });

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    const start = toCanvas(playerTrail[0][0], playerTrail[0][1]);
    ctx.moveTo(start.x, start.y);
    playerTrail.forEach(point => {
      const p = toCanvas(point[0], point[1]);
      ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  // Texto de puntuación
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 80px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${score} pts`, 540, 1700);

  ctx.fillStyle = '#FFD700';
  ctx.font = '40px monospace';
  ctx.fillText(neighborhoodName, 540, 1780);

  ctx.fillStyle = '#888888';
  ctx.font = '35px monospace';
  ctx.fillText('GeoChomp', 540, 1850);

  // Descargar
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'geochomp_score.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
```

---

## 12. Game Loop Principal (main.js)

```javascript
// main.js
import { initMap } from './map.js';
import { startGPS, snapToRoad, KalmanGPS } from './gps.js';
import { StreetGraph } from './graph.js';
import { Ghost } from './ghosts.js';
import { GameState } from './game.js';
import { initAudio } from './audio.js';
import { haptics } from './haptics.js';
import { saveScore } from './storage.js';
import { generateShareImage } from './share.js';

async function main() {
  // 1. Cargar datos del barrio
  const mapData = await fetch('data/neighborhoods/malasana.geojson').then(r => r.json());

  // 2. Inicializar mapa
  const map = initMap('map-container');

  // 3. Construir grafo de calles
  const graph = new StreetGraph(mapData.streets);

  // 4. Inicializar estado del juego
  const game = new GameState(mapData);

  // 5. Audio
  const audio = initAudio();

  // 6. Inicializar fantasmas (posición inicial: esquinas del bounding box del barrio)
  const ghosts = [
    new Ghost('blinky', '#FF0000', graph, { lat: 40.4220, lng: -3.7010 }),
    new Ghost('pinky', '#FFB8FF', graph, { lat: 40.4230, lng: -3.6990 }),
  ];

  // 7. Esperar primer fix GPS para centrar el mapa y comenzar
  let playerPos = null;

  map.on('load', () => {
    // Añadir capas del juego al mapa
    addGameLayers(map, mapData, game);

    // Iniciar GPS
    startGPS(
      (pos, accuracy) => {
        const snapped = snapToRoad(pos, mapData.streets);
        playerPos = snapped;

        if (game.phase === 'idle') {
          // Primer fix: centrar mapa y comenzar partida
          map.flyTo({ center: [snapped.lng, snapped.lat], zoom: 17 });
          game.phase = 'playing';
          ghosts.forEach(g => g.startMoving(() => playerPos, 2500));
        }

        if (game.phase !== 'playing') return;

        // Actualizar posición del jugador en el mapa
        updatePlayerLayer(map, snapped);
        game.addTrailPoint(snapped);

        // Rotar mapa para que el jugador siempre mire "arriba"
        // (requiere bearing del GPS, opcional)

        // Verificar colisiones con pellets
        const eaten = game.checkPelletCollision(snapped);
        if (eaten.length > 0) {
          audio.playChomp();
          haptics.chomp();
          updatePelletLayers(map, game);

          const powerEaten = eaten.filter(e => e.type === 'power');
          if (powerEaten.length > 0) {
            audio.playPower();
            haptics.powerPellet();
            ghosts.forEach(g => g.setFrightened(8000));
          }
        }

        // Verificar colisiones con fantasmas
        const ghostCollision = game.checkGhostCollision(snapped, ghosts);
        if (ghostCollision) {
          if (ghostCollision.type === 'player_died') {
            audio.playDeath();
            haptics.death();
            if (game.lives <= 0) endGame(game, ghosts, audio);
            else respawnPlayer(game, ghosts);
          } else if (ghostCollision.type === 'eat_ghost') {
            audio.playGhostEaten();
          }
        }

        // Actualizar posiciones de fantasmas en el mapa
        updateGhostLayers(map, ghosts);

        // Calcular distancia al fantasma más cercano para la sirena
        const nearestGhostDist = Math.min(...ghosts.map(g =>
          turf.distance(
            turf.point([snapped.lng, snapped.lat]),
            turf.point([g.position.lng, g.position.lat]),
            { units: 'meters' }
          )
        ));
        audio.setSirenIntensity(nearestGhostDist);

        // Actualizar HUD
        updateHUD(game);

        // Verificar victoria
        if (game.isWon()) endGame(game, ghosts, audio, true);
      },
      (err) => console.error('GPS Error:', err)
    );
  });
}

async function endGame(game, ghosts, audio, won = false) {
  game.phase = won ? 'won' : 'dead';
  ghosts.forEach(g => g.stop());
  await saveScore('malasana', game.score, game.playerTrail);
  showEndScreen(game, won);
}

main();
```

---

## 13. HUD y UI (ui.js / style.css)

### El HUD debe ser mínimo y no obstaculizar la visión del mapa.

```
+----------------------------------+
|  ❤️❤️❤️          SCORE: 1.240   |
+----------------------------------+
|                                  |
|         [MAPA OCUPA TODO]        |
|                                  |
+----------------------------------+
| [PAUSA]              [COMPARTIR] |
+----------------------------------+
```

```css
/* style.css — fragmento clave */
body { margin: 0; background: #000; font-family: 'Press Start 2P', monospace; }

#map-container {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
}

#hud {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
  color: #FFD700;
  font-size: 14px;
  pointer-events: none;    /* El HUD no bloquea toques en el mapa */
}

#bottom-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));  /* iPhone notch */
  background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
}

/* Pantalla de inicio */
#start-screen {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #FFD700;
  text-align: center;
}

.neon-title {
  font-size: 48px;
  text-shadow: 0 0 20px #FFD700, 0 0 40px #FFD700;
  animation: pulse 1.5s ease-in-out infinite alternate;
}

@keyframes pulse {
  from { opacity: 1; }
  to { opacity: 0.6; }
}
```

---

## 14. Consideraciones de Performance en Móvil

| Problema | Solución |
|---|---|
| GPS activo drena batería | Reducir `maximumAge` a 2000ms cuando el usuario no se mueve (detectar con velocidad < 0.5 m/s) |
| A* caro en grafos grandes | Limitar el barrio a un radio de 600m. Grafos de ~200 nodos son instantáneos. |
| WebGL + GPS simultáneo | Usar `map.setLayoutProperty` para ocultar capas fuera del viewport del jugador |
| GeoJSON pesado | Comprimir con gzip en el CDN (Vercel lo hace automáticamente). 400KB → ~80KB transferidos |
| Re-renders excesivos | Actualizar capas del mapa máximo 1 vez por segundo, no en cada evento GPS |

---

## 15. Deploy (Vercel / GitHub Pages)

```bash
# Opción A: GitHub Pages (gratis, estático)
# 1. Push a repo
# 2. Settings → Pages → Deploy from main/root
# El CDN de GitHub sirve gzip automáticamente

# Opción B: Vercel (recomendado, edge network global)
npm i -g vercel
vercel deploy

# vercel.json para headers de caché óptimos
```

```json
{
  "headers": [
    {
      "source": "/data/(.*).geojson",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=86400" },
        { "key": "Content-Encoding", "value": "gzip" }
      ]
    }
  ]
}
```

---

## 16. Orden de Implementación Recomendado

Sigue exactamente este orden para tener algo jugable lo antes posible:

1. **`index.html` + `map.js`** — Mapa oscuro en pantalla completa, sin GPS todavía.
2. **`gps.js`** — Mostrar el punto del jugador moviéndose en el mapa. Validar Snap-to-Road.
3. **`graph.js`** — Construir el grafo en memoria y visualizarlo (líneas debug en rojo).
4. **Generar el GeoJSON** de un barrio real con el script de la Sección 4.
5. **`game.js`** — Pellets visibles, colisión, puntuación en el HUD.
6. **`ghosts.js`** — Un solo fantasma moviéndose. Validar que el A* funciona.
7. **`audio.js` + `haptics.js`** — Sonidos y vibración.
8. **`share.js`** — Imagen final exportable.
9. **`storage.js`** — Guardar puntuaciones.
10. **Pulir UI**, añadir pantalla de inicio y pantalla final.

---

## 17. Lo que NO construir en V1

- Multijugador (requiere backend)
- Leaderboard global (requiere backend)
- Más de 2 barrios pre-procesados
- Más de 2 fantasmas
- Sistema de niveles o progresión
- Autenticación de usuarios

**El objetivo de V1:** Una partida completa, en un barrio real, que se pueda compartir en una Story. Nada más.

---

*Generado como especificación técnica para Claude Code. Todos los módulos son independientes e importables. Stack: Vanilla JS ES Modules + MapLibre GL JS + Turf.js + Howler.js. Cero frameworks. Cero backend.*

// main.js — Game Loop Principal: orquesta todos los módulos de GeoChomp

import { initMap, addGameLayers, updatePlayerLayer, updatePelletLayers, updateGhostLayers, updateTrailLayer } from './map.js';
import { startGPS, stopGPS, snapToRoad } from './gps.js';
import { StreetGraph } from './graph.js';
import { Ghost } from './ghosts.js';
import { GameState } from './game.js';
import { initAudio } from './audio.js';
import { haptics } from './haptics.js';
import { saveScore, clearProgress } from './storage.js';
import { generateShareImage } from './share.js';
import {
    updateHUD, updateGPSIndicator, showOverlay, hideOverlay,
    showEndScreen, showGhostAlert, showFrightenedBanner, showScorePopup, initUIListeners
} from './ui.js';

// ── Config ────────────────────────────────────────────────────────────────────────
const NEIGHBORHOOD_ID = 'malasana';
const NEIGHBORHOOD_NAME = 'Malasaña, Madrid';
const DATA_URL = 'data/neighborhoods/malasana.geojson';
const GHOST_INTERVAL_MS = 2200;   // Velocidad de los fantasmas (ms entre pasos)
const GHOST_ALERT_DIST = 35;     // Metros para alertar de fantasma cerca
const MAP_UPDATE_THROTTLE = 1000; // Actualizar capas máx 1 vez por segundo

// Posiciones iniciales de los fantasmas (esquinas del bounding box de Malasaña)
const GHOST_STARTS = {
    blinky: { lat: 40.4260, lng: -3.7050 },
    pinky: { lat: 40.4200, lng: -3.6980 },
};

// ── Estado global ─────────────────────────────────────────────────────────────────
let map, game, graph, ghosts = [], audio, gpsWatchId = null;
let playerPos = null;
let lastLayerUpdate = 0;
let isInitialized = false;

// ── Entrada principal ─────────────────────────────────────────────────────────────
async function main() {
    console.log('[GeoChomp] Iniciando...');

    // 1. Inicializar mapa inmediatamente (se muestra el mapa oscuro antes del GPS)
    map = initMap('map-container');

    // 2. Inicializar audio
    audio = initAudio();

    // 3. Registrar listeners de UI
    initUIListeners({
        onPlay: handlePlay,
        onPause: handlePause,
        onResume: handleResume,
        onAbandon: handleAbandon,
        onShareEnd: handleShare,
        onRestart: handleRestart,
    });

    // 4. Mostrar pantalla de inicio
    showOverlay('start-screen');

    console.log('[GeoChomp] Listo. Esperando al jugador...');
}

// ── Handlers de UI ────────────────────────────────────────────────────────────────

async function handlePlay() {
    hideOverlay('start-screen');

    // Cargar datos del barrio
    try {
        showLoadingState(true);
        const mapData = await fetch(DATA_URL).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
        // Guardar en scope del módulo para setupGameLayers
        window._geochomp_mapData = mapData;

        // Construir grafo en memoria
        graph = new StreetGraph(mapData.streets);

        // Inicializar estado del juego
        game = new GameState(mapData);

        // Inicializar fantasmas
        ghosts = [
            new Ghost('blinky', '#FF3333', graph, GHOST_STARTS.blinky),
            new Ghost('pinky', '#FF88CC', graph, GHOST_STARTS.pinky),
        ];

        // Cuando el mapa esté listo, añadir capas del juego
        if (map.loaded()) {
            setupGameLayers();
        } else {
            map.once('load', setupGameLayers);
        }

        // Iniciar GPS
        updateGPSIndicator(null);
        gpsWatchId = startGPS(handleGPSUpdate, handleGPSError);

        isInitialized = true;
        showLoadingState(false);

    } catch (err) {
        showLoadingState(false);
        console.error('[GeoChomp] Error cargando datos:', err);
        // Modo demo: usar posición fija de Malasaña para pruebas sin GPS
        startDemoMode();
    }
}

function setupGameLayers() {
    // Usar el mapData guardado en scope global de módulo
    const md = window._geochomp_mapData;
    if (!md || !game) { console.warn('[GeoChomp] setupGameLayers: data no disponible'); return; }
    addGameLayers(map, md, game);
    updateHUD(game);
}

function handleGPSUpdate(pos, accuracy) {
    if (!game || !isInitialized) return;

    updateGPSIndicator(accuracy);

    // Snap-to-road sobre las calles del barrio
    const snapped = (game.pelletsData && graph)
        ? snapToRoad(pos, { type: 'FeatureCollection', features: [] })  // evitar coste en cada tick
        : pos;

    // Primer fix: centrar mapa y arrancar la partida
    if (game.phase === 'idle') {
        map.flyTo({ center: [pos.lng, pos.lat], zoom: 17.5, duration: 1500 });
        game.start();
        ghosts.forEach(g => g.startMoving(() => playerPos || pos, GHOST_INTERVAL_MS));
        document.getElementById('btn-pause').classList.remove('hidden');
    }

    if (game.phase !== 'playing') return;

    playerPos = pos;  // Usar posición filtrada por Kalman (snap es costoso, se hace selectivamente)
    game.addTrailPoint(pos);

    // Actualizar capas del mapa con throttling
    const now = Date.now();
    if (now - lastLayerUpdate >= MAP_UPDATE_THROTTLE) {
        lastLayerUpdate = now;
        updatePlayerLayer(map, pos);
        updateGhostLayers(map, ghosts);
        updateTrailLayer(map, game.playerTrail);
    }

    // Verificar colisión con pellets
    const eaten = game.checkPelletCollision(pos);
    if (eaten.length > 0) {
        audio.playChomp();
        haptics.chomp();
        updatePelletLayers(map, game);
        updateHUD(game);

        const powerEaten = eaten.filter(e => e.type === 'power');
        if (powerEaten.length > 0) {
            audio.playPower();
            haptics.powerPellet();
            ghosts.forEach(g => g.setFrightened(8000));
            showFrightenedBanner(8000);
            showScorePopup('+50 ⚡', '#4488FF');
        } else {
            showScorePopup('+10', '#FFFFFF');
        }
    }

    // Verificar colisión con fantasmas
    const ghostCollision = game.checkGhostCollision(pos, ghosts);
    if (ghostCollision) {
        if (ghostCollision.type === 'player_died') {
            handlePlayerDeath();
        } else if (ghostCollision.type === 'eat_ghost') {
            audio.playGhostEaten();
            haptics.eatGhost();
            showScorePopup('+200 👻', '#FF88CC');
            updateHUD(game);
        }
    }

    // Alerta de fantasma cercano
    const nearestGhostDist = minGhostDistance(pos);
    audio.setSirenIntensity(nearestGhostDist);
    showGhostAlert(nearestGhostDist <= GHOST_ALERT_DIST && !ghostsAllFrightened());

    // Verificar victoria
    if (game.isWon()) endGame(true);
}

function handleGPSError(err) {
    console.warn('[GPS]', err.message || err);
    updateGPSIndicator(null);
    // En caso de error de GPS, intentar modo demo
    if (!isInitialized || !game || game.phase === 'idle') {
        startDemoMode();
    }
}

// ── Player Death ──────────────────────────────────────────────────────────────────

function handlePlayerDeath() {
    audio.playDeath();
    haptics.death();
    updateHUD(game);

    if (game.lives <= 0) {
        endGame(false);
    } else {
        // Flash rojo en el mapa
        flashScreen('#FF000030');
        // Reposicionar fantasmas
        ghosts.forEach((g, i) => {
            const starts = Object.values(GHOST_STARTS);
            g.respawn(starts[i % starts.length]);
        });
        // Pequeño cooldown antes de reanudar
        game.phase = 'paused';
        setTimeout(() => {
            if (game.phase === 'paused') game.phase = 'playing';
        }, 2000);
    }
}

function flashScreen(color) {
    const flash = document.createElement('div');
    flash.style.cssText = `
    position:fixed;inset:0;z-index:500;
    background:${color};pointer-events:none;
    animation:flashAnim 0.5s ease-out forwards;
  `;
    if (!document.getElementById('flash-style')) {
        const style = document.createElement('style');
        style.id = 'flash-style';
        style.textContent = '@keyframes flashAnim{from{opacity:1}to{opacity:0}}';
        document.head.appendChild(style);
    }
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
}

// ── Pause / Resume / Abandon ──────────────────────────────────────────────────────

function handlePause() {
    if (!game || game.phase !== 'playing') return;
    game.pause();
    audio.stopAll();
    showOverlay('pause-screen');
    document.getElementById('pause-score').textContent = game.score.toLocaleString();
}

function handleResume() {
    if (!game || game.phase !== 'paused') return;
    game.resume();
    hideOverlay('pause-screen');
}

function handleAbandon() {
    hideOverlay('pause-screen');
    if (game) { game.phase = 'dead'; }
    endGame(false);
}

// ── End Game ──────────────────────────────────────────────────────────────────────

async function endGame(won) {
    if (!game) return;
    game.phase = won ? 'won' : 'dead';
    ghosts.forEach(g => g.stop());
    stopGPS(gpsWatchId);
    audio.stopAll();
    if (won) { audio.playWin(); haptics.win(); }
    else { haptics.death(); }

    // Guardar score
    await saveScore(NEIGHBORHOOD_ID, game.score, game.playerTrail).catch(console.error);
    await clearProgress(NEIGHBORHOOD_ID).catch(console.error);

    showEndScreen(game, won);
}

// ── Share ─────────────────────────────────────────────────────────────────────────

function handleShare() {
    if (!game) return;
    generateShareImage(game.playerTrail, game.score, NEIGHBORHOOD_NAME, game.pelletsEaten);
}

// ── Restart ───────────────────────────────────────────────────────────────────────

function handleRestart() {
    hideOverlay('end-screen');
    ghosts.forEach(g => g.stop());
    stopGPS(gpsWatchId);
    audio.stopAll();
    isInitialized = false;
    playerPos = null;
    game = null;
    graph = null;
    ghosts = [];
    lastLayerUpdate = 0;
    // Recargar la página para un estado completamente limpio
    window.location.reload();
}

// ── Helpers ───────────────────────────────────────────────────────────────────────

function minGhostDistance(pos) {
    if (!ghosts.length || !pos) return Infinity;
    const playerPoint = turf.point([pos.lng, pos.lat]);
    return Math.min(...ghosts
        .filter(g => g.state !== 'dead')
        .map(g => turf.distance(
            playerPoint,
            turf.point([g.position.lng, g.position.lat]),
            { units: 'meters' }
        ))
    );
}

function ghostsAllFrightened() {
    return ghosts.every(g => g.state === 'frightened' || g.state === 'dead');
}

function showLoadingState(loading) {
    const btn = document.getElementById('btn-play');
    if (!btn) return;
    btn.textContent = loading ? '⏳ CARGANDO...' : '▶ JUGAR';
    btn.disabled = loading;
}

// ── Modo Demo (sin GPS, para pruebas en desktop) ──────────────────────────────────

function startDemoMode() {
    console.log('[GeoChomp] Modo Demo activado (sin GPS)');
    if (!game) {
        // Si el juego todavía no se creó (error al cargar datos), crear un estado mínimo
        console.log('[GeoChomp] Demo: datos no cargados, mostrando mapa base');
        if (map.loaded()) {
            map.flyTo({ center: [-3.7037, 40.4226], zoom: 17.5 });
        } else {
            map.once('load', () => map.flyTo({ center: [-3.7037, 40.4226], zoom: 17.5 }));
        }
        return;
    }
    if (game.phase === 'idle') {
        game.start();
        map.flyTo({ center: [-3.7037, 40.4226], zoom: 17.5 });
        ghosts.forEach(g => g.startMoving(() => ({
            lat: 40.4226,
            lng: -3.7037 + (Math.random() - 0.5) * 0.001
        }), GHOST_INTERVAL_MS));
        playerPos = { lat: 40.4226, lng: -3.7037 };
        updatePlayerLayer(map, playerPos);
        updateGPSIndicator(999);
    }
}

// ── Controles de teclado (demo / desktop) ─────────────────────────────────────────
// Moves ~5 meters per keypress. At latitude 40°N:
//   1° lat ≈ 111 000 m  →  5 m ≈ 0.000045°
//   1° lng ≈  85 200 m  →  5 m ≈ 0.000059°
const KEY_STEP_LAT = 0.000045;
const KEY_STEP_LNG = 0.000059;

const MOVE_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'w', 'a', 's', 'd',
    'W', 'A', 'S', 'D',
]);

const keysHeld = new Set();
let keyMoveInterval = null;

function applyKeyMovement() {
    if (!playerPos || !game || game.phase !== 'playing') return;

    let dLat = 0, dLng = 0;
    if (keysHeld.has('ArrowUp')    || keysHeld.has('w') || keysHeld.has('W')) dLat += KEY_STEP_LAT;
    if (keysHeld.has('ArrowDown')  || keysHeld.has('s') || keysHeld.has('S')) dLat -= KEY_STEP_LAT;
    if (keysHeld.has('ArrowRight') || keysHeld.has('d') || keysHeld.has('D')) dLng += KEY_STEP_LNG;
    if (keysHeld.has('ArrowLeft')  || keysHeld.has('a') || keysHeld.has('A')) dLng -= KEY_STEP_LNG;

    if (dLat === 0 && dLng === 0) return;

    const newPos = { lat: playerPos.lat + dLat, lng: playerPos.lng + dLng };
    handleGPSUpdate(newPos, 5);
    map.panTo([newPos.lng, newPos.lat], { duration: 80 });
}

document.addEventListener('keydown', (e) => {
    if (!MOVE_KEYS.has(e.key)) return;
    // Prevent the map from panning via its own key bindings
    e.preventDefault();

    if (keysHeld.has(e.key)) return;   // already held

    keysHeld.add(e.key);

    if (!keyMoveInterval) {
        applyKeyMovement();   // immediate first step
        keyMoveInterval = setInterval(applyKeyMovement, 150);
    }
});

document.addEventListener('keyup', (e) => {
    keysHeld.delete(e.key);
    if (keysHeld.size === 0 && keyMoveInterval) {
        clearInterval(keyMoveInterval);
        keyMoveInterval = null;
    }
});

// ── Arrancar ──────────────────────────────────────────────────────────────────────
main().catch(console.error);

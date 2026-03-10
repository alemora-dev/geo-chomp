// ui.js — HUD, overlays y eventos de botones

// ── HUD ──────────────────────────────────────────────────────────────────────────

export function updateHUD(game) {
    const scoreEl = document.getElementById('score-value');
    const pelletsEl = document.getElementById('pellets-remaining');
    if (scoreEl) scoreEl.textContent = game.score.toLocaleString();
    if (pelletsEl) pelletsEl.textContent = game.pelletsRemaining();

    // Vidas
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`life-${i}`);
        if (el) el.classList.toggle('lost', i > game.lives);
    }
}

export function updateGPSIndicator(accuracy) {
    const dot = document.getElementById('gps-dot');
    const text = document.getElementById('gps-accuracy-text');
    if (!dot || !text) return;

    dot.classList.remove('inactive', 'active', 'good', 'poor');

    if (accuracy === null) {
        dot.classList.add('inactive');
        text.textContent = 'GPS...';
    } else if (accuracy <= 15) {
        dot.classList.add('good');
        text.textContent = `±${Math.round(accuracy)}m`;
    } else if (accuracy <= 40) {
        dot.classList.add('poor');
        text.textContent = `±${Math.round(accuracy)}m`;
    } else {
        dot.classList.add('inactive');
        text.textContent = `±${Math.round(accuracy)}m`;
    }
}

// ── Overlays ─────────────────────────────────────────────────────────────────────

export function showOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

export function hideOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

export function showEndScreen(game, won) {
    const emojiEl = document.getElementById('end-emoji');
    const titleEl = document.getElementById('end-title');
    const scoreEl = document.getElementById('end-score');
    const pelletsEl = document.getElementById('end-pellets');

    if (emojiEl) emojiEl.textContent = won ? '🏆' : '💀';
    if (titleEl) {
        titleEl.textContent = won ? '¡GANASTE!' : 'GAME OVER';
        titleEl.style.color = won ? '#FFD700' : '#FF3333';
    }
    if (scoreEl) scoreEl.textContent = game.score.toLocaleString();
    if (pelletsEl) pelletsEl.textContent = game.pelletsEaten;

    // Actualizar score en pantalla de pausa también
    const pauseScoreEl = document.getElementById('pause-score');
    if (pauseScoreEl) pauseScoreEl.textContent = game.score.toLocaleString();

    showOverlay('end-screen');
}

// ── Ghost Alert ───────────────────────────────────────────────────────────────────

let ghostAlertTimeout = null;

export function showGhostAlert(show) {
    const el = document.getElementById('ghost-alert');
    if (!el) return;
    if (show) {
        el.classList.remove('hidden');
        clearTimeout(ghostAlertTimeout);
    } else {
        el.classList.add('hidden');
    }
}

// ── Frightened Banner ─────────────────────────────────────────────────────────────

export function showFrightenedBanner(durationMs = 8000) {
    const el = document.getElementById('frightened-banner');
    if (!el) return;
    el.classList.remove('hidden');
    // Resetear animación
    el.style.animation = 'none';
    void el.offsetWidth;  // reflow
    el.style.animation = `bannerFade ${durationMs / 1000}s forwards`;
    setTimeout(() => el.classList.add('hidden'), durationMs);
}

// ── Score Popup (floating text) ───────────────────────────────────────────────────

export function showScorePopup(text, color = '#FFD700') {
    const popup = document.createElement('div');
    popup.textContent = text;
    popup.style.cssText = `
    position: fixed;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    font-family: 'Press Start 2P', monospace;
    font-size: 14px;
    color: ${color};
    text-shadow: 0 0 15px ${color};
    pointer-events: none;
    animation: floatUp 1.2s ease-out forwards;
  `;
    document.body.appendChild(popup);

    // Inyectar keyframe si no existe
    if (!document.getElementById('float-style')) {
        const style = document.createElement('style');
        style.id = 'float-style';
        style.textContent = `@keyframes floatUp {
      0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
    }`;
        document.head.appendChild(style);
    }

    setTimeout(() => popup.remove(), 1200);
}

// ── Inicializar listeners de botones ─────────────────────────────────────────────

export function initUIListeners({ onPlay, onPause, onResume, onAbandon, onShareEnd, onRestart }) {
    document.getElementById('btn-play')?.addEventListener('click', onPlay);
    document.getElementById('btn-pause')?.addEventListener('click', onPause);
    document.getElementById('btn-resume')?.addEventListener('click', onResume);
    document.getElementById('btn-abandon')?.addEventListener('click', onAbandon);
    document.getElementById('btn-share')?.addEventListener('click', onShareEnd);
    document.getElementById('btn-share-end')?.addEventListener('click', onShareEnd);
    document.getElementById('btn-restart')?.addEventListener('click', onRestart);
}

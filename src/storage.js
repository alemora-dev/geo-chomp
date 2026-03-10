// storage.js — Persistencia local via IndexedDB (usando idb-keyval CDN)

// idb-keyval está cargado como UMD global: window.idbKeyval
function getStore() {
    if (typeof idbKeyval !== 'undefined') return idbKeyval;
    // Fallback a localStorage si idb-keyval no carga
    console.warn('[Storage] idb-keyval no disponible, usando localStorage');
    return {
        get: async (key) => {
            try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
        },
        set: async (key, val) => {
            try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
        },
    };
}

export async function saveScore(neighborhoodId, score, trail) {
    const store = getStore();
    const key = `scores_${neighborhoodId}`;
    const existing = (await store.get(key)) || [];
    existing.push({ score, date: Date.now(), pelletsOnTrail: trail.length });
    existing.sort((a, b) => b.score - a.score);
    await store.set(key, existing.slice(0, 10));  // Top 10 scores
}

export async function getScores(neighborhoodId) {
    const store = getStore();
    return (await store.get(`scores_${neighborhoodId}`)) || [];
}

export async function saveProgress(neighborhoodId, state) {
    const store = getStore();
    await store.set(`progress_${neighborhoodId}`, {
        pelletsEaten: state.pelletsEaten,
        score: state.score,
        lives: state.lives,
        savedAt: Date.now(),
    });
}

export async function loadProgress(neighborhoodId) {
    const store = getStore();
    return await store.get(`progress_${neighborhoodId}`);
}

export async function clearProgress(neighborhoodId) {
    const store = getStore();
    await store.set(`progress_${neighborhoodId}`, null);
}

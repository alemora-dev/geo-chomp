// audio.js — Sonidos del juego con Howler.js
// Los archivos MP3 deben estar en assets/sounds/

export function initAudio() {
    // Verificar si Howler está disponible (CDN puede fallar offline)
    if (typeof Howl === 'undefined') {
        console.warn('[Audio] Howler.js no disponible, sonido desactivado');
        return createNoOpAudio();
    }

    let audioEnabled = true;

    const sounds = {
        chomp: new Howl({
            src: ['assets/sounds/chomp.mp3'],
            volume: 0.5,
            onloaderror: () => console.warn('[Audio] chomp.mp3 no encontrado')
        }),
        power: new Howl({
            src: ['assets/sounds/power_pellet.mp3'],
            volume: 0.7,
            onloaderror: () => console.warn('[Audio] power_pellet.mp3 no encontrado')
        }),
        ghostEaten: new Howl({
            src: ['assets/sounds/ghost_eaten.mp3'],
            volume: 0.8,
            onloaderror: () => console.warn('[Audio] ghost_eaten.mp3 no encontrado')
        }),
        death: new Howl({
            src: ['assets/sounds/death.mp3'],
            volume: 1.0,
            onloaderror: () => console.warn('[Audio] death.mp3 no encontrado')
        }),
        siren: new Howl({
            src: ['assets/sounds/siren.mp3'],
            loop: true,
            volume: 0,
            onloaderror: () => console.warn('[Audio] siren.mp3 no encontrado')
        }),
        won: new Howl({
            src: ['assets/sounds/power_pellet.mp3'],  // Reusar como fanfare temporal
            volume: 1.0,
            rate: 1.5,
        }),
    };

    return {
        playChomp: () => {
            if (!audioEnabled) return;
            if (sounds.chomp.state() === 'loaded') sounds.chomp.play();
        },
        playPower: () => {
            if (!audioEnabled) return;
            if (sounds.power.state() === 'loaded') sounds.power.play();
        },
        playGhostEaten: () => {
            if (!audioEnabled) return;
            if (sounds.ghostEaten.state() === 'loaded') sounds.ghostEaten.play();
        },
        playDeath: () => {
            if (!audioEnabled) return;
            sounds.siren.stop();
            if (sounds.death.state() === 'loaded') sounds.death.play();
        },
        playWin: () => {
            if (!audioEnabled) return;
            sounds.siren.stop();
            sounds.won.play();
        },
        setSirenIntensity: (distanceToNearestGhostMeters) => {
            if (!audioEnabled) return;
            if (sounds.siren.state() !== 'loaded') return;
            // Entre 0 y 80 metros → volumen de 0 a 0.6
            const vol = Math.max(0, Math.min(0.6, 0.6 * (1 - distanceToNearestGhostMeters / 80)));
            sounds.siren.volume(vol);
            if (vol > 0.02 && !sounds.siren.playing()) sounds.siren.play();
            if (vol <= 0.02 && sounds.siren.playing()) sounds.siren.stop();
        },
        stopAll: () => {
            Object.values(sounds).forEach(s => s.stop());
        },
        setEnabled: (val) => { audioEnabled = val; },
        isEnabled: () => audioEnabled,
    };
}

// No-op cuando Howler no está disponible
function createNoOpAudio() {
    const noop = () => { };
    return {
        playChomp: noop, playPower: noop, playGhostEaten: noop,
        playDeath: noop, playWin: noop, setSirenIntensity: noop,
        stopAll: noop, setEnabled: noop, isEnabled: () => false,
    };
}

// haptics.js — Vibración háptica via Navigator.vibrate

export const haptics = {
    // Pulsito corto: comer pellet
    chomp: () => navigator.vibrate?.([25]),

    // Doble pulso: power pellet
    powerPellet: () => navigator.vibrate?.([80, 40, 80]),

    // Alerta de fantasma cercano
    ghostNear: () => navigator.vibrate?.([150, 80, 150]),

    // Comer un fantasma
    eatGhost: () => navigator.vibrate?.([50, 30, 50, 30, 50]),

    // Muerte del jugador
    death: () => navigator.vibrate?.([400, 100, 400]),

    // Victoria
    win: () => navigator.vibrate?.([100, 50, 100, 50, 300]),

    // Apagar vibración si el usuario lo desea
    cancel: () => navigator.vibrate?.(0),
};

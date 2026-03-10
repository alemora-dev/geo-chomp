#!/usr/bin/env node
// scripts/generate_local.js — Genera malasana.geojson usando calles hardcodeadas
// (alternativa offline al script Overpass cuando no hay red)
// Ejecutar: node scripts/generate_local.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../data/neighborhoods/malasana.geojson');

// ── Calles reales de Malasaña (coordenadas [lng, lat]) ────────────────────────────
// Fuente: trazado manual sobre OSM de las principales calles del barrio

const STREETS_RAW = [
    // Calle Fuencarral (eje norte-sur)
    { name: 'Calle Fuencarral', coords: [[-3.7027, 40.4168], [-3.7025, 40.4185], [-3.7023, 40.4202], [-3.7021, 40.4220], [-3.7019, 40.4237], [-3.7017, 40.4255]] },
    // Calle de la Palma
    { name: 'Calle de la Palma', coords: [[-3.7080, 40.4230], [-3.7060, 40.4228], [-3.7040, 40.4226], [-3.7020, 40.4224], [-3.7000, 40.4222]] },
    // Calle del Pez
    { name: 'Calle del Pez', coords: [[-3.7078, 40.4218], [-3.7058, 40.4216], [-3.7038, 40.4214], [-3.7018, 40.4212]] },
    // Calle de San Bernardo
    { name: 'Calle de San Bernardo', coords: [[-3.7075, 40.4250], [-3.7073, 40.4235], [-3.7071, 40.4220], [-3.7069, 40.4205], [-3.7067, 40.4190]] },
    // Calle Corredera Baja de San Pablo
    { name: 'Corredera Baja de San Pablo', coords: [[-3.7070, 40.4241], [-3.7050, 40.4239], [-3.7030, 40.4237], [-3.7010, 40.4235]] },
    // Calle Corredera Alta de San Pablo
    { name: 'Corredera Alta de San Pablo', coords: [[-3.7072, 40.4253], [-3.7052, 40.4251], [-3.7032, 40.4249], [-3.7012, 40.4247]] },
    // Calle Espíritu Santo
    { name: 'Calle Espíritu Santo', coords: [[-3.7055, 40.4232], [-3.7053, 40.4218], [-3.7051, 40.4204], [-3.7049, 40.4190]] },
    // Calle Divino Pastor
    { name: 'Calle Divino Pastor', coords: [[-3.7065, 40.4238], [-3.7045, 40.4236], [-3.7025, 40.4234], [-3.7005, 40.4232]] },
    // Calle del Ruiz
    { name: 'Calle del Ruiz', coords: [[-3.7062, 40.4245], [-3.7042, 40.4243], [-3.7022, 40.4241], [-3.7002, 40.4239]] },
    // Calle de la Puebla
    { name: 'Calle de la Puebla', coords: [[-3.7045, 40.4210], [-3.7043, 40.4195], [-3.7041, 40.4180], [-3.7039, 40.4165]] },
    // Gran Vía (límite sur)
    { name: 'Gran Vía', coords: [[-3.7100, 40.4198], [-3.7080, 40.4196], [-3.7060, 40.4195], [-3.7040, 40.4194], [-3.7020, 40.4193], [-3.7000, 40.4192]] },
    // Calle de Barceló
    { name: 'Calle de Barceló', coords: [[-3.7040, 40.4262], [-3.7020, 40.4260], [-3.7000, 40.4258], [-3.6980, 40.4256]] },
    // Calle de San Vicente Ferrer
    { name: 'Calle de San Vicente Ferrer', coords: [[-3.7060, 40.4255], [-3.7058, 40.4240], [-3.7056, 40.4225], [-3.7054, 40.4210]] },
    // Calle Velarde
    { name: 'Calle Velarde', coords: [[-3.7068, 40.4258], [-3.7048, 40.4256], [-3.7028, 40.4254], [-3.7008, 40.4252]] },
    // Calle del Noviciado
    { name: 'Calle del Noviciado', coords: [[-3.7090, 40.4242], [-3.7070, 40.4240], [-3.7050, 40.4238]] },
    // Calle de la Luna
    { name: 'Calle de la Luna', coords: [[-3.7050, 40.4220], [-3.7030, 40.4218], [-3.7010, 40.4216], [-3.6990, 40.4214]] },
    // Calle de la Madera
    { name: 'Calle de la Madera', coords: [[-3.7035, 40.4228], [-3.7033, 40.4215], [-3.7031, 40.4202], [-3.7029, 40.4189]] },
    // Calle del Tesoro
    { name: 'Calle del Tesoro', coords: [[-3.7055, 40.4248], [-3.7035, 40.4246], [-3.7015, 40.4244]] },
    // Travesía de San Mateo
    { name: 'Travesía de San Mateo', coords: [[-3.7010, 40.4248], [-3.7008, 40.4258], [-3.7006, 40.4268]] },
    // Calle de San Mateo
    { name: 'Calle de San Mateo', coords: [[-3.7000, 40.4230], [-3.6998, 40.4245], [-3.6996, 40.4260]] },
];

// ── Generar features ─────────────────────────────────────────────────────────────

const streets = {
    type: 'FeatureCollection',
    features: STREETS_RAW.map(s => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: s.coords },
        properties: { name: s.name, highway: 'residential' }
    }))
};

// ── Generar pellets ──────────────────────────────────────────────────────────────

function dist2D(a, b) {
    const dLng = (b[0] - a[0]) * 111320 * Math.cos(a[1] * Math.PI / 180);
    const dLat = (b[1] - a[1]) * 111320;
    return Math.sqrt(dLng * dLng + dLat * dLat);
}

function interpolateOnLine(coords, step = 12) {
    const points = [];
    let accumulated = 0;
    let nextTarget = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        const segLen = dist2D(coords[i], coords[i + 1]);
        while (nextTarget <= accumulated + segLen) {
            const frac = segLen > 0 ? (nextTarget - accumulated) / segLen : 0;
            const lng = coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]);
            const lat = coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]);
            points.push([lng, lat]);
            nextTarget += step;
        }
        accumulated += segLen;
    }
    return points;
}

const smallPelletCoords = [];
const powerPelletCoords = [];

streets.features.forEach(f => {
    const coords = f.geometry.coordinates;
    const pts = interpolateOnLine(coords, 12);
    smallPelletCoords.push(...pts);

    // Power pellet en el punto medio de cada calle
    const mid = coords[Math.floor(coords.length / 2)];
    powerPelletCoords.push(mid);
});

// Deduplicar power pellets (min 80m)
const uniquePower = [];
for (const pp of powerPelletCoords) {
    const tooClose = uniquePower.some(u => dist2D(pp, u) < 80);
    if (!tooClose) uniquePower.push(pp);
}

const smallPellets = {
    type: 'FeatureCollection',
    features: smallPelletCoords.map(c => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: { type: 'small', eaten: false }
    }))
};

const powerPellets = {
    type: 'FeatureCollection',
    features: uniquePower.map(c => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: { type: 'power', eaten: false }
    }))
};

// ── Escribir output ──────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
const output = { streets, smallPellets, powerPellets };
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));

const sizeKB = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
console.log(`✅ malasana.geojson generado:`);
console.log(`   ${streets.features.length} calles`);
console.log(`   ${smallPellets.features.length} pellets pequeños`);
console.log(`   ${powerPellets.features.length} power pellets`);
console.log(`   Tamaño: ${sizeKB} KB → ${OUTPUT_PATH}`);

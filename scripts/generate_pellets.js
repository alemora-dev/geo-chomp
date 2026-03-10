#!/usr/bin/env node
// scripts/generate_pellets.js
// Descarga calles de Malasaña vía Overpass API y genera pellets.
// Ejecutar: node scripts/generate_pellets.js
// Requiere: Node.js 18+ (fetch nativo)

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../data/neighborhoods/malasana.geojson');

// BBox de Malasaña, Madrid
const BBOX = '40.4150,-3.7100,40.4300,-3.6920';

const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["highway"~"^(residential|tertiary|secondary|footway|path|pedestrian|living_street|service)$"]
    (${BBOX});
);
out geom;
`.trim();

async function downloadStreets() {
    console.log('[1/3] Descargando calles de Overpass API...');
    const url = 'https://overpass-api.de/api/interpreter';
    const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
    return res.json();
}

function osmToGeoJSON(osmData) {
    const features = [];
    for (const el of osmData.elements) {
        if (el.type !== 'way' || !el.geometry) continue;
        const coords = el.geometry.map(pt => [pt.lon, pt.lat]);
        if (coords.length < 2) continue;
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { highway: el.tags?.highway || 'unknown', name: el.tags?.name || '' }
        });
    }
    return { type: 'FeatureCollection', features };
}

function generatePellets(streets) {
    console.log('[2/3] Generando pellets...');
    const smallPellets = [];
    const powerPellets = [];

    streets.features.forEach(feature => {
        if (feature.geometry.type !== 'LineString') return;
        const coords = feature.geometry.coordinates;
        const line = feature;

        // Longitud de la calle en metros (aproximación simple)
        let totalLength = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            const dLng = (coords[i + 1][0] - coords[i][0]) * 111320 * Math.cos(coords[i][1] * Math.PI / 180);
            const dLat = (coords[i + 1][1] - coords[i][1]) * 111320;
            totalLength += Math.sqrt(dLng * dLng + dLat * dLat);
        }

        // Pellets cada 12 metros
        const step = 12;
        const count = Math.floor(totalLength / step);
        for (let k = 0; k <= count; k++) {
            const t = count === 0 ? 0 : k / count;
            // Interpolación lineal a lo largo de la polilínea
            let accum = 0; let ci = 0;
            for (let i = 0; i < coords.length - 1; i++) {
                const dLng = (coords[i + 1][0] - coords[i][0]) * 111320 * Math.cos(coords[i][1] * Math.PI / 180);
                const dLat = (coords[i + 1][1] - coords[i][1]) * 111320;
                const segLen = Math.sqrt(dLng * dLng + dLat * dLat);
                if (accum + segLen >= t * totalLength) {
                    const rem = t * totalLength - accum;
                    const frac = segLen > 0 ? rem / segLen : 0;
                    const lng = coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]);
                    const lat = coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]);
                    smallPellets.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [lng, lat] },
                        properties: { type: 'small', eaten: false }
                    });
                    break;
                }
                accum += segLen;
            }
        }

        // Power pellet en el midpoint de cada calle
        const mid = Math.floor(coords.length / 2);
        powerPellets.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords[mid] },
            properties: { type: 'power', eaten: false }
        });
    });

    // Deduplicar power pellets demasiado cercanos (mínimo 80m de separación)
    const dedupedPower = [];
    for (const pp of powerPellets) {
        const [lng, lat] = pp.geometry.coordinates;
        const tooClose = dedupedPower.some(existing => {
            const dLng = (lng - existing.geometry.coordinates[0]) * 111320 * Math.cos(lat * Math.PI / 180);
            const dLat = (lat - existing.geometry.coordinates[1]) * 111320;
            return Math.sqrt(dLng * dLng + dLat * dLat) < 80;
        });
        if (!tooClose) dedupedPower.push(pp);
    }

    console.log(`    ${smallPellets.length} pellets pequeños`);
    console.log(`    ${dedupedPower.length} power pellets`);

    return {
        smallPellets: { type: 'FeatureCollection', features: smallPellets },
        powerPellets: { type: 'FeatureCollection', features: dedupedPower }
    };
}

async function main() {
    try {
        const osmData = await downloadStreets();
        const streets = osmToGeoJSON(osmData);
        console.log(`    ${streets.features.length} calles descargadas`);

        const { smallPellets, powerPellets } = generatePellets(streets);

        const output = { streets, smallPellets, powerPellets };
        fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));

        const sizeKB = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
        console.log(`[3/3] Guardado en ${OUTPUT_PATH} (${sizeKB} KB)`);

        if (sizeKB > 500) {
            console.warn('⚠️  El archivo supera 500KB. Considera simplificar con mapshaper.');
        }
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();

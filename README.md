# GeoChomp 👻

> **Pac-Man GPS real.** Camina por las calles de tu barrio, come pellets y escapa de los fantasmas.

**Stack:** HTML + Vanilla JS ES Modules + MapLibre GL JS + Turf.js + Howler.js  
**Cero backend. Cero autenticación. Cero frameworks.**

---

## Cómo jugarlo

1. Abre `index.html` desde un servidor local:
   ```bash
   python3 -m http.server 8080
   # o
   npx serve .
   ```
2. Ve a `http://localhost:8080` en Chrome o Safari (móvil o desktop).
3. Acepta el permiso de ubicación cuando lo solicite.
4. Camina por el barrio y come los pellets dorados.
5. Recoge los **Power Pellets** grandes para que los fantasmas se vuelvan vulnerables.
6. Al terminar, descarga tu imagen para Instagram Stories con el botón **SHARE**.

---

## Estructura del Proyecto

```
geo-chomp/
├── index.html               # Entry point
├── style.css                # Estilos arcade (modo oscuro)
├── src/
│   ├── main.js              # Game loop principal
│   ├── map.js               # MapLibre GL JS: mapa oscuro + capas del juego
│   ├── gps.js               # Geolocation API + filtro Kalman + snap-to-road
│   ├── graph.js             # Grafo de calles + A* pathfinding
│   ├── ghosts.js            # IA de fantasmas (Blinky + Pinky)
│   ├── game.js              # Estado del juego: score, vidas, pellets
│   ├── audio.js             # Sonidos con Howler.js
│   ├── haptics.js           # Vibración (Navigator.vibrate)
│   ├── storage.js           # IndexedDB: scores y progreso
│   ├── share.js             # Canvas 9:16 para Instagram Stories
│   └── ui.js                # HUD, overlays, botones
├── data/neighborhoods/
│   └── malasana.geojson     # Calles + pellets de Malasaña, Madrid
├── assets/sounds/           # Archivos MP3 (reemplazar con sonidos reales)
├── scripts/
│   ├── generate_pellets.js  # Genera GeoJSON desde Overpass API (requiere red)
│   └── generate_local.js    # Genera GeoJSON local (sin red, con calles hardcodeadas)
└── README.md
```

---

## Añadir un nuevo barrio

1. Obtener el bounding box del barrio (lat_min, lng_min, lat_max, lng_max).
2. Editar `scripts/generate_pellets.js` con el nuevo BBox.
3. Ejecutar: `node scripts/generate_pellets.js`
4. Copiar el GeoJSON generado a `data/neighborhoods/<barrio>.geojson`.
5. En `src/main.js`, actualizar `DATA_URL` y `NEIGHBORHOOD_NAME`.

---

## GPS y Snap-to-Road

El GPS de ciudad es ruidoso (+10-20m de error). GeoChomp implementa:
- **Filtro Kalman simplificado** en `gps.js` para suavizar lecturas.
- **Snap-to-road** con `turf.nearestPointOnLine` (máximo 30m de snap).

---

## Reemplazar audio

Los archivos en `assets/sounds/` son placeholders silenciosos. Reemplázalos con:
- **chomp.mp3** — Sonido corto de comer (ej. sonido de waka-waka)
- **power_pellet.mp3** — Efecto de poder activado
- **ghost_eaten.mp3** — Sonido de fantasma comido
- **death.mp3** — Música de muerte
- **siren.mp3** — Sirena de peligro (bucle)

Fuente gratuita recomendada: [freesound.org](https://freesound.org) con licencia CC0.

---

## Deploy

```bash
# GitHub Pages (gratis)
git push origin main
# Settings → Pages → Deploy from main branch

# Vercel (recomendado)
npx vercel deploy
```

---

*Basado en el blueprint técnico GEOCHOMP_BLUEPRINT.md*

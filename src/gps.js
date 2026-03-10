// gps.js — Geolocation API con filtro Kalman + snap-to-road (Turf.js)

// ── Filtro Kalman simplificado ───────────────────────────────────────────────────
export class KalmanGPS {
    constructor() {
        this.variance = -1;  // -1 = no inicializado
        this.timestamp = null;
        this.lat = 0;
        this.lng = 0;
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

        const dt = Math.max(0, (timestamp - this.timestamp) / 1000);  // segundos
        if (dt > 0) {
            // Aumentar incertidumbre con el tiempo (movimiento posible)
            this.variance += dt * 3 * 3;  // asumimos velocidad máxima peatonal ~3 m/s
            this.timestamp = timestamp;
        }

        const k = this.variance / (this.variance + accuracy * accuracy);
        this.lat += k * (lat - this.lat);
        this.lng += k * (lng - this.lng);
        this.variance = (1 - k) * this.variance;

        return { lat: this.lat, lng: this.lng };
    }

    reset() {
        this.variance = -1;
    }
}

// ── Snap-to-Road ─────────────────────────────────────────────────────────────────
export function snapToRoad(position, streetsGeoJSON) {
    if (!streetsGeoJSON || !streetsGeoJSON.features || streetsGeoJSON.features.length === 0) {
        return position;
    }

    const point = turf.point([position.lng, position.lat]);
    let minDist = Infinity;
    let snappedPoint = null;

    streetsGeoJSON.features.forEach(street => {
        if (street.geometry.type !== 'LineString') return;
        try {
            const snapped = turf.nearestPointOnLine(street, point, { units: 'meters' });
            if (snapped.properties.dist < minDist) {
                minDist = snapped.properties.dist;
                snappedPoint = snapped;
            }
        } catch (e) {
            // Ignorar features problemáticas
        }
    });

    // Si el GPS está a más de 30m de cualquier calle, no snapeamos
    // (edificio o GPS muy malo)
    if (minDist > 30 || !snappedPoint) return position;

    return {
        lat: snappedPoint.geometry.coordinates[1],
        lng: snappedPoint.geometry.coordinates[0],
    };
}

// ── Watcher GPS ──────────────────────────────────────────────────────────────────
export function startGPS(onUpdate, onError) {
    if (!navigator.geolocation) {
        onError(new Error('Geolocation no disponible en este navegador'));
        return null;
    }

    const kalman = new KalmanGPS();

    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            const filtered = kalman.filter(latitude, longitude, accuracy, pos.timestamp);
            if (filtered) onUpdate(filtered, accuracy);
        },
        (err) => {
            console.error('[GPS Error]', err);
            onError(err);
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 1500,  // Acepta posición de hasta 1.5 segundos de antigüedad
        }
    );

    return watchId;
}

export function stopGPS(watchId) {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
}

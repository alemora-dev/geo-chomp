// share.js — Exportar imagen Stories 9:16 con canvas

export function generateShareImage(playerTrail, score, neighborhoodName, pelletsEaten) {
    // Canvas 1080×1920 (formato Instagram Stories 9:16)
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // Fondo negro
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1080, 1920);

    // Grid sutil (estética arcade)
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1080; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1920); ctx.stroke();
    }
    for (let y = 0; y < 1920; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke();
    }

    // Dibujar trail del jugador
    if (playerTrail.length > 1) {
        const lngs = playerTrail.map(p => p[0]);
        const lats = playerTrail.map(p => p[1]);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);

        const padX = 120, padY = 320;
        const areaW = 1080 - padX * 2;
        const areaH = 1400 - padY;
        const spanLng = maxLng - minLng || 0.001;
        const spanLat = maxLat - minLat || 0.001;

        const toCanvas = (lng, lat) => ({
            x: padX + ((lng - minLng) / spanLng) * areaW,
            y: padY + ((maxLat - lat) / spanLat) * areaH,
        });

        // Sombra / glow del trail
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const start = toCanvas(playerTrail[0][0], playerTrail[0][1]);
        ctx.moveTo(start.x, start.y);
        playerTrail.forEach(point => {
            const p = toCanvas(point[0], point[1]);
            ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Punto de inicio (verde)
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#44FF88';
        ctx.fillStyle = '#44FF88';
        ctx.beginPath();
        ctx.arc(start.x, start.y, 10, 0, Math.PI * 2);
        ctx.fill();

        // Punto final (rojo)
        const end = toCanvas(playerTrail[playerTrail.length - 1][0], playerTrail[playerTrail.length - 1][1]);
        ctx.shadowColor = '#FF3333';
        ctx.fillStyle = '#FF3333';
        ctx.beginPath();
        ctx.arc(end.x, end.y, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    // Resetear sombra
    ctx.shadowBlur = 0;

    // Separador
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 1620); ctx.lineTo(1000, 1620);
    ctx.stroke();

    // Score
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 30;
    ctx.font = 'bold 100px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${score.toLocaleString()} pts`, 540, 1720);

    // Pellets comidos
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '36px monospace';
    ctx.fillText(`🍬 ${pelletsEaten} pellets`, 540, 1790);

    // Nombre del barrio
    ctx.fillStyle = '#888888';
    ctx.font = '32px monospace';
    ctx.fillText(`📍 ${neighborhoodName}`, 540, 1840);

    // Branding
    ctx.fillStyle = '#444444';
    ctx.font = '28px monospace';
    ctx.fillText('GeoChomp — geochomp.app', 540, 1900);

    // Logo emoji en la parte superior
    ctx.font = '120px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👻', 540, 220);

    // Título
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 40;
    ctx.font = 'bold 80px monospace';
    ctx.fillText('GEOCHOMP', 540, 310);
    ctx.shadowBlur = 0;

    // Descargar como PNG
    canvas.toBlob(blob => {
        if (!blob) { console.error('[Share] Error al generar blob'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `geochomp_${score}pts.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
}

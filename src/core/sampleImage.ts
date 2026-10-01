// A procedurally drawn picture for the guided tour, so a first-time visitor can
// see every tool working before they have picked a photo of their own. It mixes
// what the codec reacts to: smooth gradients (big lazy blocks), hard edges and
// fine stripes (dense splitting), and saturated color (hue damage).

export const makeSampleImage = (width = 1200, height = 800): ImageData => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d')!;

    // sky
    const sky = g.createLinearGradient(0, 0, 0, height * 0.62);
    sky.addColorStop(0, '#1b1446');
    sky.addColorStop(0.55, '#c2366b');
    sky.addColorStop(1, '#ffb347');
    g.fillStyle = sky;
    g.fillRect(0, 0, width, height);

    // sun with banded stripes
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = height * 0.26;
    const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
    sun.addColorStop(0, '#fff27a');
    sun.addColorStop(1, '#ff5e3a');
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = sun;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = '#c2366b';
    for (let i = 0; i < 7; i++) {
        const y = cy + r * 0.1 + i * r * 0.14;
        g.fillRect(cx - r, y, r * 2, 3 + i * 2.2);
    }
    g.restore();

    // mountains
    const ridge = (base: number, amp: number, color: string, seed: number) => {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, height);
        for (let x = 0; x <= width; x += width / 24) {
            const y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.011 + seed) * Math.cos(x * 0.004 + seed * 2));
            g.lineTo(x, y);
        }
        g.lineTo(width, height);
        g.closePath();
        g.fill();
    };
    ridge(height * 0.6, height * 0.2, '#4b1d5e', 1.3);
    ridge(height * 0.64, height * 0.12, '#2a0f3d', 4.1);

    // perspective grid floor
    const floorTop = height * 0.62;
    g.fillStyle = '#12061f';
    g.fillRect(0, floorTop, width, height - floorTop);
    g.strokeStyle = '#25e0c8';
    g.lineWidth = 2;
    for (let i = 1; i < 14; i++) {
        const t = Math.pow(i / 14, 1.8);
        const y = floorTop + t * (height - floorTop);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(width, y);
        g.stroke();
    }
    for (let i = -16; i <= 16; i++) {
        g.beginPath();
        g.moveTo(cx + i * 18, floorTop);
        g.lineTo(cx + i * 150, height);
        g.stroke();
    }

    // a few solid shapes to select with the wand and the marquee
    g.fillStyle = '#25e0c8';
    g.beginPath();
    g.arc(width * 0.16, height * 0.24, height * 0.07, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2f2e9';
    g.fillRect(width * 0.76, height * 0.14, height * 0.16, height * 0.16);

    // title
    g.font = `900 ${Math.round(height * 0.13)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = '#12061f';
    g.strokeText('GLIC', cx, height * 0.84);
    g.fillStyle = '#f2f2e9';
    g.fillText('GLIC', cx, height * 0.84);

    return g.getImageData(0, 0, width, height);
};

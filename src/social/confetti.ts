// A short confetti burst for a successful share. Lives on its own canvas on
// <body>, so it outlives the dialog that fired it and the route change after.

const COLORS = ['#f2a03d', '#56e332', '#16150f', '#ffd23f', '#ff5d8f', '#4cc9f0'];
const COUNT = 140;
const DURATION = 2600;

interface Piece {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    spin: number;
    w: number;
    h: number;
    color: string;
    tilt: number;
}

export function celebrate() {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas.remove();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // two cannons, bottom corners, aimed up and inward
    const pieces: Piece[] = Array.from({ length: COUNT }, (_, i) => {
        const left = i % 2 === 0;
        const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7;
        const speed = (0.9 + Math.random() * 0.6) * Math.min(H, 900) * 0.022;
        return {
            x: left ? W * 0.05 : W * 0.95,
            y: H + 10,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rot: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 0.3,
            w: 6 + Math.random() * 6,
            h: 3 + Math.random() * 4,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            tilt: Math.random() * Math.PI * 2,
        };
    });

    const start = performance.now();
    let last = start;
    const frame = (now: number) => {
        const t = now - start;
        // normalise to 60fps steps so high-refresh screens don't run it faster
        const k = Math.min((now - last) / 16.67, 3);
        last = now;
        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = t > DURATION - 600 ? Math.max(0, (DURATION - t) / 600) : 1;
        for (const p of pieces) {
            p.vy += 0.32 * k;
            p.vx *= Math.pow(0.985, k);
            p.vy *= Math.pow(0.985, k);
            p.x += p.vx * k;
            p.y += p.vy * k;
            p.rot += p.spin * k;
            p.tilt += 0.12 * k;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            // flutter: squash one axis as the piece "turns over"
            ctx.scale(1, Math.cos(p.tilt));
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        if (t < DURATION) requestAnimationFrame(frame);
        else canvas.remove();
    };
    requestAnimationFrame(frame);
}

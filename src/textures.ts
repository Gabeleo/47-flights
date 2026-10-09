import * as THREE from 'three';

// All textures are drawn procedurally at PS1-ish resolutions and sampled with nearest filtering.

export type Rand = () => number;
type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c: RGB, k = 0) => `rgb(${clamp255(c[0] + k)},${clamp255(c[1] + k)},${clamp255(c[2] + k)})`;
const scaleRGB = (c: RGB, s: number) => `rgb(${clamp255(c[0] * s)},${clamp255(c[1] * s)},${clamp255(c[2] * s)})`;

function canvasTexture(
  w: number,
  h: number,
  seed: number,
  draw: (c: Ctx, r: Rand) => void,
  mipmaps = true,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  draw(c, mulberry32(seed));
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mipmaps ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  t.generateMipmaps = mipmaps;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rect(c: Ctx, color: string, x: number, y: number, w: number, h: number) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

function grain(c: Ctx, r: Rand, w: number, h: number, base: RGB, amount: number, density = 1) {
  rect(c, rgb(base), 0, 0, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (r() < density) rect(c, rgb(base, (r() - 0.5) * 2 * amount), x, y, 1, 1);
}

function label(c: Ctx, text: string, x: number, y: number, size: number, color: string, weight = 'bold') {
  c.fillStyle = color;
  c.font = `${weight} ${size}px Helvetica, Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y);
}

function line(c: Ctx, color: string, pts: number[]) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pts[0] + 0.5, pts[1] + 0.5);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] + 0.5, pts[i + 1] + 0.5);
  c.stroke();
}

/** Brushed metal: vertical grain with a few bright streaks. */
function brushed(seed: number, base: RGB) {
  return canvasTexture(16, 32, seed, (c, r) => {
    for (let x = 0; x < 16; x++) rect(c, rgb(base, (r() - 0.5) * 22), x, 0, 1, 32);
    for (let i = 0; i < 30; i++) rect(c, 'rgba(255,255,255,0.08)', Math.floor(r() * 16), Math.floor(r() * 32), 1, 4);
  });
}

/**
 * Timber slats on a dark backing, running up the texture: four slats per 16px, each its own shade,
 * lit along one edge, with grain that drifts slowly along its length.
 */
function slats(seed: number) {
  return canvasTexture(16, 32, seed, (c, r) => {
    for (let k = 0; k < 4; k++) {
      const tone: RGB = [184 + (r() - 0.5) * 30, 112 + (r() - 0.5) * 20, 58 + (r() - 0.5) * 12];
      for (let x = 0; x < 3; x++) {
        let g = 0;
        for (let y = 0; y < 32; y++) {
          g = Math.max(-6, Math.min(6, g + (r() - 0.5) * 3));
          rect(c, rgb(tone, (x === 0 ? 16 : x === 2 ? -10 : 0) + g), k * 4 + x, y, 1, 1);
        }
      }
      rect(c, '#24160c', k * 4 + 3, 0, 1, 32);
    }
  });
}

/** Path round a w x h rectangle at (x, y) with corners of radius rad. */
function roundRect(c: Ctx, x: number, y: number, w: number, h: number, rad: number) {
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}

function codeScreen(seed: number) {
  return canvasTexture(64, 48, seed, (c, r) => {
    rect(c, '#1b1e27', 0, 0, 64, 48);
    rect(c, '#14161d', 0, 0, 9, 48);
    rect(c, '#262a35', 0, 0, 64, 3);
    rect(c, '#1b1e27', 10, 0, 14, 3);
    rect(c, '#252a37', 9, 27, 55, 2);
    const palette = ['#c792ea', '#82aaff', '#c3e88d', '#d6deeb', '#f78c6c', '#89ddff', '#5c6773'];
    let indent = 0;
    for (let y = 5; y < 46; y += 2) {
      rect(c, '#3a4052', 2, y, 4, 1);
      if (r() < 0.15) continue;
      indent = Math.max(0, Math.min(10, indent + (r() < 0.25 ? 2 : r() < 0.3 ? -2 : 0)));
      let x = 11 + indent;
      const tokens = 1 + Math.floor(r() * 4);
      for (let k = 0; k < tokens && x < 62; k++) {
        const len = 2 + Math.floor(r() * 9);
        rect(c, palette[Math.floor(r() * palette.length)], x, y, Math.min(len, 62 - x), 1);
        x += len + 1;
      }
    }
    rect(c, '#ffcc66', 30, 27, 1, 2);
  });
}

function dashboard(w: number, h: number, seed: number, title?: string) {
  return canvasTexture(w, h, seed, (c, r) => {
    rect(c, '#0d1116', 0, 0, w, h);
    const head = Math.max(3, Math.round(h * 0.1));
    rect(c, '#161c24', 0, 0, w, head);
    if (title) label(c, title, w / 2, head / 2 + 0.5, head - 1, '#8aa0b8', 'normal');
    const pw = Math.floor((w - 3) / 2);
    const ph = Math.floor((h - head - 3) / 2);
    const colors = ['#4ade80', '#60a5fa', '#fbbf24', '#f87171'];
    for (let py = 0; py < 2; py++)
      for (let px = 0; px < 2; px++) {
        const x0 = 1 + px * (pw + 1);
        const y0 = head + 1 + py * (ph + 1);
        rect(c, '#121820', x0, y0, pw, ph);
        for (let gy = y0 + 3; gy < y0 + ph; gy += 4) rect(c, '#18202a', x0, gy, pw, 1);
        const col = colors[py * 2 + px];
        const spike = py === 1 && px === 1;
        let v = 0.4 + r() * 0.2;
        for (let x = 0; x < pw - 2; x++) {
          v = Math.max(0.1, Math.min(0.8, v + (r() - 0.5) * 0.16));
          const val = spike && x > pw * 0.72 ? Math.min(0.95, v + 0.45) : v;
          const y = y0 + ph - 2 - Math.round(val * (ph - 4));
          rect(c, col + '30', x0 + 1 + x, y + 1, 1, y0 + ph - 2 - y);
          rect(c, col, x0 + 1 + x, y, 1, 1);
        }
      }
  });
}

function sign(w: number, h: number, seed: number, bg: string, fg: string, text: string, size: number) {
  return canvasTexture(w, h, seed, (c) => {
    rect(c, bg, 0, 0, w, h);
    label(c, text, w / 2, h / 2 + 0.5, size, fg);
  });
}

export function officeTextures() {
  return {
    carpet: canvasTexture(32, 32, 1, (c, r) => {
      grain(c, r, 32, 32, [50, 55, 66], 7);
      for (let ty = 0; ty < 2; ty++)
        for (let tx = 0; tx < 2; tx++) {
          const horiz = (tx + ty) % 2 === 0;
          for (let i = 1; i < 16; i += 3) {
            if (horiz) rect(c, 'rgba(80,88,104,0.28)', tx * 16, ty * 16 + i, 16, 1);
            else rect(c, 'rgba(80,88,104,0.28)', tx * 16 + i, ty * 16, 1, 16);
          }
        }
      for (const p of [0, 16]) {
        rect(c, 'rgba(14,16,20,0.55)', 0, p, 32, 1);
        rect(c, 'rgba(14,16,20,0.55)', p, 0, 1, 32);
      }
    }),
    ceiling: canvasTexture(32, 32, 2, (c, r) => {
      grain(c, r, 32, 32, [196, 192, 183], 9, 0.7);
      for (let i = 0; i < 50; i++) rect(c, 'rgba(110,104,96,0.5)', Math.floor(r() * 32), Math.floor(r() * 32), 1, 1);
      rect(c, '#8a877f', 0, 0, 32, 1);
      rect(c, '#8a877f', 0, 0, 1, 32);
    }),
    drywall: canvasTexture(32, 32, 3, (c, r) => grain(c, r, 32, 32, [158, 156, 150], 4, 0.5)),
    wood: canvasTexture(64, 32, 6, (c, r) => {
      for (let y = 0; y < 32; y++) {
        const k = Math.sin(y * 0.9 + r() * 0.5) * 10 + (r() - 0.5) * 8;
        rect(c, rgb([110 + k, 76 + k * 0.7, 51 + k * 0.5]), 0, y, 64, 1);
      }
      for (let i = 0; i < 60; i++)
        rect(c, 'rgba(40,24,14,0.35)', Math.floor(r() * 64), Math.floor(r() * 32), 4 + Math.floor(r() * 10), 1);
    }),
    metal: brushed(9, [140, 146, 154]),
    // Elevator hallway.
    slats: slats(50),
    hallTile: canvasTexture(32, 32, 51, (c, r) => {
      grain(c, r, 32, 32, [136, 132, 125], 5, 0.6);
      rect(c, '#5d5953', 0, 0, 32, 1);
      rect(c, '#5d5953', 0, 0, 1, 32);
    }),
    walkMat: canvasTexture(32, 32, 52, (c, r) => grain(c, r, 32, 32, [90, 82, 74], 6)),
    // A row of chevrons inlaid across the mat, on the mat itself: the band is cut into the mat, not laid on it.
    chevrons: canvasTexture(96, 5, 53, (c, r) => {
      grain(c, r, 96, 5, [90, 82, 74], 6);
      for (let x = 0; x < 96; x += 4) [2, 1, 0, 1, 2].forEach((dx, y) => rect(c, '#9c9386', x + dx, y, 2, 1));
    }),
    // The backlit floor number: a white panel with an amber edge, bronze digits near the top.
    floor47: canvasTexture(32, 80, 54, (c) => {
      c.fillStyle = '#ffb347';
      roundRect(c, 0, 0, 32, 80, 7);
      c.fill();
      c.fillStyle = '#fbf6ea';
      roundRect(c, 1, 1, 30, 78, 6);
      c.fill();
      label(c, '47', 16, 14, 15, '#9b6b3c', 'normal');
    }),
    // Floor and car engraved on each elevator door, on a clear background.
    carLabels: Array.from({ length: 6 }, (_, k) =>
      canvasTexture(16, 16, 55 + k, (c) => {
        label(c, '47', 8, 4.5, 5, '#c9ced6', 'normal');
        label(c, `A${k + 1}`, 8, 11, 6, '#c9ced6');
      }),
    ),
    // Destination call station: a small screen over a keypad on a champagne plate.
    callStation: canvasTexture(16, 32, 61, (c) => {
      rect(c, '#8f7d5a', 0, 0, 16, 32);
      rect(c, '#c8b58e', 1, 1, 14, 30);
      rect(c, '#16222b', 3, 3, 10, 8);
      for (let y = 5; y < 10; y += 2) rect(c, '#8fd0ff', 4, y, 4 + (y % 3), 1);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) rect(c, '#6f5f40', 3 + i * 4, 14 + j * 4, 2, 2);
    }),
    doorMetal: brushed(41, [74, 77, 84]),
    fabric: canvasTexture(16, 16, 10, (c, r) => {
      grain(c, r, 16, 16, [40, 42, 50], 8);
      for (let i = 0; i < 16; i += 2) rect(c, 'rgba(0,0,0,0.25)', i, 0, 1, 16);
    }),
    felt: canvasTexture(16, 16, 11, (c, r) => grain(c, r, 16, 16, [58, 104, 100], 8)),
    // Basket weave: 2x2 blocks of threads, alternately running across and down.
    weave: canvasTexture(16, 16, 38, (c, r) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const across = ((x >> 1) + (y >> 1)) % 2 === 0;
          const lit = (across ? y : x) % 2 === 0;
          rect(c, rgb([104, 146, 114], (lit ? 9 : -9) + (r() - 0.5) * 8), x, y, 1, 1);
        }
    }),
    sofa: canvasTexture(16, 16, 12, (c, r) => grain(c, r, 16, 16, [70, 78, 98], 8)),
    screenCode: codeScreen(15),
    screenCode2: codeScreen(16),
    screenDash: dashboard(64, 48, 17),
    screenLock: canvasTexture(64, 48, 18, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 48);
      g.addColorStop(0, '#173a44');
      g.addColorStop(1, '#0a1420');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 48);
      label(c, '2:13', 32, 21, 13, '#d8e6ee');
      label(c, 'HALCYON', 32, 35, 6, '#7fa3ae');
    }),
    bigDash: dashboard(128, 72, 19, 'prod-us-east-1 · on-call'),
    pnlDash: dashboard(128, 72, 20, 'desk risk · p&l intraday'),
    // NYN 24, a local all-night news channel, sound off: an anchor, a markets box, a lower third.
    // The ticker under it is its own texture so it can scroll.
    news: canvasTexture(128, 64, 39, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#16305a');
      g.addColorStop(1, '#0a1630');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 64);
      // Studio backdrop: a skyline at night behind the desk.
      for (const [x, w, h] of [[0, 9, 18], [10, 6, 26], [17, 10, 14], [28, 5, 30], [34, 9, 20], [44, 7, 24], [52, 11, 16], [64, 6, 28]])
        rect(c, '#0f2142', x, 42 - h, w, h);
      for (let x = 2; x < 70; x += 4) for (let y = 20; y < 40; y += 4) if ((x * 7 + y * 3) % 5 < 2) rect(c, '#c9a85a', x, y, 1, 1);
      // Anchor.
      c.fillStyle = '#1b1f28';
      c.beginPath();
      c.moveTo(22, 42);
      c.lineTo(28, 30);
      c.lineTo(48, 30);
      c.lineTo(54, 42);
      c.fill();
      c.fillStyle = '#e8e8ea';
      c.beginPath();
      c.moveTo(34, 30);
      c.lineTo(42, 30);
      c.lineTo(38, 37);
      c.fill();
      rect(c, '#8a1c22', 37, 31, 2, 7);
      rect(c, '#c49576', 35, 26, 6, 4);
      c.fillStyle = '#c49576';
      c.beginPath();
      c.ellipse(38, 21, 5, 6, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a1d16';
      c.beginPath();
      c.ellipse(38, 17, 5.5, 3.5, 0, Math.PI, 0);
      c.fill();
      rect(c, '#0c1a33', 14, 40, 48, 2);
      // Over-the-shoulder box: futures falling.
      rect(c, '#e8edf5', 72, 6, 50, 30);
      rect(c, '#0c1424', 73, 7, 48, 28);
      label(c, 'FUTURES', 97, 11, 6, '#e8edf5');
      line(c, '#2a3550', [75, 22, 119, 22]);
      line(c, '#ff4a3d', [75, 17, 82, 18, 88, 16, 95, 20, 101, 22, 106, 21, 111, 27, 115, 29, 119, 32]);
      // Corner bug.
      rect(c, '#c4161c', 104, 0, 24, 5);
      label(c, 'LIVE', 116, 3, 5, '#ffffff');
      // Lower third.
      rect(c, '#c4161c', 0, 44, 34, 10);
      label(c, 'BREAKING', 17, 49.5, 6, '#ffffff');
      rect(c, '#f2f4f7', 34, 44, 94, 10);
      label(c, 'MARKETS SLIDE OVERNIGHT', 81, 49.5, 6, '#0c1424');
      rect(c, '#0c1424', 0, 54, 128, 10);
      label(c, 'NYN 24', 17, 59.5, 6, '#e8edf5');
      label(c, 'ASIA OPENS LOWER · LIVE 2:14 AM', 81, 59.5, 5, '#9fb0c8', 'normal');
    }),
    newsTicker: (() => {
      const items: [string, string][] = [
        ['DOW', '-2.14%'], ['S&P 500', '-1.87%'], ['NASDAQ', '-2.61%'], ['NIKKEI', '-3.02%'],
        ['10Y', '4.82%'], ['OIL', '$91.40'], ['GOLD', '+1.2%'], ['BTC', '-6.30%'],
      ];
      const font = 'bold 6px Helvetica, Arial, sans-serif';
      /** Lays the strip out from x = 2; returns where it ends, so the canvas can be cut to loop seamlessly. */
      const layout = (c: Ctx) => {
        c.font = font;
        c.textBaseline = 'middle';
        c.textAlign = 'left';
        let x = 2;
        for (const [name, v] of items) {
          c.fillStyle = '#0c1424';
          c.fillText(name, x, 4.5);
          x += c.measureText(name).width + 3;
          c.fillStyle = v.startsWith('-') ? '#c4161c' : '#1a7a3a';
          c.fillText(v, x, 4.5);
          x += c.measureText(v).width + 4;
          rect(c, '#9aa3b0', x, 3, 2, 2);
          x += 6;
        }
        return Math.ceil(x - 2);
      };
      const w = layout(document.createElement('canvas').getContext('2d')!);
      const t = canvasTexture(w, 8, 40, (c) => {
        rect(c, '#e8edf5', 0, 0, w, 8);
        layout(c);
      });
      // The plane shows 128px of the strip at a time, the same pixel size as the screen above it.
      t.repeat.set(128 / w, 1);
      return t;
    })(),
    // Atlas's TV: the room PC still sharing the afternoon's architecture review, red pen and all.
    tvShare: canvasTexture(128, 72, 21, (c) => {
      rect(c, '#15171c', 0, 0, 128, 6);
      rect(c, '#e0453a', 3, 2, 2, 2);
      label(c, 'Sharing screen · Q4 migration review', 66, 3.5, 5, '#9aa3ad', 'normal');
      rect(c, '#f4f5f2', 0, 6, 128, 64);
      rect(c, '#101216', 0, 70, 128, 2);
      c.save();
      c.translate(0, 6);
      const box = (x: number, y: number, w: number, h: number, col: string, text: string) => {
        c.strokeStyle = col;
        c.strokeRect(x + 0.5, y + 0.5, w, h);
        label(c, text, x + w / 2, y + h / 2 + 1, 7, col, 'normal');
      };
      box(6, 10, 22, 11, '#2456a6', 'web');
      box(44, 10, 30, 11, '#2456a6', 'api gw');
      box(92, 5, 28, 11, '#2456a6', 'auth');
      box(92, 24, 28, 11, '#2456a6', 'billing');
      box(44, 38, 30, 11, '#1f1f1f', 'queue');
      box(92, 46, 28, 11, '#1f1f1f', 'db');
      line(c, '#2456a6', [28, 15, 44, 15]);
      line(c, '#2456a6', [74, 14, 92, 10]);
      line(c, '#2456a6', [74, 17, 92, 29]);
      line(c, '#1f1f1f', [59, 21, 59, 38]);
      line(c, '#1f1f1f', [74, 44, 92, 51]);
      c.strokeStyle = '#c0282d';
      c.beginPath();
      c.ellipse(59, 43, 22, 10, 0, 0, Math.PI * 2);
      c.stroke();
      label(c, '???', 24, 50, 9, '#c0282d');
      label(c, 'Q4 migration', 30, 32, 7, '#2a8a4a', 'normal');
      c.restore();
    }),
    // The west pod's TV: their sprint board, four columns of cards.
    tvSprint: canvasTexture(128, 72, 62, (c, r) => {
      rect(c, '#0f1319', 0, 0, 128, 72);
      rect(c, '#1a212b', 0, 0, 128, 8);
      label(c, 'SPRINT 14 · RISK PLATFORM', 38, 4.5, 5, '#9fb0c4', 'normal');
      label(c, '3 DAYS LEFT', 110, 4.5, 5, '#fbbf24');
      const strips = ['#60a5fa', '#fbbf24', '#c084fc', '#4ade80'];
      ['TODO', 'DOING', 'REVIEW', 'DONE'].forEach((name, i) => {
        const x = 2 + i * 31.5;
        rect(c, '#141a22', x, 10, 30, 60);
        label(c, name, x + 15, 14, 5, '#7d8fa3');
        const cards = 2 + Math.floor(r() * 4);
        for (let k = 0; k < cards; k++) {
          const y = 19 + k * 10;
          rect(c, '#1e2733', x + 2, y, 26, 8);
          rect(c, strips[i], x + 2, y, 1, 8);
          rect(c, '#5a6b80', x + 5, y + 2, 10 + Math.floor(r() * 12), 1);
          rect(c, '#3c4858', x + 5, y + 5, 6 + Math.floor(r() * 10), 1);
        }
      });
    }),
    // Glass whiteboard by the west pod: a risk check in blue marker, the order path, and notes.
    glassBoard: canvasTexture(192, 96, 63, (c, r) => {
      rect(c, '#eef2f1', 0, 0, 192, 96);
      for (let i = 0; i < 6; i++) rect(c, 'rgba(120,132,130,0.07)', Math.floor(r() * 160), Math.floor(r() * 80), 20 + Math.floor(r() * 30), 3);
      c.strokeStyle = '#c4d4d1';
      c.strokeRect(0.5, 0.5, 191, 95);
      const write = (text: string, x: number, y: number, size: number, color: string) => {
        c.fillStyle = color;
        c.font = `${size}px monospace`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(text, x, y);
      };
      const code = [
        'def check(order):',
        '  pos = book[order.sym]',
        '  if pos + order.qty > LIMIT:',
        '    return REJECT',
        '  hedge(pos)  # before fill?',
        '  return ACCEPT',
      ];
      code.forEach((l, i) => write(l, 8, 14 + i * 8, 6, '#2456a6'));
      write('TODO: kill switch', 8, 72, 7, '#c0282d');
      line(c, '#c0282d', [8, 77, 72, 77]);
      // Order path: boxes left to right with arrows between.
      const boxes: [string, number][] = [['OMS', 112], ['risk', 140], ['gw', 166]];
      for (const [text, x] of boxes) {
        c.strokeStyle = '#1f1f1f';
        c.strokeRect(x + 0.5, 12.5, 20, 11);
        label(c, text, x + 10, 18.5, 6, '#1f1f1f', 'normal');
      }
      for (const x of [132, 160]) {
        line(c, '#1f1f1f', [x, 18, x + 7, 18]);
        line(c, '#1f1f1f', [x + 5, 16, x + 7, 18, x + 5, 20]);
      }
      line(c, '#1f1f1f', [176, 23, 176, 38]);
      line(c, '#1f1f1f', [174, 36, 176, 38, 178, 36]);
      label(c, 'exch', 176, 44, 6, '#1f1f1f', 'normal');
      c.strokeStyle = '#c0282d';
      c.beginPath();
      c.ellipse(150, 18, 16, 10, 0, 0, Math.PI * 2);
      c.stroke();
      write('p99 < 2ms ?', 118, 40, 6, '#c0282d');
      write('fills: 47 / 47', 118, 62, 6, '#2a8a4a');
      line(c, '#2a8a4a', [168, 62, 171, 65, 177, 57]);
    }),
    // Orion's TV: the room PC idling on its meeting app.
    tvMeeting: canvasTexture(128, 72, 22, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 72);
      g.addColorStop(0, '#13213a');
      g.addColorStop(1, '#090e18');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 72);
      label(c, 'ORION', 14, 6, 5, '#8fa3b8', 'normal');
      label(c, '2:13 AM', 112, 6, 5, '#8fa3b8', 'normal');
      label(c, 'ORION', 64, 28, 14, '#e8eef5');
      label(c, 'No meetings booked', 64, 40, 6, '#7d8fa3', 'normal');
      c.fillStyle = '#2f6fd1';
      roundRect(c, 42, 48, 44, 10, 5);
      c.fill();
      label(c, 'Start meeting', 64, 53.5, 5, '#ffffff');
      label(c, 'HDMI 1 · no signal', 20, 67, 4, '#55657a', 'normal');
    }),
    rug: canvasTexture(32, 32, 24, (c, r) => {
      grain(c, r, 32, 32, [150, 120, 70], 10);
      rect(c, '#2b3f4a', 0, 0, 32, 3);
      rect(c, '#2b3f4a', 0, 29, 32, 3);
      rect(c, '#2b3f4a', 0, 0, 3, 32);
      rect(c, '#2b3f4a', 29, 0, 3, 32);
      for (let i = 0; i < 4; i++) {
        const cx = 8 + (i % 2) * 16;
        const cy = 8 + Math.floor(i / 2) * 16;
        for (let d = 0; d < 5; d++) {
          rect(c, '#6b4a2a', cx - d, cy - 4 + d, 1, 1);
          rect(c, '#6b4a2a', cx + d, cy - 4 + d, 1, 1);
          rect(c, '#6b4a2a', cx - d, cy + 4 - d, 1, 1);
          rect(c, '#6b4a2a', cx + d, cy + 4 - d, 1, 1);
        }
      }
    }),
    leaf: canvasTexture(32, 32, 26, (c, r) => {
      const greens = ['#2d6a36', '#3b8546', '#24542b', '#4a9a52'];
      c.fillStyle = '#2a4a22';
      c.fillRect(15, 18, 2, 14);
      for (let i = 0; i < 18; i++) {
        c.save();
        c.translate(6 + r() * 20, 3 + r() * 24);
        c.rotate((r() - 0.5) * 2.2);
        c.fillStyle = greens[Math.floor(r() * greens.length)];
        c.beginPath();
        c.ellipse(0, 0, 2 + r() * 2, 5 + r() * 3, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }),
    lightPanel: canvasTexture(16, 32, 27, (c) => {
      rect(c, '#9aa3b5', 0, 0, 16, 32);
      rect(c, '#eef3ff', 1, 1, 14, 30);
      for (let i = 4; i < 32; i += 4) rect(c, '#d3dbec', 1, i, 14, 1);
      for (let i = 4; i < 16; i += 4) rect(c, '#d3dbec', i, 1, 1, 30);
    }),
    vent: canvasTexture(16, 16, 28, (c) => {
      rect(c, '#c4c1b8', 0, 0, 16, 16);
      for (let y = 3; y < 14; y += 3) rect(c, '#55534e', 2, y, 12, 1);
    }),
    exit: sign(32, 16, 31, '#1d0404', '#ff2a1f', 'EXIT', 11),
    stair: canvasTexture(32, 32, 34, (c) => {
      rect(c, '#1f2b4a', 0, 0, 32, 32);
      label(c, 'STAIR', 16, 8, 7, '#e8edf5');
      label(c, 'B', 16, 17, 10, '#e8edf5');
      label(c, 'FL 47', 16, 27, 6, '#e8edf5');
    }),
    roomA: sign(48, 16, 36, '#f4f6f8', '#1e2a33', 'ATLAS', 10),
    roomB: sign(48, 16, 37, '#f4f6f8', '#1e2a33', 'ORION', 10),
    // A Bloomberg keyboard from above: grey keys on black, the yellow market-sector keys across the top,
    // red CONN DFLT and CANCEL on the left, green GO where enter would be.
    bbgKeys: canvasTexture(64, 24, 64, (c) => {
      rect(c, '#18191c', 0, 0, 64, 24);
      for (let x = 2; x < 50; x += 4) rect(c, '#e0b02a', x, 2, 3, 3);
      rect(c, '#c4302a', 2, 7, 3, 3);
      rect(c, '#c4302a', 2, 11, 3, 3);
      for (let row = 0; row < 4; row++)
        for (let x = 7; x < 50; x += 3) rect(c, '#5a5d63', x, 7 + row * 4, 2, 3);
      rect(c, '#2f9a48', 44, 15, 5, 7);
      for (let y = 7; y < 22; y += 4) for (let x = 53; x < 62; x += 3) rect(c, '#5a5d63', x, y, 2, 3);
    }),
  };
}

/** Bloomberg's pantry at 919 Third: its stone, timber, fridges, terminals and reef. */
export function pantryTextures() {
  return {
    // Large grey porcelain tiles, 1.2m x 0.6m: faint veining and a hairline joint.
    porcelain: canvasTexture(32, 16, 70, (c, r) => {
      grain(c, r, 32, 16, [104, 104, 102], 4, 0.6);
      for (let i = 0; i < 3; i++) line(c, 'rgba(140,140,136,0.35)', [Math.floor(r() * 32), 0, Math.floor(r() * 32), 15]);
      rect(c, '#55575a', 0, 0, 32, 1);
      rect(c, '#55575a', 0, 0, 1, 16);
    }),
    // Walnut, grain running along u.
    walnut: canvasTexture(64, 16, 71, (c, r) => {
      for (let y = 0; y < 16; y++) {
        const k = Math.sin(y * 1.3 + r()) * 8 + (r() - 0.5) * 6;
        rect(c, rgb([98 + k, 60 + k * 0.6, 36 + k * 0.4]), 0, y, 64, 1);
      }
      for (let i = 0; i < 40; i++) rect(c, 'rgba(40,20,10,0.35)', Math.floor(r() * 64), Math.floor(r() * 16), 3 + Math.floor(r() * 9), 1);
    }),
    // The ceiling slats: warm teak, grain along u.
    teak: canvasTexture(32, 8, 72, (c, r) => {
      for (let y = 0; y < 8; y++) {
        const k = (r() - 0.5) * 14;
        rect(c, rgb([178 + k, 104 + k * 0.7, 56 + k * 0.4]), 0, y, 32, 1);
      }
      for (let i = 0; i < 14; i++) rect(c, 'rgba(90,44,18,0.4)', Math.floor(r() * 32), Math.floor(r() * 8), 2 + Math.floor(r() * 6), 1);
    }),
    // Glass-door drinks fridge, lit inside: five shelves of cans and bottles behind a steel frame.
    fridge: canvasTexture(32, 64, 73, (c, r) => {
      rect(c, '#9aa0a8', 0, 0, 32, 64);
      rect(c, '#e8eef2', 2, 2, 28, 60);
      const drinks = ['#d8262c', '#2a7fd4', '#f2c230', '#3fae5a', '#f0f0f0', '#e8742a', '#7a3fa0', '#1c1c1c'];
      for (let s = 0; s < 5; s++) {
        const y = 4 + s * 12;
        rect(c, '#b9c0c6', 2, y + 10, 28, 1);
        for (let x = 3; x < 29; x += 3) {
          const tall = r() < 0.4;
          rect(c, drinks[Math.floor(r() * drinks.length)], x, y + (tall ? 1 : 4), 2, tall ? 9 : 6);
        }
      }
      rect(c, 'rgba(255,255,255,0.35)', 4, 2, 1, 60);
      rect(c, '#6f757c', 15, 2, 2, 60);
    }),
    // Cereal behind a dispenser's clear canister.
    cereal: canvasTexture(8, 16, 74, (c, r) => {
      grain(c, r, 8, 16, [176, 120, 54], 30);
      for (let i = 0; i < 6; i++) rect(c, '#e8d6a8', Math.floor(r() * 8), Math.floor(r() * 16), 1, 1);
    }),
    // A Bloomberg Terminal left on overnight: amber on black, white headings, green and red figures.
    terminal: canvasTexture(64, 48, 75, (c, r) => {
      rect(c, '#050505', 0, 0, 64, 48);
      rect(c, '#d84a1c', 0, 0, 64, 3);
      rect(c, '#ffffff', 2, 1, 14, 1);
      rect(c, '#2a2a2a', 0, 4, 64, 3);
      rect(c, '#ffa028', 2, 5, 22, 1);
      for (let y = 9; y < 46; y += 2) {
        const head = (y - 9) % 12 === 0;
        rect(c, head ? '#ffffff' : '#ffa028', 2, y, head ? 12 : 6 + Math.floor(r() * 16), 1);
        if (head) continue;
        rect(c, '#ffa028', 30, y, 8, 1);
        rect(c, r() < 0.5 ? '#3fdd5a' : '#ff3a2a', 42, y, 6, 1);
        rect(c, '#c8c8c8', 52, y, 8, 1);
      }
    }),
    // Roller shade fabric: grey with a faint vertical weave.
    shade: canvasTexture(16, 16, 76, (c, r) => {
      grain(c, r, 16, 16, [122, 124, 126], 5);
      for (let x = 0; x < 16; x += 2) rect(c, 'rgba(0,0,0,0.08)', x, 0, 1, 16);
    }),
    // Live rock in the reef tank: purple coralline with pink and green flecks.
    liveRock: canvasTexture(16, 16, 77, (c, r) => {
      grain(c, r, 16, 16, [92, 58, 140], 22);
      for (let i = 0; i < 18; i++) rect(c, r() < 0.5 ? '#d070b8' : '#6fc08a', Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    }),
    sand: canvasTexture(16, 16, 78, (c, r) => grain(c, r, 16, 16, [222, 218, 204], 12)),
  };
}

export type BuildingKind = 'glass' | 'office' | 'prewar';

const BUILDING_STYLES: Record<
  BuildingKind,
  { facade: RGB; glass: RGB; ww: number; wh: number; lit: RGB[]; rows: number; scatter: number }
> = {
  glass: {
    facade: [14, 19, 28],
    glass: [26, 36, 54],
    ww: 3,
    wh: 3,
    lit: [[223, 233, 255], [201, 219, 255], [238, 242, 255]],
    rows: 0.2,
    scatter: 0.03,
  },
  office: {
    facade: [30, 30, 33],
    glass: [33, 37, 46],
    ww: 3,
    wh: 2,
    lit: [[246, 239, 214], [230, 238, 255], [255, 244, 208]],
    rows: 0.18,
    scatter: 0.05,
  },
  prewar: {
    facade: [50, 37, 33],
    glass: [30, 30, 36],
    ww: 2,
    wh: 2,
    lit: [[255, 211, 138], [255, 196, 107], [255, 226, 168], [159, 184, 255]],
    rows: 0,
    scatter: 0.2,
  },
};

/**
 * 64x128 facade: 16 bays x 32 floors, 4px per 3.5m cell. Pixel (0,0) is always facade,
 * which the skyline uses as the roof colour.
 */
export function buildingTexture(kind: BuildingKind, seed: number) {
  const s = BUILDING_STYLES[kind];
  return canvasTexture(
    64,
    128,
    seed,
    (c, r) => {
      rect(c, rgb(s.facade), 0, 0, 64, 128);
      for (let row = 0; row < 32; row++) {
        const chance = r() < s.rows ? 0.55 + r() * 0.4 : s.scatter * (0.4 + r() * 1.2);
        for (let col = 0; col < 16; col++) {
          const color =
            r() < chance
              ? scaleRGB(s.lit[Math.floor(r() * s.lit.length)], 0.55 + r() * 0.45)
              : rgb(s.glass, (r() - 0.5) * 10);
          rect(c, color, col * 4 + 1, row * 4 + 1, s.ww, s.wh);
        }
      }
    },
    false,
  );
}

/** One Manhattan block cell: 280m (avenue to avenue) x 80m (street to street). */
export function streetTexture() {
  return canvasTexture(64, 32, 99, (c) => {
    rect(c, '#070709', 0, 0, 64, 32);
    rect(c, '#1c1c20', 0, 0, 8, 32);
    rect(c, '#1a1a1e', 0, 25, 64, 7);
    rect(c, '#26262b', 8, 0, 1, 25);
    rect(c, '#26262b', 9, 24, 55, 1);
    for (let y = 1; y < 32; y += 4) {
      rect(c, '#ffb24d', 0, y, 1, 1);
      rect(c, '#ffb24d', 7, y, 1, 1);
    }
    for (let x = 10; x < 64; x += 6) {
      rect(c, '#ffb24d', x, 25, 1, 1);
      rect(c, '#ffb24d', x, 31, 1, 1);
    }
  });
}

export function crownTexture(seed: number, base: string, lit: string) {
  return canvasTexture(16, 16, seed, (c) => {
    rect(c, base, 0, 0, 16, 16);
    for (let x = 1; x < 16; x += 3) rect(c, lit, x, 0, 2, 16);
  });
}

export function chryslerTexture() {
  return canvasTexture(32, 32, 98, (c) => {
    rect(c, '#9aa0a8', 0, 0, 32, 32);
    c.fillStyle = '#fff6e0';
    for (let row = 0; row < 3; row++) {
      const y = 4 + row * 10;
      for (let x = 2; x < 32; x += 8) {
        c.beginPath();
        c.moveTo(x, y + 6);
        c.lineTo(x + 2, y);
        c.lineTo(x + 4, y + 6);
        c.fill();
      }
    }
  });
}

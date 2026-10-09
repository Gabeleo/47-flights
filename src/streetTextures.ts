import * as THREE from 'three';
import {
  canvasTexture,
  grain,
  label,
  line,
  rect,
  rgb,
  roundRect,
  type Ctx,
  type Rand,
  type RGB,
} from './textures';

// Everything on 36th Avenue, drawn at the same PS1 resolutions as the office.

/** Push coplanar overlays (signs, road paint, windows) ahead in depth so vertex snapping can't z-fight them. */
function decal<T extends THREE.Material>(m: T, factor = -2): T {
  m.polygonOffset = true;
  m.polygonOffsetFactor = factor;
  m.polygonOffsetUnits = factor * 2;
  return m;
}

/** Running-bond brick, 32px to the metre: courses of two pixels of brick over one of mortar. */
function brick(seed: number, base: RGB, mortar: RGB, spread: number) {
  return canvasTexture(32, 33, seed, (c, r) => {
    rect(c, rgb(mortar), 0, 0, 32, 33);
    for (let row = 0; row < 11; row++) {
      const off = row % 2 ? 4 : 0;
      for (let x = -off; x < 32; x += 8) {
        const k = (r() - 0.5) * spread;
        rect(c, rgb(base, k), x, row * 3, 7, 2);
        if (r() < 0.15) rect(c, rgb(base, k - 14), x + Math.floor(r() * 6), row * 3 + 1, 2, 1);
      }
    }
    // Grime runs down from the window sills.
    for (let i = 0; i < 6; i++) rect(c, 'rgba(20,16,14,0.08)', Math.floor(r() * 32), 0, 1 + Math.floor(r() * 2), 33);
  });
}

/** Clapboard siding, 32px to the metre: eight boards, each lit along its lower edge. */
function siding(seed: number, base: RGB) {
  return canvasTexture(32, 32, seed, (c, r) => {
    for (let k = 0; k < 8; k++) {
      rect(c, rgb(base, -14), 0, k * 4, 32, 1);
      rect(c, rgb(base, (r() - 0.5) * 4), 0, k * 4 + 1, 32, 2);
      rect(c, rgb(base, 10), 0, k * 4 + 3, 32, 1);
    }
    for (let i = 0; i < 10; i++) rect(c, 'rgba(40,40,30,0.06)', Math.floor(r() * 32), Math.floor(r() * 32), 3, 1);
  });
}

/**
 * Windows: four 16x32 cells, a top sash over a bottom one in a frame. The dark set is lit by the street;
 * the lit set glows on its own, for the few people up at this hour.
 */
function windows(seed: number, lit: boolean) {
  return canvasTexture(64, 32, seed, (c, r) => {
    for (let k = 0; k < 4; k++) {
      const x0 = k * 16;
      const frame = k % 2 ? '#d8d6cf' : '#5a4a3c';
      rect(c, frame, x0, 0, 16, 32);
      const pane = (y: number, h: number) => {
        if (!lit) {
          const g = c.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, '#2a3242');
          g.addColorStop(1, '#10131a');
          c.fillStyle = g;
          c.fillRect(x0 + 1, y, 14, h);
          // Street light caught in the glass.
          for (let i = 0; i < 4; i++) rect(c, 'rgba(160,170,190,0.18)', x0 + 2 + i + Math.floor(r() * 3), y + 1 + i * 2, 2, 1);
          if (k === 1) for (let yy = y; yy < y + h * 0.6; yy += 2) rect(c, '#6a6a64', x0 + 1, yy, 14, 1);
          if (k === 2) {
            rect(c, '#4a3a4a', x0 + 1, y, 4, h);
            rect(c, '#4a3a4a', x0 + 11, y, 4, h);
          }
        } else {
          const warm: RGB[] = [[255, 208, 140], [255, 226, 170], [150, 175, 255], [255, 240, 200]];
          rect(c, rgb(warm[k]), x0 + 1, y, 14, h);
          if (k === 0) {
            rect(c, '#b0604a', x0 + 1, y, 4, h);
            rect(c, '#b0604a', x0 + 11, y, 4, h);
          }
          if (k === 1) for (let yy = y; yy < y + h; yy += 2) rect(c, '#c49a5a', x0 + 1, yy, 14, 1);
          if (k === 2) {
            rect(c, '#4a5a9a', x0 + 1, y, 14, h);
            rect(c, '#a8c0ff', x0 + 4, y + 3, 8, 5);
          }
          if (k === 3) rect(c, '#fff8e8', x0 + 6, y + 1, 4, 2);
        }
      };
      pane(1, 14);
      pane(17, 14);
    }
  });
}

/** A storefront interior through the glass, 64x32. */
function interior(seed: number, draw: (c: Ctx, r: Rand) => void) {
  return canvasTexture(64, 32, seed, draw);
}

/** A roll-down security gate: ribbed steel, a bottom bar, and whoever has been by with a marker. */
function gate(seed: number, base: RGB, tagged: number) {
  return canvasTexture(64, 64, seed, (c, r) => {
    for (let y = 0; y < 64; y++) rect(c, rgb(base, y % 2 ? -16 : 6), 0, y, 64, 1);
    rect(c, '#2c2c2e', 0, 60, 64, 4);
    rect(c, '#9a9a96', 30, 61, 4, 2);
    const colors = ['#e0e0e0', '#2a2a2a', '#d23a8a', '#3a7ad2', '#e8c43a', '#d2463a', '#3ab07a'];
    for (let t = 0; t < tagged; t++) {
      c.strokeStyle = colors[Math.floor(r() * colors.length)];
      c.lineWidth = 1 + Math.floor(r() * 2);
      c.beginPath();
      let x = 4 + r() * 40;
      let y = 18 + r() * 34;
      c.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += 2 + r() * 5;
        y += (r() - 0.5) * 14;
        c.lineTo(x, Math.max(4, Math.min(58, y)));
      }
      c.stroke();
    }
  });
}

/** A shop's sign board: name across the middle, an optional line underneath. */
export function signTexture(seed: number, text: string, bg: string, fg: string, sub = '', serif = false) {
  return canvasTexture(128, 24, seed, (c) => {
    rect(c, bg, 0, 0, 128, 24);
    rect(c, 'rgba(0,0,0,0.25)', 0, 22, 128, 2);
    const font = serif ? 'Georgia, serif' : 'Helvetica, Arial, sans-serif';
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let size = sub ? 12 : 15;
    c.font = `bold ${size}px ${font}`;
    while (c.measureText(text).width > 120 && size > 6) c.font = `bold ${--size}px ${font}`;
    c.fillText(text, 64, sub ? 9 : 12.5);
    if (sub) label(c, sub, 64, 19, 6, fg, 'normal');
  });
}

/** A hanging platform sign: where the stair goes, with the N and W bullets and an arrow up. */
function wayfinding(seed: number, to: string, sub: string) {
  return canvasTexture(128, 24, seed, (c) => {
    rect(c, '#111214', 0, 0, 128, 24);
    rect(c, '#f2f2f2', 0, 2, 128, 1);
    c.fillStyle = '#f2f2f2';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = 'bold 9px Helvetica, Arial, sans-serif';
    c.fillText(to, 30, 10);
    c.font = '6px Helvetica, Arial, sans-serif';
    c.fillText(sub, 30, 18);
    c.beginPath();
    c.moveTo(14, 5);
    c.lineTo(21, 12);
    c.lineTo(17, 12);
    c.lineTo(17, 20);
    c.lineTo(11, 20);
    c.lineTo(11, 12);
    c.lineTo(7, 12);
    c.fill();
    for (const [x, t] of [[98, 'N'], [114, 'W']] as const) {
      c.fillStyle = '#fccc0a';
      c.beginPath();
      c.arc(x, 13, 6, 0, Math.PI * 2);
      c.fill();
      label(c, t, x, 13.5, 8, '#111214');
    }
  });
}

/** Street-name blade: white on green, the way Queens spells it. */
function blade(seed: number, text: string) {
  return canvasTexture(64, 12, seed, (c) => {
    rect(c, '#f2f2ee', 0, 0, 64, 12);
    rect(c, '#1f6b3a', 1, 1, 62, 10);
    label(c, text, 32, 6.5, 9, '#f2f2ee');
  });
}

export function streetMaterials() {
  const lam = (p: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(p);
  const basic = (p: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial(p);
  const tex = {
    asphalt: canvasTexture(64, 64, 201, (c, r) => {
      grain(c, r, 64, 64, [50, 50, 54], 7);
      for (let i = 0; i < 160; i++) rect(c, 'rgba(150,150,150,0.25)', Math.floor(r() * 64), Math.floor(r() * 64), 1, 1);
      for (let i = 0; i < 5; i++) {
        let [x, y] = [r() * 64, r() * 64];
        const pts = [x, y];
        for (let k = 0; k < 6; k++) pts.push((x += (r() - 0.5) * 12), (y += (r() - 0.5) * 12));
        line(c, 'rgba(18,18,20,0.7)', pts.map(Math.floor));
      }
      rect(c, 'rgba(30,30,34,0.5)', 10, 30, 22, 14);
    }),
    sidewalk: canvasTexture(32, 32, 202, (c, r) => {
      grain(c, r, 32, 32, [122, 120, 114], 6, 0.8);
      for (let i = 0; i < 14; i++) rect(c, 'rgba(30,28,26,0.45)', Math.floor(r() * 30), Math.floor(r() * 30), 2, 1);
      for (let i = 0; i < 3; i++) rect(c, 'rgba(60,56,50,0.15)', Math.floor(r() * 20), Math.floor(r() * 20), 8, 6);
      rect(c, '#55534e', 0, 0, 32, 1);
      rect(c, '#55534e', 0, 0, 1, 32);
    }),
    curb: canvasTexture(16, 8, 203, (c, r) => {
      grain(c, r, 16, 8, [150, 148, 140], 8);
      rect(c, '#6a6862', 0, 0, 16, 1);
    }),
    paint: canvasTexture(16, 16, 204, (c, r) => {
      grain(c, r, 16, 16, [222, 222, 214], 10);
      for (let i = 0; i < 18; i++) rect(c, 'rgba(60,60,64,0.6)', Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    }),
    yellow: canvasTexture(16, 16, 205, (c, r) => {
      grain(c, r, 16, 16, [214, 172, 54], 12);
      for (let i = 0; i < 12; i++) rect(c, 'rgba(60,60,64,0.6)', Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    }),
    manhole: canvasTexture(16, 16, 206, (c) => {
      c.fillStyle = '#2a2826';
      c.beginPath();
      c.arc(8, 8, 7.5, 0, Math.PI * 2);
      c.fill();
      for (let y = 3; y < 14; y += 2) rect(c, '#46423c', 3, y, 10, 1);
    }),
    roof: canvasTexture(16, 16, 207, (c, r) => grain(c, r, 16, 16, [44, 42, 44], 6)),
    stucco: canvasTexture(32, 32, 208, (c, r) => grain(c, r, 32, 32, [182, 168, 140], 9)),
    panel: canvasTexture(32, 32, 209, (c, r) => {
      grain(c, r, 32, 32, [128, 132, 136], 3, 0.4);
      rect(c, '#55595e', 0, 0, 32, 1);
      rect(c, '#55595e', 0, 0, 1, 32);
      rect(c, '#55595e', 16, 0, 1, 32);
    }),
    panelDark: canvasTexture(32, 32, 210, (c, r) => {
      grain(c, r, 32, 32, [52, 54, 58], 3, 0.4);
      rect(c, '#2a2c30', 0, 0, 32, 1);
      rect(c, '#2a2c30', 0, 0, 1, 32);
    }),
    concrete: canvasTexture(16, 16, 211, (c, r) => grain(c, r, 16, 16, [138, 134, 126], 8)),
    windowsDark: windows(220, false),
    windowsLit: windows(221, true),
    // Loft windows: steel sash, twelve panes, some propped open.
    loftDark: canvasTexture(32, 32, 222, (c, r) => {
      rect(c, '#2e3438', 0, 0, 32, 32);
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 3; i++) rect(c, rgb([30, 36, 46], (r() - 0.5) * 16), 1 + i * 10, 1 + j * 8, 9, 7);
      rect(c, 'rgba(160,170,190,0.2)', 3, 3, 4, 1);
    }),
    loftLit: canvasTexture(32, 32, 223, (c, r) => {
      rect(c, '#2e3438', 0, 0, 32, 32);
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 3; i++) rect(c, rgb([236, 238, 226], (r() - 0.5) * 20), 1 + i * 10, 1 + j * 8, 9, 7);
    }),
    // New construction: floor-to-ceiling glass in dark frames.
    glassDark: canvasTexture(32, 32, 224, (c) => {
      rect(c, '#1c1e22', 0, 0, 32, 32);
      const g = c.createLinearGradient(0, 0, 32, 32);
      g.addColorStop(0, '#3a4456');
      g.addColorStop(1, '#141820');
      c.fillStyle = g;
      c.fillRect(1, 1, 30, 30);
      rect(c, '#1c1e22', 15, 1, 2, 30);
      rect(c, 'rgba(180,190,210,0.18)', 4, 4, 2, 10);
    }),
    glassLit: canvasTexture(32, 32, 225, (c) => {
      rect(c, '#1c1e22', 0, 0, 32, 32);
      rect(c, '#f2e2c0', 1, 1, 30, 30);
      rect(c, '#c8b48e', 1, 24, 30, 7);
      rect(c, '#1c1e22', 15, 1, 2, 30);
    }),
    // Storefront interiors.
    bodega: interior(230, (c, r) => {
      rect(c, '#e8ecdc', 0, 0, 64, 32);
      for (let y = 4; y < 24; y += 5) {
        rect(c, '#9a9e94', 0, y + 4, 44, 1);
        for (let x = 1; x < 44; x += 2) rect(c, ['#d83a2a', '#2a7ad2', '#e8c43a', '#3ab04a', '#f2f2f2', '#e87a2a'][Math.floor(r() * 6)], x, y + 1, 1, 3);
      }
      // Drinks fridges down the right, the counter and lottery screen in front.
      rect(c, '#bfe4f0', 46, 2, 17, 24);
      for (let x = 46; x < 63; x += 6) rect(c, '#5a6a72', x, 2, 1, 24);
      for (let y = 4; y < 24; y += 3) for (let x = 47; x < 63; x += 2) rect(c, ['#c42a2a', '#2a5ac4', '#f2f2f2', '#3a9a3a'][Math.floor(r() * 4)], x, y, 1, 2);
      rect(c, '#6a4a32', 4, 24, 36, 8);
      rect(c, '#2a2a2a', 26, 18, 8, 6);
      rect(c, '#4adef0', 27, 19, 6, 4);
      label(c, 'ATM', 10, 20, 6, '#1a3a8a');
    }),
    laundry: interior(231, (c) => {
      rect(c, '#eef0ee', 0, 0, 64, 32);
      rect(c, '#c8ccd0', 0, 0, 64, 4);
      for (let x = 2; x < 62; x += 10) {
        rect(c, '#f8f8f8', x, 18, 9, 12);
        c.fillStyle = '#4a5a6a';
        c.beginPath();
        c.arc(x + 4.5, 24, 3, 0, Math.PI * 2);
        c.fill();
        rect(c, '#c8c8c8', x, 6, 9, 10);
        c.beginPath();
        c.arc(x + 4.5, 11, 3, 0, Math.PI * 2);
        c.fill();
      }
    }),
    diner: interior(232, (c, r) => {
      rect(c, '#3a2a22', 0, 0, 64, 32);
      rect(c, '#5a3e2a', 0, 20, 64, 12);
      for (let x = 4; x < 60; x += 12) {
        rect(c, '#7a5a3e', x, 18, 8, 2);
        rect(c, '#2a1e18', x + 3, 20, 2, 8);
        rect(c, '#4a2e22', x - 2, 16, 2, 12);
        rect(c, '#4a2e22', x + 8, 16, 2, 12);
      }
      for (let i = 0; i < 6; i++) rect(c, '#c8a060', 4 + Math.floor(r() * 56), 2 + Math.floor(r() * 8), 6, 4);
    }),
    pizza: interior(233, (c) => {
      rect(c, '#4a3a30', 0, 0, 64, 32);
      rect(c, '#2a2a2a', 4, 2, 56, 10);
      for (let y = 4; y < 11; y += 2) rect(c, '#e8d8a8', 8, y, 20 + (y % 4) * 4, 1);
      rect(c, '#8a8a8a', 0, 20, 64, 4);
      rect(c, '#6a4a32', 0, 24, 64, 8);
      for (let x = 6; x < 60; x += 14) {
        c.fillStyle = '#d8902a';
        c.beginPath();
        c.arc(x + 4, 20, 4, Math.PI, 0);
        c.fill();
      }
    }),
    closedGlass: interior(234, (c, r) => {
      const g = c.createLinearGradient(0, 0, 0, 32);
      g.addColorStop(0, '#20242c');
      g.addColorStop(1, '#0e1014');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 32);
      for (let i = 0; i < 5; i++) rect(c, 'rgba(160,170,190,0.15)', 6 + i * 11 + Math.floor(r() * 4), 2, 2, 28);
      rect(c, '#f2f2f2', 48, 10, 10, 5);
      label(c, 'CLOSED', 53, 12.5, 3, '#c42a2a');
    }),
    gates: [gate(240, [150, 152, 150], 3), gate(241, [120, 124, 128], 6), gate(242, [168, 164, 150], 1), gate(243, [96, 100, 104], 8)],
    door: canvasTexture(16, 32, 245, (c, r) => {
      grain(c, r, 16, 32, [72, 46, 32], 6);
      rect(c, '#2a1a12', 0, 0, 16, 1);
      rect(c, '#2a1a12', 0, 0, 1, 32);
      rect(c, '#2a1a12', 15, 0, 1, 32);
      rect(c, '#1a2028', 3, 3, 10, 12);
      rect(c, '#c8a860', 12, 17, 2, 2);
    }),
    glassDoor: canvasTexture(16, 32, 246, (c) => {
      rect(c, '#9aa0a8', 0, 0, 16, 32);
      rect(c, '#2a3038', 2, 2, 12, 28);
      rect(c, '#c8ccd0', 2, 16, 12, 1);
    }),
    awnings: [
      ['#1e6a3a', '#f2f0e8'],
      ['#b22a2a', '#f2f0e8'],
      ['#1e3a7a', '#e8e8e8'],
      ['#2a2a2a', '#c8a040'],
      ['#c86a1a', '#f2e8c8'],
    ].map(([a, b], i) =>
      canvasTexture(16, 16, 250 + i, (c) => {
        rect(c, a, 0, 0, 16, 16);
        rect(c, b, 0, 0, 4, 16);
        rect(c, b, 8, 0, 4, 16);
      }),
    ),
    // Iron fence and railing: vertical bars between two rails, on a clear background.
    railing: canvasTexture(16, 16, 255, (c) => {
      rect(c, '#1c1c1e', 0, 0, 16, 1);
      rect(c, '#1c1c1e', 0, 14, 16, 1);
      for (let x = 1; x < 16; x += 3) rect(c, '#1c1c1e', x, 0, 1, 16);
    }),
    chainLink: canvasTexture(16, 16, 256, (c) => {
      for (let i = 0; i < 16; i += 4)
        for (let k = 0; k < 16; k++) {
          rect(c, '#9a9e9e', (i + k) % 16, k, 1, 1);
          rect(c, '#8a8e8e', (i - k + 32) % 16, k, 1, 1);
        }
    }),
    fireStair: canvasTexture(16, 32, 257, (c) => {
      for (let y = 0; y < 32; y += 3) rect(c, '#18181a', 0, y, 16, 1);
      rect(c, '#18181a', 0, 0, 1, 32);
      rect(c, '#18181a', 15, 0, 1, 32);
    }),
    leaves: canvasTexture(64, 64, 258, (c, r) => {
      const greens = ['#26442a', '#2e5232', '#3a6038', '#1e3822', '#4a6a3a', '#6a6a30'];
      for (let i = 0; i < 260; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 28;
        c.fillStyle = greens[Math.floor(r() * greens.length)];
        c.beginPath();
        c.ellipse(32 + Math.cos(a) * d, 34 + Math.sin(a) * d * 0.85, 2 + r() * 2.5, 1.5 + r() * 2, r() * 3, 0, Math.PI * 2);
        c.fill();
      }
    }),
    elSteel: canvasTexture(32, 32, 260, (c, r) => {
      grain(c, r, 32, 32, [54, 70, 60], 5);
      for (let y = 2; y < 32; y += 6) for (let x = 2; x < 32; x += 6) rect(c, '#7a8a7a', x, y, 1, 1);
      for (let i = 0; i < 5; i++) rect(c, 'rgba(120,64,30,0.35)', Math.floor(r() * 32), Math.floor(r() * 16), 1, 6 + Math.floor(r() * 10));
    }),
    ties: canvasTexture(16, 16, 261, (c, r) => {
      rect(c, '#1a1816', 0, 0, 16, 16);
      for (let y = 0; y < 16; y += 4) rect(c, rgb([70, 54, 40], (r() - 0.5) * 16), 0, y, 16, 2);
    }),
    // R160 car side: fluted stainless, a window band with people's heads in a couple, four door pairs.
    trainSide: canvasTexture(128, 32, 262, (c, r) => {
      for (let x = 0; x < 128; x++) rect(c, rgb([168, 172, 176], x % 2 ? 8 : -6), x, 0, 1, 32);
      rect(c, '#7a7e84', 0, 26, 128, 6);
      const doors = [10, 42, 76, 108];
      rect(c, '#e8ecdc', 0, 8, 128, 9);
      for (let x = 0; x < 128; x += 8) rect(c, '#3a3e44', x, 8, 1, 9);
      for (let i = 0; i < 4; i++) if (r() < 0.4) rect(c, '#2a2422', 4 + Math.floor(r() * 120), 12, 3, 5);
      for (const d of doors) {
        rect(c, '#9a9ea4', d, 4, 10, 22);
        rect(c, '#3a3e44', d + 5, 4, 1, 22);
        rect(c, '#e8ecdc', d + 1, 7, 3, 7);
        rect(c, '#e8ecdc', d + 6, 7, 3, 7);
      }
      c.fillStyle = '#fccc0a';
      c.beginPath();
      c.arc(30, 4, 2.5, 0, Math.PI * 2);
      c.fill();
      rect(c, '#e8a020', 94, 2, 8, 3);
    }),
    trainFront: canvasTexture(32, 32, 263, (c) => {
      rect(c, '#a8acb0', 0, 0, 32, 32);
      rect(c, '#1a1c20', 2, 4, 28, 12);
      rect(c, '#e8ecdc', 12, 5, 8, 11);
      c.fillStyle = '#fccc0a';
      c.beginPath();
      c.arc(26, 7, 3, 0, Math.PI * 2);
      c.fill();
      label(c, 'N', 26, 7.5, 5, '#111111');
      rect(c, '#fff4d0', 3, 20, 4, 3);
      rect(c, '#fff4d0', 25, 20, 4, 3);
      rect(c, '#5a5e64', 0, 26, 32, 6);
    }),
    // The station house walls: frosted panels glowing from inside.
    mylar: canvasTexture(32, 16, 264, (c) => {
      rect(c, '#2a2e34', 0, 0, 32, 16);
      for (let x = 1; x < 32; x += 8) rect(c, '#c8dce4', x, 1, 7, 14);
      rect(c, 'rgba(255,255,255,0.4)', 2, 2, 2, 12);
    }),
    stationSign: canvasTexture(128, 16, 265, (c) => {
      rect(c, '#111214', 0, 0, 128, 16);
      rect(c, '#f2f2f2', 0, 2, 128, 1);
      c.fillStyle = '#f2f2f2';
      c.font = 'bold 10px Helvetica, Arial, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('36 Av', 6, 10);
      for (const [x, t] of [[96, 'N'], [112, 'W']] as const) {
        c.fillStyle = '#fccc0a';
        c.beginPath();
        c.arc(x, 9.5, 5.5, 0, Math.PI * 2);
        c.fill();
        label(c, t, x, 10, 8, '#111214');
      }
    }),
    // Inside the station house: terrazzo underfoot, white tile and stainless on the walls, panels overhead.
    terrazzo: canvasTexture(32, 32, 300, (c, r) => {
      grain(c, r, 32, 32, [150, 146, 138], 6);
      for (let i = 0; i < 90; i++) rect(c, ['#e8e4dc', '#5a5650', '#a89070', '#7a8a8a'][Math.floor(r() * 4)], Math.floor(r() * 32), Math.floor(r() * 32), 1, 1);
      rect(c, '#9e8e6c', 0, 0, 32, 1);
      rect(c, '#9e8e6c', 0, 0, 1, 32);
    }),
    stationWall: canvasTexture(32, 32, 301, (c, r) => {
      rect(c, '#9a9c98', 0, 0, 32, 32);
      for (let y = 0; y < 32; y += 4)
        for (let x = (y / 4) % 2 ? 4 : 0; x < 32; x += 8) rect(c, rgb([226, 228, 222], (r() - 0.5) * 8), x, y, 7, 3);
      rect(c, '#2a6a8a', 0, 28, 32, 2);
    }),
    // Panel joints in a soft grey: hard dark one-pixel lines alias into dotted lines across the ceiling
    // when it's seen at a slant.
    stationCeiling: canvasTexture(32, 32, 302, (c, r) => {
      grain(c, r, 32, 32, [200, 202, 200], 4, 0.4);
      rect(c, '#b0b2b0', 0, 0, 32, 1);
      rect(c, '#b0b2b0', 0, 0, 1, 32);
    }),
    // Wayfinding over the stairs up to each platform.
    toManhattan: wayfinding(303, 'Manhattan', '& Brooklyn'),
    toAstoria: wayfinding(304, 'Astoria', 'Ditmars Blvd'),
    agent: signTexture(305, 'Station Agent', '#111214', '#f2f2f2'),
    // OMNY reader faces: waiting for a tap, and the green GO.
    tap: canvasTexture(16, 16, 306, (c) => {
      rect(c, '#0c0c0e', 0, 0, 16, 16);
      label(c, 'TAP', 8, 6, 5, '#e8e8e8');
      rect(c, '#e8e8e8', 4, 10, 8, 1);
    }),
    go: canvasTexture(16, 16, 307, (c) => {
      rect(c, '#0c0c0e', 0, 0, 16, 16);
      rect(c, '#1ac45a', 1, 1, 14, 14);
      label(c, 'GO', 8, 8.5, 7, '#ffffff');
    }),
    vending: canvasTexture(32, 64, 308, (c) => {
      rect(c, '#2a2c30', 0, 0, 32, 64);
      rect(c, '#0039a6', 0, 0, 32, 8);
      label(c, 'OMNY', 16, 4.5, 6, '#ffffff');
      rect(c, '#101418', 4, 12, 24, 18);
      rect(c, '#3a7ad8', 5, 13, 22, 16);
      label(c, 'Touch to', 16, 19, 4, '#ffffff', 'normal');
      label(c, 'start', 16, 24, 4, '#ffffff', 'normal');
      rect(c, '#c8c8c8', 8, 34, 16, 3);
      rect(c, '#101010', 6, 42, 8, 6);
      rect(c, '#101010', 18, 42, 8, 6);
      rect(c, '#e8a020', 10, 54, 12, 2);
    }),
    map: canvasTexture(32, 32, 309, (c, r) => {
      rect(c, '#f2f0e8', 0, 0, 32, 32);
      rect(c, '#a8c8e8', 0, 18, 10, 14);
      for (let i = 0; i < 6; i++) line(c, ['#fccc0a', '#00933c', '#ee352e', '#0039a6', '#b933ad', '#ff6319'][i], [Math.floor(r() * 32), 0, Math.floor(r() * 32), 32]);
      rect(c, '#111214', 0, 0, 32, 4);
    }),
    // Pedestrian signal faces: the orange hand and the white walker.
    hand: canvasTexture(16, 16, 266, (c) => {
      rect(c, '#0c0c0c', 0, 0, 16, 16);
      rect(c, '#ff8a2a', 5, 5, 6, 7);
      for (let i = 0; i < 4; i++) rect(c, '#ff8a2a', 5 + i * 1.5, 2, 1, 4);
      rect(c, '#ff8a2a', 3, 7, 2, 2);
    }),
    walk: canvasTexture(16, 16, 267, (c) => {
      rect(c, '#0c0c0c', 0, 0, 16, 16);
      rect(c, '#f2f2f2', 7, 2, 2, 2);
      line(c, '#f2f2f2', [8, 5, 8, 10, 5, 14]);
      line(c, '#f2f2f2', [8, 10, 11, 14]);
      line(c, '#f2f2f2', [5, 8, 8, 6, 11, 8]);
    }),
    stop: canvasTexture(32, 32, 268, (c) => {
      c.fillStyle = '#f2f2f2';
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + (k * Math.PI) / 4;
        c.lineTo(16 + Math.cos(a) * 16, 16 + Math.sin(a) * 16);
      }
      c.fill();
      c.fillStyle = '#c4161c';
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + (k * Math.PI) / 4;
        c.lineTo(16 + Math.cos(a) * 14.5, 16 + Math.sin(a) * 14.5);
      }
      c.fill();
      label(c, 'STOP', 16, 16.5, 9, '#f2f2f2');
    }),
    oneWay: canvasTexture(32, 12, 269, (c) => {
      rect(c, '#111111', 0, 0, 32, 12);
      rect(c, '#f2f2f2', 2, 3, 22, 6);
      c.fillStyle = '#f2f2f2';
      c.beginPath();
      c.moveTo(24, 1);
      c.lineTo(31, 6);
      c.lineTo(24, 11);
      c.fill();
      label(c, 'ONE WAY', 13, 6.5, 5, '#111111');
    }),
    busStop: canvasTexture(16, 32, 270, (c) => {
      rect(c, '#f2f2f2', 0, 0, 16, 32);
      rect(c, '#0039a6', 0, 0, 16, 10);
      label(c, 'MTA', 8, 5.5, 6, '#f2f2f2');
      rect(c, '#0039a6', 3, 13, 10, 6);
      label(c, 'Q102', 8, 25, 5, '#0039a6');
    }),
    evgo: signTexture(271, 'EVgo', '#f4f6f8', '#1a5ad8', 'FAST CHARGING'),
    charger: canvasTexture(16, 32, 272, (c) => {
      rect(c, '#e8eaec', 0, 0, 16, 32);
      rect(c, '#1a5ad8', 0, 0, 16, 4);
      rect(c, '#101418', 3, 7, 10, 8);
      rect(c, '#3ae0a0', 4, 8, 8, 2);
      rect(c, '#2a2e34', 5, 20, 6, 6);
    }),
    marquee: canvasTexture(128, 24, 273, (c) => {
      rect(c, '#101012', 0, 0, 128, 24);
      for (let x = 2; x < 128; x += 4) {
        rect(c, '#ffe8a0', x, 1, 1, 1);
        rect(c, '#ffe8a0', x, 22, 1, 1);
      }
      label(c, 'MELROSE BALLROOM', 64, 12.5, 11, '#f2f2f2');
    }),
    blades: Object.fromEntries(['36 Av', '29 St', '30 St', '31 St', '32 St', '33 St', '34 St'].map((t, i) => [t, blade(280 + i, t)])),
    // A pool of lamplight on the ground, and the haze round a lamp head: soft radial falloffs, drawn additively.
    pool: canvasTexture(32, 32, 290, (c) => {
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 32, 32);
    }),
    open: canvasTexture(32, 12, 291, (c) => {
      rect(c, '#000000', 0, 0, 32, 12);
      c.strokeStyle = '#ff2a4a';
      roundRect(c, 1.5, 1.5, 29, 9, 3);
      c.stroke();
      label(c, 'OPEN', 16, 6.5, 8, '#4ad8ff');
    }),
    crate: canvasTexture(16, 16, 292, (c) => {
      rect(c, '#1a4aa0', 0, 0, 16, 16);
      for (let y = 3; y < 13; y += 3) for (let x = 2; x < 14; x += 3) c.clearRect(x, y, 2, 2);
    }),
    basket: canvasTexture(16, 16, 293, (c) => {
      for (let x = 0; x < 16; x += 2) rect(c, '#2a5a3a', x, 0, 1, 16);
      for (let y = 0; y < 16; y += 3) rect(c, '#2a5a3a', 0, y, 16, 1);
    }),
  };
  for (const t of [tex.pool]) {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
  }

  const brickColors: [RGB, RGB, number][] = [
    [[146, 64, 48], [150, 140, 124], 26],
    [[108, 66, 48], [130, 120, 108], 22],
    [[176, 148, 108], [190, 180, 160], 18],
    [[94, 50, 42], [120, 110, 100], 20],
    [[164, 96, 62], [160, 150, 136], 24],
    [[186, 176, 156], [196, 188, 170], 6],
    [[120, 122, 120], [134, 134, 130], 6],
  ];
  const sidingColors: RGB[] = [[208, 206, 196], [196, 182, 150], [214, 204, 160], [170, 176, 178], [156, 170, 186]];

  const additive = (map: THREE.Texture, color: number, opacity: number) =>
    basic({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

  return {
    tex,
    asphalt: lam({ map: tex.asphalt }),
    sidewalk: lam({ map: tex.sidewalk }),
    curb: lam({ map: tex.curb }),
    paint: decal(lam({ map: tex.paint })),
    yellow: decal(lam({ map: tex.yellow })),
    manhole: decal(lam({ map: tex.manhole, transparent: true, alphaTest: 0.5 })),
    tarPatch: decal(lam({ color: 0x2a2a2e })),
    roof: lam({ map: tex.roof }),
    bricks: brickColors.map(([b, m, s], i) => lam({ map: brick(300 + i, b, m, s) })),
    sidings: sidingColors.map((c, i) => lam({ map: siding(320 + i, c) })),
    stucco: lam({ map: tex.stucco }),
    panel: lam({ map: tex.panel }),
    panelDark: lam({ map: tex.panelDark }),
    concrete: lam({ map: tex.concrete }),
    stone: lam({ color: 0xc8c0ae }),
    trim: lam({ color: 0xe8e6de }),
    cornice: lam({ color: 0x3a3632 }),
    corniceLight: lam({ color: 0xb8ae9a }),
    windowsDark: decal(lam({ map: tex.windowsDark })),
    windowsLit: decal(basic({ map: tex.windowsLit })),
    loftDark: decal(lam({ map: tex.loftDark })),
    loftLit: decal(basic({ map: tex.loftLit, color: 0xd8d8d0 })),
    glassDark: decal(lam({ map: tex.glassDark })),
    glassLit: decal(basic({ map: tex.glassLit })),
    bodega: decal(basic({ map: tex.bodega, color: 0xb8b8b0 })),
    laundry: decal(basic({ map: tex.laundry, color: 0xb8b8b8 })),
    diner: decal(basic({ map: tex.diner, color: 0x8a7a6a })),
    pizza: decal(basic({ map: tex.pizza, color: 0x7a6a5a })),
    closedGlass: decal(lam({ map: tex.closedGlass })),
    gates: tex.gates.map((map) => decal(lam({ map }))),
    door: decal(lam({ map: tex.door })),
    glassDoor: decal(lam({ map: tex.glassDoor })),
    litDoor: decal(basic({ map: tex.glassDoor, color: 0xfff4e0 })),
    awnings: tex.awnings.map((map) => lam({ map, side: THREE.DoubleSide })),
    railing: lam({ map: tex.railing, alphaTest: 0.5, side: THREE.DoubleSide }),
    chainLink: lam({ map: tex.chainLink, alphaTest: 0.5, side: THREE.DoubleSide }),
    fireStair: lam({ map: tex.fireStair, alphaTest: 0.5, side: THREE.DoubleSide }),
    iron: lam({ color: 0x1c1c1e }),
    leaves: lam({ map: tex.leaves, alphaTest: 0.5, side: THREE.DoubleSide }),
    bark: lam({ color: 0x4a4038 }),
    soil: lam({ color: 0x2a2018 }),
    elSteel: lam({ map: tex.elSteel }),
    ties: lam({ map: tex.ties }),
    rail: lam({ color: 0x8a8580 }),
    trainSide: lam({ map: tex.trainSide, emissive: 0x2a2a26 }),
    trainFront: lam({ map: tex.trainFront, emissive: 0x2a2a26 }),
    trainGlow: basic({ color: 0xe8ecdc }),
    mylar: basic({ map: tex.mylar, color: 0xc8d4dc }),
    stationSign: decal(basic({ map: tex.stationSign, color: 0xcfcfcf })),
    terrazzo: lam({ map: tex.terrazzo }),
    stationWall: lam({ map: tex.stationWall }),
    stationCeiling: lam({ map: tex.stationCeiling }),
    toManhattan: decal(basic({ map: tex.toManhattan, color: 0xd8d8d8 })),
    toAstoria: decal(basic({ map: tex.toAstoria, color: 0xd8d8d8 })),
    agent: decal(basic({ map: tex.agent, color: 0xd8d8d8 })),
    tap: decal(basic({ map: tex.tap })),
    go: decal(basic({ map: tex.go })),
    vending: decal(lam({ map: tex.vending, emissive: 0x303030 })),
    map: decal(lam({ map: tex.map })),
    wood: lam({ color: 0x8a5a32 }),
    platformEdge: lam({ color: 0xd8b830 }),
    canopy: lam({ color: 0x1a1c1e, side: THREE.DoubleSide }),
    windscreen: basic({ color: 0x6a8a9a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    // Light fittings sit a few centimetres off the ceilings they hang from: pulled ahead in depth so they never sink into them.
    fluoro: decal(basic({ color: 0xf0f6ff })),
    globe: basic({ color: 0x3ae070 }),
    pole: lam({ color: 0x5a5e62 }),
    poleDark: lam({ color: 0x2a2c2e }),
    lampHead: lam({ color: 0x3a3c40 }),
    lampLens: basic({ color: 0xfff0d8 }),
    signalBody: lam({ color: 0x1e1f20 }),
    hand: decal(basic({ map: tex.hand })),
    walk: decal(basic({ map: tex.walk })),
    stop: decal(lam({ map: tex.stop, alphaTest: 0.5 })),
    oneWay: decal(lam({ map: tex.oneWay })),
    busStop: decal(lam({ map: tex.busStop })),
    evgo: decal(basic({ map: tex.evgo })),
    charger: decal(lam({ map: tex.charger, emissive: 0x1a2a3a })),
    marquee: decal(basic({ map: tex.marquee })),
    blades: Object.fromEntries(Object.entries(tex.blades).map(([k, map]) => [k, decal(lam({ map, emissive: 0x202020 }))])),
    hydrant: lam({ color: 0xa8a8a0 }),
    hydrantTop: lam({ color: 0xa82a20 }),
    hydrantCap: lam({ color: 0x3a6a3a }),
    mailbox: lam({ color: 0x1a3a7a }),
    citiBlue: lam({ color: 0x1a6ad8 }),
    tire: lam({ color: 0x141414 }),
    carGlass: lam({ color: 0x14181e }),
    headlight: basic({ color: 0xfff6dc }),
    taillight: basic({ color: 0xff2a1a }),
    taillightDim: lam({ color: 0x5a1010 }),
    chrome: lam({ color: 0x9a9ea2 }),
    carPaints: [0x1a1a1c, 0xe8e8e4, 0x8a8e92, 0x5a5e62, 0x2a3a5a, 0x6a1a1a, 0x2a4a3a, 0xb8b4a8, 0x3a2a22, 0x9ab8c8].map((c) => lam({ color: c })),
    boroTaxi: lam({ color: 0x6ac43a }),
    open: decal(basic({ map: tex.open })),
    crate: lam({ map: tex.crate, alphaTest: 0.5, side: THREE.DoubleSide }),
    basket: lam({ map: tex.basket, alphaTest: 0.5, side: THREE.DoubleSide }),
    bag: lam({ color: 0x18181a }),
    bagClear: lam({ color: 0x8aa8c8 }),
    cone: lam({ color: 0xf26a1a }),
    white: lam({ color: 0xe8e8e2 }),
    cardboard: lam({ color: 0xb08a5a }),
    bottle: lam({ color: 0x3a6a3a }),
    can: lam({ color: 0xc8c8c8 }),
    news: lam({ color: 0xd8d4c8 }),
    pool: decal(additive(tex.pool, 0xffd8a8, 0.4), -1),
    sign: (seed: number, text: string, bg: string, fg: string, sub = '', lit = true, serif = false) => {
      const map = signTexture(seed, text, bg, fg, sub, serif);
      return decal(lit ? basic({ map, color: 0xe0e0e0 }) : lam({ map }));
    },
  };
}

export type StreetMats = ReturnType<typeof streetMaterials>;

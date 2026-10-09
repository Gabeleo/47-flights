import * as THREE from 'three';
import { Builder, boxGeo, type Rect, type SurfaceArea } from './geometry';
import { decal, makeMaterials } from './materials';
import type { Bounds } from './physics';
import { propTemplates, type PropSpawn } from './props';
import { FOG_COLOR, buildSkyline } from './skyline';
import { mulberry32, pantryTextures } from './textures';
import type { World } from './world';

// Bloomberg's pantry at 919 Third Avenue, from SL Green's photos of the space: a long room down the window
// wall under a timber-slat ceiling, a white back counter on a curved wall, curved white islands glowing at
// their feet, a fruit counter and a walnut ledge along the windows. West of it, by the feature stair, the
// reef tank; east of it, open office. Floor 15, 2am.
//
// The room runs along x; the windows are on +z, the building core on -z. y = 0 is the floor.
const H = 2.75;
/** The window module: 9'4" between pier centrelines. */
const MOD = 2.845;
/** The end walls, six modules either side of the middle. */
const XW = 6 * MOD;
/** Inside face of the window glass, and of the piers between windows. */
const ZW = 5.5;
const ZP = 5.05;
const SILL = 0.76;
/** The core wall. */
const ZC = -6.5;

// Back of house: a block between the stair hall and the open office, its face the pantry's back wall,
// with its two front corners rounded off.
const BX0 = -8;
const BX1 = 9;
const ZB = -0.4;
const BR = 2;
const WALL_T = 0.15;

// The feature stair's opening, west of the pantry, and the reef tank between them.
const STAIR: Rect = [-16.2, -5.9, -11.2, -3.3];
const RISE = 0.183;
const RUN = 0.28;
const STEPS = 20;
const FLOOR_TO_FLOOR = RISE * STEPS;
const TANK = { x: -9.7, z: -3.4, w: 1.0, d: 2.4 };

/** The open office starts at the east side of the block. */
const OFFICE_X = BX1 + WALL_T;

const COUNTER_Y = 0.92;

/** Floor 15: a tall lobby, then 12' floor to floor. */
const ELEVATION = 54;

/** Outline of a slab from x0 to x1 and z0 to z1, its ends rounded to half its depth where asked. */
function slabOutline(x0: number, z0: number, x1: number, z1: number, round: [boolean, boolean] = [true, true], seg = 8) {
  const r = (z1 - z0) / 2;
  const cz = (z0 + z1) / 2;
  const pts: [number, number][] = [];
  if (round[1])
    for (let i = 0; i <= seg; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / seg;
      pts.push([x1 - r + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  else pts.push([x1, z0], [x1, z1]);
  if (round[0])
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / seg;
      pts.push([x0 + r + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  else pts.push([x0, z1], [x0, z0]);
  return pts;
}

/** Where the back wall's face is at x: straight across the middle, round at the corners. */
function backWallZ(x: number) {
  if (x < BX0 + BR) return ZB - BR + Math.sqrt(Math.max(0, BR * BR - (x - (BX0 + BR)) ** 2));
  if (x > BX1 - BR) return ZB - BR + Math.sqrt(Math.max(0, BR * BR - (x - (BX1 - BR)) ** 2));
  return ZB;
}

function pantryMaterials() {
  const t = pantryTextures();
  const lam = (p: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(p);
  const basic = (p: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial(p);
  return {
    porcelain: lam({ map: t.porcelain }),
    walnut: lam({ map: t.walnut }),
    teak: lam({ map: t.teak }),
    plenum: lam({ color: 0x17130f }),
    wall: lam({ color: 0xe4e2dc }),
    corian: lam({ color: 0xf2f1ed }),
    plinth: lam({ color: 0x1c1c1e }),
    led: basic({ color: 0xfff0d4 }),
    backlit: decal(basic({ color: 0xe9e3d6 })),
    fridge: decal(basic({ map: t.fridge, color: 0xdadada })),
    cereal: lam({ map: t.cereal }),
    terminal: decal(basic({ map: t.terminal })),
    shade: lam({ map: t.shade, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
    frosted: lam({ color: 0xdfe6ea, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    lobbyYellow: basic({ color: 0xf2c51e }),
    water: basic({ color: 0x2a78b8, transparent: true, opacity: 0.32, depthWrite: false }),
    tankLight: basic({ color: 0xbfe6ff }),
    canopy: lam({ color: 0xd8dde2 }),
    liveRock: lam({ map: t.liveRock }),
    sand: lam({ map: t.sand }),
    coral: lam({ color: 0xf0ddd2 }),
    coralPink: lam({ color: 0xe07aa8 }),
    tread: basic({ color: 0xd6d0c2 }),
    exitRed: basic({ color: 0xff2a1a }),
    sauce: lam({ color: 0xb8241c }),
    sink: decal(lam({ color: 0x2a2b2e })),
  };
}

/** Bloomberg's pantry on 15 at 2am, with Midtown East outside. */
export function pantryWorld(): World {
  const b = new Builder();
  const M = makeMaterials();
  const P = pantryMaterials();
  const r = mulberry32(919);
  const lights: THREE.Light[] = [];
  const props: PropSpawn[] = [];

  const point = (color: number, intensity: number, distance: number, x: number, y: number, z: number) => {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    lights.push(l);
    return l;
  };
  const prop = (kind: string, x: number, y: number, z: number, ry = r() * Math.PI * 2) => props.push({ kind, x, y, z, yaw: ry });

  // ---------------------------------------------------------------- floor and ceiling

  // Grey porcelain everywhere but the open office, which is carpeted; the stair opening left open.
  const floor: SurfaceArea[] = [
    { mat: P.porcelain, rect: [-XW, ZC, XW, ZW], tile: [1.2, 0.6], origin: [0, 0] },
    { mat: M.carpet, rect: [OFFICE_X, ZC, XW, ZW], tile: 1 },
    { mat: null, rect: STAIR, tile: 1 },
  ];
  b.surface(floor);
  // Acoustic tile, except over the pantry, where the slats hang under a dark plenum.
  b.surface(
    [
      { mat: M.ceiling, rect: [-XW, ZC, XW, ZW], tile: 0.6 },
      { mat: P.plenum, rect: [BX0, ZB - BR, BX1, ZW], tile: 1 },
    ],
    H,
    'down',
  );

  // ---------------------------------------------------------------- shell

  // Window wall: a white induction-unit enclosure under each window, a white pier every module, a header
  // over the glass, and roller shades left wherever the day left them.
  b.box(P.wall, 2 * XW, SILL, ZW - 5.2, 0, 0, (5.2 + ZW) / 2, { solid: true });
  b.box(M.sill, 2 * XW, 0.02, ZW - 5.18, 0, SILL, (5.18 + ZW) / 2);
  b.plane(M.glass, 2 * XW, H - SILL, 0, (H + SILL) / 2, ZW, { ry: Math.PI });
  b.box(P.wall, 2 * XW, H - 2.6, ZW - ZP, 0, 2.6, (ZP + ZW) / 2);
  b.collide(0, ZW + 0.05, 2 * XW, 0.1, 0, 0, H);
  const PIER_W = 0.75;
  for (let k = -6; k <= 6; k++) b.box(P.wall, PIER_W, H, ZW - ZP, k * MOD, 0, (ZP + ZW) / 2, { solid: true });
  for (let k = -6; k < 6; k++) {
    const x0 = k * MOD + PIER_W / 2;
    const x1 = (k + 1) * MOD - PIER_W / 2;
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    b.box(M.mullion, w, 0.04, 0.06, cx, SILL, ZW - 0.03);
    b.box(M.mullion, w, 0.04, 0.06, cx, 2.56, ZW - 0.03);
    const bottom = [2.56, 2.56, 1.9, 1.45, 0.95][Math.floor(r() * 5)];
    b.box(M.metalDark, w, 0.08, 0.09, cx, 2.6 - 0.08, ZW - 0.12);
    if (bottom < 2.5) {
      b.plane(P.shade, w - 0.04, 2.52 - bottom, cx, (2.52 + bottom) / 2, ZW - 0.1, { ry: Math.PI });
      b.box(M.metalDark, w - 0.04, 0.025, 0.025, cx, bottom - 0.025, ZW - 0.1);
    }
  }

  // Core wall along the back, and the end walls.
  b.box(P.wall, 2 * XW, H, WALL_T, 0, 0, ZC - WALL_T / 2, { solid: true });
  // West: frosted double doors out to the elevator lobby, and Bloomberg yellow glowing through them.
  const DOOR: [number, number] = [-2.3, -0.5];
  for (const [z0, z1] of [[ZC, DOOR[0]], [DOOR[1], ZW]])
    b.box(P.wall, WALL_T, H, z1 - z0, -XW - WALL_T / 2, 0, (z0 + z1) / 2, { solid: true });
  b.box(P.wall, WALL_T, H - 2.3, DOOR[1] - DOOR[0], -XW - WALL_T / 2, 2.3, (DOOR[0] + DOOR[1]) / 2);
  const doorMid = (DOOR[0] + DOOR[1]) / 2;
  for (const s of [-1, 1]) {
    const z = doorMid + (s * (DOOR[1] - DOOR[0])) / 4;
    b.plane(P.frosted, (DOOR[1] - DOOR[0]) / 2 - 0.04, 2.26, -XW - 0.04, 1.15, z, { ry: Math.PI / 2 });
    b.box(M.metal, 0.03, 0.9, 0.03, -XW + 0.02, 0.6, doorMid + s * 0.08);
  }
  b.box(M.metal, 0.06, 2.3, 0.04, -XW - 0.05, 0, doorMid);
  b.box(M.metal, 0.06, 0.04, DOOR[1] - DOOR[0], -XW - 0.05, 2.28, doorMid);
  b.collide(-XW - 0.04, doorMid, 0.08, DOOR[1] - DOOR[0]);
  b.box(M.black, 0.02, 0.12, 0.08, -XW + 0.01, 1.05, DOOR[1] + 0.2);
  b.plane(P.lobbyYellow, DOOR[1] - DOOR[0] + 0.6, H, -XW - 1.4, H / 2, doorMid, { ry: Math.PI / 2 });
  point(0xffd23a, 1.2, 3, -XW - 0.6, 1.4, doorMid);
  // East: the fire stair door, with its exit sign.
  b.box(P.wall, WALL_T, H, ZW - ZC, XW + WALL_T / 2, 0, (ZC + ZW) / 2, { solid: true });
  b.box(M.metalDark, 0.04, 2.2, 1.0, XW - 0.02, 0, -4.6);
  b.box(M.metal, 0.05, 2.12, 0.9, XW - 0.03, 0, -4.6);
  b.box(M.metalDark, 0.08, 0.04, 0.5, XW - 0.07, 1.0, -4.4);
  b.box(M.white, 0.08, 0.2, 0.4, XW - 0.04, 2.32, -4.6);
  b.plane(M.exit, 0.36, 0.17, XW - 0.081, 2.42, -4.6, { ry: -Math.PI / 2 });
  point(0xff2a1a, 0.5, 2.5, XW - 0.4, 2.3, -4.6);

  // ---------------------------------------------------------------- back of house

  // The block's walls: straight across the pantry, a quarter round at each front corner, then straight
  // back to the core. Colliders follow the curve in short chords.
  b.box(P.wall, BX1 - BX0 - 2 * BR, H, WALL_T, (BX0 + BX1) / 2, 0, ZB - WALL_T / 2, { solid: true });
  for (const [cx, a0, a1] of [[BX0 + BR, Math.PI / 2, Math.PI], [BX1 - BR, Math.PI / 2, 0]] as const) {
    const cz = ZB - BR;
    const at = (rad: number, a: number): [number, number] => [cx + rad * Math.cos(a), cz + rad * Math.sin(a)];
    const SEG = 10;
    const outer = Array.from({ length: SEG + 1 }, (_, i) => at(BR, a0 + ((a1 - a0) * i) / SEG));
    const inner = Array.from({ length: SEG + 1 }, (_, i) => at(BR - WALL_T, a0 + ((a1 - a0) * i) / SEG));
    b.prism(P.wall, [...outer, ...inner.reverse()], 0, H);
    for (let i = 0; i < SEG; i++) {
      const [x0, z0] = at(BR - WALL_T / 2, a0 + ((a1 - a0) * i) / SEG);
      const [x1, z1] = at(BR - WALL_T / 2, a0 + ((a1 - a0) * (i + 1)) / SEG);
      b.collide((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) + 0.02, WALL_T, Math.atan2(-(z1 - z0), x1 - x0));
    }
  }
  for (const x of [BX0 + WALL_T / 2, BX1 - WALL_T / 2]) b.box(P.wall, WALL_T, H, ZB - BR - ZC, x, 0, (ZC + ZB - BR) / 2, { solid: true });

  // ---------------------------------------------------------------- slat ceiling

  // Teak slats running across the room from the back wall to the windows, their undersides rolling in a
  // slow wave down its length; a bulkhead closes off each end, and downlights hang in the gaps.
  for (const x of [BX0 + 0.05, BX1 - 0.05]) b.box(P.wall, 0.2, H - 2.42, ZP - (ZB - BR), x, 2.42, (ZP + ZB - BR) / 2);
  const SLAT = 0.22;
  for (let x = BX0 + 0.3; x < BX1 - 0.2; x += SLAT) {
    const z0 = backWallZ(x) + 0.05;
    const z1 = ZP - 0.05;
    const y = 2.46 + 0.08 * (1 + Math.sin(x * 0.42));
    b.box(P.teak, 0.07, 0.15, z1 - z0, x, y, (z0 + z1) / 2, { tile: [0.8, 0.15] });
  }
  for (let x = BX0 + 0.3 + SLAT * 2.5; x < BX1 - 0.4; x += SLAT * 6)
    for (const z of [1.2, 3.6]) b.cyl(M.downlight, 0.04, 0.04, 0.03, x, H - 0.03, z, 8);
  for (const x of [-6, -2.6, 0.6, 3.6, 7]) point(0xffd6a0, 3.2, 7, x, 2.35, 2.4);

  // ---------------------------------------------------------------- back counter

  // White counter along the back wall: urns, hot water, cups, cereal, a sink. Over it a backlit splash and
  // a white bulkhead with a strip of light along its underside. Glass-door drinks fridges beside it.
  const CX0 = -5.6;
  const CX1 = 4.1;
  const CD = 0.65;
  const ccx = (CX0 + CX1) / 2;
  b.box(P.plinth, CX1 - CX0, 0.08, CD - 0.06, ccx, 0, ZB + (CD - 0.06) / 2);
  b.box(P.corian, CX1 - CX0, COUNTER_Y - 0.08 - 0.04, CD, ccx, 0.08, ZB + CD / 2);
  b.box(P.corian, CX1 - CX0 + 0.02, 0.04, CD + 0.02, ccx, COUNTER_Y - 0.04, ZB + (CD + 0.02) / 2);
  b.collide(ccx, ZB + CD / 2, CX1 - CX0, CD, 0, 0, COUNTER_Y);
  b.plane(P.backlit, CX1 - CX0, 0.86, ccx, COUNTER_Y + 0.43, ZB + 0.003);
  b.box(P.corian, CX1 - CX0, H - 1.95, 0.42, ccx, 1.95, ZB + 0.21);
  b.box(P.led, CX1 - CX0 - 0.2, 0.012, 0.03, ccx, 1.938, ZB + 0.36);
  point(0xfff0d8, 1.6, 4, ccx, 1.6, ZB + 0.8);

  // Three coffee urns on a drip tray.
  b.box(M.black, 1.7, 0.03, 0.34, -4.55, COUNTER_Y, ZB + 0.3);
  for (const x of [-5.1, -4.55, -4.0]) {
    b.box(M.black, 0.26, 0.08, 0.26, x, COUNTER_Y + 0.03, ZB + 0.28);
    b.cyl(M.metal, 0.12, 0.12, 0.46, x, COUNTER_Y + 0.11, ZB + 0.28, 10);
    b.cyl(M.black, 0.09, 0.11, 0.05, x, COUNTER_Y + 0.57, ZB + 0.28, 10);
    b.box(M.black, 0.03, 0.05, 0.06, x, COUNTER_Y + 0.13, ZB + 0.43);
  }
  // Hot water tower and paper cup stacks with their lids.
  b.box(M.metal, 0.3, 0.46, 0.34, -3.35, COUNTER_Y, ZB + 0.25);
  b.box(M.black, 0.2, 0.08, 0.02, -3.35, COUNTER_Y + 0.3, ZB + 0.43);
  for (const [i, x] of [-2.85, -2.7, -2.55].entries()) {
    b.cyl(M.paper, 0.045, 0.034, 0.32 + i * 0.04, x, COUNTER_Y, ZB + 0.22, 8);
    b.cyl(M.black, 0.044, 0.044, 0.12, x, COUNTER_Y, ZB + 0.42, 8);
  }
  // Cereal: four gravity dispensers on a steel stand, a knob under each.
  b.box(M.metal, 2.0, 0.03, 0.3, -0.75, COUNTER_Y + 0.3, ZB + 0.22);
  for (const x of [-1.7, 0.2]) b.box(M.metal, 0.03, 0.3, 0.26, x, COUNTER_Y, ZB + 0.22);
  for (const [i, x] of [-1.45, -0.95, -0.45, 0.05].entries()) {
    const fill = 0.2 + ((i * 7) % 4) * 0.05;
    b.box(P.cereal, 0.17, fill, 0.17, x, COUNTER_Y + 0.35, ZB + 0.22);
    b.box(M.glass, 0.2, 0.44, 0.2, x, COUNTER_Y + 0.33, ZB + 0.22);
    b.box(M.black, 0.2, 0.04, 0.2, x, COUNTER_Y + 0.77, ZB + 0.22);
    b.box(M.black, 0.06, 0.06, 0.06, x, COUNTER_Y + 0.22, ZB + 0.36);
    b.box(M.metalDark, 0.12, 0.06, 0.12, x, COUNTER_Y + 0.14, ZB + 0.3);
  }
  // Napkins, a stirrer and sugar caddy, a sink and its gooseneck tap.
  b.box(M.metal, 0.22, 0.14, 0.14, 0.75, COUNTER_Y, ZB + 0.3);
  b.box(M.black, 0.32, 0.08, 0.16, 1.25, COUNTER_Y, ZB + 0.3);
  for (const [i, c] of [0xf2f0e8, 0xd8b04a, 0x6aa0d8, 0xe07aa8].entries()) b.box(M.paper, 0.06, 0.05, 0.12, 1.14 + i * 0.07, COUNTER_Y + 0.04, ZB + 0.3, { faces: { py: { mat: new THREE.MeshLambertMaterial({ color: c }) } } });
  b.plane(P.sink, 0.5, 0.36, 2.6, COUNTER_Y + 0.002, ZB + 0.33, { rx: -Math.PI / 2 });
  b.cyl(M.metal, 0.015, 0.015, 0.36, 2.6, COUNTER_Y, ZB + 0.08, 6);
  b.box(M.metal, 0.03, 0.03, 0.2, 2.6, COUNTER_Y + 0.34, ZB + 0.17);
  b.box(M.metal, 0.03, 0.08, 0.03, 2.6, COUNTER_Y + 0.27, ZB + 0.27);

  // Two drinks fridges, built in to the ceiling.
  for (const x of [4.55, 5.37]) {
    b.box(M.black, 0.8, 2.0, 0.7, x, 0, ZB + 0.35, { solid: true });
    b.plane(P.fridge, 0.74, 1.88, x, 1.02, ZB + 0.702);
    b.box(M.metal, 0.03, 0.9, 0.04, x + 0.3, 0.6, ZB + 0.73);
  }
  b.box(P.wall, 1.64, H - 2.0, 0.7, 4.96, 2.0, ZB + 0.35);
  point(0xdfe9ff, 1.3, 3.2, 4.96, 1.0, ZB + 1.3);

  // ---------------------------------------------------------------- islands and counters

  /**
   * A white solid-surface counter over `outline`'s footprint (from slabOutline) with a dark plinth set
   * well back, and a strip of LED along the floor under it that washes the porcelain warm.
   */
  function counter(x0: number, z0: number, x1: number, z1: number, round: [boolean, boolean], glow = true) {
    const inset = (d: number) => slabOutline(x0 + d, z0 + d, x1 - d, z1 - d, round);
    b.prism(P.plinth, inset(0.12), 0, 0.1);
    if (glow) b.prism(P.led, inset(0.05), 0, 0.018);
    b.prism(P.corian, inset(0), 0.1, COUNTER_Y - 0.14);
    b.prism(P.corian, inset(-0.025), COUNTER_Y - 0.04, 0.04);
    const [cx, cz, w, d] = [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0];
    b.collide(cx, cz, w - d * 0.3, d * 0.92, 0, 0, COUNTER_Y);
    b.collide(cx, cz, w - d, d + 0.05, 0, 0, COUNTER_Y);
    if (glow) point(0xffdcaa, 0.7, 2.4, cx, 0.14, cz);
  }

  // Two islands down the middle of the room.
  const ISLAND_Z: [number, number] = [1.45, 2.55];
  counter(-4.5, ISLAND_Z[0], -0.7, ISLAND_Z[1], [true, true]);
  counter(1.7, ISLAND_Z[0], 5.1, ISLAND_Z[1], [true, true]);
  // On the first: napkins, cutlery, plates, cups and a couple of mugs left behind.
  const IY = COUNTER_Y;
  b.box(M.metal, 0.22, 0.14, 0.14, -4.0, IY, 2.0);
  b.box(M.metalDark, 0.5, 0.1, 0.22, -3.4, IY, 2.0);
  for (const [i, x] of [-3.57, -3.4, -3.23].entries()) b.box(M.metal, 0.12, 0.02, 0.16, x, IY + 0.1 + i * 0.002, 2.0);
  b.cyl(M.white, 0.12, 0.11, 0.12, -2.7, IY, 2.0, 12);
  prop('paperCup', -2.1, IY, 1.85);
  prop('paperCup', -1.95, IY, 2.15);
  prop('mug1', -1.3, IY, 1.75);
  prop('mug0', -1.15, IY, 2.3);
  // On the second: hot sauce, salt and pepper, more cups.
  for (const [i, x] of [2.3, 2.4, 2.5].entries()) b.cyl(i === 2 ? M.white : P.sauce, 0.025, 0.025, 0.16, x, IY, 2.0, 6);
  b.cyl(M.white, 0.02, 0.02, 0.09, 2.7, IY, 1.95, 6);
  b.cyl(M.black, 0.02, 0.02, 0.09, 2.76, IY, 1.95, 6);
  prop('paperCup', 3.6, IY, 1.8);
  prop('mug3', 4.4, IY, 2.25);

  // The fruit counter along the windows at the west end, with four trays set into its top.
  const FZ: [number, number] = [4.0, ZP];
  counter(-7.6, FZ[0], -1.4, FZ[1], [true, false]);
  const trays: [string, number][] = [['banana', -6.6], ['apple', -5.15], ['orange', -3.7], ['appleGreen', -2.25]];
  const TY = COUNTER_Y + 0.02;
  for (const [kind, cx] of trays) {
    const [tw, td, tz] = [1.3, 0.62, (FZ[0] + FZ[1]) / 2 - 0.04];
    b.box(P.corian, tw, 0.02, td, cx, COUNTER_Y, tz, { solid: true });
    for (const s of [-1, 1]) {
      b.box(P.corian, tw, 0.07, 0.02, cx, COUNTER_Y, tz + s * (td / 2 - 0.01), { solid: true });
      b.box(P.corian, 0.02, 0.07, td, cx + s * (tw / 2 - 0.01), COUNTER_Y, tz, { solid: true });
    }
    if (kind === 'banana')
      for (let i = 0; i < 9; i++) prop(kind, cx - 0.45 + (i % 5) * 0.22, TY + Math.floor(i / 5) * 0.03, tz - 0.12 + Math.floor(i / 5) * 0.22, Math.PI / 2 + (r() - 0.5) * 0.6);
    else
      for (let i = 0; i < 12; i++) prop(kind, cx - 0.48 + (i % 6) * 0.19 + (r() - 0.5) * 0.03, TY, tz - 0.14 + Math.floor(i / 6) * 0.26 + (r() - 0.5) * 0.03);
  }

  // A walnut ledge along the rest of the windows, where people stand with their coffee.
  const LX: [number, number] = [-1.4, BX1 - 0.4];
  b.box(P.walnut, LX[1] - LX[0], 0.05, 0.6, (LX[0] + LX[1]) / 2, 1.0, ZP - 0.3, { tile: [1.2, 0.3] });
  b.box(P.corian, LX[1] - LX[0], 1.0, 0.2, (LX[0] + LX[1]) / 2, 0, ZP - 0.1);
  b.collide((LX[0] + LX[1]) / 2, ZP - 0.3, LX[1] - LX[0], 0.6, 0, 0, 1.05);
  prop('paperCup', 1.2, 1.05, ZP - 0.3);
  prop('mug2', 6.3, 1.05, ZP - 0.25);

  // ---------------------------------------------------------------- feature stair

  // The opening for the stair down to 14, with glass balustrade all round, a walnut cap rail on it, and
  // the slab's white edge showing under the glass. The flight runs down along its south side.
  const [SX0, SZ0, SX1, SZ1] = STAIR;
  const RAIL_H = 1.07;
  const edges: [number, number, number, number][] = [
    [SX0, SZ0, SX1, SZ0],
    [SX0, SZ1, SX1, SZ1],
    [SX0, SZ0, SX0, SZ1],
    [SX1, SZ0, SX1, SZ1],
  ];
  for (const [x0, z0, x1, z1] of edges) {
    const alongX = z0 === z1;
    const len = alongX ? x1 - x0 : z1 - z0;
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const ry = alongX ? 0 : Math.PI / 2;
    b.push(cx, cz, ry);
    b.box(P.wall, len + 0.1, 0.35, 0.05, 0, -0.36, 0);
    b.plane(M.glass, len, RAIL_H + 0.15, 0, (RAIL_H - 0.15) / 2, 0);
    b.box(P.walnut, len + 0.06, 0.05, 0.07, 0, RAIL_H, 0, { tile: [1.2, 0.3] });
    for (let s = -len / 2 + 0.3; s < len / 2; s += 1.2) b.cyl(M.metal, 0.025, 0.025, 0.03, s, -0.08, 0.03, 6);
    b.pop();
    b.collide(cx, cz, alongX ? len : 0.08, alongX ? 0.08 : len, 0, 0, RAIL_H + 0.05);
  }
  // The flight: lit white treads on two dark steel stringers, down toward the west.
  const FLIGHT: [number, number] = [-4.75, SZ1 - 0.08];
  const fw = FLIGHT[1] - FLIGHT[0];
  const fz = (FLIGHT[0] + FLIGHT[1]) / 2;
  for (let k = 1; k <= STEPS; k++) {
    const x = SX1 - (k - 0.5) * RUN;
    b.box(P.tread, RUN + 0.02, 0.04, fw, x, -k * RISE - 0.04, fz);
    b.collide(x, fz, RUN, fw, 0, -k * RISE - 0.04, -k * RISE);
  }
  const slope = Math.atan2(FLOOR_TO_FLOOR, STEPS * RUN);
  const flightLen = Math.hypot(FLOOR_TO_FLOOR, STEPS * RUN);
  for (const z of FLIGHT) {
    b.add(boxGeo(0.04, 0.32, flightLen), M.metalDark, SX1 - (STEPS * RUN) / 2, -FLOOR_TO_FLOOR / 2 - 0.2, z, Math.PI / 2, -slope);
  }
  // Floor 14 below: just enough of it to look down onto.
  const below: Rect = [SX0 - 2.5, ZC, SX1 + 1.5, SZ1 + 1.5];
  b.plane(P.porcelain, below[2] - below[0], below[3] - below[1], (below[0] + below[2]) / 2, -FLOOR_TO_FLOOR, (below[1] + below[3]) / 2, { rx: -Math.PI / 2, tile: [1.2, 0.6] });
  b.collide((below[0] + below[2]) / 2, (below[1] + below[3]) / 2, below[2] - below[0], below[3] - below[1], 0, -FLOOR_TO_FLOOR - 1, -FLOOR_TO_FLOOR);
  point(0xfff0dc, 1.4, 6, (SX0 + SX1) / 2, -1.2, (SZ0 + SZ1) / 2);

  // ---------------------------------------------------------------- reef tank

  // On a walnut cabinet between the stair and the pantry: sand, purple live rock, coral, a light bar over
  // the water, and a frosted canopy up to the ceiling. The fish are separate meshes so they can swim.
  const { x: tx, z: tz, w: tw, d: td } = TANK;
  const TANK_Y = 0.85;
  const TANK_TOP = 2.12;
  b.box(P.walnut, tw + 0.06, TANK_Y, td + 0.06, tx, 0, tz, { solid: true, tile: [1.2, 0.3] });
  b.box(P.sand, tw - 0.04, 0.08, td - 0.04, tx, TANK_Y, tz);
  for (let i = 0; i < 9; i++) {
    const rz = tz + (i / 8 - 0.5) * (td - 0.4);
    b.sphere(P.liveRock, 0.14 + r() * 0.12, tx + (r() - 0.5) * 0.4, TANK_Y + 0.12 + r() * 0.1, rz, 0.75);
    if (i % 2 === 0) b.sphere(P.liveRock, 0.1 + r() * 0.08, tx + (r() - 0.5) * 0.4, TANK_Y + 0.32 + r() * 0.12, rz, 0.8);
  }
  for (let i = 0; i < 6; i++) {
    const cz = tz + (r() - 0.5) * (td - 0.3);
    const cx = tx + (r() - 0.5) * (tw - 0.3);
    b.cyl(i % 2 ? P.coral : P.coralPink, 0.06, 0.02, 0.18, cx, TANK_Y + 0.3 + r() * 0.15, cz, 6);
  }
  b.box(P.water, tw - 0.04, TANK_TOP - TANK_Y - 0.14, td - 0.04, tx, TANK_Y + 0.02, tz);
  b.box(M.glass, tw, TANK_TOP - TANK_Y, td, tx, TANK_Y, tz);
  b.collide(tx, tz, tw, td, 0, TANK_Y, TANK_TOP);
  b.box(P.tankLight, tw - 0.3, 0.03, td - 0.3, tx, TANK_TOP + 0.02, tz);
  b.box(P.canopy, tw + 0.06, H - TANK_TOP - 0.05, td + 0.06, tx, TANK_TOP + 0.05, tz);
  point(0x9fd8ff, 2.4, 4.5, tx, 1.8, tz);
  point(0x6fb8ff, 1.0, 3, tx + 1.0, 1.4, tz);

  const fishGroup = new THREE.Group();
  const fishColors = [0xf07a1c, 0xf07a1c, 0xf2d61e, 0xf2d61e, 0x2a5cd8, 0x2a5cd8, 0x8a3ad0, 0xd8302a, 0xf2f2f2];
  const fishGeo = new THREE.BoxGeometry(0.018, 0.05, 0.085);
  const fish = Array.from({ length: 14 }, (_, i) => {
    const mesh = new THREE.Mesh(fishGeo, new THREE.MeshBasicMaterial({ color: fishColors[i % fishColors.length] }));
    fishGroup.add(mesh);
    return { mesh, phase: r() * Math.PI * 2, speed: 0.25 + r() * 0.3, x: (r() - 0.5) * 0.5, y: 1.15 + r() * 0.7, wobble: r() * 6 };
  });
  const _prev = new THREE.Vector3();
  function swim(t: number) {
    for (const f of fish) {
      const a = t * f.speed + f.phase;
      _prev.copy(f.mesh.position);
      f.mesh.position.set(
        tx + f.x * 0.6 + Math.sin(a * 2.3 + f.wobble) * 0.12,
        f.y + Math.sin(a * 0.7 + f.wobble) * 0.12,
        tz + Math.sin(a) * (td / 2 - 0.2),
      );
      const dx = f.mesh.position.x - _prev.x;
      const dz = f.mesh.position.z - _prev.z;
      if (dx * dx + dz * dz > 1e-10) f.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  // ---------------------------------------------------------------- stair hall

  // Acoustic-tile ceiling with a few downlights left on, and plants in the window corners.
  for (const [x, z] of [[-14, -1.0], [-14, 2.5], [-10.5, 0.5], [-10.5, 3.5]]) b.cyl(M.downlight, 0.06, 0.06, 0.02, x, H - 0.02, z, 10);
  point(0xffe2b8, 3.4, 7, -12.2, 2.4, 1.2);
  point(0xffe2b8, 2.4, 6, -15.5, 2.4, 3.5);
  prop('plant', -XW + 0.6, 0, ZP - 0.6);
  prop('plant', -9.0, 0, ZP - 0.6);

  // ---------------------------------------------------------------- open office

  // Two runs of benching desks, Bloomberg-style: back to back, a low divider between, two screens a seat.
  // Most are dark; a few terminals have been left up overnight.
  const DESK_Y = 0.74;
  const SEATS = 4;
  const SEAT_W = 1.45;
  const runX = (XW + OFFICE_X) / 2 + 0.2;
  const terminals = new Set(['0,1,2', '1,-1,0', '1,1,3']);
  [-3.4, 1.6].forEach((rz, run) => {
    const len = SEATS * SEAT_W;
    b.box(P.corian, len, 0.03, 1.6, runX, DESK_Y - 0.03, rz, { solid: true });
    b.box(M.frosted, len, 0.3, 0.02, runX, DESK_Y, rz);
    for (const ex of [-len / 2 + 0.05, len / 2 - 0.05]) b.box(M.metal, 0.05, DESK_Y - 0.03, 1.5, runX + ex, 0, rz, { solid: true });
    for (const side of [-1, 1]) {
      for (let k = 0; k < SEATS; k++) {
        const sx = runX - len / 2 + (k + 0.5) * SEAT_W;
        const on = terminals.has(`${run},${side},${k}`);
        // The sitter faces the divider; the screens face them.
        const facing = side > 0 ? 0 : Math.PI;
        for (const dx of [-0.29, 0.29]) {
          b.push(sx + dx, rz + side * 0.22, facing);
          b.box(M.bezel, 0.56, 0.34, 0.03, 0, 0.98, 0);
          b.plane(on ? P.terminal : M.screenOff, 0.52, 0.3, 0, 1.15, 0.016);
          b.box(M.black, 0.04, 0.24, 0.04, 0, DESK_Y, -0.04);
          b.box(M.black, 0.2, 0.012, 0.16, 0, DESK_Y, -0.04);
          b.pop();
        }
        b.collide(sx, rz + side * 0.22, 1.16, 0.06, 0, 0.98, 1.32);
        if (on) point(0xffa850, 0.5, 2.2, sx, 1.15, rz + side * 0.55);
        prop('bbgKeyboard', sx + (r() - 0.5) * 0.06, DESK_Y, rz + side * 0.48, facing + (r() - 0.5) * 0.1);
        prop('mouse', sx + 0.32, DESK_Y, rz + side * 0.48, facing);
        if (r() < 0.3) prop(`mug${Math.floor(r() * 4)}`, sx - 0.5, DESK_Y, rz + side * 0.42);
        prop('chair', sx + (r() - 0.5) * 0.3, 0, rz + side * (1.25 + r() * 0.2), facing + (r() - 0.5) * 0.8);
      }
    }
  });
  // Ceiling lights over the desks, all but one off; Bloomberg TV on mute on the core wall.
  for (const x of [10.6, 13.4, 16.2])
    for (const z of [-4.8, -1.8, 1.2, 3.9]) {
      const on = x === 13.4 && z === -1.8;
      b.plane(on ? M.lightOn : M.lightOff, 0.6, 1.2, x, H - 0.005, z, { rx: Math.PI / 2 });
      if (on) point(0xe6eeff, 4, 8, x, 2.6, z);
    }
  b.box(M.bezel, 1.69, 0.975, 0.05, 13.0, 0.99, ZC + 0.025);
  b.plane(M.news, 1.586, 0.7865, 13.0, 1.5263, ZC + 0.052);
  b.plane(M.newsTicker, 1.586, 0.0975, 13.0, 1.0843, ZC + 0.052);
  point(0x8fb0ff, 0.6, 3, 13.0, 1.5, ZC + 0.7);

  // ---------------------------------------------------------------- assemble

  // The floor slab has the stairwell cut out of it, so the scene's own ground is only the part east of the
  // opening; the rest of the slab, and the ceiling over all of it, are colliders here.
  const out: Bounds = [-XW - 0.5, ZC - 0.5, XW + 0.5, ZW + 0.5];
  const slab = ([x0, z0, x1, z1]: Bounds, y0: number, y1: number) =>
    b.collide((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, y0, y1);
  slab([out[0], out[1], SX1, SZ0], -1, 0);
  slab([out[0], SZ1, SX1, out[3]], -1, 0);
  slab([out[0], SZ0, SX0, SZ1], -1, 0);
  slab(out, H, H + 1);

  const group = b.build();
  for (const l of lights) group.add(l);
  group.add(fishGroup);
  const city = buildSkyline(ELEVATION);
  group.add(city.group);
  // Night: cool ambient, moonlight through the glass, orange street glow from Third Avenue below.
  group.add(new THREE.AmbientLight(0x7884aa, 0.9));
  const moonlight = new THREE.DirectionalLight(0x9aa8d8, 0.45);
  moonlight.position.set(-0.45, 0.5, 0.87);
  group.add(moonlight);
  const streetGlow = new THREE.DirectionalLight(0xd89a70, 0.2);
  streetGlow.position.set(0.2, -1, -0.3);
  group.add(streetGlow);
  const ticker = M.newsTicker.map!;

  const walls = 0.3;
  return {
    subtitle: 'BLOOMBERG &middot; 919 THIRD AVE &middot; FLOOR 15 PANTRY &middot; 2:13 AM',
    group,
    colliders: b.colliders,
    props,
    templates: propTemplates(M),
    floor: [SX1, out[1], out[2], out[3]],
    walkable: [-XW + walls, ZC + walls, XW - walls, ZP - walls],
    fog: { color: FOG_COLOR, density: 0.0012 },
    ambience: 'office',
    spawn: { x: -6.8, z: 3.2, yaw: -Math.PI / 2 },
    surfaceAt: (x) => (x > OFFICE_X ? 'carpet' : 'stone'),
    update: (t, dt, camera) => {
      ticker.offset.x = (ticker.offset.x + dt * 0.04) % 1;
      swim(t);
      city.update(t, dt, camera);
    },
  };
}

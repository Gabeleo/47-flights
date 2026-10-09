import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Soundscape } from './audio';
import { strut, type Glow } from './el';
import { Builder, type BoxFace } from './geometry';
import type { Physics } from './physics';
import type { Action } from './player';
import type { PropSpawn } from './props';
import { CURB, EL, flatWalk, stairWalk, type Walk } from './streetPlan';
import type { StreetMats } from './streetTextures';

// 36 Av on the Astoria Line. Street stairs climb the 31st Street sidewalks from three corners (none on
// the north-east) to landings that bridge into the station house slung under the tracks over the
// avenue. Inside, unpaid lobbies at the north and south ends, a line of turnstiles across each with the
// agent's booth in the middle, and the paid area between, where it's a free crossover between the two
// directions. From the paid area two stairs go up to each side platform: west for Manhattan, east for
// Astoria-Ditmars Blvd.

const X = EL.x;
/** Mezzanine floor and ceiling, and the platforms. */
const FY = EL.houseBottom;
const CY = EL.houseTop;
const PY = EL.platform;
/** Half-extents of the station house. */
const HX = 9.6;
const HZ = EL.houseHalf;
const WALL = 0.15;
/** Platforms run from the edge by the tracks out to the windscreens. */
const EDGE = 5.85;
const OUTER = 9.1;
const PH = EL.platformHalf;
const CANOPY = 40;
/** Platform stairs: a strip each side, rising from z = SZ0 out to SZ1 each way, through a hole in the platform from HOLE. */
const SX0 = 6.55;
const SX1 = 8.45;
const SZ0 = 1.5;
const SZ1 = 10.5;
const HOLE = 6.5;
/** The turnstile lines, either side of the paid area. */
const LINE = 8;
/** Street stairs: centre line, width, foot and head along 31st, and the landing from the head into the house. */
const STAIR_X = 11.3;
const STAIR_W = 1.9;
const STAIR_FOOT = 21;
const STAIR_HEAD = 12.6;
const LANDING: [number, number] = [10.8, 12.6];
const LANDING_X = 12.4;
const BRIDGE_H = 2.6;
const DOOR_H = 2.5;
/** Which corners have stairs: west or east of 31st, south or north of the avenue. */
const CORNERS: [number, number][] = [
  [-1, 1],
  [1, 1],
  [-1, -1],
];

/** One turnstile: where it is, which line, its arms and reader, and whether it'll turn. */
type Turnstile = {
  x: number;
  /** +1 for the south line, -1 for the north; the unpaid side is further out from the middle. */
  e: number;
  arms: THREE.Group;
  screen: THREE.Mesh;
  collider: RAPIER.Collider | null;
  /** Seconds it stays free to turn. */
  unlock: number;
  /** Someone has just gone through and is still in the arms' way; it locks once they're clear. */
  clearing: boolean;
  /** Which side the player was last on while in its lane: +1 unpaid, -1 paid, 0 not in it. */
  side: number;
  /** Turns made, and how far the arms have got. */
  turns: number;
  angle: number;
};

export function buildStation(b: Builder, M: StreetMats, sound: Soundscape) {
  const glows: Glow[] = [];
  const globes: THREE.Vector3[] = [];
  const walks: Walk[] = [];
  const props: PropSpawn[] = [];
  const group = new THREE.Group();
  const light = (x: number, y: number, z: number, intensity: number, distance: number, color = 0xeef4ff) =>
    glows.push({ pos: new THREE.Vector3(X + x, y, z), color, intensity, distance });

  // Floors and ceilings are laid the way the office floor is. Vertex snapping moves each vertex on its
  // own, so where one slab's corner sits partway along another's edge (a T-junction) a crack opens onto
  // whatever's below, and anything laid a few centimetres over another surface fights it for depth.
  // So each level's areas register first, then the level is cut along every area's edges into cells
  // that meet only corner to corner, each cell finished in the last area laid over it.
  type Area = { rect: [number, number, number, number]; mat: THREE.Material; tile: number };

  /** A floor area at height y, standing on it and holding props up included. */
  function floorArea(areas: Area[], mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number, tile: number) {
    const rect: Area['rect'] = [X + Math.min(x0, x1), Math.min(z0, z1), X + Math.max(x0, x1), Math.max(z0, z1)];
    areas.push({ rect, mat, tile });
    b.collide((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2, rect[2] - rect[0], rect[3] - rect[1], 0, y - 0.3, y, true);
    walks.push(flatWalk(rect[0], rect[1], rect[2], rect[3], y));
  }

  /**
   * A quad through four corners given as world (x, y, z), wound so its front faces `normal`, its texture
   * repeating every `tile` along u and v. Built from the corners exactly rather than moved into place,
   * so where two quads share an edge their vertices are the very same numbers and no pixel drops out.
   */
  function quad(mat: THREE.Material, corners: number[][], normal: [number, number, number], uvs: number[][]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([...normal, ...normal, ...normal, ...normal], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
    // Wind each triangle to face the normal.
    const [a, c, d] = [new THREE.Vector3(...corners[0]), new THREE.Vector3(...corners[1]), new THREE.Vector3(...corners[2])];
    const facing = c.sub(a).cross(d.sub(a)).dot(new THREE.Vector3(...normal)) > 0;
    g.setIndex(facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    b.add(g, mat, 0, 0, 0);
  }

  /**
   * Lay a level's areas as slabs `depth` deep with their finish on top (a floor at y) or underneath (a
   * ceiling at y), steel everywhere else, the finish's texture anchored to the world so it runs on
   * unbroken from cell to cell. Sides only go where a cell has no neighbour.
   */
  function lay(areas: Area[], y: number, depth: number, up: boolean) {
    const cuts = (k: 0 | 1) => {
      const v = areas.flatMap((a) => [a.rect[k], a.rect[k + 2]]).sort((p, q) => p - q);
      return v.filter((x, i) => i === 0 || x - v[i - 1] > 1e-6);
    };
    const [xs, zs] = [cuts(0), cuts(1)];
    const at = (i: number, j: number) => {
      if (i < 0 || j < 0 || i + 1 >= xs.length || j + 1 >= zs.length) return undefined;
      const [cx, cz] = [(xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2];
      return [...areas].reverse().find(({ rect: r }) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3]);
    };
    const [yf, yb] = up ? [y, y - depth] : [y, y + depth];
    const flatUV = (tile: number, pts: number[][]) => pts.map(([x, , z]) => [x / tile, -z / tile]);
    for (let i = 0; i + 1 < xs.length; i++)
      for (let j = 0; j + 1 < zs.length; j++) {
        const area = at(i, j);
        if (!area) continue;
        const [x0, x1, z0, z1] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
        const finish = [[x0, yf, z0], [x1, yf, z0], [x1, yf, z1], [x0, yf, z1]];
        const back = [[x0, yb, z0], [x1, yb, z0], [x1, yb, z1], [x0, yb, z1]];
        quad(area.mat, finish, [0, up ? 1 : -1, 0], flatUV(area.tile, finish));
        quad(M.elSteel, back, [0, up ? -1 : 1, 0], flatUV(2, back));
        const [lo, hi] = [Math.min(yf, yb), Math.max(yf, yb)];
        const side = (pts: number[][], n: [number, number, number], len: number) =>
          quad(M.elSteel, pts, n, [[0, 0], [len / 2, 0], [len / 2, depth / 2], [0, depth / 2]]);
        if (!at(i - 1, j)) side([[x0, lo, z0], [x0, lo, z1], [x0, hi, z1], [x0, hi, z0]], [-1, 0, 0], z1 - z0);
        if (!at(i + 1, j)) side([[x1, lo, z0], [x1, lo, z1], [x1, hi, z1], [x1, hi, z0]], [1, 0, 0], z1 - z0);
        if (!at(i, j - 1)) side([[x0, lo, z0], [x1, lo, z0], [x1, hi, z0], [x0, hi, z0]], [0, 0, -1], x1 - x0);
        if (!at(i, j + 1)) side([[x0, lo, z1], [x1, lo, z1], [x1, hi, z1], [x0, hi, z1]], [0, 0, 1], x1 - x0);
      }
  }

  /**
   * A wall `len` long centred at (x, z), running along z (alongZ) or x, from y0 to y1; solid. Its face
   * toward `out` (+1 or -1 on the axis across it) is `outer`, the rest `inner`.
   */
  function wall(alongZ: boolean, x: number, z: number, len: number, y0: number, y1: number, out: number, outer: THREE.Material, inner: THREE.Material) {
    if (len < 0.01) return;
    const [w, d] = alongZ ? [WALL, len] : [len, WALL];
    const face: BoxFace = alongZ ? (out > 0 ? 'px' : 'nx') : out > 0 ? 'pz' : 'nz';
    const tile: [number, number] = outer === M.mylar ? [4, CY - FY] : [1.2, 1.2];
    b.box(inner, w, y1 - y0, d, X + x, y0, z, { tile: [1.2, 1.2], faces: { [face]: { mat: outer, tile } }, solid: true });
  }

  // ---------------------------------------------------------------- the station house

  const mezzanine: Area[] = [];
  floorArea(mezzanine, M.terrazzo, -HX, -HZ, HX, HZ, FY, 1.2);
  // Strip lights along the soffit, lighting the intersection below.
  for (const x of [-6, -2, 2, 6]) for (const z of [-9, -3, 3, 9]) b.box(M.fluoro, 1.4, 0.06, 0.18, X + x, FY - 0.4, z);
  for (const [x, z] of [[-5, -6], [5, -6], [-5, 6], [5, 6]]) light(x, FY - 0.8, z, 22, 14);
  // A heavy fascia round the bottom and the top, standing proud of the walls, its inside face buried in
  // them so no face of it lies in the plane of theirs.
  for (const y of [FY - 0.45, CY - 0.05]) {
    for (const s of [-1, 1]) {
      b.box(M.elSteel, 0.3, 0.4, 2 * HZ + 0.4, X + s * (HX + 0.05), y, 0);
      b.box(M.elSteel, 2 * (HX - 0.1), 0.4, 0.3, X, y, s * (HZ + 0.05));
    }
  }

  // Ceiling, open over the platform stairs where they climb through it.
  const ceilings: Area[] = [];
  const ceiling = (x0: number, z0: number, x1: number, z1: number) =>
    ceilings.push({ rect: [X + x0, z0, X + x1, z1], mat: M.stationCeiling, tile: 1.2 });
  ceiling(-SX0, -HZ, SX0, HZ);
  for (const s of [-1, 1]) {
    const [a, c] = s > 0 ? [SX0, SX1] : [-SX1, -SX0];
    const [o0, o1] = s > 0 ? [SX1, HX] : [-HX, -SX1];
    ceiling(o0, -HZ, o1, HZ);
    ceiling(a, -SZ0, c, SZ0);
    ceiling(a, SZ1, c, HZ);
    ceiling(a, -HZ, c, -SZ1);
  }
  lay(ceilings, CY, 0.2, false);

  // Walls: frosted panels glowing outside, white tile inside, with a doorway where each landing comes in.
  for (const sx of [-1, 1]) {
    const doors = CORNERS.filter(([cx]) => cx === sx).map(([, sz]) => (sz > 0 ? LANDING : ([-LANDING[1], -LANDING[0]] as [number, number])));
    doors.sort((a, c) => a[0] - c[0]);
    let z = -HZ;
    for (const [d0, d1] of [...doors, [HZ, HZ] as [number, number]]) {
      wall(true, sx * (HX - WALL / 2), (z + d0) / 2, d0 - z, FY, CY, sx, M.mylar, M.stationWall);
      if (d1 > d0) wall(true, sx * (HX - WALL / 2), (d0 + d1) / 2, d1 - d0, FY + DOOR_H, CY, sx, M.mylar, M.stationWall);
      z = d1;
    }
    // The name, facing down the avenue both ways.
    for (const sz of [-6.5, 0, 6.5]) b.plane(M.stationSign, 6, 0.75, X + sx * (HX + 0.12), CY - 0.85, sz, { ry: (sx * Math.PI) / 2 });
  }
  // The end walls fit between the side walls rather than overlapping their corners.
  for (const sz of [-1, 1]) wall(false, 0, sz * (HZ - WALL / 2), 2 * (HX - WALL), FY, CY, sz, M.mylar, M.stationWall);

  // ---------------------------------------------------------------- street stairs

  // Each climbs a 31st Street sidewalk toward the avenue to a landing, which turns into the house.
  const STEPS = 25;
  for (const [sx, sz] of CORNERS) {
    const x = sx * STAIR_X;
    const foot = sz * STAIR_FOOT;
    const head = sz * STAIR_HEAD;
    const rise = (FY - CURB) / STEPS;
    const run = (foot - head) / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const z = foot - run * (i + 0.5);
      const y = CURB + rise * (i + 1);
      // Each riser stops under its tread, so the two never share a face for snapping to fight over.
      b.box(M.concrete, STAIR_W - 0.1, 0.06, Math.abs(run) + 0.04, X + x, y - 0.06, z);
      b.box(M.elSteel, STAIR_W - 0.1, rise - 0.06, 0.03, X + x, y - rise, z + run / 2 - Math.sign(run) * 0.03);
    }
    for (const e of [-1, 1]) {
      const ex = X + x + (e * STAIR_W) / 2;
      strut(b, M.elSteel, [ex, CURB + 0.2, foot], [ex, FY - 0.2, head], 0.1, 0.4);
      // Solid side panels to waist height, then a rail, stopping short of the landing so their square-cut
      // ends don't poke through into it.
      const k = 0.4 / (STAIR_FOOT - STAIR_HEAD);
      const top = (y: number) => [ex, y - (FY - CURB) * k, head + sz * 0.4];
      strut(b, M.elSteel, [ex, CURB + 0.75, foot], top(FY + 0.75), 0.06, 0.9);
      strut(b, M.poleDark, [ex, CURB + 1.15, foot], top(FY + 1.15), 0.08, 0.08);
      b.collide(ex, (foot + head) / 2, 0.12, Math.abs(foot - head), 0, 0, FY + 1.2);
    }
    walks.push(stairWalk(X + x - STAIR_W / 2, X + x + STAIR_W / 2, foot, CURB, head, FY));
    // Nobody walks in under the high end of it.
    const low = STAIR_FOOT - ((2.3 - CURB) / (FY - CURB)) * (STAIR_FOOT - STAIR_HEAD);
    b.collide(X + x, (sz * (low + STAIR_HEAD)) / 2, STAIR_W, low - STAIR_HEAD, 0, 0, 2.0);
    for (const z of [head, (foot + head) / 2]) b.box(M.elSteel, 0.25, z === head ? FY - 0.25 : (FY + CURB) / 2, 0.25, X + x + sx * 0.75, 0, z);

    // The landing: an enclosed bridge from the head of the stair into the house.
    const [l0, l1] = LANDING;
    const lx0 = sx * HX;
    const lx1 = sx * LANDING_X;
    floorArea(mezzanine, M.terrazzo, Math.min(lx0, lx1), sz * l0, Math.max(lx0, lx1), sz * l1, FY, 1.2);
    const mid = (n0: number, n1: number) => (sx * (n0 + n1)) / 2;
    // The walls along the landing run from inside the house wall to inside the end wall, so their ends
    // are buried rather than flush with either.
    const [in0, in1] = [HX - WALL / 2, LANDING_X - WALL / 2];
    wall(false, mid(in0, in1), sz * l0, in1 - in0, FY, FY + BRIDGE_H, -sz, M.mylar, M.stationWall);
    wall(true, sx * (LANDING_X - WALL / 2), (sz * (l0 + l1)) / 2, l1 - l0, FY, FY + BRIDGE_H, sx, M.mylar, M.stationWall);
    const sx0 = STAIR_X - STAIR_W / 2;
    const sx1 = STAIR_X + STAIR_W / 2;
    wall(false, mid(in0, sx0), sz * l1, sx0 - in0, FY, FY + BRIDGE_H, sz, M.mylar, M.stationWall);
    wall(false, mid(sx1, in1), sz * l1, in1 - sx1, FY, FY + BRIDGE_H, sz, M.mylar, M.stationWall);
    wall(false, mid(sx0, sx1), sz * l1, STAIR_W, FY + 2.2, FY + BRIDGE_H, sz, M.mylar, M.stationWall);
    b.box(M.elSteel, LANDING_X - HX, 0.15, l1 - l0, X + mid(HX, LANDING_X), FY + BRIDGE_H, (sz * (l0 + l1)) / 2, {
      faces: { ny: { mat: M.stationCeiling, tile: 1.2 } },
    });
    b.box(M.fluoro, 1.2, 0.04, 0.14, X + mid(HX, LANDING_X), FY + BRIDGE_H - 0.07, (sz * (l0 + l1)) / 2);
    light(mid(HX, LANDING_X), FY + 2.2, (sz * (l0 + l1)) / 2, 4, 6);

    // Green globes either side of the foot: open all night.
    for (const e of [-1, 1]) {
      const gx = X + x + (e * (STAIR_W + 0.3)) / 2;
      b.cyl(M.poleDark, 0.05, 0.06, 2.3, gx, CURB, foot + sz * 0.3, 6);
      b.sphere(M.globe, 0.2, gx, CURB + 2.5, foot + sz * 0.3);
      globes.push(new THREE.Vector3(gx, CURB + 2.5, foot + sz * 0.3));
      b.collide(gx, foot + sz * 0.3, 0.15, 0.15, 0, 0, 2.7);
    }
    b.box(M.poleDark, STAIR_W + 0.2, 0.35, 0.05, X + x, CURB + 2.6, foot + sz * 0.32);
    b.plane(M.stationSign, STAIR_W, 0.25, X + x, CURB + 2.775, foot + sz * 0.35, { ry: sz > 0 ? 0 : Math.PI });
    glows.push({ pos: new THREE.Vector3(X + x, CURB + 2.6, foot + sz * 0.6), color: 0x5aff8a, intensity: 2.5, distance: 5 });
  }

  lay(mezzanine, FY, 0.3, true);

  // ---------------------------------------------------------------- stairs up to the platforms

  const PSTEPS = 30;
  for (const s of [-1, 1])
    for (const e of [-1, 1]) {
      const x0 = s * SX0;
      const x1 = s * SX1;
      const xc = s * ((SX0 + SX1) / 2);
      const w = SX1 - SX0;
      const rise = (PY - FY) / PSTEPS;
      const run = (SZ1 - SZ0) / PSTEPS;
      for (let i = 0; i < PSTEPS; i++) {
        const z = e * (SZ0 + run * (i + 0.5));
        const y = FY + rise * (i + 1);
        b.box(M.terrazzo, w - 0.04, 0.06, run + 0.04, X + xc, y - 0.06, z);
        b.box(M.elSteel, w - 0.04, rise - 0.06, 0.03, X + xc, y - rise, z - (e * run) / 2 + e * 0.03);
      }
      walks.push(stairWalk(X + x0, X + x1, e * SZ0, FY, e * SZ1, PY));
      // Walled in from the mezzanine up to the underside of the platform, railed round the hole above it.
      for (const wx of [x0, x1]) {
        b.box(M.stationWall, 0.12, PY - 0.3 - FY, SZ1 - SZ0, X + wx, FY, (e * (SZ0 + SZ1)) / 2, { tile: 1.2 });
        b.collide(X + wx, (e * (SZ0 + SZ1)) / 2, 0.12, SZ1 - SZ0, 0, FY, PY - 0.3);
        b.plane(M.railing, SZ1 - HOLE, 1.0, X + wx, PY + 0.5, (e * (HOLE + SZ1)) / 2, { ry: Math.PI / 2, tile: [0.6, 1.0] });
        b.box(M.poleDark, 0.06, 0.06, SZ1 - HOLE, X + wx, PY + 1.0, (e * (HOLE + SZ1)) / 2);
        b.collide(X + wx, (e * (HOLE + SZ1)) / 2, 0.12, SZ1 - HOLE, 0, PY, PY + 1.1);
      }
      b.plane(M.railing, w, 1.0, X + xc, PY + 0.5, e * HOLE, { tile: [0.6, 1.0] });
      b.box(M.poleDark, w, 0.06, 0.06, X + xc, PY + 1.0, e * HOLE);
      b.collide(X + xc, e * HOLE, w, 0.12, 0, PY, PY + 1.1);
      // A strip light down the shaft's inner wall, halfway up.
      b.box(M.fluoro, 0.04, 0.12, 1.4, X + x0 - s * 0.08, FY + 3.6, e * 5.5);
      light(xc, FY + 3.4, e * 5.5, 5, 7);
      // Under the head of the stair, closing the shaft off from the lobby beyond.
      b.box(M.stationWall, w, PY - 0.4 - FY, 0.12, X + xc, FY, e * SZ1, { tile: 1.2 });
      b.collide(X + xc, e * SZ1, w, 0.12, 0, FY, PY - 0.4);
    }
  // Which way: signs hung where the paid area meets the stairs, and at the platform heads.
  for (const s of [-1, 1]) {
    const sign = s < 0 ? M.toManhattan : M.toAstoria;
    b.box(M.poleDark, 0.06, 0.5, 2.6, X + s * (SX0 - 0.2), CY - 0.7, 0);
    b.plane(sign, 2.5, 0.47, X + s * (SX0 - 0.235), CY - 0.45, 0, { ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    for (const e of [-1, 1]) {
      b.box(M.poleDark, 2.0, 0.42, 0.06, X + s * 5.0, CY - 0.6, e * (LINE - 0.9));
      b.plane(sign, 1.9, 0.36, X + s * 5.0, CY - 0.39, e * (LINE - 0.935), { ry: e > 0 ? Math.PI : 0 });
    }
  }

  // ---------------------------------------------------------------- the mezzanine

  // Lights overhead.
  for (const x of [-4, 0, 4]) for (const z of [-11.5, -5, 0, 5, 11.5]) b.box(M.fluoro, 1.2, 0.04, 0.16, X + x, CY - 0.07, z);
  for (const [x, z] of [[-3.5, -4.5], [3.5, -4.5], [-3.5, 4.5], [3.5, 4.5], [0, -11.5], [0, 11.5]]) light(x, CY - 0.4, z, 6, 9);

  // Benches in the paid area, in the middle, between the two lines.
  for (const z of [-3.2, 3.2]) {
    b.box(M.wood, 3.2, 0.06, 0.5, X, FY + 0.42, z, { solid: true });
    for (const x of [-1.4, 1.4]) b.box(M.chrome, 0.08, 0.42, 0.4, X + x, FY, z);
    b.collide(X, z, 3.2, 0.5, 0, FY, FY + 0.48);
  }
  props.push({ kind: 'newspaper', x: X + 0.6, y: FY + 0.48, z: 3.2, yaw: 0.4 });
  props.push({ kind: 'litterBasket', x: X - 4.5, y: FY, z: 0.4, yaw: 0 });

  // In each lobby: the fare machines along the end wall, a map beside them.
  for (const e of [-1, 1]) {
    for (const x of [-4.2, -3.2, 3.2, 4.2]) {
      b.box(M.chrome, 0.85, 1.9, 0.55, X + x, FY, e * (HZ - 0.45), { solid: true });
      b.plane(M.vending, 0.8, 1.6, X + x, FY + 1.0, e * (HZ - 0.45 - 0.28), { ry: e > 0 ? Math.PI : 0 });
    }
    b.plane(M.map, 1.4, 1.4, X - 1.2, FY + 1.5, e * (HZ - WALL - 0.01), { ry: e > 0 ? Math.PI : 0 });
    b.plane(M.map, 1.4, 1.4, X + 1.2, FY + 1.5, e * (HZ - WALL - 0.01), { ry: e > 0 ? Math.PI : 0 });
    props.push({ kind: 'litterBasket', x: X + 6.0, y: FY, z: e * (HZ - 0.8), yaw: 0 });
  }

  // The turnstile lines: the agent's booth in the middle, cabinets either side with a turnstile
  // between each pair, and a railing out to the walls.
  const turnstiles: Turnstile[] = [];
  const tripod = new Builder();
  tripod.cyl(M.chrome, 0.07, 0.07, 0.12, 0, -0.06, 0, 8);
  for (let k = 0; k < 3; k++) {
    tripod.push(0, 0, (k * 2 * Math.PI) / 3);
    tripod.box(M.chrome, 0.5, 0.045, 0.045, 0.25, -0.0225, 0);
    tripod.pop();
  }
  const tripodGeos = tripod.geometries();
  // The arms turn about an axis tilted up out of the cabinet, so one arm always lies level across the lane.
  const axis = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), axis, new THREE.Vector3(1, 0, 0).cross(axis));
  const tilt = new THREE.Quaternion().setFromRotationMatrix(basis);
  const screenGeo = new THREE.PlaneGeometry(0.13, 0.13);

  for (const e of [-1, 1]) {
    const lz = e * LINE;
    // Booth: stainless below, glass above, the agent inside under a light.
    b.box(M.chrome, 3, 1.1, 2.4, X, FY, lz);
    b.box(M.poleDark, 3.05, 0.2, 2.45, X, FY + 2.3, lz);
    for (const [w, x, z, ry] of [[3, 0, 1.2, 0], [3, 0, -1.2, 0], [2.4, 1.5, 0, Math.PI / 2], [2.4, -1.5, 0, Math.PI / 2]] as const)
      b.plane(M.windscreen, w, 1.2, X + x, FY + 1.7, lz + z, { ry });
    // Framed in steel, so the glass's edges read as frames rather than as a scatter of pixels edge-on.
    for (const fx of [-1.5, 1.5]) for (const fz of [-1.2, 1.2]) b.box(M.poleDark, 0.08, 1.2, 0.08, X + fx, FY + 1.1, lz + fz);
    for (const fz of [-1.2, 1.2]) b.box(M.poleDark, 3.06, 0.06, 0.08, X, FY + 1.08, lz + fz);
    for (const fx of [-1.5, 1.5]) b.box(M.poleDark, 0.08, 0.06, 2.46, X + fx, FY + 1.08, lz);
    b.box(M.poleDark, 0.45, 0.6, 0.3, X, FY + 0.9, lz);
    b.sphere(M.bark, 0.12, X, FY + 1.65, lz, 1.2);
    b.collide(X, lz, 3, 2.4, 0, FY, CY);
    b.plane(M.agent, 1.6, 0.3, X, FY + 2.4, lz + e * 1.235, { ry: e > 0 ? 0 : Math.PI });
    light(0, FY + 2.0, lz, 2, 4, 0xfff0d8);

    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) b.box(M.chrome, 0.2, 1.0, 1.3, X + side * (1.65 + 0.9 * i), FY, lz, { solid: true });
      // Railing from the last cabinet to the stair shaft, and beyond the shaft to the outside wall.
      b.collide(X + side * 6.43, lz, 0.25, 0.12, 0, FY, FY + 1.2);
      const ox = side * ((SX1 + HX) / 2);
      b.plane(M.railing, HX - SX1, 1.1, X + ox, FY + 0.55, lz, { tile: [0.6, 1.1] });
      b.box(M.chrome, HX - SX1, 0.06, 0.06, X + ox, FY + 1.1, lz);
      b.collide(X + ox, lz, HX - SX1, 0.12, 0, FY, FY + 1.2);

      for (let i = 0; i < 5; i++) {
        const x = X + side * (2.1 + 0.9 * i);
        // The reader on the cabinet to your right as you come in from the lobby.
        const rx = x + e * 0.45;
        b.box(M.poleDark, 0.18, 0.1, 0.24, rx, FY + 1.0, lz + e * 0.4);
        const screen = new THREE.Mesh(screenGeo, M.tap);
        screen.position.set(rx, FY + 1.105, lz + e * 0.4);
        screen.rotation.set(-Math.PI / 2 + 0.35, e > 0 ? Math.PI : 0, 0, 'YXZ');
        group.add(screen);
        const arms = new THREE.Group();
        for (const [mat, geo] of tripodGeos) arms.add(new THREE.Mesh(geo, mat));
        arms.position.set(x - 0.35, FY + 0.95, lz);
        arms.quaternion.copy(tilt);
        group.add(arms);
        turnstiles.push({ x, e, arms, screen, collider: null, unlock: 0, clearing: false, side: 0, turns: 0, angle: 0 });
      }
    }
  }

  // ---------------------------------------------------------------- platforms

  for (const s of [-1, 1]) {
    const sx = (n: number) => s * n;
    // The deck, in pieces round the two stair holes.
    const deck: Area[] = [];
    const piece = (a: number, c: number, z0: number, z1: number) => floorArea(deck, M.concrete, sx(a), z0, sx(c), z1, PY, 1.5);
    piece(EDGE, SX0, -PH, PH);
    piece(SX1, OUTER, -PH, PH);
    piece(SX0, SX1, -PH, -SZ1);
    piece(SX0, SX1, -HOLE, HOLE);
    piece(SX0, SX1, SZ1, PH);
    // The yellow edge strip is part of the deck's surface, not laid on it.
    deck.push({ rect: [X + Math.min(sx(EDGE), sx(EDGE + 0.45)), -PH, X + Math.max(sx(EDGE), sx(EDGE + 0.45)), PH], mat: M.platformEdge, tile: 1 });
    lay(deck, PY, 0.3, true);
    // Nobody goes over the edge onto the tracks, out through the windscreens, or off the ends.
    b.collide(X + sx(EDGE - 0.05), 0, 0.1, 2 * PH, 0, PY, PY + 2.5);
    b.collide(X + sx(OUTER + 0.05), 0, 0.1, 2 * PH, 0, PY, PY + 2.5);
    for (const e of [-1, 1]) {
      b.collide(X + sx((EDGE + OUTER) / 2), e * (PH + 0.05), OUTER - EDGE, 0.1, 0, PY, PY + 2.5);
      b.box(M.poleDark, OUTER - EDGE, 1.2, 0.08, X + sx((EDGE + OUTER) / 2), PY, e * PH);
    }

    // Windscreens: glass in the middle, mesh out at the ends, on posts.
    const wx = X + sx(OUTER);
    b.plane(M.windscreen, 2 * CANOPY, 2.3, wx, PY + 1.15, 0, { ry: Math.PI / 2 });
    for (const e of [-1, 1]) {
      const l = PH - CANOPY;
      b.plane(M.chainLink, l, 2.3, wx, PY + 1.15, e * (CANOPY + l / 2), { ry: Math.PI / 2, tile: 1.1 });
    }
    for (let z = -PH; z <= PH; z += 5) b.box(M.poleDark, 0.1, 2.4, 0.1, wx, PY, z);
    b.box(M.poleDark, 0.1, 0.1, 2 * PH, wx, PY + 2.3, 0);
    // Canopy: posts along the outer strip, a roof, strip lights and the name hung under it.
    for (let z = -CANOPY; z <= CANOPY; z += 8) {
      b.box(M.poleDark, 0.18, 3.1, 0.18, X + sx(8.75), PY, z);
      b.collide(X + sx(8.75), z, 0.2, 0.2, 0, PY, PY + 3.1);
    }
    b.box(M.canopy, 3.8, 0.08, 2 * CANOPY, X + sx(7.6), PY + 3.25, 0);
    b.box(M.canopy, 0.08, 0.5, 2 * CANOPY, X + sx(9.5), PY + 2.9, 0);
    for (let z = -CANOPY + 2; z < CANOPY; z += 4) b.box(M.fluoro, 0.16, 0.06, 1.3, X + sx(7.2), PY + 3.12, z);
    for (const z of [-30, -18, 18, 30]) {
      b.box(M.poleDark, 2.6, 0.5, 0.06, X + sx(7.0), PY + 2.45, z, { ry: Math.PI / 2 });
      b.plane(M.stationSign, 2.5, 0.42, X + sx(6.965), PY + 2.7, z, { ry: (-s * Math.PI) / 2 });
      b.plane(M.stationSign, 2.5, 0.42, X + sx(7.035), PY + 2.7, z, { ry: (s * Math.PI) / 2 });
    }
    for (let z = -36; z <= 36; z += 12) light(sx(7.2), PY + 2.6, z, 9, 10);
    // Pole lamps out along the uncovered ends.
    for (const e of [-1, 1])
      for (let z = CANOPY + 6; z < PH; z += 10) {
        b.box(M.poleDark, 0.08, 2.8, 0.08, X + sx(8.75), PY, e * z);
        b.box(M.fluoro, 0.12, 0.08, 0.9, X + sx(8.55), PY + 2.8, e * z);
        b.collide(X + sx(8.75), e * z, 0.12, 0.12, 0, PY, PY + 2.8);
        if (z < CANOPY + 20) light(sx(8.5), PY + 2.5, e * z, 6, 9);
      }
    // Benches against the windscreen, and a basket.
    for (const z of [-26, -14, 14, 26]) {
      b.box(M.wood, 0.45, 0.06, 1.8, X + sx(8.25), PY + 0.42, z);
      b.box(M.wood, 0.06, 0.45, 1.8, X + sx(8.5), PY + 0.48, z);
      for (const e of [-0.7, 0.7]) b.box(M.chrome, 0.4, 0.42, 0.06, X + sx(8.25), PY, z + e);
      b.collide(X + sx(8.3), z, 0.55, 1.8, 0, PY, PY + 0.9);
    }
    props.push({ kind: 'litterBasket', x: X + sx(8.4), y: PY, z: s * 21, yaw: 0 });
    if (s > 0) props.push({ kind: 'newspaper', x: X + sx(8.2), y: PY + 0.48, z: 14.3, yaw: 1.2 });
  }

  // ---------------------------------------------------------------- the turnstiles at work

  function attach(physics: Physics) {
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const t of turnstiles)
      t.collider = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.35, 0.35, 0.15).setTranslation(t.x, FY + 0.75, t.e * LINE), body);
  }

  /** Whether (x, z) at height y is in turnstile t's lane, and how far out of the line toward the lobby. */
  const lane = (t: Turnstile, x: number, z: number, y: number) =>
    Math.abs(y - FY) < 0.5 && Math.abs(x - t.x) < 0.45 ? (z - t.e * LINE) * t.e : null;

  function actionAt(x: number, z: number, y: number, yaw: number): Action | null {
    for (const t of turnstiles) {
      const out = lane(t, x, z, y);
      if (out === null || out < 0.2 || out > 1.8) continue;
      // Facing in toward the paid area.
      if (-Math.cos(yaw) * -t.e < 0.4) continue;
      if (t.unlock > 0) return { prompt: 'GO' };
      return {
        prompt: '[E] TAP OMNY',
        act: () => {
          t.unlock = 6;
          sound.beep();
        },
      };
    }
    return null;
  }

  function update(dt: number, who: THREE.Vector3) {
    for (const t of turnstiles) {
      const out = lane(t, who.x, who.z, who.y);
      // Out from the paid side it just turns.
      if (out !== null && out < 0 && out > -1.0) t.unlock = Math.max(t.unlock, 0.5);
      const side = out === null || Math.abs(out) > 1.5 ? 0 : Math.sign(out) || t.side;
      if (side && t.side && side !== t.side) {
        // One fare, one turn: it locks again once they're out of the arms' way.
        t.turns++;
        t.unlock = 0;
        t.clearing = true;
        sound.clunk();
      }
      t.side = side;
      if (out === null || Math.abs(out) > 0.45) t.clearing = false;
      t.unlock = Math.max(0, t.unlock - dt);
      const free = t.unlock > 0 || t.clearing;
      t.collider?.setEnabled(!free);
      t.screen.material = t.unlock > 0 ? M.go : M.tap;
      const goal = (t.turns * 2 * Math.PI) / 3;
      t.angle = Math.min(goal, t.angle + dt * 9);
      t.arms.quaternion.copy(tilt).multiply(_spin.setFromAxisAngle(_up, t.angle));
    }
  }

  return { group, glows, globes, walks, props, attach, actionAt, update };
}

const _spin = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

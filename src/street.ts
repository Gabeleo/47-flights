import * as THREE from 'three';
import { buildEl, type Glow } from './el';
import { Builder, boxGeo } from './geometry';
import type { PropSpawn } from './props';
import { buildSky } from './skyline';
import {
  AVE_LOT,
  AVE_ROAD,
  CROSS_REACH,
  CROSSWALK,
  CURB,
  EAST_END,
  EL,
  END_REACH,
  PARK,
  STREETS,
  WEST_END,
  crossReach,
  flatWalk,
  heightOn,
  type CrossStreet,
  type Walk,
} from './streetPlan';
import { buildStation } from './station';
import { streetPropTemplates } from './streetProps';
import { streetMaterials } from './streetTextures';
import { buildingTexture, mulberry32, type BuildingKind } from './textures';
import { CAR_SIZE, buildTraffic, carModel, randomCar, signalHeads } from './traffic';
import type { World, WorldContext } from './world';

// 36th Avenue between 29th and 34th Streets, Astoria, a little after two in the morning. Two- and
// three-storey brick with shops underneath, a few walk-ups and new builds, the auto shops of Dutch Kills
// toward 29th, the el over 31st, the old factory at 33rd and the delis that never close.
//
// Where it's known, it's here: 36 Ave Deli & Grocery and Aladdin at 29-02 and 29-06, Leo's Pizzeria on
// the corner at 31-01, Astoria Deli at 32-02, the one-storey Shoppes at 36th at 33-12, the EVgo chargers
// at 33rd, the factory turned flats on the south-west corner of 33rd and Melrose Ballroom down 33rd.
// The rest is the street's general character, laid out by hand and filled in at random.

type Rect = [number, number, number, number];

type Look = 'bodega' | 'laundry' | 'diner' | 'pizza' | 'glass' | 'gate';
type Shop = { name: string; sub?: string; look: Look; open?: boolean; bg: string; fg: string; awning?: number; serif?: boolean; unlit?: boolean };
type Kind = 'mixed' | 'apartment' | 'house' | 'taxpayer' | 'garage' | 'loft' | 'new' | 'evgo' | 'ballroom';
type Spec = {
  w: number;
  kind: Kind;
  floors?: number;
  shops?: Shop[];
  depth?: number;
  wall?: THREE.Material;
  /** A sidewalk shed out front: scaffolding over the sidewalk while the facade's being fixed. */
  shed?: boolean;
  /** Words on the parapet, or over the lobby door. */
  banner?: string;
  /** House number on the corner pier. */
  address?: string;
};

const FLOOR = 2.95;
/** Two in the morning: about one window in nine still lit. */
const LIT = 0.11;

const SIGN_COLORS: [string, string][] = [
  ['#c4161c', '#ffffff'],
  ['#f2f2ee', '#1a3a8a'],
  ['#1a1a1a', '#f2c43a'],
  ['#1e6a3a', '#ffffff'],
  ['#f2d43a', '#c4161c'],
  ['#1a3a8a', '#ffffff'],
  ['#f2f2ee', '#c4161c'],
  ['#5a1a5a', '#f2f2ee'],
  ['#2a2a2a', '#f2f2ee'],
];

const GENERIC: [string, string?][] = [
  ['NAIL SPA'], ['BARBER SHOP', 'WALK-INS WELCOME'], ['TAX & INSURANCE'], ['99¢ & UP'], ['CELL PHONE REPAIR', 'UNLOCK · ACCESSORIES'],
  ['TAQUERIA', 'TACOS · BURRITOS'], ['BAKERY & CAFE'], ['WINES & LIQUORS'], ['DENTAL OFFICE'], ['TRAVEL & MONEY TRANSFER'],
  ['FLORIST'], ['HARDWARE', 'KEYS MADE'], ['DRY CLEANERS', 'ALTERATIONS'], ['PHARMACY'], ['GYRO & KEBAB'], ['LAUNDROMAT', 'WASH & FOLD'],
  ['CAR SERVICE', '718'], ['THAI KITCHEN'], ['TATTOO'], ['BEAUTY SALON'], ['HALAL MEAT & GROCERY'], ['PET GROOMING'],
];

// Where the names are known.
const DELI_36: Shop = { name: '36 AVE DELI & GROCERY', sub: 'OPEN 24 HOURS', look: 'bodega', open: true, bg: '#f2d43a', fg: '#c4161c', awning: 1 };
const ALADDIN: Shop = { name: 'ALADDIN RESTAURANT', sub: 'HALAL FOOD', look: 'diner', bg: '#1e6a3a', fg: '#f2f2ee' };
const LEOS: Shop = { name: "LEO'S PIZZERIA", sub: 'SLICES · HEROS · CALZONES', look: 'pizza', bg: '#f2f2ee', fg: '#b22a2a', awning: 1, serif: true };
const ASTORIA_DELI: Shop = { name: 'ASTORIA DELI', sub: 'GROCERY · OPEN 24 HRS', look: 'bodega', open: true, bg: '#1a3a8a', fg: '#f2f2ee', awning: 2 };

type Rand = () => number;

export function buildStreet({ sound }: WorldContext): World {
  const b = new Builder();
  const M = streetMaterials();
  const r: Rand = mulberry32(3601);
  const props: PropSpawn[] = [];
  const glows: Glow[] = [];
  /** Raised sidewalk rectangles, for clipping light pools to. */
  const sidewalks: Rect[] = [];
  /** Everything there is to stand on above the road: sidewalks, and the station's stairs and floors. */
  const walks: Walk[] = [];
  /** Things kept clear of parked cars and trees: hydrants, lamp posts, corners. */
  const hydrants: [number, number][] = [];
  const lamps: [number, number][] = [];
  /** Glowing billboards round lamp heads, globes and signals. */
  const hazes: THREE.Sprite[] = [];

  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const between = (a: number, c: number) => a + r() * (c - a);
  /** Spawn a prop at local (x, z), resting on a surface at height y. */
  const prop = (kind: string, x: number, y: number, z: number, ry = r() * Math.PI * 2) => {
    const p = b.pose(x, z, ry);
    props.push({ kind, x: p.x, y, z: p.z, yaw: p.yaw });
  };
  const haze = (mat: THREE.SpriteMaterial | THREE.Material, size: number, x: number, y: number, z: number) => {
    const p = b.pose(x, z);
    const s = new THREE.Sprite(mat as THREE.SpriteMaterial);
    s.position.set(p.x, y, p.z);
    s.scale.setScalar(size);
    hazes.push(s);
  };
  const spriteMat = (color: number, opacity: number) =>
    new THREE.SpriteMaterial({ map: M.tex.pool, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const lampHaze = spriteMat(0xffe2b8, 0.3);
  const globeHaze = spriteMat(0x5aff8a, 0.45);

  /** Plane showing cell `cell` of a texture split into `cells` across. */
  function atlas(mat: THREE.Material, cell: number, cells: number, w: number, h: number, x: number, y: number, z: number, ry = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / cells);
    b.add(g, mat, x, y, z, ry);
  }

  /** Flat plane on the ground over [x0, z0, x1, z1] at height y. */
  function flat(mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number) {
    b.plane(mat, x1 - x0, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, { rx: -Math.PI / 2 });
  }

  /** Box from a to c (x, y, z) of section w x h. */
  function strut(mat: THREE.Material, a: number[], c: number[], w: number, h: number) {
    const [dx, dy, dz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const len = Math.hypot(dx, dz);
    b.add(boxGeo(w, h, Math.hypot(len, dy)), mat, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, Math.atan2(dx, dz), -Math.atan2(dy, len));
  }

  // ---------------------------------------------------------------- ground

  // One sheet of asphalt under everything; the sidewalks stand on it as slabs, so wherever vertex
  // snapping opens a crack, what shows through is road, never sky.
  {
    // Off round numbers, so a camera placed on a round coordinate never sits exactly on a grid line.
    const [x0, x1, z0, z1] = [-520.37, 619.63, -320.29, 319.71];
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 57, 32);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
    b.add(g, M.asphalt, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0, -Math.PI / 2);
  }

  /** A sidewalk slab with its concrete flags lined up across slabs and a curb face on every side. */
  function sidewalk(x0: number, z0: number, x1: number, z1: number) {
    const [w, d] = [x1 - x0, z1 - z0];
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const h = CURB + 0.1;
    const g = boxGeo(w, h, d, [1.6, 0.25]);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Top face (+y, verts 8..11): UVs from world position, so the joints run straight from slab to slab.
    for (let i = 8; i < 12; i++) uv.setXY(i, (cx + pos.getX(i)) / 1.6, -(cz + pos.getZ(i)) / 1.6);
    const top = g.clone();
    top.setIndex(Array.from(g.index!.array).slice(12, 18));
    const sides = g;
    sides.setIndex([...Array.from(g.index!.array).slice(0, 12), ...Array.from(g.index!.array).slice(24, 36)]);
    b.add(top, M.sidewalk, cx, CURB - h / 2, cz);
    b.add(sides, M.curb, cx, CURB - h / 2, cz);
    b.collide(cx, cz, w, d, 0, -1, CURB, true);
    sidewalks.push([x0, z0, x1, z1]);
    walks.push(flatWalk(x0, z0, x1, z1, CURB));
  }

  /** The avenue's blocks west to east: x extent of the frontage, and the cross streets at each end. */
  const blocks = Array.from({ length: STREETS.length + 1 }, (_, i) => {
    const w = STREETS[i - 1];
    const e = STREETS[i];
    return {
      x0: w ? w.x + w.lot : WEST_END - END_REACH,
      x1: e ? e.x - e.lot : EAST_END + END_REACH,
      road0: w ? w.x + w.road : WEST_END - END_REACH,
      road1: e ? e.x - e.road : EAST_END + END_REACH,
      west: w,
      east: e,
    };
  });

  for (const k of blocks)
    for (const s of [-1, 1]) {
      const [z0, z1] = s < 0 ? [-AVE_LOT, -AVE_ROAD] : [AVE_ROAD, AVE_LOT];
      sidewalk(k.road0, z0, k.road1, z1);
    }
  for (const st of STREETS)
    for (const e of [-1, 1])
      for (const s of [-1, 1]) {
        const [x0, x1] = e < 0 ? [st.x - st.lot, st.x - st.road] : [st.x + st.road, st.x + st.lot];
        const [z0, z1] = s < 0 ? [-CROSS_REACH, -AVE_LOT] : [AVE_LOT, CROSS_REACH];
        sidewalk(x0, z0, x1, z1);
      }

  // Road paint: a double yellow down the avenue, high-visibility crosswalks, stop bars, and the odd
  // manhole and tar patch.
  for (const k of blocks) {
    const x0 = k.west ? k.west.x + k.west.road + CROSSWALK + 1 : k.x0;
    const x1 = k.east ? k.east.x - k.east.road - CROSSWALK - 1 : k.x1;
    for (const z of [-0.12, 0.12]) flat(M.yellow, x0, z - 0.05, x1, z + 0.05, 0.006);
    for (let i = 0; i < 4; i++) {
      const x = between(x0 + 5, x1 - 5);
      const z = between(-5, 5);
      if (r() < 0.5) b.plane(M.manhole, 0.85, 0.85, x, 0.007, z, { rx: -Math.PI / 2 });
      else flat(M.tarPatch, x, z, x + between(1, 4), z + between(0.6, 2), 0.005);
    }
  }
  for (const st of STREETS) {
    // Across the avenue, in line with each of the cross street's sidewalks.
    for (const e of [-1, 1]) {
      const xa = st.x + e * (st.road + 0.4);
      const xb = st.x + e * (st.road + 0.4 + CROSSWALK);
      for (let z = -AVE_ROAD + 0.4; z < AVE_ROAD - 0.3; z += 1.2) flat(M.paint, Math.min(xa, xb), z, Math.max(xa, xb), z + 0.6, 0.006);
    }
    // Across the cross street, in line with the avenue's sidewalks.
    for (const s of [-1, 1]) {
      const za = s * (AVE_ROAD + 0.6);
      const zb = s * (AVE_ROAD + 0.6 + CROSSWALK);
      for (let x = st.x - st.road + 0.3; x < st.x + st.road - 0.3; x += 1.2)
        flat(M.paint, x, Math.min(za, zb), x + 0.6, Math.max(za, zb), 0.006);
    }
    if (st.signal)
      for (const dir of [-1, 1]) {
        const x = st.x - dir * (st.road + CROSSWALK + 0.9);
        flat(M.paint, x - 0.2, dir > 0 ? 0.2 : -AVE_ROAD + 2.2, x + 0.2, dir > 0 ? AVE_ROAD - 2.2 : -0.2, 0.006);
      }
  }

  // ---------------------------------------------------------------- facades

  const brick = () => pick(M.bricks.slice(0, 5));
  const tileOf = (m: THREE.Material): [number, number] =>
    M.bricks.includes(m as THREE.MeshLambertMaterial) ? [1, 1.03] : M.sidings.includes(m as THREE.MeshLambertMaterial) ? [1, 1] : [2, 2];

  /** A sash window: an atlas cell, lit or dark, with a stone lintel and sill or a painted trim surround. */
  function sash(x: number, y: number, w: number, h: number, frame: 'stone' | 'trim' | 'plain') {
    const lit = r() < LIT;
    const wz = frame === 'trim' ? 0.04 : 0.025;
    if (frame === 'trim') b.box(M.trim, w + 0.16, h + 0.16, 0.035, x, y - 0.08, 0.0175);
    atlas(lit ? M.windowsLit : M.windowsDark, Math.floor(r() * 4), 4, w, h, x, y + h / 2, wz);
    if (frame === 'stone') {
      b.box(M.stone, w + 0.26, 0.17, 0.08, x, y + h, 0.04);
      b.box(M.stone, w + 0.16, 0.07, 0.12, x, y - 0.07, 0.06);
    }
    if (r() < 0.07) b.box(M.trim, 0.62, 0.4, 0.5, x, y + 0.02, 0.2);
  }

  type Style = 'stone' | 'trim' | 'plain' | 'new' | 'loft';

  /** Windows over `floors` storeys of a face `len` long, starting at height y0, in the current frame. */
  function upper(len: number, y0: number, floors: number, fH: number, style: Style, x0 = -len / 2) {
    if (floors <= 0 || len < 1.5) return [] as number[];
    if (style === 'new' || style === 'loft') {
      const bays = Math.max(1, Math.round(len / (style === 'new' ? 3.0 : 3.4)));
      const xs = Array.from({ length: bays }, (_, i) => x0 + ((i + 0.5) * len) / bays);
      for (let f = 0; f < floors; f++)
        for (const x of xs) {
          const lit = r() < LIT;
          const y = y0 + f * fH;
          if (style === 'new') {
            b.plane(lit ? M.glassLit : M.glassDark, 2.3, fH - 0.5, x, y + 0.25 + (fH - 0.5) / 2, 0.02);
            if (f > 0 && r() < 0.3) {
              b.box(M.concrete, 2.6, 0.14, 1.1, x, y, 0.55);
              b.plane(M.windscreen, 2.6, 1.0, x, y + 0.64, 1.1);
            }
          } else {
            b.plane(lit ? M.loftLit : M.loftDark, 2.6, fH - 1.0, x, y + 0.6 + (fH - 1.0) / 2, 0.02);
            b.box(M.stone, 2.8, 0.14, 0.1, x, y + 0.46, 0.05);
          }
        }
      return xs;
    }
    const n = Math.max(1, Math.floor((len - 0.5) / 2.1));
    const xs = Array.from({ length: n }, (_, i) => x0 + ((i + 0.5) * len) / n);
    for (let f = 0; f < floors; f++) for (const x of xs) sash(x, y0 + f * fH + 0.85, 0.95, 1.5, style);
    return xs;
  }

  /** A shopfront from x0 to x1 under a sign, in the current frame, the frontage at z = 0. */
  function storefront(x0: number, x1: number, shop: Shop, gH: number) {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const signY = gH - 0.95;
    const oh = signY - CURB;
    b.box(M.poleDark, w - 0.08, 0.8, 0.2, cx, signY, 0.1);
    b.plane(M.sign(Math.floor(r() * 1e6), shop.name, shop.bg, shop.fg, shop.sub, !shop.unlit, shop.serif), w - 0.2, 0.7, cx, signY + 0.4, 0.205);
    const showing = shop.open || shop.look === 'glass';
    if (showing) {
      const look = { bodega: M.bodega, laundry: M.laundry, diner: M.diner, pizza: M.pizza, glass: M.closedGlass, gate: M.closedGlass }[shop.look];
      const doorX = x1 - 0.7;
      b.plane(look, w - 1.5, oh - 0.45, x0 + (w - 1.4) / 2, CURB + 0.45 + (oh - 0.45) / 2, 0.02);
      b.plane(shop.open ? M.litDoor : M.glassDoor, 1.0, Math.min(2.3, oh), doorX, CURB + Math.min(2.3, oh) / 2, 0.02);
      b.box(M.chrome, w - 1.4, 0.45, 0.06, x0 + (w - 1.4) / 2, CURB, 0.03);
      for (const x of [x0 + 0.03, doorX - 0.53, doorX + 0.53, x1 - 0.03, x0 + (w - 1.4) / 2]) b.box(M.chrome, 0.07, oh, 0.08, x, CURB, 0.04);
      b.box(M.chrome, w, 0.08, 0.08, cx, signY - 0.08, 0.04);
      if (shop.open) {
        b.plane(M.open, 0.6, 0.22, x0 + 0.8, CURB + 1.9, 0.05);
        const p = b.pose(cx, 1.8);
        glows.push({ pos: new THREE.Vector3(p.x, 2.2, p.z), color: shop.look === 'bodega' ? 0xf0f4e8 : 0xfff0d8, intensity: 6, distance: 9 });
      }
    } else {
      b.plane(pick(M.gates), w - 0.1, oh, cx, CURB + oh / 2, 0.03);
      b.box(M.pole, w - 0.05, 0.32, 0.3, cx, signY - 0.32, 0.15);
    }
    if (shop.awning !== undefined) {
      const mat = M.awnings[shop.awning % M.awnings.length];
      const slope = Math.atan2(0.55, 1.1);
      b.plane(mat, w - 0.1, Math.hypot(1.1, 0.55), cx, signY - 0.275, 0.55, { rx: -(Math.PI / 2 - slope), tile: [w - 0.1, 1.23] });
      b.plane(mat, w - 0.1, 0.25, cx, signY - 0.675, 1.1, { tile: [w - 0.1, 0.25] });
    }
  }

  /** A street door to the flats upstairs, with the light over it on. */
  function residentialDoor(x: number) {
    b.box(M.stone, 1.3, 2.5, 0.06, x, CURB, 0.03);
    b.plane(M.door, 1.0, 2.25, x, CURB + 1.125, 0.065);
    b.box(M.lampHead, 0.18, 0.2, 0.12, x, CURB + 2.6, 0.08);
    b.box(M.lampLens, 0.12, 0.04, 0.1, x, CURB + 2.58, 0.08);
  }

  function randomShop(): Shop {
    const [name, sub] = pick(GENERIC);
    const [bg, fg] = pick(SIGN_COLORS);
    const look: Look = name === 'LAUNDROMAT' ? 'laundry' : r() < 0.15 ? 'glass' : 'gate';
    return { name, sub, look, bg, fg, awning: r() < 0.3 ? Math.floor(r() * 5) : undefined, unlit: r() < 0.35 };
  }

  /** Shopfronts across the ground floor from x0 to x1, a street door at one end if there's room. */
  function groundShops(x0: number, x1: number, shops: Shop[], gH: number, door: number) {
    if (door) {
      const dx = door > 0 ? x1 - 0.8 : x0 + 0.8;
      residentialDoor(dx);
      if (door > 0) x1 -= 1.6;
      else x0 += 1.6;
    }
    const w = (x1 - x0) / shops.length;
    shops.forEach((s, i) => storefront(x0 + i * w + 0.05, x0 + (i + 1) * w - 0.05, s, gH));
  }

  /** Cornice, parapet coping and brackets along the top of a face. */
  function cornice(len: number, top: number, heavy: boolean) {
    if (heavy) {
      b.box(M.cornice, len + 0.3, 0.45, 0.5, 0, top - 0.45, 0.2);
      b.box(M.cornice, len + 0.1, 0.15, 0.25, 0, top - 0.75, 0.1);
      for (let x = -len / 2 + 0.4; x < len / 2; x += 0.9) b.box(M.cornice, 0.14, 0.3, 0.3, x, top - 0.75, 0.15);
    } else b.box(M.corniceLight, len + 0.06, 0.12, 0.34, 0, top, 0.02);
  }

  /** Fire escape over the window columns xs (two in the middle), storeys from y0 up. */
  function fireEscape(xs: number[], y0: number, floors: number, fH: number) {
    if (xs.length < 2) return;
    const mid = Math.floor(xs.length / 2);
    const [xa, xb] = [xs[mid - 1] - 0.7, xs[mid] + 0.7];
    const L = xb - xa;
    const cx = (xa + xb) / 2;
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fH + 0.15;
      b.box(M.iron, L, 0.06, 1.1, cx, y, 0.6);
      b.plane(M.railing, L, 0.95, cx, y + 0.5, 1.15, { tile: [0.6, 0.95] });
      for (const x of [xa, xb]) b.plane(M.railing, 1.1, 0.95, x, y + 0.5, 0.6, { ry: Math.PI / 2, tile: [0.6, 0.95] });
      if (f < floors - 1) strut(M.fireStair, [xa + 0.5, y + 0.06, 0.75], [xb - 0.5, y + fH, 0.75], 0.55, 0.03);
    }
    b.plane(M.fireStair, 0.5, 2.4, xb - 0.4, y0 - 1.0, 0.95);
  }

  /** The lot on the corner of 33rd: four chargers along the back, a sign on a pole, and a fence. */
  function evgoLot(w: number, corner: number) {
    const d = 22;
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      b.plane(M.chainLink, len, 2.2, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, { ry, tile: 1.1 });
      b.collide((x0 + x1) / 2, (z0 + z1) / 2, len, 0.1, ry, 0, 2.4);
      for (let i = 0; i <= Math.ceil(len / 3); i++) {
        const t = Math.min(1, (i * 3) / len);
        b.cyl(M.pole, 0.04, 0.04, 2.3, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 6);
      }
    };
    fence(-w / 2, -d, w / 2, -d);
    fence(-w / 2, 0, -w / 2, -d);
    fence(w / 2, 0, w / 2, -d);
    // A gap in the front fence for the driveway, toward the far end from the corner.
    const gap = -corner * (w / 2 - 6);
    fence(-w / 2, -0.15, gap - 3.5, -0.15);
    fence(gap + 3.5, -0.15, w / 2, -0.15);
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 3 + i * ((w - 6) / 3);
      b.box(M.white, 0.75, 1.9, 0.45, x, 0, -d + 1.4, { solid: true });
      b.plane(M.charger, 0.7, 1.4, x, 1.1, -d + 1.63);
      glows.push({ pos: new THREE.Vector3(...vec(b.pose(x, -d + 2.5), 1.4)), color: 0x6ad8ff, intensity: 1.2, distance: 4 });
      for (const s of [-1, 1]) flat(M.paint, x + s * 1.4 - 0.05, -d + 2, x + s * 1.4 + 0.05, -d + 7.5, 0.006);
      if (i === 1 || i === 2) {
        b.push(x, -d + 5.2, Math.PI);
        carModel(b, M, i === 1 ? 'suv' : 'sedan', i === 1 ? M.carPaints[1] : M.carPaints[4], false);
        b.collide(0, 0, 1.95, 4.9, 0, 0, 1.6);
        b.pop();
      }
    }
    const sx = corner * (w / 2 - 1.2);
    b.cyl(M.pole, 0.12, 0.12, 6, sx, CURB, -1.2, 8);
    b.collide(sx, -1.2, 0.3, 0.3, 0, 0, 6);
    b.box(M.white, 2.3, 1.1, 0.25, sx, 6, -1.2);
    b.plane(M.evgo, 2.2, 1.0, sx, 6.55, -1.07);
    for (const x of [-w / 4, w / 4]) {
      b.cyl(M.pole, 0.07, 0.09, 7, x, 0, -d + 0.6, 6);
      b.box(M.lampHead, 0.5, 0.15, 0.3, x, 7, -d + 0.9);
      b.box(M.lampLens, 0.4, 0.02, 0.24, x, 6.99, -d + 0.9);
      glows.push({ pos: new THREE.Vector3(...vec(b.pose(x, -d + 1.5), 6.6)), color: 0xe8f0ff, intensity: 30, distance: 16 });
    }
  }

  const vec = (p: { x: number; z: number }, y: number): [number, number, number] => [p.x, y, p.z];

  /**
   * One building in the current frame: frontage centred on x = 0 at z = 0, facing +z, `corner` saying
   * which end (-1 or +1) turns a corner onto a cross street. Returns how deep it goes.
   */
  function raise(s: Spec, corner: number): number {
    const w = s.w;
    const k = s.kind;
    if (k === 'evgo') {
      evgoLot(w, corner);
      return 22;
    }
    const d = s.depth ?? (corner ? 20 : between(15, 21));
    const floors =
      s.floors ??
      { mixed: r() < 0.6 ? 3 : 2, apartment: 4 + Math.floor(r() * 3), house: r() < 0.4 ? 3 : 2, taxpayer: 1, garage: r() < 0.3 ? 2 : 1, loft: 6, new: 6 + Math.floor(r() * 3), ballroom: 2 }[k];
    const gH = { mixed: 4.0, apartment: 3.8, house: 3.0, taxpayer: 4.6, garage: 5.0, loft: 4.4, new: 4.2, ballroom: 5.5 }[k];
    const fH = k === 'loft' ? 3.9 : k === 'new' ? 3.1 : k === 'ballroom' ? 4.5 : FLOOR;
    const H = gH + (floors - 1) * fH;
    const parapet = k === 'house' ? 0.3 : 0.8;
    const wall =
      s.wall ??
      (k === 'house'
        ? r() < 0.6
          ? pick(M.sidings)
          : brick()
        : k === 'new'
          ? pick([M.panel, M.panelDark, M.bricks[6]])
          : k === 'garage'
            ? pick([M.stucco, M.bricks[5], M.bricks[6], brick()])
            : k === 'ballroom'
              ? M.panelDark
              : k === 'loft'
                ? M.bricks[0]
                : brick());
    const setback = k === 'house' ? 3.2 : 0;
    const style: Style = k === 'new' ? 'new' : k === 'loft' ? 'loft' : M.sidings.includes(wall as THREE.MeshLambertMaterial) ? 'trim' : r() < 0.75 ? 'stone' : 'plain';

    if (setback) {
      // Front yard: paved, an iron fence along the sidewalk with the gate shut, a stoop up to the door.
      b.box(M.concrete, w, CURB + 0.12, setback, 0, -0.1, -setback / 2);
      b.plane(M.railing, w, 1.0, 0, CURB + 0.5, -0.05, { tile: [0.8, 1.0] });
      b.collide(0, -0.05, w, 0.1, 0, 0, 1.2);
      const dx = (corner || (r() < 0.5 ? 1 : -1)) * -(w / 2 - 1.0);
      for (let i = 0; i < 5; i++) b.box(M.concrete, 1.4, CURB + 0.2 * (i + 1), 0.3, dx, 0, -setback + 1.5 - i * 0.3);
      for (const e of [-1, 1]) strut(M.iron, [dx + e * 0.68, CURB + 1.1, -setback + 1.6], [dx + e * 0.68, CURB + 1.9, -setback + 0.1], 0.04, 0.04);
      if (r() < 0.4) prop(r() < 0.5 ? 'trashBag' : 'recyclingBag', -dx * 0.5, CURB + 0.12, -setback * 0.5);
    }

    b.push(0, -setback, 0);
    b.box(wall, w, H + parapet, d, 0, 0, -d / 2, { tile: tileOf(wall), faces: { py: { mat: M.roof, tile: 2 } }, solid: true });

    // Ground floor.
    const brickish = k === 'mixed' || k === 'apartment';
    if (brickish) for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) b.box(M.cornice, 0.3, gH, 0.12, x, 0, 0.06);
    if (k === 'house') {
      const dx = (corner || 1) * -(w / 2 - 1.0);
      b.box(M.trim, 1.3, 2.5, 0.06, dx, 1.2 + CURB, 0.03);
      b.plane(M.door, 1.0, 2.2, dx, 1.2 + CURB + 1.1, 0.065);
      b.box(M.lampLens, 0.12, 0.12, 0.1, dx + 0.75, 1.2 + CURB + 2.2, 0.06);
      upper(w - 2.2, 1.2, 1, FLOOR, style, -w / 2 + (dx < 0 ? 2.2 : 0));
    } else if (k === 'garage') {
      const gw = Math.min(4, w - 2.2);
      b.plane(pick(M.gates), gw, 3.4, -w / 2 + 0.6 + gw / 2, CURB + 1.7, 0.03);
      b.box(M.pole, gw + 0.1, 0.35, 0.3, -w / 2 + 0.6 + gw / 2, CURB + 3.4, 0.15);
      b.plane(M.door, 0.95, 2.2, w / 2 - 1.0, CURB + 1.1, 0.03);
      const [bg, fg] = pick(SIGN_COLORS);
      b.plane(M.sign(Math.floor(r() * 1e6), pick(['AUTO REPAIR', 'COLLISION & BODY', 'TIRES · BRAKES', 'AUTO GLASS']), bg, fg, 'FOREIGN & DOMESTIC', false), w - 1.0, 0.8, 0, CURB + 4.1, 0.03);
      if (floors > 1) upper(w, gH, floors - 1, fH, style);
    } else if (k === 'new') {
      b.plane(M.glassLit, Math.min(4, w * 0.3), gH - 0.6, w / 2 - Math.min(4, w * 0.3) / 2 - 0.4, CURB + (gH - 0.6) / 2, 0.03);
      b.plane(M.closedGlass, w * 0.55, gH - 1.2, -w / 2 + w * 0.3 + 0.4, CURB + (gH - 1.2) / 2, 0.03);
      const p = b.pose(w / 2 - 2, 1.5);
      glows.push({ pos: new THREE.Vector3(p.x, 2.4, p.z), color: 0xfff0d8, intensity: 4, distance: 7 });
    } else if (k === 'loft') {
      const bays = Math.max(2, Math.round(w / 4.5));
      for (let i = 0; i < bays; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / bays;
        if (i === 1 && s.banner) {
          b.plane(M.litDoor, 2.2, 2.8, x, CURB + 1.4, 0.03);
          b.box(M.cornice, 3.2, 0.7, 0.25, x, CURB + 3.0, 0.12);
          b.plane(M.sign(Math.floor(r() * 1e6), s.banner, '#1a1a1a', '#e8e0c8'), 3.0, 0.6, x, CURB + 3.35, 0.255);
          const p = b.pose(x, 1.5);
          glows.push({ pos: new THREE.Vector3(p.x, 2.6, p.z), color: 0xfff0d8, intensity: 4, distance: 7 });
        } else if (i % 2) b.plane(pick(M.gates), 3.2, 3.2, x, CURB + 1.6, 0.03);
        else b.plane(M.loftDark, 3.0, 2.4, x, CURB + 2.1, 0.03);
      }
    } else if (k === 'ballroom') {
      b.box(M.poleDark, Math.min(9, w - 2), 1.4, 1.6, 0, 3.6, 0.8);
      b.plane(M.marquee, Math.min(9, w - 2) - 0.2, 1.2, 0, 4.3, 1.61);
      b.plane(M.glassDoor, 4, 2.6, 0, CURB + 1.3, 0.03);
      const p = b.pose(0, 2);
      glows.push({ pos: new THREE.Vector3(p.x, 3.2, p.z), color: 0xffe8a0, intensity: 5, distance: 9 });
    } else if (s.shops?.length || k === 'taxpayer' || k === 'mixed' || r() < 0.5) {
      const shops = s.shops ?? Array.from({ length: k === 'taxpayer' ? Math.max(2, Math.round(w / 6)) : w > 10 ? 2 : 1 }, randomShop);
      const door = k !== 'taxpayer' && shops.length === 1 && w > 6.5 ? -(corner || 1) : 0;
      groundShops(-w / 2 + 0.3, w / 2 - 0.3, shops, gH, door);
    } else {
      // An apartment lobby: glass doors with the light on, a canopy, windows either side.
      b.plane(M.litDoor, 1.8, 2.4, 0, CURB + 1.2, 0.03);
      b.box(M.stone, 2.4, 2.8, 0.06, 0, CURB, 0.01);
      b.box(M.poleDark, 2.6, 0.12, 1.4, 0, CURB + 2.8, 0.7);
      for (const e of [-1, 1]) upper(w / 2 - 1.6, 0.4, 1, FLOOR, style, e < 0 ? -w / 2 : 1.6);
      const p = b.pose(0, 1.6);
      glows.push({ pos: new THREE.Vector3(p.x, 2.6, p.z), color: 0xfff0d8, intensity: 3, distance: 6 });
    }

    // Upper floors, top, and what's on them.
    const xs = k === 'house' ? upper(w, 1.2 + FLOOR, floors - 1, FLOOR, style) : k === 'garage' ? [] : upper(w, gH, floors - 1, fH, style);
    if (k === 'taxpayer' && s.banner) {
      b.box(M.corniceLight, Math.min(16, w - 2), 1.0, 0.15, 0, H, 0.07);
      b.plane(M.sign(Math.floor(r() * 1e6), s.banner, '#f2f0e8', '#2a3a5a', '', false, true), Math.min(16, w - 2) - 0.2, 0.9, 0, H + 0.5, 0.15);
    }
    cornice(w, H + parapet, brickish && style !== 'plain' && r() < 0.75);
    if (k === 'apartment' && floors >= 4 && r() < 0.8) fireEscape(xs, gH, floors - 1, fH);
    if (s.address) {
      const ax = (corner || 1) * (w / 2 - 0.15);
      b.plane(M.sign(Math.floor(r() * 1e6), s.address, '#1a1a1a', '#f2f0e8', '', true), 0.6, 0.18, ax, 3.0, 0.125);
    }

    // Round the corner: windows down the side, and the shopfront carrying on a few metres.
    if (corner) {
      b.push(corner * (w / 2), -d / 2, corner * (Math.PI / 2));
      const front = -corner * (d / 2);
      upper(d - 0.6, k === 'house' ? 1.2 + FLOOR : gH, k === 'house' ? floors - 1 : floors - 1, k === 'house' ? FLOOR : fH, style, -d / 2 + 0.3);
      if (s.shops?.length && s.shops[0].open) {
        const [x0, x1] = corner > 0 ? [front, front + 5] : [front - 5, front];
        storefront(x0, x1, { ...s.shops[0], awning: undefined }, gH);
      } else if (brickish || k === 'taxpayer') {
        const [x0, x1] = corner > 0 ? [front + 0.4, front + 4.4] : [front - 4.4, front - 0.4];
        b.plane(pick(M.gates), x1 - x0, 2.6, (x0 + x1) / 2, CURB + 1.3, 0.03);
      }
      cornice(d, H + parapet, false);
      b.pop();
    }

    // Rooftops: stair bulkheads, a water tank on the tall ones, chimneys on the houses, satellite dishes.
    if (k === 'apartment' || k === 'loft' || k === 'new') {
      const bx = between(-w / 4, w / 4);
      b.box(k === 'new' ? M.panelDark : wall, 3, 2.8, 3.2, bx, H + parapet, -d * 0.6, { tile: tileOf(wall) });
      if ((floors >= 6 && k !== 'new' && r() < 0.6) || k === 'loft') {
        const tx = -bx * 0.6;
        const tz = -d * 0.35;
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(M.iron, 0.15, 3.2, 0.15, tx + ox * 1.3, H + parapet, tz + oz * 1.3);
        b.box(M.iron, 3, 0.15, 3, tx, H + parapet + 3.2, tz);
        b.cyl(M.bark, 1.7, 1.7, 3.6, tx, H + parapet + 3.35, tz, 10);
        b.add(new THREE.ConeGeometry(1.8, 1.2, 10), M.cornice, tx, H + parapet + 7.55, tz);
      }
    }
    if (k === 'house') b.box(wall, 0.6, 1.4, 0.6, between(-w / 3, w / 3), H + parapet, -d * 0.7, { tile: tileOf(wall) });
    if (r() < 0.25) {
      const g = new THREE.CircleGeometry(0.4, 8);
      b.add(g, M.white, between(-w / 3, w / 3), H + parapet + 0.8, -1.5, Math.PI + 0.3, -0.5);
    }

    // A sidewalk shed: posts at the building line and the curb, a plywood deck painted hunter green, lit.
    if (s.shed) {
      const reach = AVE_LOT - AVE_ROAD - 0.6;
      for (let x = -w / 2 + 0.2; x <= w / 2 - 0.1; x += 2.4)
        for (const z of [0.25, reach]) {
          b.box(M.iron, 0.12, 3.2, 0.12, x, CURB, z);
          b.collide(x, z, 0.14, 0.14, 0, 0, 3.4);
        }
      b.box(M.concrete, w, 0.2, reach + 0.4, 0, 3.3, reach / 2);
      b.box(M.hydrantCap, w, 1.1, 0.06, 0, 3.5, reach + 0.2);
      b.box(M.hydrantCap, w, 0.3, reach + 0.4, 0, 3.0, reach / 2, { faces: { py: { mat: M.concrete } } });
      for (let x = -w / 2 + 1.5; x < w / 2; x += 3) {
        b.box(M.fluoro, 0.12, 0.04, 0.9, x, 2.96, reach / 2);
        const p = b.pose(x, reach / 2);
        glows.push({ pos: new THREE.Vector3(p.x, 2.7, p.z), color: 0xf0f4ff, intensity: 2.2, distance: 5 });
      }
      for (const x of [-w / 2 + 2, w / 2 - 3]) prop('cone', x, CURB, reach + 0.6);
    }

    b.pop();
    return d + setback;
  }

  // ---------------------------------------------------------------- the avenue's frontage

  function randomSpec(blockIndex: number): Spec {
    const x = r();
    const industrial = blockIndex <= 2;
    if (industrial && x < 0.14) return { kind: 'garage', w: between(8, 13) };
    if (x < 0.2) return { kind: 'apartment', w: between(12, 19) };
    if (x < 0.3) return { kind: 'house', w: between(5.5, 7) };
    if (x < 0.36) return { kind: 'new', w: between(14, 22) };
    return { kind: 'mixed', w: between(6, 9) };
  }

  /** Corner depths, for where the cross street's own frontage begins: keyed by street, side of it, side of the avenue. */
  const cornerDepth = new Map<string, number>();
  const ck = (st: CrossStreet, e: number, s: number) => `${st.name}|${e}|${s}`;

  /** Lay a block face west to east: the given buildings at each end, random ones filling the middle. */
  function face(blockIndex: number, side: -1 | 1, west: Spec[], east: Spec[] = []) {
    const k = blocks[blockIndex];
    const len = k.x1 - k.x0;
    const fixed = [...west, ...east].reduce((a, s) => a + s.w, 0);
    const mid: Spec[] = [];
    let left = len - fixed;
    while (left > 9) {
      const s = randomSpec(blockIndex);
      s.w = Math.min(s.w, left - 4.5 > 0 ? s.w : left);
      mid.push(s);
      left -= s.w;
    }
    if (left > 0.01) {
      if (left >= 4.5) mid.push({ kind: r() < 0.5 ? 'house' : 'mixed', w: left });
      else if (mid.length) mid[mid.length - 1].w += left;
      else if (west.length) west[west.length - 1].w += left;
    }
    const all = [...west, ...mid, ...east];
    let x = k.x0;
    all.forEach((s, i) => {
      const worldEnd = i === 0 && k.west ? -1 : i === all.length - 1 && k.east ? 1 : 0;
      const corner = worldEnd * (side < 0 ? 1 : -1);
      b.push(x + s.w / 2, side * AVE_LOT, side < 0 ? 0 : Math.PI);
      const depth = raise(s, corner);
      b.pop();
      if (worldEnd < 0) cornerDepth.set(ck(k.west!, 1, side), depth);
      if (worldEnd > 0) cornerDepth.set(ck(k.east!, -1, side), depth);
      x += s.w;
    });
  }

  // Blocks: 0 is west of 29th, 1 is 29th-30th ... 5 is 33rd-34th, 6 east of 34th. South is the even side.
  face(0, -1, []);
  face(0, 1, []);
  face(1, 1, [
    { kind: 'mixed', w: 8, floors: 2, shops: [DELI_36], address: '29-02' },
    { kind: 'mixed', w: 7.5, floors: 3, shops: [ALADDIN] },
  ]);
  face(1, -1, [{ kind: 'garage', w: 14, floors: 1 }, { kind: 'new', w: 20, floors: 8 }]);
  face(2, -1, [{ kind: 'mixed', w: 7 }, { kind: 'apartment', w: 17, floors: 5, shed: true }], [
    { kind: 'mixed', w: 9, floors: 3, shops: [{ name: '36 AVE PHARMACY', look: 'gate', bg: '#f2f2ee', fg: '#1a6a3a', awning: 0 }] },
  ]);
  face(2, 1, [{ kind: 'mixed', w: 8 }, { kind: 'mixed', w: 7, shops: [{ name: 'LAUNDROMAT', sub: 'WASH & FOLD · DRY CLEANING', look: 'laundry', open: true, bg: '#1a3a8a', fg: '#ffffff' }] }], [
    { kind: 'mixed', w: 9, floors: 3, shops: [{ name: 'HALAL GRILL', sub: 'GYRO · PLATTERS · OPEN LATE', look: 'diner', open: true, bg: '#c4161c', fg: '#ffffff', awning: 3 }] },
  ]);
  face(3, -1, [{ kind: 'mixed', w: 8.5, floors: 2, shops: [LEOS], address: '31-01' }]);
  face(3, 1, [{ kind: 'mixed', w: 8, floors: 3, shops: [{ name: 'CELL PHONE REPAIR', sub: 'UNLOCK · ACCESSORIES', look: 'gate', bg: '#1a1a1a', fg: '#4ad8ff' }] }]);
  face(4, -1, [], [{ kind: 'evgo', w: 22 }]);
  face(4, 1, [{ kind: 'mixed', w: 8.5, floors: 2, shops: [ASTORIA_DELI], address: '32-02' }], [
    { kind: 'loft', w: 40, depth: 40, floors: 6, banner: 'CITYPOINT' },
  ]);
  face(5, -1, [
    { kind: 'mixed', w: 9, floors: 3, address: '33-01', shops: [{ name: 'DELI & GRILL', sub: 'HOT FOOD · COLD BEER · 24 HRS', look: 'bodega', open: true, bg: '#c4161c', fg: '#f2d43a', awning: 1 }] },
  ]);
  face(5, 1, [
    {
      kind: 'taxpayer',
      w: 30,
      depth: 24,
      banner: 'THE SHOPPES AT 36TH',
      address: '33-12',
      shops: [randomShop(), { name: 'COFFEE BAR', look: 'glass', bg: '#2a2a2a', fg: '#e8d8b0' }, randomShop(), randomShop(), randomShop()],
    },
  ]);
  face(6, -1, []);
  face(6, 1, []);

  // ---------------------------------------------------------------- down the cross streets

  // Row houses and walk-ups facing each cross street, out to where the fog takes them. 33rd south of the
  // avenue is the old factories, and Melrose Ballroom on the east side.
  for (const st of STREETS)
    for (const e of [-1, 1])
      for (const s of [-1, 1]) {
        let z = AVE_LOT + (cornerDepth.get(ck(st, e, s)) ?? 20);
        const factory = st.name === '33 St' && s > 0;
        let first = true;
        while (z < CROSS_REACH) {
          let spec: Spec;
          if (factory && e > 0 && first) spec = { kind: 'ballroom', w: 30, depth: 30, floors: 2 };
          else if (factory) spec = { kind: 'loft', w: between(20, 32), floors: 4 + Math.floor(r() * 3) };
          else {
            const x = r();
            spec =
              x < 0.55
                ? { kind: 'house', w: between(5.5, 7.5) }
                : x < 0.8
                  ? { kind: 'apartment', w: between(12, 18) }
                  : st.x < 0 && x < 0.92
                    ? { kind: 'garage', w: between(8, 12) }
                    : { kind: 'mixed', w: between(6, 9), shops: [] };
          }
          first = false;
          const zc = s * (z + spec.w / 2);
          b.push(st.x + e * st.lot, zc, -e * (Math.PI / 2));
          raise(spec, 0);
          b.pop();
          z += spec.w;
        }
      }

  // ---------------------------------------------------------------- street furniture

  /** A cobra-head street light: octagonal pole at the curb, an arm out over the road, LED head. */
  function streetLamp(x: number, z: number, out: [number, number], ground = 0) {
    const [ox, oz] = out;
    b.cyl(M.pole, 0.1, 0.15, 8.4, x, ground, z, 8);
    b.cyl(M.pole, 0.24, 0.26, 0.6, x, ground, z, 8);
    b.collide(x, z, 0.35, 0.35, 0, 0, 8.4);
    const hx = x + ox * 2.4;
    const hz = z + oz * 2.4;
    strut(M.pole, [x, 8.2, z], [hx, 8.4, hz], 0.1, 0.1);
    b.box(M.lampHead, 0.75, 0.2, 0.36, hx, 8.25, hz, { ry: Math.atan2(ox, oz) + Math.PI / 2 });
    b.box(M.lampLens, 0.55, 0.03, 0.26, hx, 8.23, hz, { ry: Math.atan2(ox, oz) + Math.PI / 2 });
    haze(lampHaze, 1.7, hx, 8.15, hz);
    glows.push({ pos: new THREE.Vector3(hx, 7.8, hz), color: 0xffe2c0, intensity: 120, distance: 28 });
    lamps.push([x, z]);
    pool(hx, hz, 8.5);
  }

  /** A soft pool of light on the ground: on the road, and on each sidewalk it reaches, clipped to it. */
  function pool(cx: number, cz: number, rad: number) {
    const piece = (x0: number, z0: number, x1: number, z1: number, y: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const pos = g.attributes.position as THREE.BufferAttribute;
      const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (mx + pos.getX(i) - cx + rad) / (2 * rad), (mz - pos.getY(i) - cz + rad) / (2 * rad));
      b.add(g, M.pool, mx, y, mz, 0, -Math.PI / 2);
    };
    piece(cx - rad, cz - rad, cx + rad, cz + rad, 0.012);
    for (const [x0, z0, x1, z1] of sidewalks) {
      const c = [Math.max(x0, cx - rad), Math.max(z0, cz - rad), Math.min(x1, cx + rad), Math.min(z1, cz + rad)];
      if (c[2] - c[0] > 0.05 && c[3] - c[1] > 0.05) piece(c[0], c[1], c[2], c[3], CURB + 0.012);
    }
  }

  /** A sign pole: a plain round post. */
  const post = (x: number, z: number, h: number) => {
    b.cyl(M.pole, 0.04, 0.04, h, x, CURB, z, 6);
    b.collide(x, z, 0.12, 0.12, 0, 0, h);
  };

  /** Green street-name blades crossed at the top of a pole: the avenue's along x, the street's along z. */
  function blades(x: number, z: number, y: number, street: string) {
    for (const s of [-1, 1]) {
      b.plane(M.blades['36 Av'], 1.2, 0.22, x, y, z + s * 0.012, { ry: s > 0 ? 0 : Math.PI });
      b.plane(M.blades[street], 1.0, 0.22, x + s * 0.012, y + 0.26, z, { ry: (s * Math.PI) / 2 });
    }
  }

  // Lamps down both sides of the avenue, staggered, and down the cross streets; none under the el,
  // where the station's soffit lights the road.
  for (const k of blocks)
    for (const s of [-1, 1]) {
      const len = k.x1 - k.x0;
      const n = Math.max(1, Math.round(len / 30));
      for (let i = 0; i < n; i++) {
        const x = k.x0 + ((i + (s < 0 ? 0.25 : 0.75)) * len) / n;
        if (Math.abs(x - EL.x) < 16) continue;
        streetLamp(x, s * (AVE_ROAD + 0.45), [0, -s], CURB);
      }
    }
  for (const st of STREETS)
    for (const e of [-1, 1])
      for (const s of [-1, 1])
        for (let z = AVE_LOT + 18 + (e > 0 ? 14 : 0); z < CROSS_REACH; z += 30) streetLamp(st.x + e * (st.road + 0.45), s * z, [-e, 0], CURB);

  // Intersections: signals where there are signals, stop signs and one-way arrows elsewhere, names on every corner.
  const signals: ((t: number) => void)[] = [];
  STREETS.forEach((st, i) => {
    const dir = i % 2 ? -1 : 1;
    if (st.signal) {
      signals.push(signalHeads(b, M, st));
      blades(st.x + st.road + 0.7, AVE_ROAD + 0.7, 5.0, st.name);
      blades(st.x - st.road - 0.7, -AVE_ROAD - 0.7, 5.0, st.name);
    } else {
      // Traffic on the cross street stops; the sign on its right, before the crosswalk.
      const sx = st.x - dir * (st.road + 0.6);
      const sz = -dir * (AVE_LOT - 0.4);
      post(sx, sz, 3.4);
      b.plane(M.stop, 0.76, 0.76, sx, CURB + 2.3, sz - dir * 0.03, { ry: dir > 0 ? Math.PI : 0 });
      b.plane(M.stop, 0.76, 0.76, sx, CURB + 2.3, sz - dir * 0.025, { ry: dir > 0 ? 0 : Math.PI });
      blades(sx, sz, CURB + 3.2, st.name);
      // One-way arrows on the far corners, facing down the avenue both ways.
      for (const e of [-1, 1]) {
        const ox = st.x + e * (st.road + 0.6);
        const oz = dir * (AVE_LOT - 0.4);
        post(ox, oz, 3.0);
        const g = new THREE.PlaneGeometry(0.9, 0.32);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        // Facing -x, the texture's right runs toward +z; flip it when the street runs the other way.
        if (dir < 0) for (let j = 0; j < uv.count; j++) uv.setX(j, 1 - uv.getX(j));
        b.add(g, M.oneWay, ox - e * 0.03, CURB + 2.6, oz, e > 0 ? -Math.PI / 2 : Math.PI / 2);
        if (e > 0) blades(ox, oz, CURB + 3.0, st.name);
      }
    }
  });

  // Hydrants, trees, parked cars, and the trash out for the morning, block by block.
  const near = (pts: [number, number][], x: number, z: number, d: number) => pts.some(([px, pz]) => Math.abs(px - x) < d && Math.abs(pz - z) < d);
  const clearZones: Rect[] = [
    [18, 0, 34, AVE_ROAD], // Citi Bike dock
    [-40, -AVE_ROAD, -16, 0], // the Q102 stop
  ];
  const inZone = (x: number, z: number) => clearZones.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

  for (const k of blocks)
    for (const s of [-1, 1]) {
      const curbZ = s * (AVE_ROAD + 0.55);
      for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
        const x = between(k.x0 + 8, k.x1 - 8);
        if (near(lamps, x, curbZ, 2)) continue;
        hydrants.push([x, curbZ]);
        b.cyl(M.hydrant, 0.17, 0.2, 0.08, x, CURB, curbZ, 8);
        b.cyl(M.hydrant, 0.13, 0.13, 0.55, x, CURB, curbZ, 8);
        b.sphere(M.hydrantTop, 0.14, x, CURB + 0.6, curbZ, 0.7);
        b.box(M.hydrantTop, 0.44, 0.12, 0.12, x, CURB + 0.38, curbZ);
        b.box(M.hydrant, 0.12, 0.14, 0.24, x, CURB + 0.36, curbZ + s * 0.06);
        b.collide(x, curbZ, 0.36, 0.36, 0, 0, 0.75);
      }
      // Trees in pits along the curb.
      const treeZ = s * (AVE_ROAD + 1.0);
      for (let x = k.x0 + 5 + r() * 4; x < k.x1 - 5; x += 7 + r() * 5) {
        if (r() < 0.3 || near(lamps, x, treeZ, 2.4) || near(hydrants, x, treeZ, 2)) continue;
        b.box(M.soil, 1.2, 0.02, 1.2, x, CURB, treeZ);
        b.cyl(M.bark, 0.11, 0.15, 3.4, x, CURB, treeZ, 6);
        b.collide(x, treeZ, 0.3, 0.3, 0, 0, 3.4);
        const sz = between(3.6, 5.2);
        const cy = CURB + 2.6 + sz / 2;
        for (let j = 0; j < 3; j++) b.plane(M.leaves, sz, sz * 0.9, x, cy, treeZ, { ry: (j * Math.PI) / 3 + r() });
        b.plane(M.leaves, sz * 0.9, sz * 0.9, x, cy + 0.3, treeZ, { rx: -Math.PI / 2, ry: r() * Math.PI });
      }
      // Parked cars, nose with the traffic, clear of the corners and hydrants.
      const parkZ = s * PARK;
      let x = (k.west ? k.west.x + k.west.road + CROSSWALK + 4 : k.x0) + r() * 2;
      const end = k.east ? k.east.x - k.east.road - CROSSWALK - 6 : k.x1;
      while (x < end) {
        const kind = randomCar(r);
        const [len, w] = CAR_SIZE[kind];
        const cx = x + len / 2;
        if (cx + len / 2 > end) break;
        if (r() < 0.12 || near(hydrants, cx, parkZ, 4.5) || inZone(cx, parkZ)) {
          x += 3 + r() * 3;
          continue;
        }
        const ry = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        b.push(cx, parkZ + s * between(-0.1, 0.15), ry + between(-0.03, 0.03));
        const paint = kind === 'boro' ? M.boroTaxi : M.carPaints[Math.floor(r() * M.carPaints.length)];
        carModel(b, M, kind, paint, false);
        b.collide(0, 0, w, len, 0, 0, 1.6);
        b.pop();
        x += len + between(0.6, 2.4);
      }
      // Garbage out at the curb, a few piles a block.
      for (let p = 0; p < 2 + Math.floor(r() * 2); p++) {
        const px = between(k.x0 + 4, k.x1 - 4);
        if (near(lamps, px, treeZ, 1.5) || near(hydrants, px, treeZ, 1.5)) continue;
        for (let j = 0; j < 2 + Math.floor(r() * 4); j++)
          prop(pick(['trashBag', 'trashBag', 'trashBagSmall', 'recyclingBag']), px + between(-1, 1), CURB, treeZ + between(-0.35, 0.35));
      }
      if (r() < 0.6) prop(pick(['bottle', 'can', 'pizzaBox', 'newspaper']), between(k.x0, k.x1), CURB, s * between(AVE_ROAD + 1.5, AVE_LOT - 0.5));
    }

  // Parked cars along the cross streets too, as far as can be seen.
  for (const st of STREETS)
    for (const e of [-1, 1])
      for (const s of [-1, 1]) {
        const px = st.x + e * (st.name === '31 St' ? 8.0 : st.road - 1.1);
        for (let z = AVE_LOT + 4 + r() * 3; z < CROSS_REACH - 3; ) {
          const kind = randomCar(r);
          const [len, w] = CAR_SIZE[kind];
          if (r() < 0.1 || (st.name === '31 St' && near(EL_COLUMNS, px, s * (z + len / 2), 3.4))) {
            z += 4;
            continue;
          }
          b.push(px, s * (z + len / 2), e > 0 ? 0 : Math.PI);
          carModel(b, M, kind, M.carPaints[Math.floor(r() * M.carPaints.length)], false);
          b.collide(0, 0, w, len, 0, 0, 1.6);
          b.pop();
          z += len + between(0.6, 2.2);
        }
      }

  // Litter baskets on the corners.
  for (const st of STREETS)
    for (const e of [-1, 1]) for (const s of [-1, 1]) prop('litterBasket', st.x + e * (st.road + 1.7), CURB, s * (AVE_ROAD + 0.8));

  // Outside the delis: crates, the chair, someone's empties.
  for (const [x, s] of [[-159 + 2, 1], [93 + 3, 1], [177 + 4, -1]] as const) {
    const z = s * (AVE_LOT - 0.5);
    prop('milkCrate', x + 2.4, CURB, z);
    prop('milkCrate', x + 2.4, CURB + 0.28, z, 0.1);
    prop('milkCrate', x + 2.9, CURB, z);
    prop('plasticChair', x + 1.0, CURB, z - s * 0.6, s > 0 ? Math.PI + 0.3 : 0.3);
    prop('can', x + 1.5, CURB, z - s * 0.4);
  }
  prop('sandwichBoard', 177 + 30 * 0.5, CURB, AVE_LOT - 0.6, 0.2);

  // The Q102 stop just west of 31st on the north side.
  post(-24, -(AVE_ROAD + 0.6), 3.0);
  b.plane(M.busStop, 0.38, 0.76, -24, CURB + 2.5, -(AVE_ROAD + 0.6) + 0.03);
  b.plane(M.busStop, 0.38, 0.76, -24, CURB + 2.5, -(AVE_ROAD + 0.6) - 0.03, { ry: Math.PI });

  // A mailbox and the free-paper boxes by the station.
  b.box(M.mailbox, 0.55, 1.15, 0.5, 96, CURB, AVE_ROAD + 1.0, { solid: true });
  b.box(M.mailbox, 0.55, 0.2, 0.5, 96, CURB + 1.15, AVE_ROAD + 1.0);
  [0xc4161c, 0x1a3a8a, 0xe8c43a].forEach((c, i) => b.box(new THREE.MeshLambertMaterial({ color: c }), 0.5, 1.0, 0.45, -16.5 + i * 0.6, CURB, AVE_LOT - 0.4, { solid: true }));

  // Citi Bike dock in the parking lane east of 31st on the south side.
  {
    const z = PARK;
    b.box(M.pole, 14, 0.05, 1.6, 26, 0, z);
    b.box(M.citiBlue, 0.6, 1.9, 0.4, 19.6, 0.05, z, { solid: true });
    b.box(M.carGlass, 0.4, 0.3, 0.02, 19.6, 1.3, z - 0.21);
    b.collide(26.6, z, 12.8, 1.4, 0, 0, 1.1);
    for (let i = 0; i < 14; i++) {
      const x = 20.6 + i * 0.85;
      b.box(M.pole, 0.12, 0.85, 0.2, x, 0.05, z + 0.55);
      if (r() < 0.3) continue;
      // A blue bike, front wheel in the dock.
      for (const wz of [0.25, -0.75]) {
        const g = new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10);
        g.rotateZ(Math.PI / 2);
        b.add(g, M.tire, x, 0.37, z + wz);
      }
      b.box(M.citiBlue, 0.07, 0.08, 1.0, x, 0.55, z - 0.25);
      b.box(M.citiBlue, 0.07, 0.45, 0.07, x, 0.5, z - 0.55);
      b.box(M.tire, 0.12, 0.05, 0.24, x, 0.98, z - 0.55);
      b.box(M.tire, 0.55, 0.04, 0.04, x, 1.02, z + 0.2);
      b.box(M.white, 0.3, 0.12, 0.25, x, 0.85, z + 0.35);
    }
  }

  // ---------------------------------------------------------------- the el

  const el = buildEl(b, M, r, sound);
  glows.push(...el.glows);
  const station = buildStation(b, M, sound);
  glows.push(...station.glows);
  walks.push(...station.walks);
  props.push(...station.props);
  for (const g of station.globes) haze(globeHaze, 1.3, g.x, g.y, g.z);

  // ---------------------------------------------------------------- walls you can't see

  // The player stays on 36th Avenue: walls across each cross street a little way up, and at both ends.
  // They stop short of the el, so up on the platforms you can walk their whole length.
  for (const st of STREETS) for (const s of [-1, 1]) b.collide(st.x, s * (crossReach(st) + 0.5), 2 * st.lot + 2, 1, 0, 0, 8);
  b.collide(WEST_END - 0.5, 0, 1, 2 * AVE_LOT + 2, 0, 0, 40);
  b.collide(EAST_END + 0.5, 0, 1, 2 * AVE_LOT + 2, 0, 0, 40);

  // ---------------------------------------------------------------- beyond

  const group = b.build();

  // The rest of Astoria and Long Island City out past the fog line: low blocks all round, and the towers
  // of Court Square and Queens Plaza off to the south-west, with Midtown beyond them.
  {
    const filler: THREE.BufferGeometry[] = [];
    const far = mulberry32(36);
    const box = (geos: THREE.BufferGeometry[], x: number, z: number, w: number, d: number, h: number) => {
      const g = boxGeo(w, h, d, [56, 112]);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const du = far();
      const dv = Math.floor(far() * 32) / 32;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
      g.translate(x, h / 2, z);
      geos.push(g);
    };
    for (let x = -700; x < 800; x += 42)
      for (let z = -700; z < 700; z += 42) {
        const inside = x > WEST_END - END_REACH - 30 && x < EAST_END + END_REACH + 30 && Math.abs(z) < CROSS_REACH + 25;
        if (inside || Math.hypot(x - 40, z) > 760) continue;
        box(filler, x + far() * 10, z + far() * 10, 22 + far() * 14, 22 + far() * 14, 8 + far() * far() * 22);
      }
    const fillerMat = new THREE.MeshLambertMaterial({ map: buildingTexture('prewar', 3602), emissive: 0x111111 });
    const fillerMesh = new THREE.Mesh(mergeGeos(filler), fillerMat);
    group.add(fillerMesh);

    const towers: Record<BuildingKind, THREE.BufferGeometry[]> = { glass: [], office: [], prewar: [] };
    const tower = (x: number, z: number, w: number, h: number, kind: BuildingKind) => box(towers[kind], x, z, w, w * (0.7 + far() * 0.5), h);
    // Court Square and Queens Plaza, about a mile off.
    for (let i = 0; i < 16; i++) tower(-420 + (far() - 0.5) * 500, 1500 + (far() - 0.5) * 400, 28 + far() * 20, 90 + far() * 150, far() < 0.6 ? 'glass' : 'office');
    tower(-380, 1450, 36, 236, 'glass');
    // Midtown, three miles beyond the river.
    for (let i = 0; i < 40; i++) {
      const t = far();
      tower(-3550 + (far() - 0.5) * 1800, 3300 + (far() - 0.5) * 1400, 40 + far() * 30, 120 + t * t * 300, far() < 0.5 ? 'glass' : 'office');
    }
    for (const kind of ['glass', 'office', 'prewar'] as const) {
      if (!towers[kind].length) continue;
      const mat = new THREE.MeshBasicMaterial({ map: buildingTexture(kind, 3610 + kind.length), color: 0x8a7a8c, fog: false });
      group.add(new THREE.Mesh(mergeGeos(towers[kind]), mat));
    }
  }

  for (const h of hazes) group.add(h);
  group.add(el.train, station.group);

  const traffic = buildTraffic(M, r, sound);
  group.add(traffic.group);
  const carGlows: Glow[] = traffic.lights.map((l) => ({ pos: l.pos, color: 0xfff0d0, intensity: 5, distance: 12 }));
  glows.push(...carGlows);

  const sky = buildSky();
  group.add(sky);

  // Night out of doors: a dim blue ambient, the orange city glow under the clouds, a little moon.
  group.add(new THREE.AmbientLight(0x6a7090, 0.9));
  group.add(new THREE.HemisphereLight(0x6a5a70, 0x3a3028, 0.9));
  const moon = new THREE.DirectionalLight(0x9aa8d8, 0.3);
  moon.position.set(-0.45, 0.5, 0.87);
  group.add(moon);
  const pool16 = new LightPool(16, group);

  let player: { pos: THREE.Vector3 } | null = null;

  return {
    subtitle: '36TH AVE &middot; ASTORIA &middot; 2:31 AM',
    group,
    colliders: b.colliders,
    props,
    templates: streetPropTemplates(M),
    floor: [-520, -320, 620, 320],
    walkable: [WEST_END, -EL.platformHalf, EAST_END, EL.platformHalf],
    fog: { color: 0x2c2230, density: 0.0062 },
    ambience: 'street',
    // In front of 33-01, on the north side at the corner of 33rd, looking west toward the el.
    spawn: { x: 181, z: -8.4, yaw: Math.PI / 2 },
    surfaceAt: () => 'stone',
    heightAt: (x, z, y) => heightOn(walks, x, z, y),
    actionAt: station.actionAt,
    attach: (physics, who) => {
      player = who;
      traffic.attach(physics, who);
      station.attach(physics);
    },
    update: (t, dt, camera) => {
      sky.position.copy(camera.position);
      for (const s of signals) s(t);
      el.update(t, dt, camera);
      traffic.update(t, dt, camera);
      if (player) station.update(dt, player.pos);
      pool16.update(camera.position, glows);
    },
  };
}

/** Column positions of the el near the avenue, so cars don't park into them. */
const EL_COLUMNS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let z = 11.5; z < CROSS_REACH; z += 15) for (const s of [-1, 1]) for (const e of [-1, 1]) out.push([EL.x + e * EL.columns, s * z]);
  return out;
})();

function mergeGeos(geos: THREE.BufferGeometry[]) {
  const b = new Builder();
  const mat = new THREE.MeshBasicMaterial();
  for (const g of geos) b.add(g, mat, 0, 0, 0);
  return b.geometries().get(mat)!;
}

/**
 * A fixed set of point lights handed each frame to whichever light sources are nearest the camera.
 * A source on its way out of the set has faded to nothing by the time it goes, so nothing pops.
 */
class LightPool {
  private lights: THREE.PointLight[] = [];

  constructor(n: number, group: THREE.Group) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      this.lights.push(l);
      group.add(l);
    }
  }

  update(at: THREE.Vector3, sources: Glow[]) {
    const ranked = sources
      .filter((s) => s.intensity > 0)
      .map((s) => ({ s, d: s.pos.distanceTo(at) }))
      .sort((a, c) => a.d - c.d);
    const n = this.lights.length;
    const cut = ranked[n]?.d ?? Infinity;
    this.lights.forEach((l, i) => {
      const e = ranked[i];
      if (!e) return void (l.intensity = 0);
      l.position.copy(e.s.pos);
      l.color.setHex(e.s.color);
      l.distance = e.s.distance;
      l.intensity = e.s.intensity * Math.min(1, Math.max(0, (cut - e.d) / 12));
    });
  }
}

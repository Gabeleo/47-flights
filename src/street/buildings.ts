import * as THREE from 'three';
import { strut } from '../geometry';
import type { StreetCtx } from './context';
import { AVE_LOT, AVE_ROAD, CURB } from './plan';
import { carModel } from './traffic';

// The avenue's buildings: one `raise` puts up any of them, from a two-storey taxpayer to the factory lofts
// on 33rd, with shopfronts, windows, cornices, fire escapes, rooftops and sidewalk sheds.

type Look = 'bodega' | 'laundry' | 'diner' | 'pizza' | 'glass' | 'gate';
export type Shop = { name: string; sub?: string; look: Look; open?: boolean; bg: string; fg: string; awning?: number; serif?: boolean; unlit?: boolean };
type Kind = 'mixed' | 'apartment' | 'house' | 'taxpayer' | 'garage' | 'loft' | 'new' | 'evgo' | 'ballroom';
export type Spec = {
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

/** How a face's upper windows are done: stone lintels, painted trim, plain, new-build glass, or loft bays. */
type Style = 'stone' | 'trim' | 'plain' | 'new' | 'loft';

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

/** The building toolkit, drawing on the street's shared builder, materials and random sequence. */
export function buildingKit({ b, M, r, pick, between, prop, atlas, flat, glow }: StreetCtx) {
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
        glow(cx, 2.2, 1.8, shop.look === 'bodega' ? 0xf0f4e8 : 0xfff0d8, 6, 9);
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
      if (f < floors - 1) strut(b, M.fireStair, [xa + 0.5, y + 0.06, 0.75], [xb - 0.5, y + fH, 0.75], 0.55, 0.03);
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
      glow(x, 1.4, -d + 2.5, 0x6ad8ff, 1.2, 4);
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
      glow(x, 6.6, -d + 1.5, 0xe8f0ff, 30, 16);
    }
  }

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
      for (const e of [-1, 1]) strut(b, M.iron, [dx + e * 0.68, CURB + 1.1, -setback + 1.6], [dx + e * 0.68, CURB + 1.9, -setback + 0.1], 0.04, 0.04);
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
      glow(w / 2 - 2, 2.4, 1.5, 0xfff0d8, 4, 7);
    } else if (k === 'loft') {
      const bays = Math.max(2, Math.round(w / 4.5));
      for (let i = 0; i < bays; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / bays;
        if (i === 1 && s.banner) {
          b.plane(M.litDoor, 2.2, 2.8, x, CURB + 1.4, 0.03);
          b.box(M.cornice, 3.2, 0.7, 0.25, x, CURB + 3.0, 0.12);
          b.plane(M.sign(Math.floor(r() * 1e6), s.banner, '#1a1a1a', '#e8e0c8'), 3.0, 0.6, x, CURB + 3.35, 0.255);
          glow(x, 2.6, 1.5, 0xfff0d8, 4, 7);
        } else if (i % 2) b.plane(pick(M.gates), 3.2, 3.2, x, CURB + 1.6, 0.03);
        else b.plane(M.loftDark, 3.0, 2.4, x, CURB + 2.1, 0.03);
      }
    } else if (k === 'ballroom') {
      b.box(M.poleDark, Math.min(9, w - 2), 1.4, 1.6, 0, 3.6, 0.8);
      b.plane(M.marquee, Math.min(9, w - 2) - 0.2, 1.2, 0, 4.3, 1.61);
      b.plane(M.glassDoor, 4, 2.6, 0, CURB + 1.3, 0.03);
      glow(0, 3.2, 2, 0xffe8a0, 5, 9);
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
      glow(0, 2.6, 1.6, 0xfff0d8, 3, 6);
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
        glow(x, 2.7, reach / 2, 0xf0f4ff, 2.2, 5);
      }
      for (const x of [-w / 2 + 2, w / 2 - 3]) prop('cone', x, CURB, reach + 0.6);
    }

    b.pop();
    return d + setback;
  }

  return { raise, randomShop };
}

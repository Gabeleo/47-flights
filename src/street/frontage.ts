import { buildingKit, type Shop, type Spec } from './buildings';
import type { StreetCtx } from './context';
import { AVE_LOT, BLOCKS, CROSS_REACH, STREETS, type CrossStreet } from './plan';

// Who's where: the buildings along both sides of the avenue, the ones known by name and the rest chosen at
// random, and the row houses, walk-ups and factories down each cross street.

// Where the names are known.
const DELI_36: Shop = { name: '36 AVE DELI & GROCERY', sub: 'OPEN 24 HOURS', look: 'bodega', open: true, bg: '#f2d43a', fg: '#c4161c', awning: 1 };
const ALADDIN: Shop = { name: 'ALADDIN RESTAURANT', sub: 'HALAL FOOD', look: 'diner', bg: '#1e6a3a', fg: '#f2f2ee' };
const LEOS: Shop = { name: "LEO'S PIZZERIA", sub: 'SLICES · HEROS · CALZONES', look: 'pizza', bg: '#f2f2ee', fg: '#b22a2a', awning: 1, serif: true };
const ASTORIA_DELI: Shop = { name: 'ASTORIA DELI', sub: 'GROCERY · OPEN 24 HRS', look: 'bodega', open: true, bg: '#1a3a8a', fg: '#f2f2ee', awning: 2 };

export function buildFrontage(ctx: StreetCtx) {
  const { b, r, between } = ctx;
  const { raise, randomShop } = buildingKit(ctx);

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
    const k = BLOCKS[blockIndex];
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

  // Blocks are numbered as in BLOCKS. South is the even side.
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
}

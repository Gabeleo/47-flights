import * as THREE from 'three';
import { strut } from '../geometry';
import type { StreetCtx } from './context';
import { AVE_LOT, AVE_ROAD, BLOCKS, CROSS_REACH, CROSSWALK, CURB, EL, EL_COLUMNS, PARK, STREETS, type Rect } from './plan';
import { CAR_SIZE, carModel, randomCar, signalHeads } from './traffic';

// Everything on the sidewalks and in the parking lanes: street lights and the pools under them, signals
// and signs, hydrants, trees, parked cars, the trash out for the morning, and the odd fixture by name.

/** Lays out the street furniture; returns the signals, to be run with the time each frame. */
export function buildFurniture({ b, M, r, sidewalks, pick, between, prop, haze, hazeMat, glow }: StreetCtx) {
  /** Things kept clear of parked cars and trees: hydrants, lamp posts, corners. */
  const hydrants: [number, number][] = [];
  const lamps: [number, number][] = [];
  const lampHaze = hazeMat(0xffe2b8, 0.3);

  /** A cobra-head street light: octagonal pole at the curb, an arm out over the road, LED head. */
  function streetLamp(x: number, z: number, out: [number, number], ground = 0) {
    const [ox, oz] = out;
    b.cyl(M.pole, 0.1, 0.15, 8.4, x, ground, z, 8);
    b.cyl(M.pole, 0.24, 0.26, 0.6, x, ground, z, 8);
    b.collide(x, z, 0.35, 0.35, 0, 0, 8.4);
    const hx = x + ox * 2.4;
    const hz = z + oz * 2.4;
    strut(b, M.pole, [x, 8.2, z], [hx, 8.4, hz], 0.1, 0.1);
    b.box(M.lampHead, 0.75, 0.2, 0.36, hx, 8.25, hz, { ry: Math.atan2(ox, oz) + Math.PI / 2 });
    b.box(M.lampLens, 0.55, 0.03, 0.26, hx, 8.23, hz, { ry: Math.atan2(ox, oz) + Math.PI / 2 });
    haze(lampHaze, 1.7, hx, 8.15, hz);
    glow(hx, 7.8, hz, 0xffe2c0, 120, 28);
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
  for (const k of BLOCKS)
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

  for (const k of BLOCKS)
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

  return signals;
}

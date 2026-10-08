import * as THREE from 'three';
import { Builder, boxGeo, type Tile } from './geometry';
import { makeMaterials } from './materials';
import type { Surface } from './player';
import type { PropSpawn } from './props';
import { mulberry32 } from './textures';

// Floor plate: 40m x 28m, centred on the origin, with a service core in the middle.
// Elevator hallway runs north-south through it. The floor is at y = 0, 47 storeys above the street.
const H = 2.8;
const HX = 20;
const HZ = 14;

// Trading pods: two runs of desks around a small round table, making a hexagon with walk-in gaps.
// Sitters face out, screens face in, and a woven fabric screen wraps the outside. Each desk's back
// comes to a corner behind its sitter, with flat faces between. Angles are measured from the pod's
// local +z toward +x.
const POD_RUN = 3;
/** Radians of open floor between the two runs, at the front and the back. */
const POD_GAP = 0.66;
const POD_SEAT = (Math.PI - POD_GAP) / POD_RUN;
/** Inner radius at the points between desks. */
const POD_LOBE = 2.36;
/** How far each desk's front edge curves back to make room for its sitter. */
const POD_SCOOP = 0.16;
const POD_EDGE = POD_LOBE + POD_SCOOP;
/** Radius of the corner behind each sitter; with the screen outside it, a pod is 7m across corner to corner. */
const POD_BACK = 3.44;
/** Distance from the centre to the flat faces of the back. */
const POD_FLAT = POD_BACK * Math.cos(POD_SEAT / 2);
const POD_SCREEN = 0.06;
const POD_SCREEN_H = 1.1;
/** Where monitors hang, from the desk's front edge: tucked into the corner of the back. */
const POD_MONITOR_Z = POD_EDGE - POD_BACK + 0.36;
/** Turn of a side-by-side monitor pair so each one lines up with its face of the back. */
const POD_MONITOR_TURN = POD_SEAT / 2;
/** Pod desktops are at this height. */
const DESK_Y = 0.75;
/** Centre height of a monitor on its arm, and of the arms where they leave the pole. */
const MONITOR_Y = 1.13;
const ARM_Y = 1.19;
/** The arm's pole stands this far behind the monitors, in the corner where they meet. */
const ARM_POLE_BACK = 0.2;

type DeskKind = 'off' | 'lock' | 'code' | 'dash' | 'empty' | 'mine';

/** Axis-aligned floor rectangle: x0, z0, x1, z1. */
type Rect = [number, number, number, number];

export function buildOffice() {
  const b = new Builder();
  const M = makeMaterials();
  const r = mulberry32(47);
  const lights: THREE.Light[] = [];

  const point = (color: number, intensity: number, distance: number, x: number, y: number, z: number) => {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    lights.push(l);
    return l;
  };

  // ---------------------------------------------------------------- furniture

  // Loose items are physics props (see props.ts); here we only record where they start.
  const props: PropSpawn[] = [];
  /** Spawn a prop at local (x, z), resting on a surface at height y, turned by ry. */
  function prop(kind: string, x: number, y: number, z: number, ry = 0) {
    const p = b.pose(x, z, ry);
    props.push({ kind, x: p.x, y, z: p.z, yaw: p.yaw });
  }
  const chair = (x: number, z: number, ry: number, hoodie = false) => prop(hoodie ? 'chairHoodie' : 'chair', x, 0, z, ry);
  const plant = (x: number, z: number, s = 1) => prop(s < 1 ? 'plantSmall' : 'plant', x, 0, z, r() * Math.PI * 2);
  const mug = (x: number, z: number) => prop(`mug${Math.floor(r() * 4)}`, x, 0.75, z, r() * Math.PI * 2);

  /** Box of width w and height h running from a to b, as [x, y, z] in the current frame. */
  function strut(mat: THREE.Material, a: number[], c: number[], w: number, h: number) {
    const [dx, dy, dz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const flat = Math.hypot(dx, dz);
    const geo = boxGeo(w, h, Math.hypot(flat, dy));
    b.add(geo, mat, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, Math.atan2(dx, dz), -Math.atan2(dy, flat));
  }

  /**
   * Two monitors on a dual arm clamped to the desk, in desk space. A silver pole stands in the corner
   * behind the pair; from a hub near its top an arm runs out behind each monitor to an elbow, and a
   * gas-spring forearm comes back down to the VESA plate on the monitor's back.
   */
  function monitorPair(left: THREE.Material, right: THREE.Material) {
    const pz = POD_MONITOR_Z - ARM_POLE_BACK;
    /** The pole stops level with the tops of the monitors. */
    const pole = MONITOR_Y + 0.18 - DESK_Y;
    b.box(M.black, 0.09, 0.012, 0.13, 0, DESK_Y, pz);
    b.box(M.black, 0.05, 0.05, 0.05, 0, DESK_Y + 0.16, pz);
    b.cyl(M.metal, 0.018, 0.018, pole, 0, DESK_Y, pz, 8);
    b.cyl(M.metal, 0.032, 0.032, 0.05, 0, ARM_Y - 0.03, pz, 8);
    b.collide(0, pz, 0.04, 0.04, 0, DESK_Y, DESK_Y + pole);
    for (const [s, screen] of [[-1, left], [1, right]] as const) {
      const ry = -s * POD_MONITOR_TURN;
      const [mx, mz] = [s * 0.32, POD_MONITOR_Z];
      b.push(mx, mz, ry);
      b.box(M.bezel, 0.6, 0.36, 0.035, 0, MONITOR_Y - 0.18, 0);
      b.plane(screen, 0.56, 0.32, 0, MONITOR_Y, 0.0185);
      b.box(M.black, 0.1, 0.1, 0.012, 0, MONITOR_Y - 0.05, -0.0235);
      b.box(M.black, 0.035, 0.045, 0.035, 0, MONITOR_Y - 0.03, -0.047);
      b.collide(0, 0, 0.6, 0.035, 0, MONITOR_Y - 0.18, MONITOR_Y + 0.18);
      b.pop();
      // Along the monitor's face, away from the corner, and straight out of its back.
      const [tx, tz] = [s * Math.cos(POD_MONITOR_TURN), Math.sin(POD_MONITOR_TURN)];
      const [nx, nz] = [-Math.sin(ry), -Math.cos(ry)];
      const elbow = [0.55 * tx + 0.04 * nx, ARM_Y, pz + 0.55 * tz + 0.04 * nz];
      const tilt = [mx + 0.065 * nx, MONITOR_Y, mz + 0.065 * nz];
      strut(M.metal, [0, ARM_Y, pz], elbow, 0.04, 0.035);
      b.cyl(M.metal, 0.024, 0.024, 0.07, elbow[0], ARM_Y - 0.035, elbow[2], 8);
      const fore = [elbow[0], ARM_Y + 0.01, elbow[2]];
      strut(M.metal, fore, tilt, 0.045, 0.03);
      strut(M.black, [fore[0], fore[1] - 0.02, fore[2]], [tilt[0], tilt[1] - 0.02, tilt[2]], 0.035, 0.015);
    }
  }

  /** What sits on one pod desk, in local space: the front edge is at z = 0, the sitter at +z facing -z. */
  function desk(kind: DeskKind) {
    if (kind === 'mine') {
      monitorPair(M.screenCode, M.screenDash);
      prop('keyboard', -0.05, 0.75, -0.12);
      prop('mouse', 0.3, 0.75, -0.1);
      mug(-0.52, -0.1);
      for (let i = 0; i < 3; i++) prop('can', 0.5 + i * 0.07, 0.75, -0.25 + (i % 2) * 0.08);
      prop('notebook', 0.45, 0.75, -0.02, 0.3);
      chair(0.2, 0.5, 0.7, true);
      const glow = b.pose(0, POD_MONITOR_Z + 0.12);
      point(0x7fa8ff, 0.8, 3, glow.x, 1.2, glow.z);
      return;
    }
    // Every desk has its pair of monitors, dark if nobody sits there.
    const screens = {
      off: [M.screenOff, M.screenOff],
      empty: [M.screenOff, M.screenOff],
      lock: [M.screenLock, M.screenLock],
      code: [M.screenCode, M.screenCode2],
      dash: [M.screenDash, M.screenDash],
    }[kind];
    monitorPair(screens[0], screens[1]);
    if (kind !== 'empty') {
      prop('keyboard', 0, 0.75, -0.12);
      prop('mouse', 0.32, 0.75, -0.1);
    }
    if (r() < 0.12) prop('deskPlant', -0.62, 0.75, -0.28, r() * Math.PI);
    else if (r() < 0.35) mug(-0.55 + r() * 0.15, -0.05 - r() * 0.15);
    if (r() < 0.3) prop('paper', 0.5, 0.75, -0.1, (r() - 0.5) * 0.5);
    chair((r() - 0.5) * 0.3, 0.4 + r() * 0.2, (r() - 0.5) * 0.8);
  }

  function randomDesk(): DeskKind {
    const x = r();
    return x < 0.12 ? 'empty' : x < 0.62 ? 'off' : x < 0.86 ? 'lock' : x < 0.95 ? 'code' : 'dash';
  }

  /** Point at radius rad and angle a in pod space. */
  const polar = (rad: number, a: number): [number, number] => [rad * Math.sin(a), rad * Math.cos(a)];

  /** One run of desks in pod space, starting at angle a0 and going round toward +a. */
  function deskRun(a0: number, kinds: DeskKind[]) {
    const n = kinds.length;
    /** Angle in pod space of u, which counts desks from a0. */
    const angle = (u: number) => a0 + u * POD_SEAT;
    /** The scalloped front edge: radius at u. */
    const front = (u: number) => POD_LOBE + POD_SCOOP * Math.sin(Math.PI * (u - Math.floor(u)));
    /** The faceted back, its flat faces d out from the centre: a corner behind each desk, square ends. */
    const back = (d: number) => [
      polar(d, angle(0)),
      ...kinds.map((_, k) => polar(d / Math.cos(POD_SEAT / 2), angle(k + 0.5))),
      polar(d, angle(n)),
    ];
    const band = (d0: number, d1: number) => [...back(d1), ...back(d0).reverse()];
    const edge = Array.from({ length: n * 8 + 1 }, (_, i) => {
      const u = n - i / 8;
      return polar(front(u), angle(u));
    });

    b.prism(M.poly, [...back(POD_FLAT), ...edge], 0.72, 0.03);
    b.prism(M.weave, band(POD_FLAT, POD_FLAT + POD_SCREEN), 0.06, POD_SCREEN_H - 0.06, 0.24);
    b.prism(M.metalDark, band(POD_FLAT + 0.008, POD_FLAT + POD_SCREEN - 0.008), 0, 0.06);

    // Colliders in quarter-desk slices, each square to the flat face behind it: the desktop reaching in to
    // the front edge's average depth there, and the screen along the face.
    const face = (u: number) => angle(Math.floor(u + 0.5));
    for (let i = 0; i < n * 4; i++) {
      const [u0, u1] = [i / 4, (i + 1) / 4];
      const um = (u0 + u1) / 2;
      const f = face(um);
      const depth = (u: number) => front(u) * Math.cos(angle(u) - f);
      const inner = (depth(u0) + 4 * depth(um) + depth(u1)) / 6;
      const [x0, x1] = [u0, u1].map((u) => POD_FLAT * Math.tan(angle(u) - f));
      const along = (x1 + x0) / 2;
      const slab = (z0: number, z1: number, y0: number, y1: number) => {
        const zc = (z0 + z1) / 2;
        b.collide(zc * Math.sin(f) + along * Math.cos(f), zc * Math.cos(f) - along * Math.sin(f), x1 - x0, z1 - z0, f, y0, y1);
      };
      slab(inner, POD_FLAT, 0.72, 0.75);
      slab(POD_FLAT, POD_FLAT + POD_SCREEN, 0, POD_SCREEN_H);
    }

    // Drawer pedestals under the points between desks, and a slim leg at each open end.
    for (let k = 1; k < n; k++) {
      const a = a0 + k * POD_SEAT;
      const [x, z] = polar((POD_LOBE + POD_FLAT) / 2, a);
      b.box(M.metalDark, 0.42, 0.62, 0.6, x, 0, z, { ry: a, solid: true });
    }
    for (const a of [a0 + 0.05, a0 + n * POD_SEAT - 0.05]) {
      const [x, z] = polar(POD_LOBE + 0.12, a);
      b.box(M.metal, 0.05, 0.72, 0.05, x, 0, z, { ry: a, solid: true });
    }

    kinds.forEach((kind, k) => {
      const a = a0 + (k + 0.5) * POD_SEAT;
      b.push(...polar(POD_EDGE, a), a + Math.PI);
      desk(kind);
      b.pop();
    });
  }

  /** A round pod at (cx, cz): runs of desks on local +x and -x, walk-in gaps on local +z and -z. */
  function pod(cx: number, cz: number, ry = 0, pick: (seat: number) => DeskKind = randomDesk) {
    b.push(cx, cz, ry);
    b.cyl(M.poly, 0.42, 0.42, 0.03, 0, 0.72, 0, 14);
    b.cyl(M.metal, 0.04, 0.04, 0.72, 0, 0, 0, 6);
    b.cyl(M.metal, 0.24, 0.26, 0.025, 0, 0, 0, 10);
    b.collide(0, 0, 0.6, 0.6, 0, 0.72, 0.75);
    b.collide(0, 0, 0.08, 0.08, 0, 0, 0.72);
    if (r() < 0.3) mug(0.15, -0.1);
    if (r() < 0.3) prop('paper', -0.1, 0.75, 0.1, r() * Math.PI);
    for (const side of [0, 1])
      deskRun(
        POD_GAP / 2 + side * Math.PI,
        Array.from({ length: POD_RUN }, (_, k) => pick(side * POD_RUN + k)),
      );
    b.pop();
  }

  /** Axis-aligned frameless glass partition from (x0,z0) to (x1,z1) with door openings along its length. */
  function glassWall(x0: number, z0: number, x1: number, z1: number, gaps: [number, number][]) {
    const alongX = z0 === z1;
    const runs: [number, number][] = [];
    let s = alongX ? x0 : z0;
    for (const [g0, g1] of gaps) {
      runs.push([s, g0]);
      s = g1;
    }
    runs.push([s, alongX ? x1 : z1]);
    const at = (a: number): [number, number] => (alongX ? [a, z0] : [x0, a]);
    const ry = alongX ? 0 : Math.PI / 2;
    for (const [a0, a1] of runs) {
      const len = a1 - a0;
      if (len < 0.01) continue;
      const [cx, cz] = at((a0 + a1) / 2);
      b.push(cx, cz, ry);
      b.plane(M.glass, len, H, 0, H / 2, 0);
      b.plane(M.frosted, len, 0.14, 0, 1.4, 0.003);
      b.pop();
      b.collide(cx, cz, alongX ? len : 0.1, alongX ? 0.1 : len);
    }
    for (const [g0, g1] of gaps) {
      const [cx, cz] = at((g0 + g1) / 2);
      b.push(cx, cz, ry);
      b.plane(M.glass, g1 - g0, H - 2.21, 0, (H + 2.21) / 2, 0);
      b.pop();
    }
  }

  // ---------------------------------------------------------------- shell

  // The floor is one grid over the whole plate, laid at the end. Vertex snapping is why: it shifts depth
  // by centimetres at grazing angles, so a rug even a few millimetres up fights the carpet under it; and
  // it moves each vertex on its own, so where one piece's corner sits partway along another's edge (a
  // T-junction), or a floor's edge stops at the foot of a wall, a crack opens onto the city below. So
  // areas register here instead, the plate is cut along every area's edges into cells that meet only
  // corner to corner, each cell takes the last area laid over it, and walls stand on top of it.
  type FloorArea = { mat: THREE.Material; rect: Rect; tile: Tile; origin: [number, number] };
  const floorAreas: FloorArea[] = [];
  /**
   * Floor `mat` over `rect`, its texture repeating every `tile` and anchored so that u = 0 at x = ox and
   * v = 0 at z = oz (v running toward -z), so the cells it's cut into line up their pattern.
   */
  function floor(mat: THREE.Material, rect: Rect, tile: Tile, origin: [number, number] = [0, 0]) {
    floorAreas.push({ mat, rect, tile, origin });
  }
  floor(M.carpet, [-HX, -HZ, HX, HZ], 1);

  /** One flat floor cell, its UVs from world position as `floor` describes. */
  function floorCell(mat: THREE.Material, [x0, z0, x1, z1]: Rect, tile: Tile, [ox, oz]: [number, number]) {
    const [tu, tv] = typeof tile === 'number' ? [tile, tile] : tile;
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // Laid flat, the plane's local +y points along world -z.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + pos.getX(i) - ox) / tu, (oz - (cz - pos.getY(i))) / tv);
    b.add(g, mat, cx, 0, cz, 0, -Math.PI / 2);
  }

  b.plane(M.ceiling, 40, 28, 0, H, 0, { rx: Math.PI / 2, tile: 0.6 });

  // Curtain wall: radiator enclosure, glass, mullions every 1.5m. Local +z faces inward.
  for (const s of [
    { x: 0, z: -HZ, len: 2 * HX, ry: 0 },
    { x: 0, z: HZ, len: 2 * HX, ry: Math.PI },
    { x: -HX, z: 0, len: 2 * HZ, ry: Math.PI / 2 },
    { x: HX, z: 0, len: 2 * HZ, ry: -Math.PI / 2 },
  ]) {
    b.push(s.x, s.z, s.ry);
    b.box(M.radiator, s.len, 0.55, 0.35, 0, 0, 0.175, { solid: true });
    b.box(M.sill, s.len, 0.03, 0.4, 0, 0.55, 0.2);
    b.plane(M.glass, s.len, H - 0.58, 0, 0.58 + (H - 0.58) / 2, 0.03);
    for (let x = -s.len / 2; x <= s.len / 2 + 0.01; x += 1.5) b.box(M.mullion, 0.07, H - 0.58, 0.1, x, 0.58, 0.05);
    b.box(M.mullion, s.len, 0.12, 0.14, 0, H - 0.12, 0.07);
    b.collide(0, 0.03, s.len, 0.06, 0, 0.55, H); // the glass, so nothing gets thrown out of the building
    b.pop();
  }

  // Perimeter columns.
  for (const [x, z] of [
    [-10, -HZ], [0, -HZ], [10, -HZ], [-10, HZ], [0, HZ], [10, HZ],
    [-HX, -7], [-HX, 7], [HX, -7], [HX, 7],
  ]) {
    const cx = Math.abs(x) === HX ? x - Math.sign(x) * 0.55 : x;
    const cz = Math.abs(z) === HZ ? z - Math.sign(z) * 0.55 : z;
    b.box(M.drywall, 0.8, H, 0.8, cx, 0, cz, { tile: 1, solid: true });
  }

  // Core: x -6..6, z -4..4, cut through the middle by the elevator hallway (x -2.142..2.142), open at both
  // ends: three cars down each side, doors facing across. CX is the middle of the core on either side.
  const LW = 2.142;
  const CX = (6 + LW) / 2;
  /** How far the elevator doors are set back into the hallway walls. */
  const RECESS = 0.3;
  b.box(M.drywall, 6 - LW - RECESS, H, 8, -(CX + RECESS / 2), 0, 0, { tile: 1, solid: true });
  b.box(M.drywall, 6 - LW - RECESS, H, 8, CX + RECESS / 2, 0, 0, { tile: 1, solid: true });

  // ---------------------------------------------------------------- elevator hallway

  // Timber-slat walls and ceiling, stainless doors in deep stainless reveals, and warm LED portals
  // framing each mouth and each bay. Coming in from the south, a bay runs: portal, slatted pier, doors.
  const doors = [-2.3, 0, 2.3];
  const DOOR_W = 1.2;
  const DOOR_H = 2.4;
  /** Underside of the slatted ceiling, and of the header across each mouth. */
  const SLAT_Y = 2.72;
  const MOUTH_Y = 2.6;
  /** Portals: one under each mouth's header, and one just past the north edge of each door. */
  const MOUTH_Z = 3.95;
  const portals = [-MOUTH_Z, ...doors.map((z) => z - DOOR_W / 2 - 0.05), MOUTH_Z];
  const portalTop = (z: number) => (Math.abs(z) === MOUTH_Z ? MOUTH_Y : SLAT_Y);
  // A portal's LED: a bright core with an amber glow either side, standing well off the surface, and
  // side by side rather than layered, so vertex snapping can't make them fight at grazing angles.
  const LED_W = 0.04;
  const LED_D = 0.02;
  const GLOW_W = 0.035;
  const GLOW_D = 0.014;

  // Floor: a border of large porcelain tiles running out past each mouth as an apron, a walk-off mat
  // down the middle, and a band of chevrons across the mat in front of each pair of doors.
  // Each laid over the last; brushed-steel thresholds in the door reveals.
  const tx = (2 * LW) / Math.round((2 * LW) / 0.6);
  const tz = 8 / Math.round(8 / 0.6);
  const hallFloor: Rect = [-LW, -(4 + 2 * tz), LW, 4 + 2 * tz];
  floor(M.hallTile, hallFloor, [tx, tz], [-LW, hallFloor[3]]);
  floor(M.walkMat, [-(LW - tx), -(4 - tz), LW - tx, 4 - tz], 0.5);
  for (const z of doors) {
    const band: Rect = [-1.05, z - 0.055, 1.05, z + 0.055];
    floor(M.chevrons, band, [2.1, 0.11], [band[0], band[3]]);
    for (const x0 of [-LW - RECESS, LW]) floor(M.metal, [x0, z - DOOR_W / 2, x0 + RECESS, z + DOOR_W / 2], 0.3);
  }
  /** What you're walking on, for footsteps: the hallway's tiles, its mat, or carpet everywhere else. */
  const surfaceAt = (x: number, z: number): Surface => {
    if (Math.abs(x) > LW || Math.abs(z) > 4 + 2 * tz) return 'carpet';
    return Math.abs(x) < LW - tx && Math.abs(z) < 4 - tz ? 'carpet' : 'stone';
  };

  // Each side wall in its own frame: local +z points across the hallway, local x = side * world z.
  for (const side of [-1, 1]) {
    b.push(side * LW, 0, -side * (Math.PI / 2));
    const at = (z: number) => side * z;
    // The wall face, RECESS deep: piers between the openings and a header over each, slatted only on
    // the hallway side. Their ends are stainless where they line a door's reveal, and drywall at the
    // mouths, where they finish the core's outside face.
    const slats = { mat: M.slats, tile: [0.2, 1] as Tile };
    const steel = { mat: M.metal };
    const end = (z: number) => (Math.abs(z) < 4 ? steel : undefined);
    const edges = [-4, ...doors.flatMap((z) => [z - DOOR_W / 2, z + DOOR_W / 2]), 4];
    for (let i = 0; i < edges.length; i += 2) {
      const [z0, z1] = [edges[i], edges[i + 1]];
      // Local +x is toward +z on the east wall and toward -z on the west.
      const [px, nx] = side > 0 ? [end(z1), end(z0)] : [end(z0), end(z1)];
      b.box(M.drywall, z1 - z0, H, RECESS, at((z0 + z1) / 2), 0, -RECESS / 2, {
        tile: 1,
        solid: true,
        faces: { pz: slats, px, nx },
      });
    }
    doors.forEach((z, i) => {
      const x = at(z);
      b.box(M.drywall, DOOR_W, H - DOOR_H, RECESS, x, DOOR_H, -RECESS / 2, {
        tile: 1,
        solid: true,
        faces: { pz: slats, ny: steel },
      });
      // The doors at the back of the reveal.
      b.box(M.metalDark, DOOR_W, DOOR_H, 0.02, x, 0, -RECESS + 0.01);
      for (const s of [-1, 1])
        b.box(M.doorMetal, 0.545, DOOR_H - 0.05, 0.03, x + s * 0.2775, 0, -RECESS + 0.035, { tile: [0.25, 0.5] });
      // Cars are numbered from the south: A1, A3, A5 down the west side, A2, A4, A6 down the east.
      const car = 2 * (doors.length - 1 - i) + (side < 0 ? 0 : 1);
      b.plane(M.carLabels[car], 0.08, 0.08, x, 1.65, -RECESS + 0.051);
      // Call station on the pier just past the door's portal.
      const cx = at(z - DOOR_W / 2 - 0.27);
      b.box(M.champagne, 0.13, 0.28, 0.02, cx, 1.0, 0.01);
      b.plane(M.callStation, 0.12, 0.27, cx, 1.14, 0.021);
    });
    for (const z of portals) {
      b.box(M.led, LED_W, portalTop(z), LED_D, at(z), 0, LED_D / 2);
      for (const s of [-1, 1])
        b.box(M.ledGlow, GLOW_W, portalTop(z), GLOW_D, at(z) + (s * (LED_W + GLOW_W)) / 2, 0, GLOW_D / 2);
    }
    // The backlit floor number on the right-hand wall as you come in: east from the south, west from
    // the north. Both land at the same local x.
    b.plane(M.floor47, 0.42, 1.05, 3.5, 1.45, 0.004);
    b.pop();
  }

  // Slatted ceiling with the slats running across, a header over each mouth with a dome camera
  // beyond it, the portals' runs across, and downlights over each pair of doors.
  // The ceiling stops inside each header, so its ends don't share a plane with the header's outside face.
  b.box(M.slats, 2 * MOUTH_Z, 0.03, 2 * LW, 0, SLAT_Y, 0, { ry: Math.PI / 2, tile: [0.32, 2] });
  for (const z of [-MOUTH_Z, MOUTH_Z]) {
    // Timber only on the side facing into the hallway; drywall outside, flush with the core's face.
    b.box(M.drywall, 2 * LW, H - MOUTH_Y, 0.1, 0, MOUTH_Y, z, { tile: 1, faces: { [z > 0 ? 'nz' : 'pz']: { mat: M.wood } } });
    b.cyl(M.white, 0.08, 0.08, 0.025, 0, H - 0.025, Math.sign(z) * 4.45, 10);
    b.sphere(M.black, 0.055, 0, H - 0.025, Math.sign(z) * 4.45, 0.8);
  }
  for (const z of portals) {
    b.box(M.led, 2 * LW, LED_D, LED_W, 0, portalTop(z) - LED_D, z);
    for (const s of [-1, 1]) b.box(M.ledGlow, 2 * LW, GLOW_D, GLOW_W, 0, portalTop(z) - GLOW_D, z + (s * (LED_W + GLOW_W)) / 2);
  }
  for (const z of doors) {
    b.cyl(M.downlight, 0.06, 0.06, 0.02, 0, SLAT_Y - 0.02, z, 10);
    point(0xffd9a6, 2.4, 5.5, 0, 2.45, z);
  }
  plant(-LW - 0.6, 4.5);
  plant(LW + 0.6, 4.5);

  // Hanging exit signs at both mouths.
  for (const z of [-4.2, 4.2]) {
    b.box(M.white, 0.4, 0.2, 0.08, 0, 2.45, z);
    b.plane(M.exit, 0.36, 0.17, 0, 2.55, z + 0.041);
    b.plane(M.exit, 0.36, 0.17, 0, 2.55, z - 0.041, { ry: Math.PI });
  }

  // ---------------------------------------------------------------- core faces

  // North faces either side of the hallway: the desk's risk dashboard and the on-call one.
  for (const [x, mat] of [[-CX, M.pnlDash], [CX, M.bigDash]] as const) {
    b.box(M.bezel, 2.21, 1.3, 0.06, x, 0.85, -4.03);
    b.plane(mat, 2.08, 1.17, x, 1.5, -4.062, { ry: Math.PI });
    point(0x6fa0ff, 0.6, 3.5, x, 1.5, -4.6);
  }

  // East face (x = 6): stairwell door with exit sign.
  b.box(M.metalDark, 0.04, 2.2, 1.12, 6.02, 0, 0);
  b.box(M.metal, 0.06, 2.12, 1.0, 6.03, 0, 0);
  b.box(M.metalDark, 0.05, 0.05, 0.6, 6.085, 1.0, 0.1);
  b.plane(M.stair, 0.3, 0.3, 6.062, 1.55, -0.25, { ry: Math.PI / 2 });
  b.box(M.white, 0.08, 0.2, 0.4, 6.04, 2.32, 0);
  b.plane(M.exit, 0.36, 0.17, 6.081, 2.42, 0, { ry: Math.PI / 2 });
  point(0xff2a1a, 0.5, 2.5, 6.4, 2.3, 0);

  // West face (x = -6), across the aisle from the west pod: their sprint board on a TV, and a glass
  // whiteboard on standoffs, with a marker ledge, covered in someone's working.
  const WEST = -6;
  b.box(M.bezel, 0.05, 1.274, 2.184, WEST - 0.025, 0.813, -1.6);
  b.plane(M.tvSprint, 2.08, 1.17, WEST - 0.051, 1.45, -1.6, { ry: -Math.PI / 2 });
  point(0x9fc4ff, 0.5, 3.5, WEST - 0.7, 1.45, -1.6);
  b.box(M.glassEdge, 0.012, 1.2, 2.4, WEST - 0.03, 0.8, 1.24);
  b.plane(M.glassBoard, 2.39, 1.19, WEST - 0.0365, 1.4, 1.24, { ry: -Math.PI / 2 });
  for (const y of [0.86, 1.94]) for (const z of [0.1, 2.38]) b.box(M.metal, 0.03, 0.03, 0.03, WEST - 0.051, y - 0.015, z);
  b.box(M.metal, 0.06, 0.015, 1.6, WEST - 0.045, 0.765, 1.24);
  b.box(M.black, 0.018, 0.018, 0.13, WEST - 0.05, 0.78, 0.7);
  b.box(M.orange, 0.018, 0.018, 0.13, WEST - 0.05, 0.78, 0.9);

  // South faces either side of the hallway: the news on mute, facing the lounge. The screen is split
  // so the ticker strip along its bottom can scroll.
  for (const x of [-CX, CX]) {
    b.box(M.bezel, 1.69, 0.975, 0.05, x, 0.9875, 4.025);
    b.plane(M.news, 1.586, 0.7865, x, 1.5238, 4.052);
    b.plane(M.newsTicker, 1.586, 0.0975, x, 1.0818, 4.052);
    point(0x8fb0ff, 0.5, 3, x, 1.5, 4.6);
  }

  // ---------------------------------------------------------------- desks

  // A row of pods north of the core and another south of it, one either side, one in the south-east
  // corner, all entered from the aisles.
  pod(-13.4, -8.8);
  // Yours: the middle pod behind the core, back-right desk as you walk in from the core side.
  pod(-3.8, -8.8, 0, (seat) => (seat === 2 ? 'mine' : randomDesk()));
  pod(5.8, -8.8);
  for (const x of [-15, -7, 7.85]) pod(x, 9.1);
  pod(-12.8, -0.3, Math.PI / 2);
  pod(12.8, -0.3, Math.PI / 2);
  pod(15.5, 8.9, Math.PI / 2);

  // ---------------------------------------------------------------- conference rooms (NE corner)

  glassWall(12, -6, 20, -6, [[14.9, 15.8], [16.2, 17.1]]);
  glassWall(12, -13.65, 12, -6, []);
  b.box(M.drywall, 0.12, H, 7.65, 16, 0, -9.825, { tile: 1, solid: true });
  b.plane(M.roomA, 0.36, 0.12, 14.5, 1.55, -5.99);
  b.plane(M.roomB, 0.36, 0.12, 17.5, 1.55, -5.99);
  // Each room has a TV on the dividing wall, fed by a small PC on the floor under it with its cable run
  // up the wall, and a white table with a keyboard for the PC. s is the side of the wall the room is on:
  // Atlas to the west, Orion to the east.
  for (const [s, cx, screen] of [[-1, 14, M.tvShare], [1, 18, M.tvMeeting]] as const) {
    const face = 16 + s * 0.06;
    b.box(M.bezel, 0.05, 1.274, 2.184, face + s * 0.025, 0.813, -10);
    b.plane(screen, 2.08, 1.17, face + s * 0.051, 1.45, -10, { ry: (s * Math.PI) / 2 });
    point(0x9fc4ff, 0.5, 3.5, face + s * 0.7, 1.45, -10);
    b.box(M.black, 0.1, 0.32, 0.3, face + s * 0.07, 0, -10.6, { solid: true });
    b.plane(M.pcLed, 0.012, 0.012, face + s * 0.121, 0.27, -10.6, { ry: (s * Math.PI) / 2 });
    b.box(M.black, 0.012, 0.813 - 0.32, 0.02, face + s * 0.008, 0.32, -10.6);

    b.box(M.white, 1.1, 0.04, 3.0, cx, 0.72, -10, { solid: true });
    b.box(M.white, 0.5, 0.72, 0.08, cx, 0, -11, { solid: true });
    b.box(M.white, 0.5, 0.72, 0.08, cx, 0, -9, { solid: true });
    prop('puck', cx, 0.76, -10);
    // On the far side from the TV, turned to face it.
    prop('keyboard', cx + s * 0.3, 0.76, -10.4, (s * Math.PI) / 2);
    for (const z of [-11, -10, -9]) {
      chair(cx + 0.85 + r() * 0.15, z + (r() - 0.5) * 0.15, Math.PI / 2 + (r() - 0.5) * 0.4);
      chair(cx - 0.85 - r() * 0.15, z + (r() - 0.5) * 0.15, -Math.PI / 2 + (r() - 0.5) * 0.4);
    }
  }
  plant(19.1, -13.1, 0.9);

  // ---------------------------------------------------------------- lounge (south, facing the elevators)

  floor(M.rug, [-2.3, 9.2, 2.3, 12.6], [4.6, 3.4], [-2.3, 12.6]);
  b.box(M.sofa, 2.4, 0.42, 0.9, 0, 0, 12.3, { solid: true });
  b.box(M.sofa, 2.4, 0.5, 0.22, 0, 0.42, 12.64, { solid: true });
  for (const s of [-1, 1]) {
    b.box(M.sofa, 0.22, 0.62, 0.9, s * 1.31, 0, 12.3, { solid: true });
    prop('cushion', s * 0.57, 0.42, 12.2);
  }
  b.box(M.wood, 1.2, 0.04, 0.6, 0, 0.38, 11.0, { solid: true });
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.25, 0.25]) b.box(M.metalDark, 0.04, 0.38, 0.04, sx, 0, 11 + sz);
  prop('paper', 0.2, 0.42, 11.0, 0.4);
  for (const s of [-1, 1]) {
    b.push(s * 1.9, 10.5, -s * (Math.PI / 2));
    b.box(M.sofa, 0.85, 0.4, 0.8, 0, 0, 0, { solid: true });
    b.box(M.sofa, 0.85, 0.45, 0.18, 0, 0.4, 0.31, { solid: true });
    b.box(M.sofa, 0.14, 0.58, 0.8, -0.36, 0, 0, { solid: true });
    b.box(M.sofa, 0.14, 0.58, 0.8, 0.36, 0, 0, { solid: true });
    b.pop();
  }
  // Floor lamp: the only warm light on the floor.
  b.cyl(M.metalDark, 0.13, 0.15, 0.03, 1.55, 0, 12.75, 8);
  b.cyl(M.metalDark, 0.015, 0.015, 1.45, 1.55, 0, 12.75, 5);
  b.cyl(M.lampShade, 0.17, 0.24, 0.3, 1.55, 1.42, 12.75, 8);
  b.collide(1.55, 12.75, 0.3, 0.3);
  point(0xffb066, 3.5, 6, 1.55, 1.5, 12.75);
  prop('beanbagTeal', -2.2, 0, 9.3);
  prop('beanbagOrange', -2.1, 0, 12.6);
  plant(2.9, 9.0);
  plant(-19.1, 13.1, 0.9);

  plant(19.1, 13.1, 0.9);
  plant(-19.1, -13.1, 0.9);
  plant(-19.1, -4.0, 0.9);

  // ---------------------------------------------------------------- ceiling grid

  // Most fixtures are dark at 2am; motion sensors left a few on.
  const lit = new Set(['-0.5,-6.5', '-3.5,-9.5', '-9.5,-0.5', '-0.5,5.5', '2.5,5.5', '-15.5,8.5']);
  const flickerKey = '-12.5,2.5';
  let flickerLight: THREE.PointLight | null = null;
  for (let x = -18.5; x <= HX - 1.5; x += 3)
    for (let z = -12.5; z <= HZ - 1.5; z += 3) {
      if (Math.abs(x) < 6.6 && Math.abs(z) < 4.6) continue;
      const key = `${x},${z}`;
      const on = lit.has(key);
      const mat = key === flickerKey ? M.lightFlicker : on ? M.lightOn : M.lightOff;
      b.plane(mat, 0.6, 1.2, x, H - 0.005, z, { rx: Math.PI / 2 });
      if (on) point(0xe6eeff, 6, 9, x, 2.6, z);
      if (key === flickerKey) flickerLight = point(0xe6eeff, 6, 9, x, 2.6, z);
      if (r() < 0.2) b.plane(M.vent, 0.6, 0.6, x + 1.5, H - 0.005, z + 1.5, { rx: Math.PI / 2 });
    }

  // ---------------------------------------------------------------- floor

  // Cut the plate along every area's edges (see floorAreas) and lay each cell in the last area over it.
  const cuts = (k: 0 | 1) => {
    const v = floorAreas.flatMap((f) => [f.rect[k], f.rect[k + 2]]).sort((a, c) => a - c);
    return v.filter((x, i) => i === 0 || x - v[i - 1] > 1e-6);
  };
  const [xs, zs] = [cuts(0), cuts(1)];
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < zs.length; j++) {
      const cell: Rect = [xs[i], zs[j], xs[i + 1], zs[j + 1]];
      const [cx, cz] = [(cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2];
      for (let k = floorAreas.length - 1; k >= 0; k--) {
        const { mat, rect, tile, origin } = floorAreas[k];
        if (cx > rect[0] && cx < rect[2] && cz > rect[1] && cz < rect[3]) {
          floorCell(mat, cell, tile, origin);
          break;
        }
      }
    }

  // ---------------------------------------------------------------- assemble

  const group = b.build();
  for (const l of lights) group.add(l);

  let flickerOn = true;
  let flickerTimer = 2;
  const flickerBase = flickerLight?.intensity ?? 0;

  const ticker = M.newsTicker.map!;

  function update(_t: number, dt: number) {
    ticker.offset.x = (ticker.offset.x + dt * 0.04) % 1;
    flickerTimer -= dt;
    if (flickerTimer <= 0) {
      flickerOn = !flickerOn;
      flickerTimer = flickerOn ? (r() < 0.3 ? 0.04 + r() * 0.1 : 1 + r() * 5) : 0.03 + r() * 0.15;
      M.lightFlicker.color.setScalar(flickerOn ? 1 : 0.22);
      if (flickerLight) flickerLight.intensity = flickerOn ? flickerBase : flickerBase * 0.05;
    }
  }

  return {
    group,
    colliders: b.colliders,
    props,
    materials: M,
    update,
    surfaceAt,
    spawn: { x: 0, z: 2.6, yaw: Math.PI },
  };
}

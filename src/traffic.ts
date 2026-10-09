import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Soundscape } from './audio';
import { Builder } from './geometry';
import type { Physics } from './physics';
import type { StreetMats } from './streetTextures';
import { AVE_ROAD, CROSSWALK, LANE, STREETS, type CrossStreet } from './streetPlan';
import type { Rand } from './textures';

// Cars, parked and moving, and the signals they obey. Signalized corners run a fixed cycle, offset
// block to block so a car doing the limit eastbound mostly makes the greens. The other cross streets
// have stop signs and the avenue goes straight through.

export type CarKind = 'sedan' | 'suv' | 'van' | 'boro' | 'livery';

/** Footprint of each kind: length, width. */
export const CAR_SIZE: Record<CarKind, [number, number]> = {
  sedan: [4.7, 1.8],
  suv: [4.9, 1.95],
  van: [5.3, 2.0],
  boro: [4.8, 1.82],
  livery: [5.1, 1.88],
};

function wheel(b: Builder, M: StreetMats, x: number, z: number) {
  const g = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 8);
  g.rotateZ(Math.PI / 2);
  b.add(g, M.tire, x, 0.33, z);
}

/** A car in local space: nose toward +z, centred on the origin, wheels on y = 0. */
export function carModel(b: Builder, M: StreetMats, kind: CarKind, paint: THREE.Material, lit: boolean) {
  const [len, w] = CAR_SIZE[kind];
  const tall = kind === 'suv' || kind === 'van';
  const body = kind === 'van' ? 1.55 : tall ? 0.95 : 0.72;
  const y0 = 0.28;
  if (kind === 'van') {
    b.box(paint, w, body, len - 1.0, 0, y0, -0.5);
    b.box(paint, w, 0.7, 1.0, 0, y0, len / 2 - 0.5);
    b.box(M.carGlass, w - 0.08, 0.7, 0.6, 0, y0 + 0.75, len / 2 - 1.25);
    b.box(M.carGlass, w + 0.02, 0.5, 1.2, 0, y0 + 0.95, len / 2 - 1.9);
  } else {
    b.box(paint, w, body, len, 0, y0, 0);
    const cab = tall ? 0.72 : 0.58;
    const cabLen = len * (tall ? 0.6 : 0.5);
    const cabZ = tall ? -0.25 : -0.15;
    b.box(M.carGlass, w - 0.12, cab, cabLen, 0, y0 + body, cabZ);
    b.box(paint, w - 0.16, 0.06, cabLen - 0.5, 0, y0 + body + cab, cabZ - 0.1);
    // Pillars, so the glasshouse reads as windows rather than a black box.
    for (const z of [cabZ + cabLen / 2 - 0.08, cabZ - cabLen / 2 + 0.08])
      for (const s of [-1, 1]) b.box(paint, 0.06, cab, 0.12, s * (w / 2 - 0.08), y0 + body, z);
    if (kind === 'boro') {
      b.box(M.white, 0.7, 0.22, 0.25, 0, y0 + body + cab + 0.06, cabZ);
    }
  }
  b.box(M.chrome, w + 0.02, 0.12, 0.12, 0, y0, len / 2 - 0.02);
  b.box(M.chrome, w + 0.02, 0.12, 0.12, 0, y0, -len / 2 + 0.02);
  for (const s of [-1, 1]) {
    b.box(lit ? M.headlight : M.chrome, 0.32, 0.14, 0.04, s * (w / 2 - 0.25), y0 + body - 0.3, len / 2 + 0.005);
    b.box(lit ? M.taillight : M.taillightDim, 0.28, 0.16, 0.04, s * (w / 2 - 0.22), y0 + body - 0.28, -len / 2 - 0.005);
  }
  const axle = len / 2 - 0.85;
  for (const s of [-1, 1]) {
    wheel(b, M, s * (w / 2 - 0.12), axle);
    wheel(b, M, s * (w / 2 - 0.12), -axle);
  }
}

export function randomCar(r: Rand): CarKind {
  const x = r();
  return x < 0.45 ? 'sedan' : x < 0.75 ? 'suv' : x < 0.85 ? 'van' : x < 0.93 ? 'livery' : 'boro';
}

// ---------------------------------------------------------------- signals

type Light = 'green' | 'yellow' | 'red';
const CYCLE = 64;
/** Avenue green, yellow, all-red, cross green, yellow, all-red: the end of each, in seconds. */
const PHASES = [30, 33, 35, 59, 62, 64];

/** Seconds into the cycle at intersection `s` at time t. */
const cycleAt = (s: CrossStreet, t: number) => (((t + s.x / 11) % CYCLE) + CYCLE) % CYCLE;

export function avenueLight(s: CrossStreet, t: number): Light {
  const c = cycleAt(s, t);
  return c < PHASES[0] ? 'green' : c < PHASES[1] ? 'yellow' : 'red';
}

export function crossLight(s: CrossStreet, t: number): Light {
  const c = cycleAt(s, t);
  return c >= PHASES[2] && c < PHASES[3] ? 'green' : c >= PHASES[3] && c < PHASES[4] ? 'yellow' : 'red';
}

/** Walk, flashing hand, or hand, for people crossing alongside the avenue's traffic or the cross street's. */
function walkSignal(s: CrossStreet, t: number, alongAvenue: boolean): 'walk' | 'flash' | 'hand' {
  const c = cycleAt(s, t);
  const [g0, g1] = alongAvenue ? [0, PHASES[0]] : [PHASES[2], PHASES[3]];
  if (c >= g0 && c < g1 - 12) return 'walk';
  if (c >= g1 - 12 && c < g1) return t % 1 < 0.5 ? 'flash' : 'hand';
  return 'hand';
}

/** Signal heads and ped signals at one intersection, with their lamps as materials to switch. */
export function signalHeads(b: Builder, M: StreetMats, s: CrossStreet) {
  const lens = () => ({
    red: new THREE.MeshBasicMaterial({ color: 0x2a0806 }),
    yellow: new THREE.MeshBasicMaterial({ color: 0x2a1c04 }),
    green: new THREE.MeshBasicMaterial({ color: 0x062a14 }),
  });
  const ave = lens();
  const cross = lens();
  const walkAve = new THREE.MeshBasicMaterial({ map: M.tex.walk });
  const handAve = new THREE.MeshBasicMaterial({ map: M.tex.hand });
  const walkCross = new THREE.MeshBasicMaterial({ map: M.tex.walk });
  const handCross = new THREE.MeshBasicMaterial({ map: M.tex.hand });

  /** A three-lamp head at height y, facing local +z. */
  const head = (set: ReturnType<typeof lens>, y: number) => {
    b.box(M.signalBody, 0.38, 1.05, 0.28, 0, y, 0);
    (['red', 'yellow', 'green'] as const).forEach((k, i) => {
      b.plane(set[k], 0.24, 0.24, 0, y + 0.85 - i * 0.33, 0.141);
      b.box(M.signalBody, 0.3, 0.03, 0.18, 0, y + 0.98 - i * 0.33, 0.23);
    });
  };
  const ped = (walk: THREE.Material, hand: THREE.Material, y: number) => {
    b.box(M.signalBody, 0.36, 0.36, 0.2, 0, y, 0);
    b.plane(hand, 0.3, 0.3, -0.0, y + 0.18, 0.101);
    b.plane(walk, 0.3, 0.3, 0, y + 0.18, 0.102);
  };

  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = s.x + sx * (s.road + 0.7);
      const z = sz * (AVE_ROAD + 0.7);
      b.cyl(M.pole, 0.09, 0.11, 4.6, x, 0, z, 8);
      b.collide(x, z, 0.25, 0.25, 0, 0, 4.6);
      // Far-side heads: the east corners face westbound-from-the-west traffic, i.e. look west, and so on.
      b.push(x, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      head(ave, 3.5);
      b.pop();
      b.push(x, z, sz > 0 ? Math.PI : 0);
      head(cross, 3.5);
      b.pop();
      // Ped signals face across each crosswalk from this corner.
      b.push(x, z, sz > 0 ? Math.PI : 0);
      b.push(0, -0.25, 0);
      ped(walkCross, handCross, 2.4);
      b.pop();
      b.pop();
      b.push(x, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      b.push(0.0, -0.25, 0);
      ped(walkAve, handAve, 2.4);
      b.pop();
      b.pop();
    }

  const bright = { red: 0xff2a1a, yellow: 0xffb81a, green: 0x3affa0 };
  const dim = { red: 0x2a0806, yellow: 0x2a1c04, green: 0x062a14 };
  return (t: number) => {
    const a = avenueLight(s, t);
    const c = crossLight(s, t);
    for (const k of ['red', 'yellow', 'green'] as const) {
      ave[k].color.setHex(a === k ? bright[k] : dim[k]);
      cross[k].color.setHex(c === k ? bright[k] : dim[k]);
    }
    // Crossing the cross street goes with the avenue's green, and the other way about.
    const wc = walkSignal(s, t, true);
    const wa = walkSignal(s, t, false);
    walkCross.visible = wc === 'walk';
    handCross.visible = wc === 'hand';
    walkAve.visible = wa === 'walk';
    handAve.visible = wa === 'hand';
  };
}

// ---------------------------------------------------------------- moving cars

type Mover = {
  group: THREE.Group;
  body: RAPIER.RigidBody | null;
  len: number;
  /** Which way it drives: along the avenue (+x or -x) or up a cross street (+z or -z). */
  axis: 'x' | 'z';
  dir: 1 | -1;
  /** Fixed coordinate across its lane, and position along it. */
  lane: number;
  pos: number;
  speed: number;
  cruise: number;
  /** For cross-street cars: the street, seconds stopped at its stop sign, and whether the stop is done. */
  street?: CrossStreet;
  wait: number;
  stopped: boolean;
  /** Seconds left off-stage before a cross-street car comes round again. */
  idle: number;
};

const ACCEL = 2.4;
const BRAKE = 6;
/** Avenue cars loop between these, well into the fog at both ends. */
const LOOP: [number, number] = [-480, 560];
const CROSS_LOOP = 140;

/** A headlight beam's worth of light ahead of each moving car, for the street lighting to pick up. */
export type CarLight = { pos: THREE.Vector3 };

export function buildTraffic(M: StreetMats, r: Rand, sound: Soundscape) {
  const group = new THREE.Group();
  const movers: Mover[] = [];
  const lights: CarLight[] = [];

  const make = (axis: 'x' | 'z', dir: 1 | -1, lane: number, pos: number, street?: CrossStreet) => {
    const kind = randomCar(r);
    const paint = kind === 'boro' ? M.boroTaxi : kind === 'livery' ? M.carPaints[0] : M.carPaints[Math.floor(r() * M.carPaints.length)];
    const b = new Builder();
    carModel(b, M, kind, paint, true);
    const g = b.build();
    group.add(g);
    const cruise = 9 + r() * 4;
    movers.push({ group: g, body: null, len: CAR_SIZE[kind][0], axis, dir, lane, pos, speed: cruise, cruise, street, wait: 0, stopped: false, idle: r() * 20 });
    lights.push({ pos: new THREE.Vector3() });
  };
  // Four cars each way on the avenue at this hour, and one car per cross street.
  for (const dir of [1, -1] as const)
    for (let i = 0; i < 4; i++) make('x', dir, dir * LANE, LOOP[0] + ((i + r() * 0.6) * (LOOP[1] - LOOP[0])) / 4);
  STREETS.forEach((s, i) => {
    const dir = (i % 2 ? -1 : 1) as 1 | -1;
    // 31st runs both ways under the el; the rest are one-way, alternating.
    make('z', dir, s.x - dir * (s.name === '31 St' ? 3.2 : 1.5), -dir * CROSS_LOOP, s);
  });

  /** Signalized stop lines on the avenue, for traffic heading `dir`: x of each. */
  const stopLine = (s: CrossStreet, dir: number) => s.x - dir * (s.road + CROSSWALK + 1.2);

  let player: { pos: THREE.Vector3 } | null = null;

  function attach(p: Physics, who: { pos: THREE.Vector3 }) {
    player = who;
    for (const m of movers) {
      m.body = p.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
      p.world.createCollider(RAPIER.ColliderDesc.cuboid(0.95, 0.75, m.len / 2).setTranslation(0, 0.75, 0), m.body);
    }
  }

  /** Room ahead before this car must be stopped, in metres; Infinity if the road is clear. */
  function room(m: Mover, t: number, dt: number) {
    let d = Infinity;
    const ahead = (x: number) => (x - m.pos) * m.dir;
    if (m.axis === 'x') {
      for (const s of STREETS) {
        if (!s.signal) continue;
        const a = ahead(stopLine(s, m.dir));
        if (a < -0.5 || a > 60) continue;
        const light = avenueLight(s, t);
        // On yellow, stop only if there's room to do it comfortably.
        if (light === 'red' || (light === 'yellow' && a > (m.speed * m.speed) / (2 * BRAKE) + 2)) d = Math.min(d, a - m.len / 2);
      }
    } else {
      const s = m.street!;
      const a = ahead(-m.dir * (AVE_ROAD + CROSSWALK + 1.2));
      if (a > -0.5 && a < 50) {
        if (s.signal) {
          const light = crossLight(s, t);
          if (light === 'red' || (light === 'yellow' && a > (m.speed * m.speed) / (2 * BRAKE) + 2)) d = Math.min(d, a - m.len / 2);
        } else if (!m.stopped || avenueBusy(s)) {
          // Full stop at the sign, then wait for a gap on the avenue.
          d = Math.min(d, a - m.len / 2);
          if (m.speed < 0.2 && a - m.len / 2 < 1.5 && (m.wait += dt) > 1.6) m.stopped = true;
        }
      }
    }
    // Whoever is ahead in the same lane.
    for (const o of movers) {
      if (o === m || o.axis !== m.axis || o.dir !== m.dir || Math.abs(o.lane - m.lane) > 1) continue;
      const a = ahead(o.pos);
      if (a > 0) d = Math.min(d, a - (o.len + m.len) / 2 - 2.5);
    }
    // And the player, if they're standing in the road rather than up in the station over it.
    if (player && player.pos.y < 1) {
      const p = player.pos;
      const [along, across] = m.axis === 'x' ? [p.x, p.z] : [p.z, p.x];
      const a = ahead(along);
      if (Math.abs(across - m.lane) < 1.9 && a > 0 && a < 40) d = Math.min(d, a - m.len / 2 - 2.5);
    }
    return d;
  }

  function avenueBusy(s: CrossStreet) {
    return movers.some((o) => o.axis === 'x' && Math.abs(o.pos - s.x) < 28 && (s.x - o.pos) * o.dir > -s.road - 3);
  }

  const _right = new THREE.Vector3();
  const _to = new THREE.Vector3();

  function update(t: number, dt: number, camera: THREE.Camera) {
    let loud = 0;
    let pan = 0;
    camera.getWorldDirection(_to);
    _right.set(-_to.z, 0, _to.x).normalize();
    movers.forEach((m, i) => {
      // Cross-street cars that have gone by wait off-stage a while before the next one comes.
      if (m.axis === 'z' && m.pos * m.dir > CROSS_LOOP) {
        m.group.visible = false;
        m.body?.setNextKinematicTranslation({ x: 0, y: -50, z: 0 });
        if ((m.idle -= dt) > 0) return;
        m.pos = -m.dir * CROSS_LOOP;
        m.idle = 10 + r() * 40;
        m.wait = 0;
        m.stopped = false;
        m.group.visible = true;
      }
      const d = room(m, t, dt);
      const target = Math.min(m.cruise, Math.sqrt(2 * BRAKE * 0.8 * Math.max(0, d)));
      m.speed = target > m.speed ? Math.min(target, m.speed + ACCEL * dt) : Math.max(target, m.speed - BRAKE * 1.5 * dt);
      m.pos += m.speed * m.dir * dt;
      if (m.axis === 'x') {
        if (m.pos > LOOP[1]) m.pos = LOOP[0];
        if (m.pos < LOOP[0]) m.pos = LOOP[1];
      }

      const [x, z] = m.axis === 'x' ? [m.pos, m.lane] : [m.lane, m.pos];
      const yaw = m.axis === 'x' ? (m.dir * Math.PI) / 2 : m.dir > 0 ? 0 : Math.PI;
      m.group.position.set(x, 0, z);
      m.group.rotation.y = yaw;
      if (m.body) {
        m.body.setNextKinematicTranslation({ x, y: 0, z });
        m.body.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
      }
      lights[i].pos.set(x + Math.sin(yaw) * (m.len / 2 + 3), 0.9, z + Math.cos(yaw) * (m.len / 2 + 3));

      _to.set(x - camera.position.x, 0, z - camera.position.z);
      const dist = _to.length();
      const l = Math.max(0, 1 - dist / 45) ** 2 * (0.25 + 0.75 * Math.min(1, m.speed / 10));
      if (l > loud) {
        loud = l;
        pan = dist > 0.1 ? _to.normalize().dot(_right) : 0;
      }
    });
    sound.setCars(loud, pan);
  }

  return { group, lights, attach, update };
}

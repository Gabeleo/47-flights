import * as THREE from 'three';
import type { Soundscape } from '../audio';
import { Builder, strut } from '../geometry';
import type { Glow } from './lightPool';
import type { StreetMats } from './materials';
import { EL } from './plan';
import type { Rand } from '../textures';

// The Astoria Line over 31st Street: steel bents in the roadway and three tracks on plate girders, and
// the N or W that comes through every minute or two and stops at 36 Av. The station is station.ts.

const BENT_Y = 7.0;
const GIRDER_TOP = 8.8;
const CAR_LEN = 18.35;
const CAR_W = 3.05;
const CARS = 8;
const TRAIN_LEN = CARS * (CAR_LEN + 0.5);
const CRUISE = 13;
const DECEL = 1.1;
const ACCEL_OUT = 1.3;
const DWELL = 20;
const RUN_OUT = 420;

export function buildEl(b: Builder, M: StreetMats, r: Rand, sound: Soundscape) {
  const glows: Glow[] = [];
  const X = EL.x;
  const reach = EL.reach;

  // ---------------------------------------------------------------- structure

  // Bents every 15m, skipping the long span over the avenue.
  const bents: number[] = [];
  for (let z = 11.5; z < reach; z += 15) bents.push(z, -z);
  for (const z of bents) {
    for (const s of [-1, 1]) {
      const x = X + s * EL.columns;
      b.box(M.concrete, 0.9, 0.5, 0.9, x, 0, z, { solid: true });
      b.box(M.elSteel, 0.5, BENT_Y, 0.5, x, 0, z, { tile: 1 });
      b.box(M.elSteel, 0.62, BENT_Y - 0.5, 0.12, x, 0.5, z, { tile: 1 });
      b.collide(x, z, 0.62, 0.62, 0, 0, BENT_Y);
      // Knee braces, except inside the station house, where the bent passes through its lobby.
      if (Math.abs(z) > EL.houseHalf) strut(b, M.elSteel, [x - s * 0.25, BENT_Y - 1.6, z], [x - s * 2.0, BENT_Y, z], 0.25, 0.3);
    }
    b.box(M.elSteel, 2 * 9.4, 1.0, 0.6, X, BENT_Y, z, { tile: 1 });
  }
  // Plate girders under each track and deep fascia girders down the outsides.
  const len = 2 * reach;
  for (const tx of EL.tracks)
    for (const s of [-1, 1]) b.box(M.elSteel, 0.3, GIRDER_TOP - (BENT_Y + 1), len, X + tx + s * 0.8, BENT_Y + 1, 0, { tile: 1 });
  for (const s of [-1, 1]) b.box(M.elSteel, 0.3, 1.8, len, X + s * 6.3, BENT_Y + 0.6, 0, { tile: 1 });
  // Ties and rails.
  for (const tx of EL.tracks) {
    b.box(M.ties, 2.6, 0.15, len, X + tx, GIRDER_TOP, 0, { tile: [2.6, 2.4] });
    for (const s of [-1, 1]) b.box(M.rail, 0.08, 0.1, len, X + tx + s * 0.72, GIRDER_TOP + 0.15, 0);
  }

  // ---------------------------------------------------------------- the train

  const tb = new Builder();
  for (let k = 0; k < CARS; k++) {
    const z = (k - (CARS - 1) / 2) * (CAR_LEN + 0.5);
    const ends = { pz: { mat: k === CARS - 1 ? M.trainFront : M.chrome }, nz: { mat: k === 0 ? M.trainFront : M.chrome } };
    tb.box(M.trainSide, CAR_W, 3.5, CAR_LEN, 0, 0.3, z, { faces: { py: { mat: M.chrome }, ny: { mat: M.tire }, ...ends } });
    tb.box(M.trainGlow, CAR_W - 0.1, 0.02, CAR_LEN - 0.4, 0, 3.81, z);
    for (const e of [-1, 1]) tb.box(M.tire, 2.2, 0.5, 2.6, 0, 0, z + e * (CAR_LEN / 2 - 2.6));
    if (k < CARS - 1) tb.box(M.tire, 1.4, 2.4, 0.6, 0, 0.6, z + CAR_LEN / 2 + 0.2);
  }
  const train = tb.build();
  train.visible = false;
  const trainGlows = [-1, 0, 1].map((k) => ({
    pos: new THREE.Vector3(),
    color: 0xe8ecdc,
    intensity: 0,
    distance: 10,
    k,
  }));
  glows.push(...trainGlows);

  type Phase = 'idle' | 'arrive' | 'dwell' | 'depart';
  let phase: Phase = 'idle';
  let timer = 6 + r() * 10;
  /** +1 runs south (+z) on the west track, -1 north on the east track. */
  let dir = 1;
  let pos = 0;
  let speed = 0;
  let chimed = false;

  const _to = new THREE.Vector3();
  const _right = new THREE.Vector3();

  function update(_t: number, dt: number, camera: THREE.Camera) {
    let brake = 0;
    if (phase === 'idle') {
      if ((timer -= dt) <= 0) {
        phase = 'arrive';
        dir = -dir;
        pos = -dir * RUN_OUT;
        speed = CRUISE;
        train.visible = true;
        train.position.x = X + (dir > 0 ? EL.tracks[0] : EL.tracks[2]);
        train.position.y = EL.rail;
        train.rotation.y = dir > 0 ? 0 : Math.PI;
      }
    } else if (phase === 'arrive') {
      const left = -pos * dir;
      const v = Math.min(CRUISE, Math.sqrt(2 * DECEL * Math.max(0, left)));
      if (v < CRUISE - 0.01) brake = 1;
      speed = Math.max(v, 0.4);
      pos += speed * dir * dt;
      if (left < 0.05) {
        pos = 0;
        speed = 0;
        phase = 'dwell';
        timer = DWELL;
        chimed = false;
      }
    } else if (phase === 'dwell') {
      timer -= dt;
      if (!chimed && timer < 4) {
        chimed = true;
        sound.chime(Math.max(0, 1 - camera.position.distanceTo(train.position) / 70));
      }
      if (timer <= 0) phase = 'depart';
    } else {
      speed = Math.min(CRUISE + 2, speed + ACCEL_OUT * dt);
      pos += speed * dir * dt;
      if (pos * dir > RUN_OUT) {
        phase = 'idle';
        train.visible = false;
        timer = 45 + r() * 70;
      }
    }
    train.position.z = pos;
    for (const g of trainGlows) {
      g.pos.set(train.position.x, EL.rail + 2.2, pos + g.k * TRAIN_LEN * 0.33);
      g.intensity = train.visible ? 10 : 0;
    }

    // How it sounds: louder the nearer its nearest car, rumbling with speed, squealing as it brakes in.
    if (!train.visible) return sound.setTrain(0, 0, 0);
    const nearZ = Math.max(pos - TRAIN_LEN / 2, Math.min(pos + TRAIN_LEN / 2, camera.position.z));
    _to.set(train.position.x - camera.position.x, train.position.y - camera.position.y, nearZ - camera.position.z);
    const d = _to.length();
    const moving = phase === 'dwell' ? 0.12 : 0.3 + 0.7 * Math.min(1, speed / CRUISE);
    const level = Math.max(0, 1 - d / 170) ** 1.6 * moving;
    camera.getWorldDirection(_right);
    _right.set(-_right.z, 0, _right.x).normalize();
    sound.setTrain(level, brake, _to.normalize().dot(_right));
  }

  return { train, glows, update };
}

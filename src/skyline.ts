import * as THREE from 'three';
import { boxGeo, mergeToMesh } from './geometry';
import {
  buildingTexture,
  chryslerTexture,
  crownTexture,
  mulberry32,
  streetTexture,
  type BuildingKind,
} from './textures';

export const FOG_COLOR = 0x2a2130;

// Manhattan grid: avenues every 280m along x (30m wide), streets every 80m along z (18m wide).
const AVE = 280;
const STR = 80;
const BLOCK_HX = 125;
const BLOCK_HZ = 31;
const CITY_RADIUS = 1650;

const ESB = { x: 280, z: 760 };
const CHRYSLER = { x: 800, z: 380 };

// Facade textures are 16 bays x 32 floors at 3.5m each.
const FACADE_TILE: [number, number] = [56, 112];
// Pixel (0,0) of every facade texture is plain wall: used for roofs.
const ROOF_UV: [number, number] = [0.5 / 64, 1 - 0.5 / 128];

function facadeBox(w: number, h: number, d: number, du: number, dv: number) {
  const g = boxGeo(w, h, d, FACADE_TILE);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) uv.setXY(k, ROOF_UV[0], ROOF_UV[1]);
      else uv.setXY(k, uv.getX(k) + du, uv.getY(k) + dv);
    }
  return g;
}

/** Max height (from the street) a building at (x, z) may have without hiding a landmark's crown from y = 0. */
function viewCap(x: number, z: number, streetY: number) {
  let cap = Infinity;
  for (const [lm, crownY] of [[ESB, 190], [CHRYSLER, 60]] as const) {
    const len = Math.hypot(lm.x, lm.z);
    const along = (x * lm.x + z * lm.z) / len;
    if (along < 20 || along > len - 90) continue;
    const across = Math.abs(x * lm.z - z * lm.x) / len;
    if (across > 50 + along * 0.05) continue;
    cap = Math.min(cap, -streetY + 1.6 + (along * crownY) / len - 15);
  }
  return cap;
}

/** The city around a floor `elevation` metres above the street; the floor itself is y = 0. */
export function buildSkyline(elevation: number) {
  const STREET_Y = -elevation;
  const group = new THREE.Group();
  const r = mulberry32(1947);

  const kinds: BuildingKind[] = ['glass', 'office', 'prewar'];
  const facadeMats = Object.fromEntries(
    kinds.map((k, i) => [k, new THREE.MeshBasicMaterial({ map: buildingTexture(k, 500 + i) })]),
  ) as Record<BuildingKind, THREE.MeshBasicMaterial>;
  const facades: Record<BuildingKind, THREE.BufferGeometry[]> = { glass: [], office: [], prewar: [] };
  const rooftops: THREE.BufferGeometry[] = [];
  const beacons: THREE.BufferGeometry[] = [];

  function block(kind: BuildingKind, x: number, z: number, w: number, d: number, y0: number, h: number) {
    const g = facadeBox(w, h, d, r(), Math.floor(r() * 32) / 32);
    g.translate(x, STREET_Y + y0 + h / 2, z);
    facades[kind].push(g);
  }

  function rooftop(g: THREE.BufferGeometry, x: number, y: number, z: number) {
    g.translate(x, STREET_Y + y, z);
    rooftops.push(g);
  }

  function waterTower(x: number, top: number, z: number) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rooftop(new THREE.BoxGeometry(0.3, 3, 0.3), x + sx * 1.5, top + 1.5, z + sz * 1.5);
    rooftop(new THREE.CylinderGeometry(2.2, 2.2, 4, 8), x, top + 5, z);
    rooftop(new THREE.ConeGeometry(2.4, 1.6, 8), x, top + 7.8, z);
  }

  function building(kind: BuildingKind, x: number, z: number, w: number, d: number, h: number, dist: number) {
    if (h > 110 && r() < 0.65) {
      const h1 = h * (0.45 + r() * 0.3);
      const s = 0.6 + r() * 0.25;
      block(kind, x, z, w, d, 0, h1);
      block(kind, x + (r() - 0.5) * w * (1 - s) * 0.5, z, w * s, d * s, h1, h - h1);
    } else block(kind, x, z, w, d, 0, h);
    if (r() < 0.45) rooftop(new THREE.BoxGeometry(w * 0.3, 4, d * 0.3), x, h + 2, z);
    if (h < 110 && dist < 800 && r() < 0.22) waterTower(x + (r() - 0.5) * w * 0.4, h, z + (r() - 0.5) * d * 0.4);
    if (h > 155) {
      const g = new THREE.BoxGeometry(2.5, 2.5, 2.5);
      g.translate(x, STREET_Y + h + 1.5, z);
      beacons.push(g);
    }
  }

  // ---------------------------------------------------------------- generic city

  for (let i = -6; i <= 6; i++)
    for (let j = -21; j <= 21; j++) {
      const bx = i * AVE;
      const bz = j * STR;
      if (Math.hypot(bx, bz) > CITY_RADIUS) continue;
      let x = bx - BLOCK_HX;
      while (x < bx + BLOCK_HX - 6) {
        const w = Math.min(bx + BLOCK_HX - x, 14 + r() * 36);
        const lots: [number, number][] =
          r() < 0.55 ? [[bz - BLOCK_HZ, bz], [bz, bz + BLOCK_HZ]] : [[bz - BLOCK_HZ, bz + BLOCK_HZ]];
        for (const [z0, z1] of lots) {
          const cx = x + w / 2;
          const cz = (z0 + z1) / 2;
          if (i === 0 && j === 0 && Math.abs(cx) < 22 + w / 2) continue; // our own tower
          if (Math.hypot(cx - ESB.x, cz - ESB.z) < 90 || Math.hypot(cx - CHRYSLER.x, cz - CHRYSLER.z) < 60) continue;
          const dist = Math.hypot(cx, cz);
          const midtown = Math.max(0, 1 - dist / 1100);
          const roll = r();
          let h =
            roll < 0.06 + 0.14 * midtown
              ? 190 + r() * 210
              : roll < 0.25 + 0.35 * midtown
                ? 80 + r() * 110
                : 14 + r() * r() * 70;
          if (i === 0 && j === 0) h = Math.min(h, 140);
          h = Math.min(h, viewCap(cx, cz, STREET_Y));
          const kind: BuildingKind =
            h > 150 ? (r() < 0.6 ? 'glass' : 'office') : h > 70 ? (r() < 0.5 ? 'office' : 'prewar') : 'prewar';
          building(kind, cx, cz, w - 1 - r() * 3, z1 - z0 - 1 - r() * 3, h, dist);
        }
        x += w;
      }
    }

  // ---------------------------------------------------------------- landmarks

  const crownWarm = new THREE.MeshBasicMaterial({ map: crownTexture(90, '#b89a60', '#fff2cf'), fog: false });
  const crownBright = new THREE.MeshBasicMaterial({ color: 0xfff6e2, fog: false });
  const crownGeos: THREE.BufferGeometry[] = [];
  const brightGeos: THREE.BufferGeometry[] = [];
  const crownBox = (w: number, d: number, y0: number, y1: number, x: number, z: number) => {
    const g = boxGeo(w, y1 - y0, d, [6, 12]);
    g.translate(x, STREET_Y + (y0 + y1) / 2, z);
    crownGeos.push(g);
  };

  // Empire State: setback tiers, floodlit crown, mast.
  for (const [w, d, y0, y1] of [
    [95, 60, 0, 24], [72, 50, 24, 86], [52, 40, 86, 300], [44, 34, 300, 326], [36, 28, 326, 348], [28, 22, 348, 370],
  ])
    block('prewar', ESB.x, ESB.z, w, d, y0, y1 - y0);
  crownBox(20, 18, 370, 382, ESB.x, ESB.z);
  crownBox(15, 14, 382, 392, ESB.x, ESB.z);
  crownBox(10, 10, 392, 404, ESB.x, ESB.z);
  const mast = new THREE.CylinderGeometry(2.2, 3.4, 30, 8);
  mast.translate(ESB.x, STREET_Y + 419, ESB.z);
  brightGeos.push(mast);
  const tip = new THREE.BoxGeometry(2, 2, 2);
  tip.translate(ESB.x, STREET_Y + 446, ESB.z);
  beacons.push(tip);

  // Chrysler: tower plus a stacked, lit, terraced crown and spire.
  for (const [w, y0, y1] of [[60, 0, 70], [46, 70, 170], [36, 170, 240]]) block('prewar', CHRYSLER.x, CHRYSLER.z, w, w, y0, y1 - y0);
  const chryslerTex = chryslerTexture();
  chryslerTex.repeat.set(4, 1);
  const chryslerMat = new THREE.MeshBasicMaterial({ map: chryslerTex, fog: false });
  const chryslerGeos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const rad = 17 - k * 2.1;
    const g = new THREE.CylinderGeometry(rad - 1.2, rad, 7, 8);
    g.rotateY(Math.PI / 8);
    g.translate(CHRYSLER.x, STREET_Y + 240 + k * 7 + 3.5, CHRYSLER.z);
    chryslerGeos.push(g);
  }
  const spire = new THREE.ConeGeometry(2.4, 30, 8);
  spire.translate(CHRYSLER.x, STREET_Y + 289 + 15, CHRYSLER.z);
  brightGeos.push(spire);

  // ---------------------------------------------------------------- merge

  for (const k of kinds) group.add(mergeToMesh(facades[k], facadeMats[k]));
  group.add(mergeToMesh(rooftops, new THREE.MeshBasicMaterial({ color: 0x1c1a1a })));
  group.add(mergeToMesh(crownGeos, crownWarm));
  group.add(mergeToMesh(brightGeos, crownBright));
  group.add(mergeToMesh(chryslerGeos, chryslerMat));
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2010, fog: false });
  group.add(mergeToMesh(beacons, beaconMat));

  // Streets, aligned so avenues/streets fall between blocks.
  const ground = new THREE.PlaneGeometry(4400, 4400);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position as THREE.BufferAttribute;
  const uv = ground.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (pos.getX(i) - (AVE / 2 - 15)) / AVE, (pos.getZ(i) - BLOCK_HZ) / STR);
  ground.translate(0, STREET_Y, 0);
  group.add(mergeToMesh([ground], new THREE.MeshBasicMaterial({ map: streetTexture() })));

  // ---------------------------------------------------------------- traffic

  type Car = { x: number; z: number; alongZ: boolean; dir: number; speed: number; taxi: boolean };
  const cars: Car[] = [];
  for (let i = -6; i < 6; i++) {
    const ax = i * AVE + AVE / 2;
    const dir = i % 2 === 0 ? 1 : -1;
    for (let n = 0; n < 26; n++)
      cars.push({ x: ax + (r() < 0.5 ? -6 : 6), z: (r() - 0.5) * 3000, alongZ: true, dir, speed: 7 + r() * 8, taxi: r() < 0.35 });
  }
  for (let j = -10; j < 10; j++) {
    const sz = j * STR + STR / 2;
    const dir = j % 2 === 0 ? 1 : -1;
    for (let n = 0; n < 6; n++)
      cars.push({ x: (r() - 0.5) * 3000, z: sz + (r() - 0.5) * 6, alongZ: false, dir, speed: 5 + r() * 6, taxi: r() < 0.35 });
  }
  const carMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1.6, 5.5), new THREE.MeshBasicMaterial(), cars.length);
  carMesh.frustumCulled = false;
  group.add(carMesh);
  const carMatrix = new THREE.Matrix4();
  const taxiColor = new THREE.Color(0xffc933);
  const headColor = new THREE.Color(0xfff1d0);
  const tailColor = new THREE.Color(0xff2a1a);

  // ---------------------------------------------------------------- sky

  const sky = buildSky();
  group.add(sky);

  function update(t: number, dt: number, camera: THREE.Camera) {
    sky.position.copy(camera.position);
    beaconMat.color.setRGB(t % 2 < 0.7 ? 1 : 0.12, 0.05, 0.03);
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const step = car.dir * car.speed * dt;
      if (car.alongZ) {
        car.z += step;
        if (car.z > 1500) car.z -= 3000;
        if (car.z < -1500) car.z += 3000;
        carMatrix.makeRotationY(0);
      } else {
        car.x += step;
        if (car.x > 1500) car.x -= 3000;
        if (car.x < -1500) car.x += 3000;
        carMatrix.makeRotationY(Math.PI / 2);
      }
      carMatrix.setPosition(car.x, STREET_Y + 0.8, car.z);
      carMesh.setMatrixAt(i, carMatrix);
      const away = car.dir * (car.alongZ ? car.z - camera.position.z : car.x - camera.position.x) > 0;
      carMesh.setColorAt(i, car.taxi ? taxiColor : away ? tailColor : headColor);
    }
    carMesh.instanceMatrix.needsUpdate = true;
    if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;
  }

  return { group, update };
}

/**
 * The night sky: a gradient dome that glows over the city at the horizon, with the moon. Follows the
 * camera, so set its position to the camera's every frame.
 */
export function buildSky() {
  const skyGeo = new THREE.SphereGeometry(4000, 24, 12);
  const skyPos = skyGeo.attributes.position as THREE.BufferAttribute;
  const below = new THREE.Color(0x120e12);
  const horizon = new THREE.Color(0x3b2a36);
  const mid = new THREE.Color(0x1c1b2c);
  const zenith = new THREE.Color(0x06080f);
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const t = skyPos.getY(i) / 4000;
    if (t < 0) c.copy(horizon).lerp(below, Math.min(1, -t * 6));
    else if (t < 0.18) c.copy(horizon).lerp(mid, t / 0.18);
    else c.copy(mid).lerp(zenith, Math.min(1, (t - 0.18) / 0.5));
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  sky.userData.noSnap = true;

  const moon = new THREE.Mesh(new THREE.CircleGeometry(55, 12), new THREE.MeshBasicMaterial({ color: 0xe8e4d6, fog: false }));
  moon.position.set(-0.45, 0.2, 0.87).normalize().multiplyScalar(3500);
  moon.lookAt(0, 0, 0);
  moon.userData.noSnap = true;
  sky.add(moon);

  return sky;
}

import * as THREE from 'three';
import { buildSky } from '../skyline';
import type { World, WorldContext } from '../world';
import { buildBeyond } from './beyond';
import { streetContext } from './context';
import { buildEl } from './el';
import { buildFrontage } from './frontage';
import { buildFurniture } from './furniture';
import { buildGround } from './ground';
import { LightPool, type Glow } from './lightPool';
import { AVE_LOT, EAST_END, EL, STREETS, WEST_END, crossReach, heightOn } from './plan';
import { streetPropTemplates } from './props';
import { buildStation } from './station';
import { buildTraffic } from './traffic';

// 36th Avenue between 29th and 34th Streets, Astoria, a little after two in the morning. Two- and
// three-storey brick with shops underneath, a few walk-ups and new builds, the auto shops of Dutch Kills
// toward 29th, the el over 31st, the old factory at 33rd and the delis that never close.
//
// Where it's known, it's here: 36 Ave Deli & Grocery and Aladdin at 29-02 and 29-06, Leo's Pizzeria on
// the corner at 31-01, Astoria Deli at 32-02, the one-storey Shoppes at 36th at 33-12, the EVgo chargers
// at 33rd, the factory turned flats on the south-west corner of 33rd and Melrose Ballroom down 33rd.
// The rest is the street's general character, laid out by hand and filled in at random.
//
// The parts below all draw on one random sequence, so they run in this order or the street comes out different.

export function buildStreet({ sound }: WorldContext): World {
  const ctx = streetContext();
  const { b, M, r, props, glows, walks, hazes } = ctx;

  buildGround(ctx);
  buildFrontage(ctx);
  const signals = buildFurniture(ctx);

  // The el, and the station hanging under it over the intersection.
  const el = buildEl(b, M, r, sound);
  glows.push(...el.glows);
  const station = buildStation(b, M, sound);
  glows.push(...station.glows);
  walks.push(...station.walks);
  props.push(...station.props);
  const globeHaze = ctx.hazeMat(0x5aff8a, 0.45);
  for (const g of station.globes) ctx.haze(globeHaze, 1.3, g.x, g.y, g.z);

  // Walls you can't see. The player stays on 36th Avenue: walls across each cross street a little way up,
  // and at both ends. They stop short of the el, so up on the platforms you can walk their whole length.
  for (const st of STREETS) for (const s of [-1, 1]) b.collide(st.x, s * (crossReach(st) + 0.5), 2 * st.lot + 2, 1, 0, 0, 8);
  b.collide(WEST_END - 0.5, 0, 1, 2 * AVE_LOT + 2, 0, 0, 40);
  b.collide(EAST_END + 0.5, 0, 1, 2 * AVE_LOT + 2, 0, 0, 40);

  const group = b.build();
  buildBeyond(group);

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

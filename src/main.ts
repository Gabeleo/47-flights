import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './style.css';
import { Soundscape } from './audio';
import { Grabber } from './grab';
import { Halo } from './halo';
import { officeWorld } from './office';
import { Physics } from './physics';
import { Player } from './player';
import { Props } from './props';
import { PS1Pipeline, applyVertexSnap } from './ps1';
import { Seats } from './seats';
import { buildStreet } from './street';
import type { World } from './world';

await RAPIER.init();

// ?scene=street for 36th Avenue; the office otherwise.
const SCENES: Record<string, (sound: Soundscape) => World> = {
  office: () => officeWorld(),
  street: (sound) => buildStreet({ sound }),
};
const params = new URLSearchParams(location.search);
const sceneName = params.get('scene') ?? 'office';
const sound = new Soundscape();
const world = (SCENES[sceneName] ?? SCENES.office)(sound);
sound.ambience = world.ambience;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(world.fog.color);
scene.fog = new THREE.FogExp2(world.fog.color, world.fog.density);

const camera = new THREE.PerspectiveCamera(66, 4 / 3, 0.05, 6000);

scene.add(world.group);

const physics = new Physics(world.colliders, world.floor, world.ceiling);
const props = new Props(physics, world.props, world.templates);
scene.add(props.group);
const seats = new Seats(props, physics, Player.radius, Player.halfHeight, world.walkable);

const pipeline = new PS1Pipeline(renderer);
const player = new Player(camera, renderer.domElement, physics, props, seats);
player.surfaceAt = world.surfaceAt;
if (world.heightAt) player.heightAt = world.heightAt;
if (world.actionAt) player.actionAt = world.actionAt;
player.place(world.spawn.x, world.spawn.z, world.spawn.yaw);
world.attach?.(physics, player);
const grabber = new Grabber(camera, physics, props, player, () => seats.body);
player.carrying = () => grabber.held;
const halo = new Halo(props);

applyVertexSnap(scene);

player.onStep = (surface, running) => sound.footstep(surface, running);
player.onSit = player.onStand = () => sound.creak();
props.onImpact = (kind, strength, x, y, z) => sound.impact(kind, strength, camera.position.distanceTo(new THREE.Vector3(x, y, z)));

function resize() {
  pipeline.setSize(innerWidth, innerHeight);
  camera.aspect = pipeline.width / pipeline.height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const overlay = document.getElementById('overlay')!;
const startLabel = document.getElementById('start-label')!;
const hud = document.getElementById('hud')!;
document.getElementById('subtitle')!.innerHTML = world.subtitle;
// Scene links reload the page into the other scene rather than entering this one.
for (const a of document.querySelectorAll<HTMLAnchorElement>('#scenes a')) {
  a.classList.toggle('current', a.dataset.scene === sceneName || (!(sceneName in SCENES) && a.dataset.scene === 'office'));
  a.addEventListener('click', (e) => e.stopPropagation());
}

function setPaused(paused: boolean) {
  overlay.classList.toggle('hidden', !paused);
  player.enabled = !paused;
  if (paused) {
    grabber.drop();
    startLabel.textContent = 'CLICK TO RESUME';
    sound.pause();
  } else sound.start();
}

overlay.addEventListener('click', () => {
  player.lock();
  setPaused(false);
});
player.onUnlock = () => setPaused(true);
if (params.has('debug')) setPaused(false);

let last = performance.now();
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;
  player.update(dt);
  grabber.update(dt);
  physics.step(dt);
  props.sync(dt);
  player.syncCamera(dt);
  world.update(t, dt, camera);
  halo.update(grabber.focus);
  if (hud.textContent !== player.prompt) hud.textContent = player.prompt;
  pipeline.render(scene, camera, { scene: halo.scene, strength: grabber.focusAlpha });
});

// Dev hook for poking at things from the console, e.g. __game.pose(0, -12, 0), or with a last argument
// for which floor: __game.pose(7.5, 20, 0, 0, 10) is up on the el's east platform.
Object.assign(window, {
  __game: {
    scene,
    camera,
    player,
    props,
    seats,
    grabber,
    physics,
    renderer,
    pose: (x: number, z: number, yawDeg: number, pitchDeg = 0, level = 0) =>
      player.place(x, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg), level),
  },
});

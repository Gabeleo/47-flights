import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './style.css';
import { Soundscape } from './audio';
import { Grabber } from './grab';
import { Halo } from './halo';
import type { Level } from './level';
import { buildOffice } from './office';
import { buildPantry } from './pantry';
import { Physics } from './physics';
import { Player } from './player';
import { Props, propTemplates } from './props';
import { PS1Pipeline, applyVertexSnap } from './ps1';
import { Seats } from './seats';
import { FOG_COLOR, buildSkyline } from './skyline';

await RAPIER.init();

// ?level=pantry for Bloomberg's pantry at 919 Third; the office otherwise.
const LEVELS: Record<string, () => Level> = { office: buildOffice, pantry: buildPantry };
const params = new URLSearchParams(location.search);
const levelName = params.get('level') ?? '';
const level = (LEVELS[levelName] ?? buildOffice)();

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0012);

const camera = new THREE.PerspectiveCamera(66, 4 / 3, 0.05, 6000);

scene.add(level.group);
const city = buildSkyline(level.elevation);
scene.add(city.group);

const physics = new Physics(level.colliders, level.ground, level.ceiling);
const props = new Props(physics, level.props, propTemplates(level.materials));
scene.add(props.group);
const seats = new Seats(props, physics, Player.radius, Player.halfHeight, level.walkable);

// Night: cool ambient, moonlight through the glass, orange street glow bouncing up onto the ceiling.
scene.add(new THREE.AmbientLight(0x7884aa, 0.9));
const moonlight = new THREE.DirectionalLight(0x9aa8d8, 0.45);
moonlight.position.set(-0.45, 0.5, 0.87);
scene.add(moonlight);
const streetGlow = new THREE.DirectionalLight(0xd89a70, 0.14);
streetGlow.position.set(0.2, -1, -0.3);
scene.add(streetGlow);

const pipeline = new PS1Pipeline(renderer);
const player = new Player(camera, renderer.domElement, physics, props, seats);
player.place(level.spawn.x, level.spawn.z, level.spawn.yaw);
player.surfaceAt = level.surfaceAt;
const grabber = new Grabber(camera, physics, props, player, () => seats.body);
player.carrying = () => grabber.held;
const halo = new Halo(props);

applyVertexSnap(scene);

const sound = new Soundscape();
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
document.getElementById('subtitle')!.innerHTML = level.subtitle;
// Level links reload the page into another level rather than entering this one.
for (const a of document.querySelectorAll<HTMLAnchorElement>('#levels a')) {
  a.classList.toggle('current', a.dataset.level === (levelName in LEVELS ? levelName : 'office'));
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
  level.update(t, dt);
  player.syncCamera(dt);
  halo.update(grabber.focus);
  city.update(t, dt, camera);
  if (hud.textContent !== player.prompt) hud.textContent = player.prompt;
  pipeline.render(scene, camera, { scene: halo.scene, strength: grabber.focusAlpha });
});

// Dev hook for poking at things from the console, e.g. __game.pose(0, -12, 0).
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
    pose: (x: number, z: number, yawDeg: number, pitchDeg = 0) =>
      player.place(x, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg)),
  },
});

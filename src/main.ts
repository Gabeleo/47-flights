import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './style.css';
import { Soundscape } from './audio';
import { Grabber } from './grab';
import { Halo } from './halo';
import { buildOffice } from './office';
import { Physics } from './physics';
import { Player } from './player';
import { Props, propTemplates } from './props';
import { PS1Pipeline, applyVertexSnap } from './ps1';
import { Seats } from './seats';
import { FOG_COLOR, buildSkyline } from './skyline';

await RAPIER.init();

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0012);

const camera = new THREE.PerspectiveCamera(66, 4 / 3, 0.05, 6000);

const office = buildOffice();
scene.add(office.group);
const city = buildSkyline();
scene.add(city.group);

const physics = new Physics(office.colliders);
const props = new Props(physics, office.props, propTemplates(office.materials));
scene.add(props.group);
const seats = new Seats(props, physics, Player.radius, Player.halfHeight);

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
player.place(office.spawn.x, office.spawn.z, office.spawn.yaw);
player.surfaceAt = office.surfaceAt;
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
if (new URLSearchParams(location.search).has('debug')) setPaused(false);

let last = performance.now();
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;
  player.update(dt);
  grabber.update(dt);
  physics.step(dt);
  props.sync(dt);
  office.update(t, dt);
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

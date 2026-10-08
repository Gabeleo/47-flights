import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Physics } from './physics';
import type { Prop, Props } from './props';
import type { Seats } from './seats';

export type Surface = 'carpet' | 'wood' | 'stone';

const EYE = 1.65;
const RADIUS = 0.28;
/** Half the straight section of the capsule; total height is 2 * (HALF_HEIGHT + RADIUS). */
const HALF_HEIGHT = 0.6;
const CENTER_Y = HALF_HEIGHT + RADIUS + 0.02;
const WALK = 1.7;
const RUN = 3.2;
const SCOOT = 1.1;
const STRIDE = 0.72;
const LOOK_SPEED = 0.0022;
/** Seconds to sit down or stand up. */
const BLEND_TIME = 0.45;
/** Approach speed (m/s) needed to shove a heavy prop; slower contact just blocks. */
const KNOCK_SPEED = 1.0;
/** Speed a knocked prop gains per m/s of approach speed. */
const KNOCK_GAIN = 1.4;
/** Props lighter than this (kg) don't block the player; the capsule just pushes them aside. */
const LIGHT_MASS = 2;

/** Camera move between standing and seated, with the turn to face the chair spread over it. */
type Blend = { t: number; from: THREE.Vector3; turn: number; applied: number };

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

export class Player {
  static readonly radius = RADIUS;
  static readonly halfHeight = HALF_HEIGHT;

  yaw = 0;
  pitch = 0;
  readonly pos = new THREE.Vector3();
  readonly collider: RAPIER.Collider;
  /** Movement and look only respond while enabled (i.e. not paused). */
  enabled = false;
  /** Interaction hint for the HUD; empty when there is nothing to do. */
  prompt = '';
  /** While set, mouse movement goes here instead of looking around. */
  lookHook: ((dx: number, dy: number) => void) | null = null;
  /** The prop being carried, which must never block the player. */
  carrying: () => Prop | null = () => null;
  onStep: (surface: Surface, running: boolean) => void = () => {};
  /** The floor underfoot at a point, for footstep sounds. */
  surfaceAt: (x: number, z: number) => Surface = () => 'carpet';
  onSit: () => void = () => {};
  onStand: () => void = () => {};
  onUnlock: () => void = () => {};

  private body: RAPIER.RigidBody;
  private kcc: RAPIER.KinematicCharacterController;
  private vel = new THREE.Vector2();
  private keys = new Set<string>();
  private phase = 0;
  private locked = false;
  private dragging = false;
  /** Chair being looked at. */
  private target: Prop | null = null;
  private seated = false;
  private blend: Blend | null = null;
  private notice = '';
  private noticeTime = 0;
  private eye = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    physics: Physics,
    private props: Props,
    private seats: Seats,
  ) {
    const world = physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CENTER_Y, 0));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);
    this.kcc = world.createCharacterController(0.02);
    this.kcc.setSlideEnabled(true);
    this.kcc.setApplyImpulsesToDynamicBodies(false);

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyE' && !e.repeat && this.enabled) this.interact();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === dom;
      if (wasLocked && !this.locked) this.onUnlock();
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || (!this.locked && !this.dragging)) return;
      if (this.lookHook) return this.lookHook(e.movementX, e.movementY);
      this.yaw -= e.movementX * LOOK_SPEED;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * LOOK_SPEED, -1.45, 1.45);
    });
    // Drag-to-look fallback for when pointer lock is unavailable.
    dom.addEventListener('mousedown', () => (this.dragging = this.enabled && !this.locked));
    addEventListener('mouseup', () => (this.dragging = false));
  }

  lock() {
    Promise.resolve(this.dom.requestPointerLock()).catch(() => {});
  }

  place(x: number, z: number, yaw: number, pitch = 0) {
    if (this.seated) this.seats.release(x, z);
    this.seated = false;
    this.blend = null;
    this.teleport(x, z);
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /** Movement and interaction; call before the physics step. */
  update(dt: number) {
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    const [wx, wz, running] = this.wish();

    if (this.seated) {
      // Mouse swivels the chair, WASD scoots it; the chair keeps its heading until we've turned into it.
      this.seats.drive(wx, wz, this.blend ? null : this.yaw, dt);
      this.setPrompt('[E] STAND UP   [WASD] SCOOT');
      return;
    }

    const a = 1 - Math.exp(-dt * 9);
    this.vel.x += (wx - this.vel.x) * a;
    this.vel.y += (wz - this.vel.y) * a;

    const held = this.carrying();
    this.kcc.computeColliderMovement(
      this.collider,
      { x: this.vel.x * dt, y: 0, z: this.vel.y * dt },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      (c) => this.blocks(c, held),
    );
    // Shove whatever heavy props we ran into, judged by the speed we hit them at.
    const knocked = new Set<Prop>();
    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const hit = this.kcc.computedCollision(i);
      const prop = hit?.collider ? this.props.propOf(hit.collider) : undefined;
      if (prop && !knocked.has(prop)) {
        knocked.add(prop);
        this.knock(prop);
      }
    }
    const mv = this.kcc.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: CENTER_Y, z: t.z + mv.z });
    this.pos.set(t.x + mv.x, 0, t.z + mv.z);
    // Keep only the velocity we actually achieved, so leaning on a wall doesn't build up speed.
    if (dt > 0) this.vel.set(mv.x / dt, mv.z / dt);

    const speed = this.vel.length();
    const before = Math.floor(this.phase / Math.PI);
    this.phase += (speed * dt * Math.PI) / STRIDE;
    if (Math.floor(this.phase / Math.PI) !== before && speed > 0.4) this.onStep(this.surface(), running);

    this.target = this.blend || held ? null : this.seats.pick(this.pos.x, this.pos.z, this.yaw, held);
    this.setPrompt(this.target ? '[E] SIT' : '');
  }

  /** Place the camera; call after the physics step so a seated view rides the chair exactly. */
  syncCamera(dt: number) {
    let roll = 0;
    if (this.seated) this.seats.seatEye(this.eye);
    else {
      const amp = this.blend ? 0 : Math.min(1, this.vel.length() / WALK);
      this.eye.set(this.pos.x, EYE + (Math.abs(Math.sin(this.phase)) - 0.5) * 0.05 * amp, this.pos.z);
      roll = Math.sin(this.phase) * 0.006 * amp;
    }
    const b = this.blend;
    if (b) {
      b.t = Math.min(1, b.t + dt / BLEND_TIME);
      const e = smooth(b.t);
      this.yaw += b.turn * (e - b.applied);
      b.applied = e;
      this.camera.position.lerpVectors(b.from, this.eye, e);
      if (b.t >= 1) this.blend = null;
    } else this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch, this.yaw, roll, 'YXZ');
  }

  private blocks(c: RAPIER.Collider, held: Prop | null) {
    const prop = this.props.propOf(c);
    if (!prop) return true;
    if (prop === held || prop.body === this.seats.body) return false;
    return prop.body.isFixed() || prop.body.mass() >= LIGHT_MASS;
  }

  private knock(prop: Prop) {
    const body = prop.body;
    if (!body.isDynamic()) return;
    const t = body.translation();
    let nx = t.x - this.pos.x;
    let nz = t.z - this.pos.z;
    const d = Math.hypot(nx, nz) || 1;
    nx /= d;
    nz /= d;
    const lv = body.linvel();
    const approach = (this.vel.x - lv.x) * nx + (this.vel.y - lv.z) * nz;
    if (approach <= KNOCK_SPEED) return;
    const m = body.mass();
    body.applyImpulse({ x: nx * approach * KNOCK_GAIN * m, y: 0, z: nz * approach * KNOCK_GAIN * m }, true);
    const spin = (nx * this.vel.y - nz * this.vel.x) * 2.5 + (Math.random() - 0.5) * approach;
    body.applyTorqueImpulse({ x: 0, y: spin * m * 0.06, z: 0 }, true);
  }

  private interact() {
    if (this.blend || this.carrying()) return;
    if (this.seated) this.standUp();
    else if (this.target) this.sitDown(this.target);
  }

  private sitDown(chair: Prop) {
    this.seats.occupy(chair);
    this.seated = true;
    this.collider.setEnabled(false);
    this.vel.set(0, 0);
    this.blend = {
      t: 0,
      from: this.camera.position.clone(),
      turn: wrapAngle(this.seats.yawOf(chair) - this.yaw),
      applied: 0,
    };
    this.onSit();
  }

  private standUp() {
    const spot = this.seats.standSpot();
    if (!spot) {
      this.notice = 'NO ROOM TO STAND';
      this.noticeTime = 1.5;
      return;
    }
    this.seats.release(spot.x, spot.z);
    this.seated = false;
    this.teleport(spot.x, spot.z);
    this.blend = { t: 0, from: this.camera.position.clone(), turn: 0, applied: 0 };
    this.onStand();
  }

  private teleport(x: number, z: number) {
    const p = { x, y: CENTER_Y, z };
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    this.collider.setEnabled(true);
    this.pos.set(x, 0, z);
    this.vel.set(0, 0);
  }

  private setPrompt(text: string) {
    this.prompt = this.noticeTime > 0 ? this.notice : text;
  }

  /** Desired x/z velocity from the keys, camera-relative. */
  private wish(): [number, number, boolean] {
    const k = this.keys;
    const running = k.has('ShiftLeft') || k.has('ShiftRight');
    if (!this.enabled) return [0, 0, running];
    const f = +(k.has('KeyW') || k.has('ArrowUp')) - +(k.has('KeyS') || k.has('ArrowDown'));
    const s = +(k.has('KeyD') || k.has('ArrowRight')) - +(k.has('KeyA') || k.has('ArrowLeft'));
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wx = -sin * f + cos * s;
    const wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len === 0) return [0, 0, running];
    const v = (this.seated ? SCOOT : running ? RUN : WALK) / len;
    return [wx * v, wz * v, running];
  }

  private surface(): Surface {
    return this.surfaceAt(this.pos.x, this.pos.z);
  }
}

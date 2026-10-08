import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Physics } from './physics';
import type { Prop, Props } from './props';

// Garry's Mod-style physgun: hold left mouse to carry the prop at the centre of the view, swing and let go to fling,
// right mouse to throw (or punt what you're aiming at), R + mouse to rotate, F to freeze it in mid-air.
// Grabbing a frozen prop unfreezes it. Looking steadily at a grabbable prop gives it a halo.

const RANGE = 6;
const PUNT_RANGE = 3;
const MIN_DIST = 0.7;
/** Fraction of the gap to the hold point closed per frame. */
const HOLD_STIFFNESS = 0.6;
const MAX_HOLD_SPEED = 25;
const MAX_HOLD_SPIN = 20;
/** Throw impulse (N·s), capped so light things don't go supersonic. */
const THROW_IMPULSE = 90;
const MAX_THROW_SPEED = 16;
const ROTATE_SPEED = 0.006;
/** Seconds of steady looking before a grabbable prop gets its halo. */
const FOCUS_TIME = 3;
/** Glances away shorter than this don't reset the focus timer. */
const FOCUS_GRACE = 0.2;
const HALO_FADE_IN = 0.35;
const HALO_FADE_OUT = 0.15;

/** What the grabber needs from the player. */
export type GrabHost = {
  enabled: boolean;
  yaw: number;
  /** While set, mouse movement goes here instead of looking around. */
  lookHook: ((dx: number, dy: number) => void) | null;
  readonly collider: RAPIER.Collider;
};

const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3(1, 0, 0);

export class Grabber {
  held: Prop | null = null;
  /** The prop wearing the halo (or fading it out). */
  focus: Prop | null = null;
  /** Halo opacity, 0..1. */
  focusAlpha = 0;

  private dist = 2;
  /** Body centre relative to the aim point, in the player's yaw frame. */
  private offset = new THREE.Vector3();
  /** Body orientation relative to the player's yaw. */
  private relRot = new THREE.Quaternion();
  private looking: Prop | null = null;
  private lookTime = 0;
  private missTime = 0;

  constructor(
    private camera: THREE.Camera,
    private physics: Physics,
    private props: Props,
    private host: GrabHost,
    private excludeBody: () => RAPIER.RigidBody | null,
  ) {
    const active = () => this.host.enabled && document.pointerLockElement !== null;
    addEventListener('mousedown', (e) => {
      if (!active()) return;
      if (e.button === 0) this.grab();
      if (e.button === 2) this.throw();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.drop();
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (!this.held || e.repeat) return;
      if (e.code === 'KeyR') this.host.lookHook = (dx, dy) => this.rotate(dx, dy);
      if (e.code === 'KeyF') this.freeze();
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyR') this.host.lookHook = null;
    });
  }

  /** Pick up whatever is at the centre of the view. */
  grab() {
    const hit = this.aim(RANGE);
    if (!hit) return false;
    const { prop, toi } = hit;
    const body = prop.body;
    if (body.isFixed()) body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.wakeUp();
    this.held = prop;
    prop.held = true;
    this.focus = this.looking = null;
    this.focusAlpha = this.lookTime = 0;
    this.dist = Math.max(MIN_DIST, toi);
    const inv = this.yawQuat(_q).invert();
    const aimPoint = _v2.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(_dir), toi);
    const t = body.translation();
    this.offset.set(t.x, t.y, t.z).sub(aimPoint).applyQuaternion(inv);
    const r = body.rotation();
    this.relRot.copy(inv).multiply(_q2.set(r.x, r.y, r.z, r.w));
    return true;
  }

  /** Let go; the prop keeps whatever velocity it had, so swinging the view flings it. */
  drop() {
    if (!this.held) return;
    this.held.held = false;
    this.held = null;
    this.host.lookHook = null;
  }

  /** Throw the held prop, or punt the one being looked at. */
  throw() {
    let prop = this.held;
    if (!prop) prop = this.aim(PUNT_RANGE)?.prop ?? null;
    if (!prop || prop.body.isFixed()) return;
    this.drop();
    const body = prop.body;
    const dir = this.camera.getWorldDirection(_dir);
    const speed = Math.min(MAX_THROW_SPEED, THROW_IMPULSE / body.mass());
    const v = body.linvel();
    body.setLinvel({ x: v.x + dir.x * speed, y: v.y + dir.y * speed + 1, z: v.z + dir.z * speed }, true);
    body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
    prop.cooldown = 0.2;
  }

  /** Pin the held prop where it is. */
  freeze() {
    const prop = this.held;
    if (!prop) return;
    this.drop();
    prop.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    prop.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    prop.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  }

  /** Drive the held prop toward the hold point; call before the physics step. */
  update(dt: number) {
    this.updateFocus(dt);
    if (!this.held) return;
    const body = this.held.body;
    const yawQ = this.yawQuat(_q);
    const target = _v
      .copy(this.camera.position)
      .addScaledVector(this.camera.getWorldDirection(_dir), this.dist)
      .add(_v2.copy(this.offset).applyQuaternion(yawQ));
    const t = body.translation();
    const k = HOLD_STIFFNESS / Math.max(dt, 1 / 240);
    target.set(target.x - t.x, target.y - t.y, target.z - t.z).multiplyScalar(k);
    if (target.length() > MAX_HOLD_SPEED) target.setLength(MAX_HOLD_SPEED);
    body.setLinvel({ x: target.x, y: target.y, z: target.z }, true);

    // Turn toward the held orientation: angular velocity from the remaining rotation.
    const r = body.rotation();
    const delta = _q2.copy(yawQ).multiply(this.relRot).multiply(_q.set(r.x, r.y, r.z, r.w).invert());
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    const angle = 2 * Math.acos(Math.min(1, delta.w));
    const s = Math.sqrt(Math.max(0, 1 - delta.w * delta.w));
    const spin = s > 1e-4 ? Math.min(MAX_HOLD_SPIN, angle * k) / s : 0;
    body.setAngvel({ x: delta.x * spin, y: delta.y * spin, z: delta.z * spin }, true);
  }

  /** Track how long the same grabbable prop has been at the centre of view, and fade its halo. */
  private updateFocus(dt: number) {
    const aimed = this.host.enabled && !this.held ? (this.aim(RANGE)?.prop ?? null) : null;
    if (aimed === this.looking) {
      this.missTime = 0;
      if (aimed) this.lookTime += dt;
    } else if ((this.missTime += dt) > FOCUS_GRACE || !this.host.enabled) {
      this.looking = aimed;
      this.lookTime = this.missTime = 0;
    }
    if (this.looking && this.lookTime >= FOCUS_TIME) {
      this.focus = this.looking;
      this.focusAlpha = Math.min(1, this.focusAlpha + dt / HALO_FADE_IN);
    } else {
      this.focusAlpha = Math.max(0, this.focusAlpha - dt / HALO_FADE_OUT);
      if (this.focusAlpha === 0) this.focus = null;
    }
  }

  private rotate(dx: number, dy: number) {
    _q.setFromAxisAngle(_up, dx * ROTATE_SPEED);
    _q2.setFromAxisAngle(_right, dy * ROTATE_SPEED);
    this.relRot.premultiply(_q2).premultiply(_q);
  }

  private yawQuat(out: THREE.Quaternion) {
    return out.setFromAxisAngle(_up, this.host.yaw);
  }

  private aim(range: number) {
    const o = this.camera.position;
    const d = this.camera.getWorldDirection(_dir);
    const hit = this.physics.world.castRay(
      new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }),
      range,
      true,
      undefined,
      undefined,
      this.host.collider,
      this.excludeBody() ?? undefined,
    );
    if (!hit) return null;
    const prop = this.props.propOf(hit.collider);
    return prop ? { prop, toi: hit.timeOfImpact } : null;
  }
}

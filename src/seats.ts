import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Physics } from './physics';
import type { Prop, Props } from './props';

const SEAT_EYE = 1.17;
const SIT_REACH = 1.7;
/** Extra mass while someone sits in a chair, so it shoves other things instead of bouncing off. */
const SITTER_MASS = 70;
/** The walkable floor, inside the window radiators. */
const FLOOR_HX = 19.6;
const FLOOR_HZ = 13.6;

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function yawRotation(yaw: number) {
  _q.setFromAxisAngle(_up, yaw);
  return { x: _q.x, y: _q.y, z: _q.z, w: _q.w };
}

/** Heading of a body's local +z axis projected onto the floor. */
function headingOf(body: RAPIER.RigidBody) {
  const r = body.rotation();
  return Math.atan2(2 * (r.x * r.z + r.w * r.y), 1 - 2 * (r.x * r.x + r.y * r.y));
}

/** Sitting in office chairs: picking one, driving it while seated, and finding room to stand up. */
export class Seats {
  private occupied: Prop | null = null;
  private standShape: RAPIER.Capsule;

  constructor(
    private props: Props,
    private physics: Physics,
    private playerRadius: number,
    private playerHalfHeight: number,
  ) {
    this.standShape = new RAPIER.Capsule(playerHalfHeight, playerRadius);
  }

  get body() {
    return this.occupied?.body ?? null;
  }

  /** The upright, unfrozen chair the player is looking at within reach. */
  pick(x: number, z: number, yaw: number, exclude: Prop | null) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let best: Prop | null = null;
    let bestScore = Infinity;
    for (const p of this.props.list) {
      if (!p.template.seat || p === exclude || p.body.isFixed()) continue;
      const t = p.body.translation();
      const dx = t.x - x;
      const dz = t.z - z;
      const d = Math.hypot(dx, dz);
      if (d > SIT_REACH || d < 1e-3) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < 0.85) continue;
      const score = d * (2 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  yawOf(p: Prop) {
    return headingOf(p.body);
  }

  /** Sit: stand the chair back up if it was knocked over, then keep it upright while occupied. */
  occupy(p: Prop) {
    this.occupied = p;
    const b = p.body;
    const t = b.translation();
    b.setTranslation({ x: t.x, y: Math.max(t.y, 0), z: t.z }, true);
    b.setRotation(yawRotation(headingOf(b)), true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.setEnabledRotations(false, true, false, true);
    b.setAdditionalMass(SITTER_MASS, true);
  }

  /** Stand up toward (x, z); the chair rolls back a little. */
  release(x: number, z: number) {
    const p = this.occupied;
    this.occupied = null;
    if (!p) return;
    const b = p.body;
    b.setEnabledRotations(true, true, true, true);
    b.setAdditionalMass(0, true);
    const t = b.translation();
    const dx = t.x - x;
    const dz = t.z - z;
    const d = Math.hypot(dx, dz) || 1;
    b.setLinvel({ x: (dx / d) * 0.6, y: 0, z: (dz / d) * 0.6 }, true);
    b.setAngvel({ x: 0, y: (Math.random() - 0.5) * 1.5, z: 0 }, true);
  }

  seatEye(out: THREE.Vector3) {
    const b = this.occupied!.body;
    const t = b.translation();
    const yaw = headingOf(b);
    return out.set(t.x + Math.sin(yaw) * 0.06, t.y + SEAT_EYE, t.z + Math.cos(yaw) * 0.06);
  }

  /** Scoot toward (wx, wz) m/s and swivel to `yaw` (null keeps the chair's heading). */
  drive(wx: number, wz: number, yaw: number | null, dt: number) {
    const b = this.occupied?.body;
    if (!b) return;
    const v = b.linvel();
    const a = 1 - Math.exp(-dt * (wx || wz ? 5 : 3));
    b.setLinvel({ x: v.x + (wx - v.x) * a, y: v.y, z: v.z + (wz - v.z) * a }, true);
    if (yaw !== null) {
      b.setRotation(yawRotation(yaw), true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** A clear spot to stand next to the occupied chair: in front first, then sides and back. */
  standSpot() {
    const b = this.occupied?.body;
    if (!b) return null;
    const t = b.translation();
    const yaw = headingOf(b);
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const r = this.playerRadius;
    const offsets = [[0, -0.6], [0.65, 0], [-0.65, 0], [0, 0.7], [0.6, -0.5], [-0.6, -0.5], [0.6, 0.6], [-0.6, 0.6]];
    for (const [lx, lz] of offsets) {
      const x = t.x + lx * c + lz * s;
      const z = t.z - lx * s + lz * c;
      if (Math.abs(x) > FLOOR_HX - r || Math.abs(z) > FLOOR_HZ - r) continue;
      const blocked = this.physics.world.intersectionWithShape(
        { x, y: this.playerHalfHeight + r + 0.03, z },
        { x: 0, y: 0, z: 0, w: 1 },
        this.standShape,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        b,
      );
      if (!blocked) return { x, z };
    }
    return null;
  }
}

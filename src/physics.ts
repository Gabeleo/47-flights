import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider } from './geometry';

const STEP = 1 / 60;

/** Axis-aligned floor rectangle: x0, z0, x1, z1. */
export type Bounds = [number, number, number, number];

/** The Rapier world: fixed scene geometry plus whatever dynamic bodies get added to it. */
export class Physics {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private grounds = new Set<number>();

  /** `floor` is the extent of the ground slab at y = 0; `ceiling`, if any, caps the same area. */
  constructor(statics: Collider[], floor: Bounds, ceiling?: number) {
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const box = (c: Collider) => {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(c.hw, (c.y1 - c.y0) / 2, c.hd)
          .setTranslation(c.x, (c.y0 + c.y1) / 2, c.z)
          .setRotation({ x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) })
          .setFriction(0.7),
        fixed,
      );
      if (c.ground) this.grounds.add(collider.handle);
    };
    for (const c of statics) box(c);
    const [x0, z0, x1, z1] = floor;
    const slab = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, yaw: 0 };
    box({ ...slab, y0: -1, y1: 0 });
    if (ceiling !== undefined) box({ ...slab, y0: ceiling, y1: ceiling + 1 });
  }

  /** Whether a collider is walkable ground the player steps up onto rather than bumps into. */
  isGround(c: RAPIER.Collider) {
    return this.grounds.has(c.handle);
  }

  /** Advance by a frame's dt in equal substeps of at most 1/60s. */
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt / STEP - 0.01));
    this.world.timestep = dt / n;
    for (let i = 0; i < n; i++) this.world.step();
  }
}

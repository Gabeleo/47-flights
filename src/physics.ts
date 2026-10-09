import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, Rect } from './geometry';

const STEP = 1 / 60;

/** The Rapier world: fixed level geometry plus whatever dynamic bodies get added to it. */
export class Physics {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  /** `ground` is the floor slab at y = 0; the ceiling caps everything over its bounding box. */
  constructor(statics: Collider[], ground: Rect[], ceiling: number) {
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const box = (c: Collider) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(c.hw, (c.y1 - c.y0) / 2, c.hd)
          .setTranslation(c.x, (c.y0 + c.y1) / 2, c.z)
          .setRotation({ x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) })
          .setFriction(0.7),
        fixed,
      );
    const slab = ([x0, z0, x1, z1]: Rect, y0: number, y1: number) =>
      box({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, yaw: 0, y0, y1 });
    for (const c of statics) box(c);
    for (const rect of ground) slab(rect, -1, 0);
    const bounds: Rect = [
      Math.min(...ground.map((r) => r[0])),
      Math.min(...ground.map((r) => r[1])),
      Math.max(...ground.map((r) => r[2])),
      Math.max(...ground.map((r) => r[3])),
    ];
    slab(bounds, ceiling, ceiling + 1);
  }

  /** Advance by a frame's dt in equal substeps of at most 1/60s. */
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt / STEP - 0.01));
    this.world.timestep = dt / n;
    for (let i = 0; i < n; i++) this.world.step();
  }
}

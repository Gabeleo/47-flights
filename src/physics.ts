import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider } from './geometry';

const CEILING = 2.8;
const STEP = 1 / 60;

/** The Rapier world: fixed office geometry plus whatever dynamic bodies get added to it. */
export class Physics {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  constructor(statics: Collider[]) {
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const box = (c: Collider) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(c.hw, (c.y1 - c.y0) / 2, c.hd)
          .setTranslation(c.x, (c.y0 + c.y1) / 2, c.z)
          .setRotation({ x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) })
          .setFriction(0.7),
        fixed,
      );
    for (const c of statics) box(c);
    box({ x: 0, z: 0, hw: 25, hd: 20, yaw: 0, y0: -1, y1: 0 });
    box({ x: 0, z: 0, hw: 25, hd: 20, yaw: 0, y0: CEILING, y1: CEILING + 1 });
  }

  /** Advance by a frame's dt in equal substeps of at most 1/60s. */
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt / STEP - 0.01));
    this.world.timestep = dt / n;
    for (let i = 0; i < n; i++) this.world.step();
  }
}

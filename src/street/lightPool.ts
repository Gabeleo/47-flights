import * as THREE from 'three';

/** A light source the street's lighting can pick up: where it is, its colour, how strong and how far. */
export type Glow = { pos: THREE.Vector3; color: number; intensity: number; distance: number };

/**
 * A fixed set of point lights handed each frame to whichever light sources are nearest the camera.
 * A source on its way out of the set has faded to nothing by the time it goes, so nothing pops.
 */
export class LightPool {
  private lights: THREE.PointLight[] = [];

  constructor(n: number, group: THREE.Group) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      this.lights.push(l);
      group.add(l);
    }
  }

  update(at: THREE.Vector3, sources: Glow[]) {
    const ranked = sources
      .filter((s) => s.intensity > 0)
      .map((s) => ({ s, d: s.pos.distanceTo(at) }))
      .sort((a, c) => a.d - c.d);
    const n = this.lights.length;
    const cut = ranked[n]?.d ?? Infinity;
    this.lights.forEach((l, i) => {
      const e = ranked[i];
      if (!e) return void (l.intensity = 0);
      l.position.copy(e.s.pos);
      l.color.setHex(e.s.color);
      l.distance = e.s.distance;
      l.intensity = e.s.intensity * Math.min(1, Math.max(0, (cut - e.d) / 12));
    });
  }
}

import type * as THREE from 'three';
import type { Collider, Rect } from './geometry';
import type { Mats } from './materials';
import type { Surface } from './player';
import type { PropSpawn } from './props';

/** Everything main.ts needs from a floor to run it. */
export type Level = {
  /** Shown under the title. */
  subtitle: string;
  group: THREE.Group;
  colliders: Collider[];
  props: PropSpawn[];
  materials: Mats;
  /** Solid floor slab at y = 0, as rectangles; anything left out (a stairwell) is open. */
  ground: Rect[];
  /** Height of the ceiling over the ground. */
  ceiling: number;
  /** Where the player may stand up out of a chair. */
  walkable: Rect;
  /** Height of the floor above the street, for the city outside. */
  elevation: number;
  spawn: { x: number; z: number; yaw: number };
  surfaceAt: (x: number, z: number) => Surface;
  update: (t: number, dt: number) => void;
};

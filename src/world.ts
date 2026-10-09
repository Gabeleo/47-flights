import type * as THREE from 'three';
import type { Soundscape } from './audio';
import type { Collider } from './geometry';
import type { Bounds, Physics } from './physics';
import type { Action, Surface } from './player';
import type { PropSpawn, Template } from './props';

/** Which bed of background sound plays under a scene. */
export type Ambience = 'office' | 'street';

/** Everything main.ts needs from a scene to run it. */
export type World = {
  /** Shown on the title card. */
  subtitle: string;
  group: THREE.Group;
  colliders: Collider[];
  props: PropSpawn[];
  templates: Record<string, Template>;
  /** The ground slab at y = 0 under everything, and a ceiling over it if the scene is indoors. */
  floor: Bounds;
  ceiling?: number;
  /** Where the player may stand up out of a chair. */
  walkable: Bounds;
  fog: { color: number; density: number };
  ambience: Ambience;
  spawn: { x: number; z: number; yaw: number };
  surfaceAt: (x: number, z: number) => Surface;
  /** Height of the floor at a point for feet at height y; see Player.heightAt. */
  heightAt?: (x: number, z: number, y: number) => number;
  /** Something to do here, such as tapping through a turnstile; see Player.actionAt. */
  actionAt?: (x: number, z: number, y: number, yaw: number) => Action | null;
  /** Called once the physics world exists, for anything that moves through it (cars, say). */
  attach?: (physics: Physics, player: { pos: THREE.Vector3 }) => void;
  update: (t: number, dt: number, camera: THREE.Camera) => void;
};

/** What a scene builder may hook into. */
export type WorldContext = { sound: Soundscape };

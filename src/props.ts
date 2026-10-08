import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Builder } from './geometry';
import type { Mats } from './materials';
import type { Physics } from './physics';

// Loose objects on the floor: each is a Rapier rigid body drawn through a per-type InstancedMesh.

export type ImpactSound = 'thud' | 'plastic' | 'metal' | 'ceramic' | 'paper' | 'wood' | 'soft';

export type PropSpawn = { kind: string; x: number; y: number; z: number; yaw: number };

export type Template = {
  /** Visual parts in local space; y = 0 is the surface the prop rests on. */
  build: (b: Builder) => void;
  /** Collision shapes (each with its own mass) in the same local space. */
  shapes: () => RAPIER.ColliderDesc[];
  sound: ImpactSound;
  bounce?: number;
  /** Linear and angular damping; high values fake air drag on paper and cups. */
  damping?: [number, number];
  /** Continuous collision detection, for small things that get thrown fast. */
  ccd?: boolean;
  /** An office chair you can sit in. */
  seat?: boolean;
};

export type Prop = {
  kind: string;
  template: Template;
  body: RAPIER.RigidBody;
  slots: { mesh: THREE.InstancedMesh; index: number }[];
  /** Being carried by the grabber; impact sounds are suppressed. */
  held: boolean;
  /** Needs one more matrix write (it was awake last frame). */
  dirty: boolean;
  lastVel: THREE.Vector3;
  /** Seconds until this prop may trigger another impact sound. */
  cooldown: number;
};

const cuboid = (hx: number, hy: number, hz: number, x: number, y: number, z: number, mass: number) =>
  RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setMass(mass);
const cylinder = (r: number, hh: number, x: number, y: number, z: number, mass: number) =>
  RAPIER.ColliderDesc.cylinder(hh, r).setTranslation(x, y, z).setMass(mass);

/** Prop types, keyed by the names office.ts spawns. */
export function propTemplates(M: Mats): Record<string, Template> {
  const chairParts = (b: Builder) => {
    b.box(M.black, 0.62, 0.035, 0.06, 0, 0.04, 0);
    b.box(M.black, 0.06, 0.035, 0.62, 0, 0.04, 0);
    b.cyl(M.metalDark, 0.025, 0.025, 0.36, 0, 0.07, 0, 6);
    b.box(M.fabric, 0.48, 0.07, 0.46, 0, 0.43, 0);
    b.box(M.fabric, 0.46, 0.54, 0.05, 0, 0.56, 0.23);
    for (const s of [-1, 1]) {
      b.box(M.black, 0.03, 0.18, 0.03, s * 0.25, 0.5, 0.02);
      b.box(M.black, 0.05, 0.025, 0.24, s * 0.25, 0.68, 0.02);
    }
  };
  // Office chair: a heavy, low-friction caster base so it rolls, seat and back above.
  const chairShapes = () => [
    cylinder(0.31, 0.02, 0, 0.02, 0, 6)
      .setFriction(0.15)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),
    cylinder(0.03, 0.18, 0, 0.25, 0, 1),
    cuboid(0.24, 0.035, 0.23, 0, 0.465, 0, 3),
    cuboid(0.23, 0.27, 0.025, 0, 0.83, 0.23, 2),
  ];
  const chair: Template = { build: chairParts, shapes: chairShapes, sound: 'thud', damping: [0.8, 1.5], seat: true };

  const mug = (mat: THREE.Material): Template => ({
    build: (b) => {
      b.cyl(mat, 0.04, 0.035, 0.1, 0, 0, 0, 7);
      b.box(mat, 0.015, 0.06, 0.03, 0.045, 0.02, 0);
    },
    shapes: () => [cylinder(0.04, 0.05, 0, 0.05, 0, 0.3)],
    sound: 'ceramic',
    ccd: true,
  });

  const plant = (s: number): Template => ({
    build: (b) => {
      b.cyl(M.pot, 0.27 * s, 0.21 * s, 0.5 * s, 0, 0, 0);
      b.cyl(M.soil, 0.25 * s, 0.25 * s, 0.02, 0, 0.47 * s, 0);
      for (let k = 0; k < 3; k++) b.plane(M.leaf, 1.0 * s, 1.3 * s, 0, 1.12 * s, 0, { ry: (k * Math.PI) / 3 });
    },
    shapes: () => [cylinder(0.25 * s, 0.25 * s, 0, 0.25 * s, 0, 12)],
    sound: 'thud',
  });

  const beanbag = (mat: THREE.Material): Template => ({
    build: (b) => b.sphere(mat, 0.45, 0, 0.27, 0, 0.6),
    shapes: () => [RAPIER.ColliderDesc.roundCylinder(0.07, 0.25, 0.2).setTranslation(0, 0.27, 0).setMass(6)],
    sound: 'soft',
    damping: [0.6, 2],
  });

  return {
    chair,
    chairHoodie: {
      ...chair,
      build: (b) => {
        chairParts(b);
        b.box(M.hoodie, 0.5, 0.42, 0.09, 0, 0.7, 0.28);
        b.box(M.hoodie, 0.3, 0.14, 0.12, 0, 1.08, 0.26);
        b.box(M.hoodie, 0.1, 0.4, 0.08, -0.22, 0.34, 0.27);
      },
    },
    keyboard: {
      build: (b) => b.box(M.black, 0.42, 0.02, 0.13, 0, 0, 0),
      shapes: () => [cuboid(0.21, 0.01, 0.065, 0, 0.01, 0, 0.7)],
      sound: 'plastic',
    },
    mouse: {
      build: (b) => b.box(M.black, 0.05, 0.02, 0.09, 0, 0, 0),
      shapes: () => [cuboid(0.025, 0.01, 0.045, 0, 0.01, 0, 0.1)],
      sound: 'plastic',
      ccd: true,
    },
    mug0: mug(M.mugs[0]),
    mug1: mug(M.mugs[1]),
    mug2: mug(M.mugs[2]),
    mug3: mug(M.mugs[3]),
    can: {
      build: (b) => b.cyl(M.can, 0.033, 0.033, 0.12, 0, 0, 0, 7),
      shapes: () => [cylinder(0.033, 0.06, 0, 0.06, 0, 0.05)],
      sound: 'metal',
      bounce: 0.3,
      ccd: true,
    },
    paper: {
      build: (b) => b.box(M.paper, 0.21, 0.006, 0.3, 0, 0, 0),
      shapes: () => [cuboid(0.105, 0.004, 0.15, 0, 0.004, 0, 0.05)],
      sound: 'paper',
      damping: [3, 4],
    },
    notebook: {
      build: (b) => b.box(M.notebook, 0.16, 0.015, 0.22, 0, 0, 0),
      shapes: () => [cuboid(0.08, 0.0075, 0.11, 0, 0.0075, 0, 0.3)],
      sound: 'paper',
    },
    deskPlant: {
      build: (b) => {
        b.cyl(M.pot, 0.06, 0.05, 0.1, 0, 0, 0, 6);
        b.plane(M.leaf, 0.22, 0.26, 0, 0.23, 0, { ry: 0.4 });
        b.plane(M.leaf, 0.22, 0.26, 0, 0.23, 0, { ry: 2.0 });
      },
      shapes: () => [cylinder(0.06, 0.05, 0, 0.05, 0, 0.6)],
      sound: 'ceramic',
    },
    plant: plant(1),
    plantSmall: plant(0.9),
    cushion: {
      build: (b) => b.box(M.cushion, 1.12, 0.12, 0.62, 0, 0, 0),
      shapes: () => [cuboid(0.56, 0.06, 0.31, 0, 0.06, 0, 1.5)],
      sound: 'soft',
      damping: [0.5, 1],
    },
    beanbagTeal: beanbag(M.felt),
    beanbagOrange: beanbag(M.orange),
    puck: {
      build: (b) => b.cyl(M.black, 0.12, 0.13, 0.03, 0, 0, 0, 10),
      shapes: () => [cylinder(0.125, 0.015, 0, 0.015, 0, 0.6)],
      sound: 'plastic',
    },
  };
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

export class Props {
  readonly group = new THREE.Group();
  readonly list: Prop[] = [];
  onImpact: (sound: ImpactSound, strength: number, x: number, y: number, z: number) => void = () => {};

  private byCollider = new Map<number, Prop>();
  private meshes = new Map<string, THREE.InstancedMesh[]>();
  private matrix = new THREE.Matrix4();

  constructor(physics: Physics, spawns: PropSpawn[], templates: Record<string, Template>) {
    const counts = new Map<string, number>();
    for (const s of spawns) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);

    for (const [kind, count] of counts) {
      const template = templates[kind];
      if (!template) throw new Error(`Unknown prop kind: ${kind}`);
      const b = new Builder();
      template.build(b);
      this.meshes.set(
        kind,
        [...b.geometries()].map(([mat, geo]) => {
          const mesh = new THREE.InstancedMesh(geo, mat, count);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.frustumCulled = false;
          this.group.add(mesh);
          return mesh;
        }),
      );
    }

    const used = new Map<string, number>();
    for (const s of spawns) {
      const template = templates[s.kind];
      const index = used.get(s.kind) ?? 0;
      used.set(s.kind, index + 1);
      _q.setFromAxisAngle(_up, s.yaw);
      // Spawned exactly at rest; Rapier puts them to sleep on its own within a second or two.
      // (Don't use setSleeping(true) here: a body created asleep ignores contacts and falls through desks.)
      const body = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(s.x, s.y, s.z)
          .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
          .setLinearDamping(template.damping?.[0] ?? 0.1)
          .setAngularDamping(template.damping?.[1] ?? 0.4)
          .setCcdEnabled(!!template.ccd),
      );
      const prop: Prop = {
        kind: s.kind,
        template,
        body,
        slots: this.meshes.get(s.kind)!.map((mesh) => ({ mesh, index })),
        held: false,
        dirty: true,
        lastVel: new THREE.Vector3(),
        cooldown: 0,
      };
      for (const shape of template.shapes()) {
        const collider = physics.world.createCollider(shape.setRestitution(template.bounce ?? 0.1), body);
        this.byCollider.set(collider.handle, prop);
      }
      this.list.push(prop);
    }
    this.sync(0);
  }

  propOf(collider: RAPIER.Collider) {
    return this.byCollider.get(collider.handle);
  }

  /** The instanced meshes (one per material) that draw every prop of this kind. */
  meshesOf(kind: string) {
    return this.meshes.get(kind) ?? [];
  }

  /** Copy awake bodies into their instance matrices and detect impacts from sudden velocity changes. */
  sync(dt: number) {
    const touched = new Set<THREE.InstancedMesh>();
    for (const p of this.list) {
      const asleep = p.body.isSleeping();
      if (asleep && !p.dirty) continue;
      p.dirty = !asleep;
      const t = p.body.translation();
      const r = p.body.rotation();
      this.matrix.compose(_v.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _one);
      for (const s of p.slots) {
        s.mesh.setMatrixAt(s.index, this.matrix);
        touched.add(s.mesh);
      }

      const lv = p.body.linvel();
      const change = _v.set(lv.x, lv.y, lv.z).distanceTo(p.lastVel);
      p.lastVel.set(lv.x, lv.y, lv.z);
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (!p.held && change > 1.0 && p.cooldown <= 0) {
        p.cooldown = 0.08;
        this.onImpact(p.template.sound, change, t.x, t.y, t.z);
      }
    }
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
  }
}

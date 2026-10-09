import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Template } from '../props';
import type { StreetMats } from './materials';

// Loose things on the sidewalk at 2am: litter baskets, the night's garbage out at the curb, crates and a
// chair outside the deli, a few cones, and whatever people dropped.

const cuboid = (hx: number, hy: number, hz: number, x: number, y: number, z: number, mass: number) =>
  RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setMass(mass);
const cylinder = (r: number, hh: number, x: number, y: number, z: number, mass: number) =>
  RAPIER.ColliderDesc.cylinder(hh, r).setTranslation(x, y, z).setMass(mass);

export function streetPropTemplates(M: StreetMats): Record<string, Template> {
  const bag = (mat: THREE.Material, s: number): Template => ({
    build: (b) => {
      b.sphere(mat, 0.32 * s, 0, 0.26 * s, 0, 0.85);
      b.cyl(mat, 0.05, 0.09, 0.14 * s, 0, 0.48 * s, 0, 5);
    },
    shapes: () => [RAPIER.ColliderDesc.roundCylinder(0.12 * s, 0.2 * s, 0.1).setTranslation(0, 0.25 * s, 0).setMass(3 * s)],
    sound: 'soft',
    damping: [0.8, 2],
  });

  return {
    // The green wire litter basket on every corner, with the day's rubbish in it.
    litterBasket: {
      build: (b) => {
        b.cyl(M.basket, 0.3, 0.27, 0.9, 0, 0, 0, 10);
        b.cyl(M.hydrantCap, 0.31, 0.31, 0.05, 0, 0.88, 0, 10);
        b.cyl(M.iron, 0.27, 0.27, 0.03, 0, 0.02, 0, 10);
        b.sphere(M.news, 0.22, 0, 0.75, 0, 0.6);
        b.box(M.cardboard, 0.2, 0.16, 0.2, 0.08, 0.7, -0.05);
      },
      shapes: () => [cylinder(0.3, 0.45, 0, 0.45, 0, 9)],
      sound: 'metal',
    },
    trashBag: bag(M.bag, 1),
    trashBagSmall: bag(M.bag, 0.75),
    recyclingBag: bag(M.bagClear, 0.9),
    cone: {
      build: (b) => {
        b.box(M.cone, 0.36, 0.03, 0.36, 0, 0, 0);
        b.add(new THREE.ConeGeometry(0.13, 0.68, 8), M.cone, 0, 0.37, 0);
        b.cyl(M.white, 0.085, 0.1, 0.1, 0, 0.32, 0, 8);
      },
      shapes: () => [cuboid(0.18, 0.015, 0.18, 0, 0.015, 0, 1.2), RAPIER.ColliderDesc.cone(0.34, 0.13).setTranslation(0, 0.37, 0).setMass(0.6)],
      sound: 'plastic',
    },
    milkCrate: {
      build: (b) => b.box(M.crate, 0.33, 0.28, 0.33, 0, 0, 0),
      shapes: () => [cuboid(0.165, 0.14, 0.165, 0, 0.14, 0, 1.4)],
      sound: 'plastic',
    },
    // The white plastic chair the guy from the deli sits out on.
    plasticChair: {
      build: (b) => {
        b.box(M.white, 0.46, 0.04, 0.44, 0, 0.42, 0);
        b.box(M.white, 0.46, 0.46, 0.04, 0, 0.46, 0.22);
        for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) b.box(M.white, 0.04, 0.42, 0.04, x, 0, z);
        for (const s of [-1, 1]) b.box(M.white, 0.04, 0.04, 0.4, s * 0.23, 0.64, 0.02);
      },
      shapes: () => [cuboid(0.23, 0.02, 0.22, 0, 0.44, 0, 1.2), cuboid(0.23, 0.23, 0.02, 0, 0.69, 0.22, 0.6), cuboid(0.2, 0.2, 0.19, 0, 0.2, 0, 0.6)],
      sound: 'plastic',
      seat: true,
      damping: [0.6, 1.2],
    },
    pizzaBox: {
      build: (b) => b.box(M.cardboard, 0.4, 0.045, 0.4, 0, 0, 0),
      shapes: () => [cuboid(0.2, 0.0225, 0.2, 0, 0.0225, 0, 0.25)],
      sound: 'paper',
      damping: [1.5, 2],
    },
    bottle: {
      build: (b) => {
        b.cyl(M.bottle, 0.035, 0.035, 0.2, 0, 0, 0, 7);
        b.cyl(M.bottle, 0.012, 0.03, 0.08, 0, 0.2, 0, 6);
      },
      shapes: () => [cylinder(0.035, 0.14, 0, 0.14, 0, 0.4)],
      sound: 'ceramic',
      ccd: true,
    },
    can: {
      build: (b) => b.cyl(M.can, 0.033, 0.033, 0.12, 0, 0, 0, 7),
      shapes: () => [cylinder(0.033, 0.06, 0, 0.06, 0, 0.05)],
      sound: 'metal',
      bounce: 0.3,
      ccd: true,
    },
    newspaper: {
      build: (b) => b.box(M.news, 0.3, 0.012, 0.4, 0, 0, 0),
      shapes: () => [cuboid(0.15, 0.006, 0.2, 0, 0.006, 0, 0.15)],
      sound: 'paper',
      damping: [3, 4],
    },
    // A sandwich board out front of the cafe, folded up for the night and leaning.
    sandwichBoard: {
      build: (b) => {
        b.box(M.iron, 0.6, 0.9, 0.04, 0, 0, 0);
        b.box(M.cardboard, 0.5, 0.7, 0.01, 0, 0.12, 0.025);
      },
      shapes: () => [cuboid(0.3, 0.45, 0.03, 0, 0.45, 0, 4)],
      sound: 'wood',
    },
  };
}

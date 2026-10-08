import * as THREE from 'three';
import { applyVertexSnap } from './ps1';
import type { Prop, Props } from './props';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

/**
 * The focused prop's silhouette, drawn on its own into the PS1 pipeline's halo mask;
 * the post pass turns the mask's edge into the glow.
 */
export class Halo {
  readonly scene = new THREE.Scene();
  private shapes = new Map<string, THREE.Group>();
  private solid = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private current: THREE.Group | null = null;

  constructor(private props: Props) {}

  /** Match `prop`'s current pose, or hide the silhouette. Call after the physics step. */
  update(prop: Prop | null) {
    const shape = prop ? this.shapeOf(prop.kind) : null;
    if (this.current && this.current !== shape) this.current.visible = false;
    this.current = shape;
    if (!prop || !shape) return;
    shape.visible = true;
    const t = prop.body.translation();
    const r = prop.body.rotation();
    shape.matrix.compose(_v.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _one);
    shape.matrixWorldNeedsUpdate = true;
  }

  private shapeOf(kind: string) {
    let shape = this.shapes.get(kind);
    if (shape) return shape;
    shape = new THREE.Group();
    shape.matrixAutoUpdate = false;
    for (const mesh of this.props.meshesOf(kind)) {
      const src = mesh.material as THREE.MeshLambertMaterial;
      // Cut-out parts (plant leaves) keep their alpha test so the halo hugs the leaves, not the quads.
      const mat =
        src.alphaTest > 0
          ? new THREE.MeshBasicMaterial({ map: src.map, alphaTest: src.alphaTest, side: THREE.DoubleSide })
          : this.solid;
      shape.add(new THREE.Mesh(mesh.geometry, mat));
    }
    applyVertexSnap(shape);
    this.shapes.set(kind, shape);
    this.scene.add(shape);
    return shape;
  }
}

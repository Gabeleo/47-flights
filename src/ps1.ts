import * as THREE from 'three';

// Internal render height; the frame is upscaled by an integer factor with nearest filtering.
const TARGET_HEIGHT = 240;

// Shared by every patched material so all vertices snap to the low-res pixel grid.
const snapUniform = { value: new THREE.Vector2(320, 240) };

const SNAP_GLSL = /* glsl */ `
  if (gl_Position.w > 0.0) {
    vec2 grid = uSnap * 0.5;
    gl_Position.xy = floor(gl_Position.xy / gl_Position.w * grid + 0.5) / grid * gl_Position.w;
  }
`;

type CompileParams = Parameters<THREE.Material['onBeforeCompile']>[0];

function snapVertices(shader: CompileParams) {
  shader.uniforms.uSnap = snapUniform;
  shader.vertexShader =
    'uniform vec2 uSnap;\n' +
    shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + SNAP_GLSL);
}

/** Patch every mesh material under `root` with PS1-style vertex snapping. */
export function applyVertexSnap(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.noSnap) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.onBeforeCompile = snapVertices;
  });
}

const POST_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tMask;
  uniform vec2 uRes;
  uniform float uHalo;
  varying vec2 vUv;

  float maskAt(vec2 uv) { return step(0.004, dot(texture2D(tMask, uv).rgb, vec3(1.0))); }

  float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  vec3 linearToSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 c = linearToSRGB(clamp(texture2D(tScene, vUv).rgb, 0.0, 1.0));
    if (uHalo > 0.0) {
      // Halo: a soft white ring a few low-res pixels wide around the masked silhouette.
      vec2 px = 1.0 / uRes;
      vec2 uv = (floor(vUv * uRes) + 0.5) * px;
      float glow = 0.0;
      for (int y = -3; y <= 3; y++)
        for (int x = -3; x <= 3; x++) {
          float d = length(vec2(float(x), float(y)));
          if (d > 3.2) continue;
          glow = max(glow, maskAt(uv + vec2(float(x), float(y)) * px) * (1.0 - d / 3.8));
        }
      c = mix(c, vec3(1.0), glow * (1.0 - maskAt(uv)) * uHalo * 0.6);
    }
    // 15-bit colour with ordered dithering, like the PS1 framebuffer.
    float d = bayer4(floor(vUv * uRes)) - 0.5;
    c = floor(c * 31.0 + 0.5 + d) / 31.0;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class PS1Pipeline {
  width = 320;
  height = 240;
  private target: THREE.WebGLRenderTarget;
  /** Silhouette of whatever wears the halo, at the same low resolution. */
  private mask: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.mask = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        tMask: { value: this.mask.texture },
        uRes: { value: new THREE.Vector2(this.width, this.height) },
        uHalo: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  setSize(w: number, h: number) {
    const scale = Math.max(1, Math.round(h / TARGET_HEIGHT));
    this.width = Math.ceil(w / scale);
    this.height = Math.ceil(h / scale);
    this.renderer.setSize(w, h);
    this.target.setSize(this.width, this.height);
    this.mask.setSize(this.width, this.height);
    this.post.uniforms.uRes.value.set(this.width, this.height);
    snapUniform.value.set(this.width, this.height);
  }

  /** Render the frame; `halo` draws a glow around everything in its scene at the given strength. */
  render(scene: THREE.Scene, camera: THREE.Camera, halo?: { scene: THREE.Scene; strength: number }) {
    const strength = halo?.strength ?? 0;
    this.post.uniforms.uHalo.value = strength;
    if (halo && strength > 0) {
      this.renderer.setRenderTarget(this.mask);
      this.renderer.render(halo.scene, camera);
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}

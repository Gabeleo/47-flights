import * as THREE from 'three';
import { officeTextures } from './textures';

/** Push coplanar overlays (screens, signs, rugs) ahead in depth so vertex snapping can't z-fight them. */
function decal<T extends THREE.Material>(m: T): T {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -4;
  return m;
}

export function makeMaterials() {
  const t = officeTextures();
  const lam = (p: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(p);
  const basic = (p: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial(p);
  return {
    carpet: lam({ map: t.carpet }),
    ceiling: lam({ map: t.ceiling }),
    drywall: lam({ map: t.drywall }),
    wood: lam({ map: t.wood }),
    metal: lam({ map: t.metal }),
    doorMetal: lam({ map: t.doorMetal }),
    slats: lam({ map: t.slats }),
    hallTile: lam({ map: t.hallTile }),
    walkMat: lam({ map: t.walkMat }),
    chevrons: lam({ map: t.chevrons }),
    led: basic({ color: 0xfff1cf }),
    ledGlow: basic({ color: 0xe0a04a }),
    floor47: decal(basic({ map: t.floor47, alphaTest: 0.5 })),
    carLabels: t.carLabels.map((map) => decal(lam({ map, alphaTest: 0.5 }))),
    champagne: lam({ color: 0xb8a47c }),
    callStation: decal(lam({ map: t.callStation })),
    metalDark: lam({ color: 0x3a3e45 }),
    mullion: lam({ color: 0x2a2d33 }),
    black: lam({ color: 0x141518 }),
    white: lam({ color: 0xe6e6e2 }),
    paper: lam({ color: 0xf0efe8 }),
    radiator: lam({ color: 0xb4b3ad }),
    sill: lam({ color: 0xd0cfc8 }),
    fabric: lam({ map: t.fabric }),
    felt: lam({ map: t.felt }),
    weave: lam({ map: t.weave }),
    poly: lam({ color: 0xeceeeb }),
    sofa: lam({ map: t.sofa }),
    cushion: lam({ color: 0x5b6680 }),
    hoodie: lam({ color: 0x3c4a3a }),
    notebook: lam({ color: 0x7a2a26 }),
    can: lam({ color: 0x3fae5a }),
    pot: lam({ color: 0xc9c2b4 }),
    soil: lam({ color: 0x2a1d14 }),
    leaf: lam({ map: t.leaf, alphaTest: 0.5, side: THREE.DoubleSide }),
    rug: lam({ map: t.rug }),
    orange: lam({ color: 0xe0782a }),
    mugs: [0xe6e6e2, 0x1e525c, 0xc8402a, 0x2b2d33].map((c) => lam({ color: c })),
    bezel: lam({ color: 0x15161a }),
    screenOff: decal(lam({ color: 0x0b0c0f })),
    screenLock: decal(basic({ map: t.screenLock, color: 0x8a8a8a })),
    screenCode: decal(basic({ map: t.screenCode })),
    screenCode2: decal(basic({ map: t.screenCode2 })),
    screenDash: decal(basic({ map: t.screenDash })),
    bigDash: decal(basic({ map: t.bigDash })),
    pnlDash: decal(basic({ map: t.pnlDash })),
    news: decal(basic({ map: t.news })),
    newsTicker: decal(basic({ map: t.newsTicker })),
    tvShare: decal(basic({ map: t.tvShare })),
    tvMeeting: decal(basic({ map: t.tvMeeting })),
    tvSprint: decal(basic({ map: t.tvSprint })),
    glassBoard: decal(lam({ map: t.glassBoard })),
    glassEdge: lam({ color: 0xcfe0dc }),
    pcLed: basic({ color: 0x7fb8ff }),
    glass: basic({ color: 0x3c4a5a, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    frosted: lam({ color: 0xc8d0da, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    lightOn: decal(basic({ map: t.lightPanel })),
    lightFlicker: decal(basic({ map: t.lightPanel })),
    lightOff: decal(lam({ map: t.lightPanel, color: 0xb4b8c0 })),
    downlight: basic({ color: 0xfff1d8 }),
    lampShade: basic({ color: 0xffc98a }),
    vent: decal(lam({ map: t.vent })),
    exit: decal(basic({ map: t.exit })),
    stair: decal(lam({ map: t.stair })),
    roomA: decal(lam({ map: t.roomA })),
    roomB: decal(lam({ map: t.roomB })),
  };
}

export type Mats = ReturnType<typeof makeMaterials>;

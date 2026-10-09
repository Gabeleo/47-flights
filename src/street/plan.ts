// 36th Avenue, Astoria, from 29th Street to 34th Street. The avenue runs along x (west to east is +x),
// centred on z = 0, with north toward -z. The cross streets run along z. Blocks here are about 84m
// centre to centre; the N/W el runs up 31st Street, with the 36 Av station over the intersection.

/** A cross street: its centreline, the half-width of its roadway, and of its building lines. */
export type CrossStreet = { name: string; x: number; road: number; lot: number; signal: boolean };

export const STREETS: CrossStreet[] = [
  { name: '29 St', x: -168, road: 5, lot: 9, signal: true },
  { name: '30 St', x: -84, road: 5, lot: 9, signal: false },
  { name: '31 St', x: 0, road: 9, lot: 13.5, signal: true },
  { name: '32 St', x: 84, road: 5, lot: 9, signal: false },
  { name: '33 St', x: 168, road: 5, lot: 9, signal: true },
  { name: '34 St', x: 252, road: 5, lot: 9, signal: false },
];

/** Half-width of the avenue's roadway: a travel lane and a parking lane each way. */
export const AVE_ROAD = 6;
/** The avenue's building lines, either side of the centreline. */
export const AVE_LOT = 10.5;
/** Centre of each travel lane and each parking lane, from the centreline. */
export const LANE = 1.9;
export const PARK = 4.9;
/** Sidewalks stand this high above the road. */
export const CURB = 0.15;
/** Crosswalks run from the corner this far out across the cross street's mouth. */
export const CROSSWALK = 3.2;
/** How far down a cross street the scenery goes before the fog takes it. */
export const CROSS_REACH = 95;
/** The avenue carries on past 29th and 34th this far, for the view. */
export const END_REACH = 75;

/** Where the player is allowed: the avenue, its sidewalks, and into each intersection, but no further. */
export const WEST_END = STREETS[0].x - STREETS[0].lot;
export const EAST_END = STREETS[STREETS.length - 1].x + STREETS[STREETS.length - 1].lot;
/** How far up each cross street the player may go before an invisible wall; further under the el, to see the stairs. */
export const crossReach = (s: CrossStreet) => (s.name === '31 St' ? 24 : AVE_LOT + 4.5);

/** The el over 31st Street: track centres, column lines, and heights. */
export const EL = {
  x: 0,
  tracks: [-4.2, 0, 4.2],
  columns: 6.6,
  /** Top of the rails. */
  rail: 9.0,
  /** Platform deck height, level with the car floors. */
  platform: 10.1,
  /** The station house hanging under the tracks over the intersection: its floor, its ceiling, how far it runs up 31st. */
  houseBottom: 4.6,
  houseTop: 7.3,
  houseHalf: 13.5,
  /** Platforms run this far each way from the avenue. */
  platformHalf: 76,
  /** The structure carries on this far into the fog. */
  reach: 260,
};

/** A floor someone can stand on: a rectangle, and its height at each point in it (stairs slope). */
export type Walk = { rect: [number, number, number, number]; at: (x: number, z: number) => number };

/** Highest step someone takes without thinking about it; anything higher is another floor. */
const STEP = 0.5;

/** Height underfoot at (x, z) for feet at y: the highest floor there within a step up, else the road. */
export function heightOn(walks: Walk[], x: number, z: number, y: number) {
  let best = 0;
  for (const { rect, at } of walks) {
    if (x < rect[0] || x > rect[2] || z < rect[1] || z > rect[3]) continue;
    const h = at(x, z);
    if (h <= y + STEP && h > best) best = h;
  }
  return best;
}

/** A flat floor at height h. */
export const flatWalk = (x0: number, z0: number, x1: number, z1: number, h: number): Walk => ({
  rect: [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)],
  at: () => h,
});

/** A stair running along z, from height y0 at z0 to y1 at z1. */
export const stairWalk = (x0: number, x1: number, z0: number, y0: number, z1: number, y1: number): Walk => ({
  rect: [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)],
  at: (_x, z) => y0 + ((y1 - y0) * (z - z0)) / (z1 - z0),
});

/** An axis-aligned rectangle on the ground: x0, z0, x1, z1. */
export type Rect = [number, number, number, number];

/** One block of the avenue: the x extent of its frontage and of its roadway, and the cross streets at each end. */
export type Block = { x0: number; x1: number; road0: number; road1: number; west?: CrossStreet; east?: CrossStreet };

/** The avenue's blocks west to east: 0 is west of 29th, 1 is 29th-30th ... 5 is 33rd-34th, 6 east of 34th. */
export const BLOCKS: Block[] = Array.from({ length: STREETS.length + 1 }, (_, i) => {
  const w = STREETS[i - 1];
  const e = STREETS[i];
  return {
    x0: w ? w.x + w.lot : WEST_END - END_REACH,
    x1: e ? e.x - e.lot : EAST_END + END_REACH,
    road0: w ? w.x + w.road : WEST_END - END_REACH,
    road1: e ? e.x - e.road : EAST_END + END_REACH,
    west: w,
    east: e,
  };
});

/** Column positions of the el up and down 31st, so cars don't park into them. */
export const EL_COLUMNS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let z = 11.5; z < CROSS_REACH; z += 15) for (const s of [-1, 1]) for (const e of [-1, 1]) out.push([EL.x + e * EL.columns, s * z]);
  return out;
})();

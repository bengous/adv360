// @ts-check
// Geometry of the drawn keyboard, from the `schematic` block of data/keyboard.json.

/**
 * @typedef {[number, number]} Point
 * @typedef {{ position: string, col: number, row: number, w: number }} MainKey
 * @typedef {{ position: string, x: number, y: number, w: number, h: number }} ThumbKey
 * @typedef {{ indicator: string, x: number, y: number }} LedSpot
 * @typedef {{
 *   columns: { x: number[], stagger: number[] },
 *   main: MainKey[],
 *   thumb: { origin: number[], angle: number, keys: ThumbKey[] },
 *   leds: LedSpot[],
 *   mirror: Record<string, string>,
 *   gap: number,
 *   palm: number[][],
 *   pedal: { x: number, y: number, w: number, h: number }
 * }} Schematic
 * @typedef {{ position: string, cx: number, cy: number, w: number, h: number, angle: number }} PlacedKey
 * @typedef {{ indicator: string, cx: number, cy: number }} PlacedLed
 * @typedef {{
 *   keys: PlacedKey[],
 *   pedal: PlacedKey,
 *   leds: PlacedLed[],
 *   cases: Point[][],
 *   width: number,
 *   height: number
 * }} Placed
 */

/**
 * @param {PlacedKey} k
 * @returns {Point[]}
 */
export function corners(k) {
  const r = (k.angle * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);

  /** @type {Point[]} */
  const offsets = [
    [-k.w / 2, -k.h / 2],
    [k.w / 2, -k.h / 2],
    [k.w / 2, k.h / 2],
    [-k.w / 2, k.h / 2],
  ];

  return offsets.map(([dx, dy]) => [
    k.cx + dx * cos - dy * sin,
    k.cy + dx * sin + dy * cos,
  ]);
}

/**
 * @template T
 * @param {T[][]} lists
 * @returns {T[]}
 */
function flat(lists) {
  /** @type {T[]} */
  const all = [];

  for (const list of lists) {
    all.push(...list);
  }

  return all;
}

/** @type {(o: Point, a: Point, b: Point) => number} */
const cross = (o, a, b) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * One chain of Andrew's monotone hull, without its last point.
 * @param {Point[]} points
 * @returns {Point[]}
 */
function chain(points) {
  /** @type {Point[]} */
  const out = [];

  for (const p of points) {
    while (
      out.length >= 2 &&
      cross(out[out.length - 2] ?? p, out[out.length - 1] ?? p, p) <= 0
    ) {
      out.pop();
    }

    out.push(p);
  }

  return out.slice(0, -1);
}

/**
 * @param {Point[]} points
 * @returns {Point[]}
 */
function hull(points) {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  return chain(sorted).concat(chain(sorted.slice().reverse()));
}

/**
 * Maps a point of the thumb cluster's own frame onto the half.
 * @param {Schematic["thumb"]} thumb
 * @returns {(x: number, y: number) => Point}
 */
function thumbFrame(thumb) {
  const rad = (thumb.angle * Math.PI) / 180;
  const [ox = 0, oy = 0] = thumb.origin;

  return (x, y) => [
    ox + x * Math.cos(rad) - y * Math.sin(rad),
    oy + x * Math.sin(rad) + y * Math.cos(rad),
  ];
}

/**
 * The left half: main keys from their column, thumb keys and LEDs in the tilted thumb frame.
 * @param {Schematic} s
 */
function leftHalf(s) {
  const inThumb = thumbFrame(s.thumb);

  /** @type {PlacedKey[]} */
  const main = s.main.map((k) => ({
    position: k.position,
    cx: (s.columns.x[k.col] ?? 0) + k.w / 2,
    cy: k.row + (s.columns.stagger[k.col] ?? 0) + 0.5,
    w: k.w,
    h: 1,
    angle: 0,
  }));

  const thumb = s.thumb.keys.map((k) => {
    const [cx, cy] = inThumb(k.x + k.w / 2, k.y + k.h / 2);

    return {
      position: k.position,
      cx,
      cy,
      w: k.w,
      h: k.h,
      angle: s.thumb.angle,
    };
  });

  const leds = s.leds.map((l) => {
    const [cx, cy] = inThumb(l.x, l.y);

    return { indicator: l.indicator, cx, cy };
  });

  return { keys: main.concat(thumb), leds };
}

/**
 * @param {Record<string, string>} mirror
 * @param {string} name
 */
function mirrored(mirror, name) {
  const other = mirror[name];

  if (other === undefined) {
    throw new Error(`schematic: no mirror for ${name}`);
  }

  return other;
}

/**
 * Both halves: the right one reflects the left across a vertical axis `gap` units past its edge.
 * @param {Schematic} s
 */
function halves(s) {
  const left = leftHalf(s);
  const leftCorners = flat(left.keys.map(corners));
  const axis = 2 * Math.max(...leftCorners.map((c) => c[0])) + s.gap;

  const right = left.keys.map((k) =>
    Object.assign({}, k, {
      position: mirrored(s.mirror, k.position),
      cx: axis - k.cx,
      angle: -k.angle,
    }),
  );

  const rightLeds = left.leds.map((l) => ({
    indicator: mirrored(s.mirror, l.indicator),
    cx: axis - l.cx,
    cy: l.cy,
  }));

  /** @type {Point[]} */
  const palm = s.palm.map(([x = 0, y = 0]) => [x, y]);
  const caseLeft = hull(leftCorners.concat(palm));

  /** @type {Point[][]} */
  const cases = [caseLeft, caseLeft.map(([x, y]) => [axis - x, y])];

  return {
    keys: left.keys.concat(right),
    leds: left.leds.concat(rightLeds),
    cases,
  };
}

/**
 * The two halves, their cases and the pedal, in key units, shifted so the drawing starts at 0,0.
 * @param {Schematic} s
 * @returns {Placed}
 */
export function place(s) {
  const { keys, leds, cases } = halves(s);
  const p = s.pedal;

  const pedal = {
    position: "pedl",
    cx: p.x,
    cy: p.y,
    w: p.w,
    h: p.h,
    angle: 0,
  };

  const extent = flat(cases).concat(corners(pedal));
  const minX = Math.min(...extent.map((q) => q[0]));
  const minY = Math.min(...extent.map((q) => q[1]));

  /** @type {<T extends { cx: number, cy: number }>(o: T) => T} */
  const shift = (o) =>
    Object.assign({}, o, { cx: o.cx - minX, cy: o.cy - minY });

  return {
    keys: keys.map(shift),
    pedal: shift(pedal),
    leds: leds.map(shift),
    cases: cases.map((c) =>
      c.map(([x, y]) => /** @type {Point} */ ([x - minX, y - minY])),
    ),
    width: Math.max(...extent.map((q) => q[0])) - minX,
    height: Math.max(...extent.map((q) => q[1])) - minY,
  };
}

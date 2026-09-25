import { describe, expect, test } from "bun:test";

import keyboard from "../data/keyboard.json";
import { corners, place } from "./layout.mjs";
import type { Point } from "./layout.mjs";

function separated(a: Point[], b: Point[], axis: Point): boolean {
  const pa = a.map(([x, y]) => x * axis[0] + y * axis[1]);
  const pb = b.map(([x, y]) => x * axis[0] + y * axis[1]);

  return (
    Math.max(...pa) <= Math.min(...pb) + 1e-9 ||
    Math.max(...pb) <= Math.min(...pa) + 1e-9
  );
}

// Separating axis test on two convex quads; touching edges do not count.
function overlap(a: Point[], b: Point[]): boolean {
  const edges = [a, b].flatMap((quad) =>
    quad.map((p, i): Point => {
      const q = quad[(i + 1) % quad.length]!;

      return [q[1] - p[1], p[0] - q[0]];
    }),
  );

  return !edges.some((axis) => separated(a, b, axis));
}

const placed = place(keyboard.schematic);

const byPosition = new Map(placed.keys.map((k) => [k.position, k]));

describe("place", () => {
  test("given the schematic, then the 76 non-pedal positions are placed once each", () => {
    const expected = keyboard.keys
      .map((k) => k.position)
      .filter((p) => p !== "pedl");

    expect(placed.keys.map((k) => k.position).toSorted()).toEqual(
      expected.toSorted(),
    );
    expect(placed.pedal.position).toBe("pedl");
  });

  test("given the placed keys, then no two caps overlap", () => {
    const quads = placed.keys.map((k) => ({ k, quad: corners(k) }));

    const hits = quads.flatMap((a, i) =>
      quads
        .slice(i + 1)
        .filter((b) => overlap(a.quad, b.quad))
        .map((b) => `${a.k.position}/${b.k.position}`),
    );

    expect(hits).toEqual([]);
  });

  test("given a left key, then its mirror sits at the same height, reflected across the middle", () => {
    const pairs = Object.entries(keyboard.schematic.mirror)
      .filter(([left]) => byPosition.has(left))
      .map(([left, right]) => [byPosition.get(left)!, byPosition.get(right)!]);

    const off = pairs.filter(
      ([a, b]) =>
        Math.abs(a!.cx + b!.cx - placed.width) > 1e-9 ||
        JSON.stringify([a!.cy, a!.w, a!.h, -a!.angle]) !==
          JSON.stringify([b!.cy, b!.w, b!.h, b!.angle]),
    );

    expect(pairs).toHaveLength(38);
    expect(off).toEqual([]);
  });

  test("given the six indicators, then each LED sits above its thumb cluster, mirrored", () => {
    const leds = new Map(placed.leds.map((l) => [l.indicator, l]));

    expect([...leds.keys()].toSorted()).toEqual([
      "IND1",
      "IND2",
      "IND3",
      "IND4",
      "IND5",
      "IND6",
    ]);
    expect(leds.get("IND1")!.cy).toBeLessThan(byPosition.get("lctr")!.cy);
    expect(leds.get("IND1")!.cx + leds.get("IND6")!.cx).toBeCloseTo(
      placed.width,
      9,
    );
  });

  test("given the placed geometry, then everything lies inside width and height", () => {
    const points = [...placed.cases.flat(), ...placed.keys.flatMap(corners)];

    const outside = points.filter(
      ([x, y]) =>
        x < -1e-9 ||
        y < -1e-9 ||
        x > placed.width + 1e-9 ||
        y > placed.height + 1e-9,
    );

    expect(outside).toEqual([]);
  });

  test("given a mirror table without a thumb key, then place names the missing position", () => {
    const { lctr: _, ...mirror } = keyboard.schematic.mirror;

    expect(() => place({ ...keyboard.schematic, mirror })).toThrow(
      "schematic: no mirror for lctr",
    );
  });
});

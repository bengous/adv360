import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { effectiveLayer, parseEntry, parseLayout, serializeLayout } from "./layout.ts";

const REAL = join(import.meta.dir, "../../tests/fixtures/real/layouts");

describe("layout round-trip", () => {
  test("every real layout file (and the named backup) serializes byte-identical", async () => {
    const names = await readdir(REAL);
    expect(names.length).toBe(10);
    for (const name of names) {
      const text = await Bun.file(join(REAL, name)).text();
      expect(serializeLayout(parseLayout(text))).toBe(text);
      expect(parseLayout(text).eol).toBe("\r\n");
    }
  });

  test("mixed EOL keeps every line's own ending and reports the dominant one", () => {
    const text = "<base>\n[a]>[b]\r\n[c]>[d]\n";
    const layout = parseLayout(text);
    expect(serializeLayout(layout)).toBe(text);
    expect(layout.eol).toBe("\n");
    expect(parseLayout("<base>").eol).toBe("\r\n");
    expect(parseLayout("").lines).toEqual([]);
  });
});

describe("layout grammar", () => {
  test("remap, tap-and-hold, macro with prefixes and strokes", () => {
    expect(parseEntry("[caps]>[esc]")).toEqual({ kind: "remap", position: "caps", action: "esc" });
    expect(parseEntry("[caps]>[caps][t&h500][esc]")).toEqual({
      kind: "taphold", position: "caps", tap: "caps", ms: 500, hold: "esc",
    });
    expect(parseEntry("{lctr}{hk3}>{s5}{x1}{d125}{dran}{-lshf}{F6}{+lshf}")).toEqual({
      kind: "macro", trigger: "hk3", cotrigger: "lctr",
      tokens: ["s5", "x1", "d125", "dran", "-lshf", "F6", "+lshf"],
    });
    expect(parseEntry("{tab}>{h}{i}")).toEqual({ kind: "macro", trigger: "tab", cotrigger: null, tokens: ["h", "i"] });
  });

  test("headers are case-insensitive, unknown tokens stay as written, junk is unparsed", () => {
    expect(parseEntry("<KEYPAD>")).toEqual({ kind: "header", layer: "keypad" });
    expect(parseEntry("<layer9>")).toEqual({ kind: "unparsed" });
    expect(parseEntry("[rctr]>[caxx]")).toEqual({ kind: "remap", position: "rctr", action: "caxx" });
    expect(parseEntry("[a]>{b}")).toEqual({ kind: "unparsed" });
    expect(parseEntry("   ")).toEqual({ kind: "blank" });
    expect(parseEntry("*[a]>[b]")).toEqual({ kind: "disabled", inner: { kind: "remap", position: "a", action: "b" } });
  });
});

describe("effective layer", () => {
  const layout = parseLayout(
    [
      "[q]>[w]",
      "<base>",
      "[caps]>[esc]",
      "*[caps]>[tab]",
      "[CAPS]>[ent]",
      "{lctr}{hk3}>{a}",
      "{hk3}>{b}",
      "<keypad>",
      "[caps]>[f1]",
    ].join("\r\n") + "\r\n",
  );

  test("the last non-disabled line of the layer wins, keyed case-insensitively", () => {
    const base = effectiveLayer(layout, "base");
    expect(base.keys.get("caps")).toEqual({ line: 5, entry: { kind: "remap", position: "CAPS", action: "ent" } });
    expect(base.keys.has("q")).toBe(false);
    expect(effectiveLayer(layout, "keypad").keys.get("caps")?.entry).toEqual({ kind: "remap", position: "caps", action: "f1" });
  });

  test("macros are keyed by trigger and co-trigger", () => {
    const base = effectiveLayer(layout, "base");
    expect([...base.macros.keys()].sort()).toEqual(["hk3+", "hk3+lctr"]);
    expect(base.macros.get("hk3+lctr")?.line).toBe(6);
  });
});

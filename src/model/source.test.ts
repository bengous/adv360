import { describe, expect, test } from "bun:test";

import { CliError } from "../errors.ts";
import { kindOfName, parseProfile, relOf } from "./source.ts";

describe("profile", () => {
  test.each(["1", "9"])(
    "given %s, when parsing a profile, then it is accepted",
    (text) => {
      expect<number>(parseProfile(text)).toBe(Number(text));
    },
  );

  test.each(["0", "10", "1.5", "x", "", undefined])(
    "given %j, when parsing a profile, then it is bad-profile",
    (text) => {
      expect(() => parseProfile(text)).toThrow(CliError);
    },
  );
});

describe("file kinds", () => {
  test("given a profile, when naming its files, then layout and led have their own folder", () => {
    expect(relOf("layout", 3)).toBe("layouts/layout3.txt");
    expect(relOf("led", 3)).toBe("lighting/led3.txt");
  });

  test.each([
    ["/x/lighting/led1.txt", "led"],
    ["layout1.txt.backup", "layout"],
    ["/x/other.txt", "layout"],
  ])("given %s, when guessing its kind, then it is %s", (path, kind) => {
    expect<string>(kindOfName(path)).toBe(kind);
  });
});

import { describe, expect, test } from "bun:test";

import { tokenForKey } from "./press.mjs";

describe("tokenForKey", () => {
  test.each([
    [0x01000000, 9, "\u001B", "esc"],
    [0x01000004, 36, "\r", "ent"],
    [0x01000034, 71, "", "f5"],
    [0x01000047, 202, "", "f24"],
    [0x01000020, 50, "", "lshf"],
    [0x01000020, 62, "", "rshf"],
    [0x01000021, 105, "", "rctr"],
    [0x01000053, 133, "", "lwin"],
    [0x41, 38, "A", "a"],
    [0x37, 16, "7", "7"],
    [0x3f, 61, "?", "fsls"],
    [0x5c, 51, "\\", "bsls"],
    [0x20, 65, " ", "spc"],
    [0x2a, 63, "*", "kp*"],
    [0x2b, 86, "+", "kp+"],
    [0x31, 87, "1", "kp1"],
    [0x01000010, 79, "", "kp7"],
    [0x01000005, 104, "\r", "kpen"],
  ])(
    "given Qt key %p (scancode %p, text %p), then the token is %p",
    (key, scan, text, token) => {
      expect(tokenForKey(key, scan, text)).toBe(token);
    },
  );

  test("given a key tokens.json has no token for, then there is none", () => {
    expect(tokenForKey(0x01000100, 0, "é")).toBeNull();
  });
});

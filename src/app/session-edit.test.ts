import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { adv, mountFixture, setRemap } from "../testkit.ts";
import type { Fixture } from "../testkit.ts";

let fx: Fixture;

beforeEach(async () => {
  fx = await mountFixture();
});

const remap = (pos: string, action: string, layer = "base") =>
  setRemap(fx.deps, { profile: 9, layer, pos, action });

describe("session edits", () => {
  test("given a mounted drive, when setting a remap, then the session is dirty and lists the edit", async () => {
    const reply = await remap("caps", "esc");

    expect(reply.last).toEqual({
      profile: 9,
      state: "dirty",
      source: { dir: fx.mount, device: "/dev/fake" },
      layout: {
        edits: [
          { op: "set-remap", layer: "base", position: "caps", action: "esc" },
        ],
        renders: "layouts/layout9.txt",
      },
      led: null,
    });
  });

  test("given no drive, when making the first edit, then it is no-base", async () => {
    fx.deps.devices = [];

    expect((await remap("caps", "esc")).last["error"]).toBe("no-base");
  });

  test("given a layout without the layer header, when editing that layer, then it is layer-missing", async () => {
    await Bun.write(join(fx.mount, "layouts/layout9.txt"), "<base>\r\n");

    expect((await remap("a", "b", "fn3")).last).toMatchObject({
      error: "layer-missing",
      layer: "function3",
    });
  });

  test("given a session, when discarding, then the state is clean", async () => {
    await remap("caps", "esc");
    const reply = await adv(fx.deps, "session", "discard", "--profile", "9");

    expect(reply.last).toMatchObject({
      state: "clean",
      layout: null,
      led: null,
    });
  });
});

describe("session conflict", () => {
  beforeEach(async () => {
    await remap("caps", "esc");
    await Bun.write(
      join(fx.mount, "layouts/layout9.txt"),
      "<base>\r\n[q]>[w]\r\n",
    );
  });

  test("given a changed disk, when asking status, then the session is conflict", async () => {
    const status = await adv(fx.deps, "session", "status", "--profile", "9");

    expect(status.last["state"]).toBe("conflict");
  });

  test("given a conflict, when editing or applying, then both are session-conflict", async () => {
    const edit = await remap("a", "b");
    const apply = await adv(fx.deps, "apply", "--profile", "9");

    expect(edit.last["error"]).toBe("session-conflict");
    expect(apply.last["error"]).toBe("session-conflict");
  });

  test("given a conflict, when discarding, then editing works again", async () => {
    await adv(fx.deps, "session", "discard", "--profile", "9");

    expect((await remap("a", "b")).last["state"]).toBe("dirty");
  });
});

describe("session load-file", () => {
  test("given a led file, when loading it, then the kind is guessed from its name", async () => {
    const from = join(fx.mount, "lighting/led1.txt");

    const reply = await adv(
      fx.deps,
      "session",
      "load-file",
      "--profile",
      "3",
      "--from",
      from,
    );

    expect(reply.last).toMatchObject({
      state: "dirty",
      layout: null,
      led: { edits: [{ op: "replace-file" }] },
    });
  });

  test("given a missing file, when loading it, then it is file-missing", async () => {
    const reply = await adv(
      fx.deps,
      "session",
      "load-file",
      "--profile",
      "3",
      "--from",
      join(fx.root, "nope.txt"),
    );

    expect(reply.last["error"]).toBe("file-missing");
  });

  test("given a bad --kind, when loading a file, then it is a usage error", async () => {
    const from = join(fx.mount, "layouts/layout2.txt");

    const reply = await adv(
      fx.deps,
      "session",
      "load-file",
      "--profile",
      "3",
      "--from",
      from,
      "--kind",
      "bogus",
    );

    expect(reply.code).toBe(2);
  });
});

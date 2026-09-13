import { expect, test } from "bun:test";
import { join } from "node:path";

import { parseSettings } from "./settings.ts";

test("settings.txt yields the active profile and both firmware versions", async () => {
  const text = await Bun.file(
    join(import.meta.dir, "../../tests/fixtures/real/settings/settings.txt"),
  ).text();

  const settings = parseSettings(text);
  expect(settings.activeProfile).toBe(1);
  expect(settings.firmware).toEqual({ left: "1.0.69", right: "1.0.69" });
  expect(settings.raw["model"]).toBe("adv360");
  expect(parseSettings("").activeProfile).toBeNull();
});

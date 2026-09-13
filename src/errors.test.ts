import { expect, test } from "bun:test";
import { join } from "node:path";

import { ERROR_CODES } from "./errors.ts";

test("given the error codes, when reading docs/capabilities.md, then every code is documented", async () => {
  const doc = await Bun.file(
    join(import.meta.dir, "../docs/capabilities.md"),
  ).text();

  const undocumented = ERROR_CODES.filter(
    (code) => !doc.includes(`\`${code}\``),
  );

  expect(undocumented).toEqual([]);
});

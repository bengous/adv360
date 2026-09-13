import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 80,
  sortImports: true,
  ignorePatterns: [
    "tools/oxlint/anti-slop/**",
    // Byte-for-byte copies of the keyboard's files, CRLF included.
    "tests/fixtures/**",
    // Contract data read by the CLI, the GUI and the panel.
    "data/**",
    // A fragment spliced into Omarchy's menu file, not a JSONC document.
    "omarchy/menu-entry.jsonc",
    "research/**",
    "docs/**",
    "**/*.md",
    // Vendored copies, never edited here.
    ".claude/skills/**",
    ".claude/agents/**",
  ],
});

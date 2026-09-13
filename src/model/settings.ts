export type Settings = {
  activeProfile: number | null;
  firmware: { left: string | null; right: string | null };
  raw: Record<string, string>;
};

// Read only: the keyboard owns settings.txt.
export function parseSettings(text: string): Settings {
  const raw: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf("=");

    if (eq > 0) {
      raw[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }

  const profile = Number(raw["profile"]);

  return {
    activeProfile: Number.isInteger(profile) && profile >= 0 ? profile : null,
    firmware: { left: raw["kbd_fw_l"] ?? null, right: raw["kbd_fw_r"] ?? null },
    raw,
  };
}

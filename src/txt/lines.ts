export type Eol = "\r\n" | "\n";

export type RawLine = { raw: string; text: string };

export function splitLines(text: string): RawLine[] {
  const out: RawLine[] = [];
  let i = 0;

  while (i < text.length) {
    const nl = text.indexOf("\n", i);
    const raw = nl === -1 ? text.slice(i) : text.slice(i, nl + 1);
    out.push({ raw, text: raw.replace(/\r?\n$/, "") });
    i += raw.length;
  }

  return out;
}

// The keyboard writes CRLF; a file without any line break gets CRLF too.
export function dominantEol(lines: readonly RawLine[]): Eol {
  let crlf = 0;
  let lf = 0;

  for (const { raw } of lines) {
    if (raw.endsWith("\r\n")) {
      crlf++;
    } else if (raw.endsWith("\n")) {
      lf++;
    }
  }

  return lf > crlf ? "\n" : "\r\n";
}

export function joinLines(lines: readonly { raw: string }[]): string {
  return lines.map((l) => l.raw).join("");
}

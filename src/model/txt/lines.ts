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

// The capture groups of a match as a tuple of the pattern's arity; an optional
// group that did not take part reads as "".
export function groups(re: RegExp, text: string, n: 1): [string] | null;
export function groups(re: RegExp, text: string, n: 2): [string, string] | null;
export function groups(
  re: RegExp,
  text: string,
  n: 3,
): [string, string, string] | null;
export function groups(
  re: RegExp,
  text: string,
  n: 4,
): [string, string, string, string] | null;
export function groups(
  re: RegExp,
  text: string,
  n: 5,
): [string, string, string, string, string] | null;
export function groups(re: RegExp, text: string, n: number): string[] | null {
  const m = re.exec(text);

  return m === null
    ? null
    : m.slice(1, n + 1).map((g: string | undefined) => g ?? "");
}

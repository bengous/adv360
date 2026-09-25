// @ts-check
// Action tokens as the GUI shows and assigns them. Tokens stay opaque strings: nothing
// here refuses one, it only tells whether data/tokens.json knows it.

/**
 * @typedef {{ categories: { name: string, tokens: Record<string, string> }[] }} TokensJson
 */

/**
 * The label of every known action, keyed by its lower-case token.
 * @param {TokensJson} tokens
 * @returns {Record<string, string>}
 */
export function labels(tokens) {
  /** @type {Record<string, string>} */
  const out = {};

  for (const category of tokens.categories) {
    for (const token of Object.keys(category.tokens)) {
      out[token.toLowerCase()] = category.tokens[token] ?? token;
    }
  }

  return out;
}

/**
 * @param {string} token
 * @param {TokensJson} tokens
 */
export function isKnown(token, tokens) {
  const wanted = token.toLowerCase();

  return tokens.categories.some((c) =>
    Object.keys(c.tokens).some((t) => t.toLowerCase() === wanted),
  );
}

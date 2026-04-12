/**
 * Some LLMs emit `\\"` (two backslashes + quote) where JSON requires `"` for string
 * delimiters — often on album/track names. That is not valid JSON and breaks
 * `JSON.parse`. Replacing those sequences with a single `"` fixes the common case
 * without affecting valid `\"` escapes (single backslash + quote inside strings).
 */
export function repairMalformedLlmJsonQuotes(s: string): string {
  return s.replace(/\\\\"/g, '"');
}

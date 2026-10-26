// Counting text the way each platform counts it. No dependencies; runs in Node 18+ and modern browsers.

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/** Split text into graphemes (what a reader sees as one character). Falls back to code points. */
export function graphemes(text) {
  const s = String(text ?? '');
  if (!s) return [];
  return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
}

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
/** True when a grapheme is an emoji (including flags and keycaps). */
export function isEmoji(g) {
  return EMOJI_RE.test(g) || /⃣/.test(g);
}

// East Asian wide and fullwidth blocks: Hangul, CJK ideographs, kana, CJK symbols, fullwidth forms.
const WIDE = [[0x1100, 0x115F], [0x2E80, 0x303E], [0x3041, 0x33FF], [0x3400, 0x4DBF], [0x4E00, 0x9FFF],
  [0xA000, 0xA4CF], [0xA960, 0xA97F], [0xAC00, 0xD7A3], [0xF900, 0xFAFF], [0xFE30, 0xFE4F], [0xFF00, 0xFF60],
  [0xFFE0, 0xFFE6], [0x20000, 0x2FFFD], [0x30000, 0x3FFFD]];
/** True when a grapheme is a Chinese, Japanese or Korean (wide) character. */
export function isWide(g) {
  const cp = g.codePointAt(0);
  return WIDE.some(([a, b]) => cp >= a && cp <= b);
}

const encoder = new TextEncoder();
export const utf8Bytes = (s) => encoder.encode(String(s ?? '')).length;

// Links: http(s) URLs and bare www. hosts. X also treats some bare domains ("example.com") as links;
// those are not detected here, so a post full of bare domains may count slightly higher on X than here.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
export function findLinks(text) {
  return String(text ?? '').match(URL_RE) || [];
}

// X's published weighting (twitter-text v3 config): code points in these ranges weigh 1, every other
// code point weighs 2, any emoji weighs 2 however many code points it is built from, each link weighs 23.
const X_LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
function xWeighted(text) {
  const s = String(text ?? '').normalize('NFC');
  const links = findLinks(s);
  const rest = s.replace(URL_RE, '');
  let n = links.length * 23;
  for (const g of graphemes(rest)) {
    if (isEmoji(g)) { n += 2; continue; }
    for (const ch of g) {
      const cp = ch.codePointAt(0);
      n += X_LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
  }
  return n;
}

// Threads: "Text posts are limited to 500 characters", with emoji counted by their UTF-8 bytes.
function threadsCount(text) {
  let n = 0;
  for (const g of graphemes(text)) n += isEmoji(g) ? utf8Bytes(g) : Array.from(g).length;
  return n;
}

/**
 * Length of `text` in a platform's unit.
 * Units: codepoints, graphemes, utf8-bytes, utf16, x-weighted, threads,
 * and the ad-copy rules plain, wide (CJK counts 2), wide+emoji (CJK and emoji count 2).
 * `linkLength`, when given, makes every link count as that many characters (X ads).
 */
export function countText(text, unit = 'codepoints', { linkLength } = {}) {
  let s = String(text ?? '');
  let extra = 0;
  if (linkLength && unit !== 'x-weighted') {
    const links = findLinks(s);
    extra = links.length * linkLength;
    s = s.replace(URL_RE, '');
  }
  switch (unit) {
    case 'codepoints': return extra + Array.from(s).length;
    case 'graphemes':
    case 'plain': return extra + graphemes(s).length;
    case 'utf8-bytes': return extra + utf8Bytes(s);
    case 'utf16': return extra + s.length;
    case 'x-weighted': return xWeighted(s);
    case 'threads': return extra + threadsCount(s);
    case 'wide':
    case 'wide+emoji': {
      let n = 0;
      for (const g of graphemes(s)) n += (isWide(g) || (unit === 'wide+emoji' && isEmoji(g))) ? 2 : 1;
      return extra + n;
    }
    default: throw new Error(`Unknown unit "${unit}"`);
  }
}

/** Hashtags and @mentions in a caption. */
export function countTags(text) {
  const s = String(text ?? '');
  return {
    hashtags: (s.match(/(^|[^\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu) || []).length,
    mentions: (s.match(/(^|[^\p{L}\p{N}_.])@[\p{L}\p{N}_.]+/gu) || []).length,
    links: findLinks(s).length,
  };
}

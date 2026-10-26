import { textLimits, adCopy, placements, safeZones } from './data.js';
import { countText, countTags, findLinks, graphemes, isEmoji, isWide, utf8Bytes } from './count.js';

export { textLimits, adCopy, placements, safeZones };
export { countText, countTags, findLinks, graphemes, isEmoji, isWide, utf8Bytes };

const byId = (list, id, what) => {
  const row = list.find((r) => r.id === id);
  if (!row) throw new Error(`Unknown ${what} "${id}". Known: ${list.map((r) => r.id).join(', ')}`);
  return row;
};

/** One organic text limit by id, e.g. "instagram.caption". */
export const getTextLimit = (id) => byId(textLimits.limits, id, 'text limit');
/** One placement by id, e.g. "instagram-reel". */
export const getPlacement = (id) => byId(placements.placements, id, 'placement');
/** One safe-zone map by id, e.g. "tiktok". */
export const getSafeZone = (id) => byId(safeZones.zones, id, 'safe zone');
/** One ad platform by id, e.g. "google-search". */
export const getAdPlatform = (id) => byId(adCopy.platforms, id, 'ad platform');

/**
 * Check organic post text against one channel's limit.
 * @param {string} id   a text limit id, e.g. "x.post", "instagram.caption", "bluesky.post"
 * @param {string} text
 * @param {{ premium?: boolean }} [opts]  premium: the X account has Premium (raises the cap to 25,000)
 */
export function checkText(id, text, opts = {}) {
  const row = getTextLimit(id);
  const max = opts.premium && row.extended ? row.extended.max : row.max;
  const count = countText(text, row.unit);
  const problems = [];
  if (count > max) problems.push({ code: 'too-long', message: `${count} of ${max} (${row.unit}): ${count - max} over.` });
  if (row.maxBytes) {
    const bytes = utf8Bytes(text);
    if (bytes > row.maxBytes) problems.push({ code: 'too-many-bytes', message: `${bytes} of ${row.maxBytes} UTF-8 bytes.` });
  }
  const tags = countTags(text);
  if (row.maxHashtags != null && tags.hashtags > row.maxHashtags) problems.push({ code: 'too-many-hashtags', message: `${tags.hashtags} hashtags; the limit is ${row.maxHashtags}.` });
  if (row.maxMentions != null && tags.mentions > row.maxMentions) problems.push({ code: 'too-many-mentions', message: `${tags.mentions} mentions; the limit is ${row.maxMentions}.` });
  if (row.maxLinks != null) {
    const unique = new Set(findLinks(text)).size;
    if (unique > row.maxLinks) problems.push({ code: 'too-many-links', message: `${unique} links; the limit is ${row.maxLinks}.` });
  }
  return { id, platform: row.platform, field: row.field, ok: problems.length === 0, count, max, unit: row.unit, remaining: max - count, problems };
}

/**
 * Check one caption against every organic channel at once (body fields only by default; pass
 * `{ kinds: ['body', 'title', 'tags'] }` to include title and tag fields). One result per limit.
 */
export function checkEverywhere(text, opts = {}) {
  const kinds = opts.kinds || ['body'];
  return textLimits.limits.filter((row) => kinds.includes(row.kind)).map((row) => checkText(row.id, text, opts));
}

/**
 * Check ad copy against one platform field.
 * status: "ok", "may-truncate" (past the recommended length, still accepted) or "over" (past a hard cap).
 * @param {string} platformId e.g. "google-search", "meta", "linkedin"
 * @param {string} fieldId    e.g. "headline", "primary-text"
 */
export function checkAdCopy(platformId, fieldId, text) {
  const p = getAdPlatform(platformId);
  const f = byId(p.fields, fieldId, `${platformId} field`);
  const count = countText(text, f.rule || 'plain', { linkLength: f.linkLength });
  const over = f.max != null && count > f.max;
  const long = f.recommended != null && count > f.recommended;
  return {
    platform: platformId, field: fieldId, name: `${p.name}: ${f.name}`,
    ok: !over, status: over ? 'over' : long ? 'may-truncate' : 'ok',
    count, max: f.max ?? null, recommended: f.recommended ?? null, rule: f.rule || 'plain',
    source: f.source || p.source,
  };
}

/** "4:5" -> 0.8, "1.91:1" -> 1.91, 0.8 -> 0.8 */
export function parseRatio(r) {
  if (typeof r === 'number') return r;
  const [a, b] = String(r).split(':').map(Number);
  if (!a || !b) throw new Error(`Not a ratio: "${r}"`);
  return a / b;
}

/** The centred crop of a width x height frame to `ratio`: what is kept and the fraction of the frame lost. */
export function centerCrop(width, height, ratio) {
  const t = parseRatio(ratio), r = width / height;
  if (Math.abs(r - t) / t < 1e-6) return { x: 0, y: 0, width, height, lost: 0 };
  if (r > t) { const w = Math.round(height * t); return { x: Math.round((width - w) / 2), y: 0, width: w, height, lost: 1 - w / width }; }
  const h = Math.round(width / t); return { x: 0, y: Math.round((height - h) / 2), width, height: h, lost: 1 - h / height };
}

const TOL = 0.01;
const mb = (n) => `${Math.round(n / 1048576 * 10) / 10} MB`;

/**
 * Check an image or video against a placement.
 * @param {string} id placement id
 * @param {{ width: number, height: number, type?: 'image'|'video', bytes?: number, durationSeconds?: number }} media
 * @returns {{ ok: boolean, placement: string, issues: {level:'error'|'warning', code:string, message:string}[], export: {width:number,height:number}, crop: object|null }}
 */
export function checkMedia(id, media) {
  const p = getPlacement(id);
  const { width: w, height: h } = media;
  if (!(w > 0 && h > 0)) throw new Error('checkMedia needs a positive width and height');
  const type = media.type || 'image';
  const issues = [];
  const err = (code, message) => issues.push({ level: 'error', code, message });
  const warn = (code, message) => issues.push({ level: 'warning', code, message });
  const r = w / h;
  let crop = null;

  if (!p.media.includes(type)) err('wrong-media', `${p.name} takes ${p.media.join(' or ')}, not ${type}.`);

  if (p.aspect) {
    const { min, max, outside, recommended } = p.aspect;
    const inside = r >= min * (1 - TOL) && r <= max * (1 + TOL);
    if (!inside) {
      const target = r < min ? min : max;
      crop = centerCrop(w, h, target);
      const pct = Math.round(crop.lost * 1000) / 10;
      if (outside === 'refuse') err('shape-refused', `Accepts ${fmtRange(min, max)}; this is ${ratioLabel(r)}.`);
      else if (outside === 'crop') warn('will-crop', `Outside ${fmtRange(min, max)}: about ${pct}% of the frame is cropped.`);
      else warn('letterbox', `Not ${recommended}: shown with bars or cropped to fill the screen.`);
    } else if (Math.abs(r - parseRatio(recommended)) / parseRatio(recommended) > TOL) {
      warn('not-recommended-shape', `Accepted, but ${recommended} is recommended.`);
    }
  }
  if (p.shapes) {
    const hit = p.shapes.find((s) => Math.abs(r - parseRatio(s.ratio)) / parseRatio(s.ratio) <= TOL);
    if (!hit) {
      const list = p.shapes.map((s) => s.ratio).join(', ');
      if (p.shapesAreRecommendations) warn('not-recommended-shape', `Recommended shapes are ${list}.`);
      else err('shape-refused', `Takes ${list} only.`);
    } else if (!p.shapesAreRecommendations && (w < hit.minWidth || h < hit.minHeight)) {
      err('too-small', `${hit.ratio} needs at least ${hit.minWidth} x ${hit.minHeight}.`);
    }
  }
  if (p.minWidth && w < p.minWidth) err('too-small', `At least ${p.minWidth} px wide; this is ${w}.`);
  if (p.minHeight && h < p.minHeight) err('too-small', `At least ${p.minHeight} px tall; this is ${h}.`);
  if (p.minShortSide && Math.min(w, h) < p.minShortSide) err('too-small', `The short side must be at least ${p.minShortSide} px.`);
  if (p.maxLongSide && Math.max(w, h) > p.maxLongSide) err('too-large-dimensions', `The long side must be at most ${p.maxLongSide} px.`);

  const cap = type === 'video' ? p.maxVideoBytes : p.maxImageBytes;
  if (media.bytes != null && cap && media.bytes > cap) err('file-too-large', `${mb(media.bytes)} is over the ${mb(cap)} limit.`);
  if (type === 'video' && media.durationSeconds != null) {
    if (p.maxDurationSeconds && media.durationSeconds > p.maxDurationSeconds) err('too-long', `${media.durationSeconds}s is over the ${p.maxDurationSeconds}s limit.`);
    if (p.minDurationSeconds && media.durationSeconds < p.minDurationSeconds) err('too-short', `At least ${p.minDurationSeconds}s.`);
  }
  return { ok: !issues.some((i) => i.level === 'error'), placement: id, name: p.name, issues, export: p.export, crop, source: p.source };
}

function round(x) { return Math.round(x * 100) / 100; }
const NAMED = [['9:16', 9 / 16], ['2:3', 2 / 3], ['3:4', 3 / 4], ['4:5', 4 / 5], ['1:1', 1], ['16:9', 16 / 9], ['1.91:1', 1.91], ['3:1', 3]];
function ratioLabel(x) { const n = NAMED.find(([, v]) => Math.abs(x - v) / v < 0.005); return n ? n[0] : `${round(x)}:1`; }
function fmtRange(min, max) { return min === max ? ratioLabel(min) : `${ratioLabel(min)} to ${ratioLabel(max)}`; }

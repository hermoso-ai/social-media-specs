import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  textLimits, adCopy, placements, safeZones,
  countText, checkText, checkEverywhere, checkAdCopy, checkMedia, centerCrop, parseRatio,
} from '../src/index.js';

const json = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));

test('src/data.js matches data/*.json', () => {
  assert.deepEqual(textLimits, json('text-limits.json'));
  assert.deepEqual(adCopy, json('ad-copy.json'));
  assert.deepEqual(placements, json('placements.json'));
  assert.deepEqual(safeZones, json('safe-zones.json'));
});

test('every row is well formed and ids are unique', () => {
  const units = new Set(Object.keys(textLimits.units));
  const ids = new Set();
  for (const r of textLimits.limits) {
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`); ids.add(r.id);
    assert.ok(Number.isInteger(r.max) && r.max > 0, r.id);
    assert.ok(units.has(r.unit), `${r.id} unit ${r.unit} is not described in units`);
    assert.ok(Object.keys(textLimits.kinds).includes(r.kind), `${r.id} kind`);
    assert.ok(r.source === null || /^https:\/\//.test(r.source), r.id);
    assert.ok(r.source !== null || r.notes, `${r.id} has no source, so it must explain itself in notes`);
  }
  for (const p of adCopy.platforms) {
    assert.match(p.source, /^https:\/\//);
    for (const f of p.fields) {
      assert.ok(f.max != null || f.recommended != null, `${p.id}.${f.id} has neither max nor recommended`);
      assert.ok(Object.keys(adCopy.rules).includes(f.rule), `${p.id}.${f.id} rule`);
      if (f.max != null && f.recommended != null) assert.ok(f.recommended <= f.max, `${p.id}.${f.id}`);
    }
  }
  const zoneIds = new Set(safeZones.zones.map((z) => z.id));
  for (const p of placements.placements) {
    assert.match(p.source, /^https:\/\//, p.id);
    assert.ok(p.aspect || p.shapes, `${p.id} needs aspect or shapes`);
    if (p.aspect) {
      assert.ok(p.aspect.min <= p.aspect.max, p.id);
      const rec = parseRatio(p.aspect.recommended);
      assert.ok(rec >= p.aspect.min * 0.99 && rec <= p.aspect.max * 1.01, `${p.id} recommended shape outside its own range`);
      assert.ok(['crop', 'refuse', 'letterbox'].includes(p.aspect.outside), p.id);
    }
    if (p.safeZone) assert.ok(zoneIds.has(p.safeZone), `${p.id} names unknown safe zone ${p.safeZone}`);
  }
  for (const z of safeZones.zones) {
    for (const b of [...(z.blocked || []), ...(z.safe ? [z.safe] : [])]) {
      const [x, y, w, h] = b.box;
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.0001 && y + h <= 1.0001, `${z.id} ${b.label}`);
    }
  }
});

test('counting units', () => {
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  assert.equal(countText(family, 'graphemes'), 1);
  assert.equal(countText(family, 'codepoints'), 5);
  assert.equal(countText('é', 'utf8-bytes'), 2);
  assert.equal(countText('日本', 'utf8-bytes'), 6);
  assert.equal(countText('😀', 'utf16'), 2);
  assert.equal(countText('日本語', 'wide'), 6);
  assert.equal(countText('ab😀', 'wide'), 3);
  assert.equal(countText('ab😀', 'wide+emoji'), 4);
  assert.equal(countText('hi 😀', 'threads'), 3 + 4);
});

test('X weighting: links are 23, CJK and emoji are 2', () => {
  assert.equal(countText('hello', 'x-weighted'), 5);
  assert.equal(countText('see https://example.com/a/very/long/path/that/goes/on', 'x-weighted'), 4 + 23);
  assert.equal(countText('日本', 'x-weighted'), 4);
  assert.equal(countText('\u{1F468}‍\u{1F469}‍\u{1F467}', 'x-weighted'), 2);
  assert.equal(checkText('x.post', 'a'.repeat(280)).ok, true);
  assert.equal(checkText('x.post', 'a'.repeat(281)).ok, false);
  assert.equal(checkText('x.post', 'a'.repeat(281), { premium: true }).ok, true);
});

test('Bluesky enforces graphemes and bytes', () => {
  assert.equal(checkText('bluesky.post', 'a'.repeat(300)).ok, true);
  assert.equal(checkText('bluesky.post', 'a'.repeat(301)).ok, false);
  const r = checkText('bluesky.post', '\u{1F468}‍\u{1F469}‍\u{1F467}'.repeat(200));
  assert.equal(r.count, 200);
  assert.ok(r.problems.some((p) => p.code === 'too-many-bytes'));
});

test('Instagram hashtag cap and Threads link cap', () => {
  const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
  assert.ok(checkText('instagram.caption', tags).problems.some((p) => p.code === 'too-many-hashtags'));
  const links = Array.from({ length: 6 }, (_, i) => `https://e.com/${i}`).join(' ');
  assert.ok(checkText('threads.post', links).problems.some((p) => p.code === 'too-many-links'));
});

test('checkEverywhere returns one row per limit', () => {
  const rows = checkEverywhere('x'.repeat(600));
  assert.equal(rows.length, textLimits.limits.filter((r) => r.kind === 'body').length);
  assert.equal(checkEverywhere('x', { kinds: ['body', 'title', 'tags'] }).length, textLimits.limits.length);
  assert.ok(!rows.some((r) => r.id === 'youtube.title'));
  assert.equal(rows.find((r) => r.id === 'threads.post').ok, false);
  assert.equal(rows.find((r) => r.id === 'instagram.caption').ok, true);
});

test('ad copy: hard caps, recommendations and CJK', () => {
  assert.equal(checkAdCopy('google-search', 'headline', 'a'.repeat(30)).status, 'ok');
  assert.equal(checkAdCopy('google-search', 'headline', 'a'.repeat(31)).status, 'over');
  assert.equal(checkAdCopy('google-search', 'headline', '日'.repeat(16)).status, 'over');
  assert.equal(checkAdCopy('meta', 'primary-text', 'a'.repeat(400)).status, 'may-truncate');
  assert.equal(checkAdCopy('meta', 'primary-text', 'a'.repeat(400)).ok, true);
  assert.equal(checkAdCopy('x', 'post-text', `${'a'.repeat(256)} https://example.com/${'p'.repeat(80)}`).count, 280);
  assert.throws(() => checkAdCopy('meta', 'nope', 'x'), /Unknown/);
});

test('media checks', () => {
  assert.equal(checkMedia('instagram-reel', { width: 1080, height: 1920, type: 'video' }).issues.length, 0);
  assert.equal(checkMedia('instagram-reel', { width: 1080, height: 1920, type: 'image' }).ok, false);
  const sq = checkMedia('instagram-post-api', { width: 1080, height: 1440 });
  assert.equal(sq.ok, false);
  assert.equal(sq.issues[0].code, 'shape-refused');
  const app = checkMedia('instagram-post', { width: 1080, height: 1440 });
  assert.equal(app.ok, true);
  const tall = checkMedia('instagram-post', { width: 1080, height: 1920 });
  assert.equal(tall.ok, true);
  assert.equal(tall.issues[0].code, 'will-crop');
  assert.ok(Math.abs(tall.crop.lost - 0.25) < 0.001);
  assert.equal(checkMedia('tiktok-infeed-ad', { width: 500, height: 888, type: 'video' }).ok, false);
  assert.equal(checkMedia('tiktok-infeed-ad', { width: 1080, height: 1350, type: 'video' }).ok, false);
  assert.equal(checkMedia('youtube-short', { width: 1920, height: 1080, type: 'video' }).ok, false);
  assert.equal(checkMedia('youtube-thumbnail', { width: 1280, height: 720, bytes: 60 * 1048576 }).issues[0].code, 'file-too-large');
  assert.equal(checkMedia('meta-reels-ad', { width: 1440, height: 2560, type: 'video', durationSeconds: 1000 }).issues[0].code, 'too-long');
});

test('centerCrop', () => {
  const sq = centerCrop(1080, 1080, '4:5');
  assert.deepEqual([sq.x, sq.y, sq.width, sq.height], [108, 0, 864, 1080]);
  assert.ok(Math.abs(sq.lost - 0.2) < 1e-9);
  assert.equal(centerCrop(1080, 1350, '4:5').lost, 0);
  const c = centerCrop(1920, 1080, '9:16');
  assert.equal(c.width, 608);
  assert.equal(c.height, 1080);
  assert.equal(c.x, 656);
});

// Regenerates the tables in README.md between the <!-- tables:start --> and <!-- tables:end --> markers
// from data/*.json, so the README can never disagree with the data. `--check` fails when they differ (CI).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(path.join(root, 'data', f), 'utf8'));
const text = read('text-limits.json'), ads = read('ad-copy.json'), media = read('placements.json');
const n = (x) => x.toLocaleString('en-US');
const mb = (b) => (b >= 1073741824 ? `${n(Math.round(b / 1073741824))} GB` : `${n(Math.round(b / 1048576))} MB`);
const dur = (s) => (s >= 60 ? `${n(Math.round(s / 60))} min` : `${s} s`);
const link = (u) => (u ? `[source](${u})` : 'see notes');

const lines = [];
lines.push('### Post text', '', '| Channel | Field | Limit | Counted in | Source |', '|---|---|---:|---|---|');
for (const r of text.limits) {
  const extra = [r.extended && `${n(r.extended.max)} with ${r.extended.when.replace('the posting account has ', '')}`,
    r.maxBytes && `and ${n(r.maxBytes)} bytes`, r.maxHashtags && `${r.maxHashtags} hashtags`, r.maxMentions && `${r.maxMentions} mentions`,
    r.maxLinks && `${r.maxLinks} links`].filter(Boolean).join(', ');
  lines.push(`| ${r.platform} | ${r.field} | ${n(r.max)}${extra ? ` (${extra})` : ''} | ${r.unit} | ${link(r.source)} |`);
}
lines.push('', '### Ad copy', '', '| Platform | Field | Hard limit | Recommended | Source |', '|---|---|---:|---:|---|');
for (const p of ads.platforms) for (const f of p.fields) {
  const rule = f.rule === 'wide' ? ' (CJK counts 2)' : f.rule === 'wide+emoji' ? ' (CJK and emoji count 2)' : f.linkLength ? ` (links count ${f.linkLength})` : '';
  lines.push(`| ${p.name} | ${f.name}${rule} | ${f.max != null ? n(f.max) : '-'} | ${f.recommended != null ? n(f.recommended) : '-'} | ${link(f.source || p.source)} |`);
}
lines.push('', '### Images and video', '', '| Placement | Export at | Shape | Max file | Max length | Source |', '|---|---|---|---|---|---|');
for (const p of media.placements) {
  const shape = p.aspect ? (p.aspect.min === p.aspect.max ? p.aspect.recommended : `${p.aspect.recommended} (accepts ${ratio(p.aspect.min)} to ${ratio(p.aspect.max)})`) : p.shapes.map((s) => s.ratio).join(', ');
  const file = [p.maxImageBytes && `image ${mb(p.maxImageBytes)}`, p.maxVideoBytes && `video ${mb(p.maxVideoBytes)}`].filter(Boolean).join(', ') || '-';
  lines.push(`| ${p.name} | ${p.export.width} x ${p.export.height} | ${shape} | ${file} | ${p.maxDurationSeconds ? dur(p.maxDurationSeconds) : '-'} | ${link(p.source)} |`);
}
function ratio(x) {
  const named = [['9:16', 9 / 16], ['2:3', 2 / 3], ['3:4', 0.75], ['4:5', 0.8], ['1:1', 1], ['16:9', 16 / 9], ['1.91:1', 1.91], ['3:1', 3]];
  const m = named.find(([, v]) => Math.abs(x - v) / v < 0.005); return m ? m[0] : `${x}:1`;
}

const file = path.join(root, 'README.md');
const readme = readFileSync(file, 'utf8');
const re = /(<!-- tables:start -->\n)[\s\S]*?(<!-- tables:end -->)/;
if (!re.test(readme)) { console.error('README.md has no tables markers'); process.exit(1); }
const next = readme.replace(re, `$1${lines.join('\n')}\n$2`);
if (process.argv.includes('--check')) {
  if (next !== readme) { console.error('README tables are out of date: run `npm run readme`.'); process.exit(1); }
  console.log('README tables are up to date.');
} else { writeFileSync(file, next); console.log('README tables written'); }

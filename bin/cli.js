#!/usr/bin/env node
import {
  textLimits, adCopy, placements, safeZones,
  checkText, checkEverywhere, checkAdCopy, checkMedia,
} from '../src/index.js';

const HELP = `social-media-specs: check post text, ad copy and media sizes against each platform's real limits.

Usage
  social-media-specs fit "<text>"                     check one caption against every channel
  social-media-specs text <limit-id> "<text>"         e.g. text x.post "Hello"
  social-media-specs ad <platform>.<field> "<text>"   e.g. ad google-search.headline "Free shipping"
  social-media-specs media <placement> <W>x<H> [--video] [--bytes N] [--seconds S]
  social-media-specs list [text|ads|media|zones]

Text can also be piped in: cat caption.txt | social-media-specs fit
Flags: --premium (X Premium account), --json (machine-readable output)
Exit code 1 when something is over a limit.`;

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return undefined; argv.splice(i, 1); return true; };
const opt = (name) => { const i = argv.indexOf(name); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const asJson = flag('--json');
const premium = flag('--premium');
const video = flag('--video');
const bytes = opt('--bytes');
const seconds = opt('--seconds');
const [cmd, ...rest] = argv;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c(32, s), red = (s) => c(31, s), yellow = (s) => c(33, s), dim = (s) => c(2, s), bold = (s) => c(1, s);

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s.replace(/\n$/, '');
}
const out = (obj, text) => { console.log(asJson ? JSON.stringify(obj, null, 2) : text); };
const pad = (s, n) => String(s).padEnd(n);

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }

  if (cmd === 'list') {
    const what = rest[0] || 'all';
    const lines = [];
    if (what === 'all' || what === 'text') { lines.push(bold('Text limits')); for (const r of textLimits.limits) lines.push(`  ${pad(r.id, 26)} ${pad(r.max.toLocaleString('en-US'), 7)} ${dim(r.unit)}`); }
    if (what === 'all' || what === 'ads') { lines.push(bold('Ad copy')); for (const p of adCopy.platforms) for (const f of p.fields) lines.push(`  ${pad(`${p.id}.${f.id}`, 34)} ${f.max != null ? `max ${f.max}` : ''}${f.recommended != null ? `${f.max != null ? ', ' : ''}recommended ${f.recommended}` : ''}`); }
    if (what === 'all' || what === 'media') { lines.push(bold('Placements')); for (const p of placements.placements) lines.push(`  ${pad(p.id, 22)} ${pad(`${p.export.width} x ${p.export.height}`, 13)} ${dim(p.name)}`); }
    if (what === 'all' || what === 'zones') { lines.push(bold('Safe zones')); for (const z of safeZones.zones) lines.push(`  ${pad(z.id, 24)} ${dim(z.name)}`); }
    console.log(lines.join('\n'));
    return 0;
  }

  if (cmd === 'fit') {
    const text = rest.length ? rest.join(' ') : await readStdin();
    const results = checkEverywhere(text, { premium });
    const lines = results.map((r) => {
      const mark = r.ok ? green('✓') : red('✗');
      const n = `${r.count.toLocaleString('en-US')} / ${r.max.toLocaleString('en-US')}`;
      return `${mark} ${pad(`${r.platform} ${r.field.toLowerCase()}`, 38)} ${pad(n, 15)} ${r.ok ? '' : red(r.problems.map((p) => p.message).join(' '))}`;
    });
    const bad = results.filter((r) => !r.ok).length;
    lines.push('', bad ? red(`Too long for ${bad} of ${results.length}.`) : green('Fits every channel.'));
    out(results, lines.join('\n'));
    return bad ? 1 : 0;
  }

  if (cmd === 'text') {
    const [id, ...words] = rest;
    const text = words.length ? words.join(' ') : await readStdin();
    const r = checkText(id, text, { premium });
    out(r, `${r.ok ? green('✓ fits') : red('✗ over')}  ${r.platform} ${r.field}: ${r.count} of ${r.max} ${dim(`(${r.unit})`)}${r.problems.length ? '\n  ' + r.problems.map((p) => p.message).join('\n  ') : ''}`);
    return r.ok ? 0 : 1;
  }

  if (cmd === 'ad') {
    const [key, ...words] = rest;
    const dot = (key || '').indexOf('.');
    if (dot < 1) throw new Error('Use <platform>.<field>, e.g. google-search.headline (see `list ads`).');
    const text = words.length ? words.join(' ') : await readStdin();
    const r = checkAdCopy(key.slice(0, dot), key.slice(dot + 1), text);
    const label = r.status === 'ok' ? green('✓ fits') : r.status === 'over' ? red('✗ over') : yellow('! may be cut off');
    const lim = [r.max != null && `max ${r.max}`, r.recommended != null && `recommended ${r.recommended}`].filter(Boolean).join(', ');
    out(r, `${label}  ${r.name}: ${r.count} ${dim(`(${lim})`)}`);
    return r.ok ? 0 : 1;
  }

  if (cmd === 'media') {
    const [id, size] = rest;
    const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(size || '');
    if (!id || !m) throw new Error('Use: media <placement> <W>x<H>, e.g. media instagram-reel 1080x1920');
    const r = checkMedia(id, {
      width: +m[1], height: +m[2], type: video ? 'video' : 'image',
      bytes: bytes != null ? +bytes : undefined, durationSeconds: seconds != null ? +seconds : undefined,
    });
    const head = `${r.ok ? (r.issues.length ? yellow('! fits, with notes') : green('✓ fits')) : red('✗ will not work')}  ${r.name} ${dim(`(export ${r.export.width} x ${r.export.height})`)}`;
    const body = r.issues.map((i) => `  ${i.level === 'error' ? red('error') : yellow('note ')}  ${i.message}`).join('\n');
    out(r, body ? `${head}\n${body}` : head);
    return r.ok ? 0 : 1;
  }

  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  return 2;
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(red(e.message)); process.exitCode = 2; });

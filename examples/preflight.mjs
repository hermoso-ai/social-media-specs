// Check a post before you schedule it: caption length on every channel, plus the image size for each placement.
// Run: node examples/preflight.mjs
import { checkEverywhere, checkMedia } from 'social-media-specs';

const post = {
  caption: 'Our summer collection is here. Linen shirts in six colours, made to be lived in. 🌊 https://example.com/summer',
  image: { width: 1080, height: 1440 },
  channels: ['instagram.caption', 'threads.post', 'x.post', 'linkedin.post'],
  placements: ['instagram-post', 'instagram-post-api', 'linkedin-image', 'pinterest-pin'],
};

for (const r of checkEverywhere(post.caption).filter((r) => post.channels.includes(r.id))) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.platform}: ${r.count}/${r.max}`, r.problems.map((p) => p.message).join(' '));
}
for (const id of post.placements) {
  const r = checkMedia(id, post.image);
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`, r.issues.map((i) => i.message).join(' '));
}

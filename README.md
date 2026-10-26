# social-media-specs

[![CI](https://github.com/hermoso-ai/social-media-specs/actions/workflows/ci.yml/badge.svg)](https://github.com/hermoso-ai/social-media-specs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/social-media-specs)](https://www.npmjs.com/package/social-media-specs)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Every social and ad platform's real limits, as data you can import: caption and ad-copy lengths **counted the way each
platform counts them**, image and video sizes, aspect ratios, file and duration caps, and the safe zones each app paints
its buttons over. Every number links to the platform page it came from. Zero dependencies, typed, with a CLI.

![The social-media-specs CLI checking a caption against 13 channels, an ad headline and an image size](assets/demo.gif)

## Why another list of social media sizes?

Most "character limit" tables are copied from each other and count wrong. A plain `.length` is wrong almost everywhere:

- **X** weighs text: a link is always 23, Chinese, Japanese, Korean and every emoji count 2.
- **Bluesky** has two caps at once: 300 graphemes *and* 3,000 UTF-8 bytes.
- **Threads** counts each emoji by its UTF-8 bytes, so one emoji uses about 4 of the 500, and allows 5 links.
- **TikTok** has a 2,200 cap for a video caption and 4,000 for a photo post, so swapping the media can break a caption.
- **Telegram** drops from 4,096 to 1,024 the moment a photo is attached.
- **Google Ads and Microsoft Ads** count CJK characters (and on Microsoft, emoji) as 2 in a 30-character headline.
- **Instagram** accepts a 3:4 post from the app and refuses the same image through the publishing API, which stops at 4:5.

This package encodes those rules, says where each one comes from, and is tested.

## Install

```bash
npm install social-media-specs
```

Or use the data without installing anything: the JSON lives in [`data/`](data) and is served by any npm CDN, for
example `https://cdn.jsdelivr.net/npm/social-media-specs/data/placements.json`.

## CLI

```bash
npx social-media-specs fit "Your caption here"                 # every channel at once
npx social-media-specs text bluesky.post "Your post"           # one channel
npx social-media-specs ad meta.primary-text "Your ad text"     # ad copy, hard caps and recommended lengths
npx social-media-specs media tiktok-infeed-ad 1080x1920 --video --seconds 45
npx social-media-specs list                                    # every id
cat caption.txt | npx social-media-specs fit --json            # pipe text in, get JSON out
```

The exit code is 1 when something is over a limit, so it drops straight into a pre-publish script or a CI step.

## Library

```js
import { checkText, checkEverywhere, checkAdCopy, checkMedia, countText } from 'social-media-specs';

checkText('x.post', 'Read this https://example.com/a/very/long/link');
// { ok: true, count: 33, max: 280, unit: 'x-weighted', remaining: 247, problems: [] , ... }

checkEverywhere(caption).filter((r) => !r.ok).map((r) => r.platform);
// [ 'X', 'Bluesky' ]

checkAdCopy('google-search', 'headline', 'Breathable Linen Shirts for Summer');
// { status: 'over', count: 34, max: 30, ... }

checkMedia('instagram-post-api', { width: 1080, height: 1440 });
// { ok: false, issues: [{ level: 'error', code: 'shape-refused', message: 'Accepts 4:5 to 1.91:1; this is 3:4.' }], export: { width: 1080, height: 1350 }, crop: {...} }

countText('👨‍👩‍👧', 'graphemes');  // 1
countText('👨‍👩‍👧', 'codepoints'); // 5
```

Everything is also exported as plain data: `textLimits`, `adCopy`, `placements`, `safeZones`. Full types are in
[`index.d.ts`](index.d.ts). [`examples/preflight.mjs`](examples/preflight.mjs) checks a post's caption and image for
four channels before it is scheduled.

### Safe zones

`safeZones` gives the boxes each app draws its UI over, as fractions of the frame (`[x, y, width, height]`), for
TikTok, Instagram Reels, YouTube Shorts, Meta Story and Reels ads, and the YouTube banner. Multiply by your canvas
size to draw an overlay or to check that your text and product stay clear.

## The data

<!-- tables:start -->
### Post text

| Channel | Field | Limit | Counted in | Source |
|---|---|---:|---|---|
| X | Post text | 280 (25,000 with X Premium) | x-weighted | [source](https://docs.x.com/fundamentals/counting-characters) |
| Threads | Post text | 500 (5 links) | threads | [source](https://developers.facebook.com/docs/threads/posts) |
| Instagram | Caption | 2,200 (30 hashtags, 20 mentions) | codepoints | [source](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media) |
| Facebook | Post text | 63,206 | codepoints | see notes |
| LinkedIn | Post text | 3,000 | codepoints | [source](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) |
| Pinterest | Pin title | 100 | codepoints | [source](https://developers.pinterest.com/docs/api/v5/pins-create) |
| Pinterest | Pin description | 800 | codepoints | [source](https://developers.pinterest.com/docs/api/v5/pins-create) |
| YouTube | Video title | 100 | codepoints | [source](https://developers.google.com/youtube/v3/docs/videos) |
| YouTube | Description | 5,000 | utf8-bytes | [source](https://developers.google.com/youtube/v3/docs/videos) |
| YouTube | Tags, combined | 500 | codepoints | [source](https://developers.google.com/youtube/v3/docs/videos) |
| TikTok | Video caption | 2,200 | utf16 | [source](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post) |
| TikTok | Photo post title | 90 | utf16 | [source](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post) |
| TikTok | Photo post caption | 4,000 | utf16 | [source](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post) |
| Bluesky | Post text | 300 (and 3,000 bytes) | graphemes | [source](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/feed/post.json) |
| Telegram | Text message | 4,096 | utf16 | [source](https://core.telegram.org/bots/api#sendmessage) |
| Telegram | Caption with media | 1,024 | utf16 | [source](https://core.telegram.org/bots/api#sendphoto) |
| Google Business Profile | Post text | 1,500 | codepoints | see notes |

### Ad copy

| Platform | Field | Hard limit | Recommended | Source |
|---|---|---:|---:|---|
| Google Ads responsive search ad | Headline (CJK counts 2) | 30 | - | [source](https://support.google.com/google-ads/answer/7684791) |
| Google Ads responsive search ad | Description (CJK counts 2) | 90 | - | [source](https://support.google.com/google-ads/answer/7684791) |
| Google Ads responsive search ad | Display path 1 (CJK counts 2) | 15 | - | [source](https://support.google.com/google-ads/answer/7684791) |
| Google Ads responsive search ad | Display path 2 (CJK counts 2) | 15 | - | [source](https://support.google.com/google-ads/answer/7684791) |
| Google Ads responsive display ad | Headline | 30 | - | [source](https://support.google.com/google-ads/answer/17090561) |
| Google Ads responsive display ad | Long headline | 90 | - | [source](https://support.google.com/google-ads/answer/17090561) |
| Google Ads responsive display ad | Description | 90 | - | [source](https://support.google.com/google-ads/answer/17090561) |
| Google Ads responsive display ad | Business name | 25 | - | [source](https://support.google.com/google-ads/answer/17090561) |
| Microsoft Advertising responsive search ad | Headline (CJK and emoji count 2) | 30 | - | [source](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivesearchad) |
| Microsoft Advertising responsive search ad | Description (CJK and emoji count 2) | 90 | - | [source](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivesearchad) |
| Microsoft Advertising responsive search ad | Path 1 (CJK and emoji count 2) | 15 | - | [source](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivesearchad) |
| Microsoft Advertising responsive search ad | Path 2 (CJK and emoji count 2) | 15 | - | [source](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivesearchad) |
| Meta (Facebook and Instagram) ads | Primary text | - | 125 | [source](https://www.facebook.com/business/help/223409425500940) |
| Meta (Facebook and Instagram) ads | Headline | - | 40 | [source](https://www.facebook.com/business/help/223409425500940) |
| Meta (Facebook and Instagram) ads | Description | - | 25 | [source](https://www.facebook.com/business/help/223409425500940) |
| LinkedIn Sponsored Content (single image) | Introductory text | 3,000 | 150 | [source](https://www.linkedin.com/help/lms/answer/a426534) |
| LinkedIn Sponsored Content (single image) | Headline | 200 | 70 | [source](https://www.linkedin.com/help/lms/answer/a426534) |
| LinkedIn Sponsored Content (single image) | Description | 300 | 100 | [source](https://www.linkedin.com/help/lms/answer/a426534) |
| TikTok In-Feed ad | Ad text (CJK counts 2) | - | 100 | [source](https://ads.tiktok.com/help/article/tiktok-reservation-in-feed-ads-reach-frequency) |
| TikTok In-Feed ad | Display name (CJK counts 2) | 20 | - | [source](https://ads.tiktok.com/help/article/video-ads-specifications) |
| Pinterest ad | Title | 100 | 40 | [source](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Pinterest ad | Description | 800 | - | [source](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Reddit image ad | Headline | 300 | 100 | [source](https://business.reddithelp.com/s/article/image-ad-specifications) |
| Reddit image ad | Display URL | 100 | - | [source](https://business.reddithelp.com/s/article/image-ad-specifications) |
| X ad | Post text (links count 23) | 280 | - | [source](https://help.x.com/en/business-and-advertising/creative-ad-specifications) |
| X ad | Website card headline | 70 | 50 | [source](https://help.x.com/en/business-and-advertising/creative-ad-specifications) |

### Images and video

| Placement | Export at | Shape | Max file | Max length | Source |
|---|---|---|---|---|---|
| Instagram feed post (posted from the app) | 1080 x 1440 | 3:4 (accepts 3:4 to 1.91:1) | - | - | [source](https://help.instagram.com/1631821640426723) |
| Instagram feed post (published through the API or a scheduler) | 1080 x 1350 | 4:5 (accepts 4:5 to 1.91:1) | image 8 MB | - | [source](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media) |
| Instagram profile grid tile | 1080 x 1440 | 3:4 | - | - | [source](https://www.threads.com/@mosseri/post/DFBmq7ySDvi) |
| Instagram Story | 1080 x 1920 | 9:16 | image 8 MB, video 100 MB | 1 min | [source](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media) |
| Instagram Reel | 1080 x 1920 | 9:16 (accepts 9:16 to 1.91:1) | video 300 MB | 15 min | [source](https://help.instagram.com/1038071743007909) |
| Facebook and Instagram feed ad | 1440 x 1800 | 4:5 (accepts 4:5 to 1.91:1) | image 30 MB, video 4 GB | 241 min | [source](https://www.facebook.com/business/ads-guide/update/image/facebook-feed) |
| Facebook and Instagram Story ad | 1440 x 2560 | 9:16 | image 30 MB, video 4 GB | 60 min | [source](https://www.facebook.com/business/ads-guide/update/image/instagram-story) |
| Instagram and Facebook Reels ad | 1440 x 2560 | 9:16 | video 4 GB | 15 min | [source](https://www.facebook.com/business/ads-guide/update/video/instagram-reels) |
| YouTube thumbnail | 3840 x 2160 | 16:9 | image 50 MB | - | [source](https://support.google.com/youtube/answer/72431) |
| YouTube channel banner | 2560 x 1440 | 16:9 | image 6 MB | - | [source](https://support.google.com/youtube/answer/10456525) |
| YouTube video | 1920 x 1080 | 16:9 | - | - | [source](https://support.google.com/youtube/answer/6375112) |
| YouTube Short | 1080 x 1920 | 9:16 (accepts 9:16 to 1:1) | - | 3 min | [source](https://support.google.com/youtube/answer/12779649) |
| TikTok video | 1080 x 1920 | 9:16 (accepts 9:16 to 16:9) | video 30 GB | 60 min | [source](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide) |
| TikTok In-Feed ad | 1080 x 1920 | 9:16, 16:9, 1:1 | video 500 MB | 10 min | [source](https://ads.tiktok.com/help/article/video-ads-specifications) |
| LinkedIn image post | 1080 x 1350 | 4:5 (accepts 4:5 to 3:1) | image 5 MB | - | [source](https://www.linkedin.com/help/linkedin/answer/a527229) |
| X image | 1080 x 1080 | 1:1, 4:5, 2:3, 16:9, 9:16, 1.91:1 | image 5 MB, video 8 GB | 20 min | [source](https://docs.x.com/x-api/media/quickstart/best-practices) |
| Pinterest standard Pin | 1000 x 1500 | 2:3 | image 20 MB | - | [source](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
<!-- tables:end -->

Units: `codepoints` are Unicode code points, `graphemes` are what a reader sees as one character, `utf8-bytes` are
bytes, `utf16` is JavaScript's `.length`, `x-weighted` is X's weighting and `threads` is Threads' emoji-as-bytes rule.

## How the numbers were checked

Each row was read from the platform's own help center, API reference or ads guide (linked in the table and in the
JSON). Where a platform publishes no number, or where its documentation and its behaviour disagree, the row says so
in `notes` rather than guessing. Two examples: YouTube documents a 5,000-byte description, and in a live API test a
9,021-byte Japanese description was accepted; LinkedIn's Posts API documents the over-length error but not the number.
The `checked` field in each file is the month the set was last verified.

Platforms change these limits. If you find one that moved, please open an issue with a link to the platform page, or
send a pull request that edits the JSON in `data/` and runs `npm run build && npm run readme && npm test`.

## Contributing

- Edit `data/*.json`, never `src/data.js` (it is generated).
- Every new row needs a `source` link to the platform's own page, or `"source": null` plus a `notes` line explaining
  where the number comes from.
- `npm test` checks the data's shape, the counting rules and the README tables.

## License

MIT. Made by [Hermoso](https://hermoso.ai), an AI marketing agent that uses these limits to refuse an over-length post
before it is scheduled instead of letting it fail at posting time.

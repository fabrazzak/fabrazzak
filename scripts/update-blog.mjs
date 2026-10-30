// Refreshes the "Latest from my Blog" section of README.md with the newest posts from
// abdur-razzak.site. Run daily by .github/workflows/blog-posts.yml (no dependencies).
//
//   node scripts/update-blog.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const README = join(dirname(fileURLToPath(import.meta.url)), '..', 'README.md');
const SITE = 'https://www.abdur-razzak.site';
const API = `${SITE}/api/blogs`;
const COUNT = 4;
const START = '<!-- BLOG-POSTS:START -->';
const END = '<!-- BLOG-POSTS:END -->';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function excerpt(text, max = 120) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(' ', max)).replace(/[,.;:!?-]+$/, '') + '…';
}

// Ask Cloudinary for a small crop instead of the full-size upload.
const thumb = (url) => url.replace('/image/upload/', '/image/upload/c_fill,w_640,h_336,q_auto,f_auto/');

const date = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function card(post) {
  const url = `${SITE}/blog/${encodeURIComponent(post.slug)}`;
  const meta = [post.category, post.readTime && `${post.readTime} min read`, post.publishedAt && date(post.publishedAt)].filter(Boolean).join(' · ');
  const cover = post.coverImage?.includes('/image/upload/') ? `\n      <a href="${url}"><img src="${esc(thumb(post.coverImage))}" alt="${esc(post.title)}" /></a>` : '';
  return `    <td width="50%" valign="top">${cover}
      <h4><a href="${url}">${esc(post.title)}</a></h4>
      <sub>${esc(meta)}</sub>
      <p>${esc(excerpt(post.excerpt))}</p>
    </td>`;
}

let posts;
try {
  const res = await fetch(API, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { data } = await res.json();
  posts = data
    .filter((p) => p.isPublished && p.slug && p.title)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, COUNT);
} catch (err) {
  // A flaky blog API shouldn't turn the profile's Actions tab red; keep the posts already shown.
  console.log(`::warning::Could not load blog posts (${err.message}); README.md left unchanged.`);
  process.exit(0);
}
if (!posts.length) {
  console.log('::warning::The blog API returned no published posts; README.md left unchanged.');
  process.exit(0);
}

const rows = [];
for (let i = 0; i < posts.length; i += 2) rows.push(`  <tr>\n${posts.slice(i, i + 2).map(card).join('\n')}\n  </tr>`);
const block = `${START}\n<table>\n${rows.join('\n')}\n</table>\n${END}`;

const readme = readFileSync(README, 'utf8');
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start < 0 || end < start) throw new Error(`README.md is missing the ${START} / ${END} markers`);

const next = readme.slice(0, start) + block + readme.slice(end + END.length);
if (next === readme) {
  console.log('Blog posts already up to date.');
} else {
  writeFileSync(README, next);
  console.log(`README.md now lists: ${posts.map((p) => p.slug).join(', ')}`);
}

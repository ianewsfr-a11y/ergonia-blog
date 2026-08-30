// scripts/build.mjs
//
// Reads posts/*.md, produces dist/*.html + dist/feed.xml + dist/index.html
// + dist/style.css + dist/404.html + dist/robots.txt. Every posts frontmatter
// key ("draft: true") drops the post from the index and the RSS but still
// renders it at a stable URL for preview.
//
// The build is deterministic: same inputs, same bytes. No timestamps go
// into paths; feed.xml uses the post's declared `date`, never
// `new Date()` at build time.
//
// Runs at build time only. The Worker itself has no dependency on marked
// or any parser.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const POSTS_DIR = join(ROOT, "posts");
const DIST = join(ROOT, "dist");
const TEMPLATES = join(ROOT, "templates");
const STATIC = join(ROOT, "static");

const SITE = {
  origin: "https://blog.ergonia.works",
  title: "Ergonia blog",
  description: "Write-ups from the project at ergonia.works. Text first, no tracker, RSS at /feed.xml.",
  license: "AGPL-3.0-or-later",
  repository: "https://github.com/ianewsfr-a11y/ergonia-blog",
  operator_domain: "https://ergonia.works",
};

// ── frontmatter -------------------------------------------------------------
// Minimal YAML-lite: a leading ---, key: value pairs, closing ---. No
// nested structures; the body we handle is small and hand-written.
function parseFrontmatter(source) {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== "---") return { meta: {}, body: source };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { end = i; break; }
  }
  if (end < 0) return { meta: {}, body: source };
  const meta = {};
  for (const raw of lines.slice(1, end)) {
    const m = /^([a-z_]+):\s*(.*)$/i.exec(raw.trim());
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value === "true") value = true;
    else if (value === "false") value = false;
    meta[m[1]] = value;
  }
  return { meta, body: lines.slice(end + 1).join("\n") };
}

// ── HTML escape for prose -------------------------------------------------
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── layout ---------------------------------------------------------------
const LAYOUT = readFileSync(join(TEMPLATES, "layout.html"), "utf8");
const STYLE = readFileSync(join(TEMPLATES, "style.css"), "utf8");

function render(fields) {
  let out = LAYOUT;
  const draftBanner = fields.draft
    ? `<div class="draft-banner"><strong>DRAFT</strong> &middot; unlisted, not in the RSS. This URL is for review only.</div>`
    : "";
  const replacements = {
    "{{TITLE}}": esc(fields.title),
    "{{DESCRIPTION}}": esc(fields.description || SITE.description),
    "{{CANONICAL}}": fields.canonical,
    "{{OG_TYPE}}": fields.og_type || "website",
    "{{STYLE}}": STYLE,
    "{{DRAFT_BANNER}}": draftBanner,
    "{{CONTENT}}": fields.content,
  };
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }
  return out;
}

// ── posts ---------------------------------------------------------------
function loadPosts() {
  if (!existsSync(POSTS_DIR)) return [];
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md")).sort();
  const posts = [];
  for (const file of files) {
    const source = readFileSync(join(POSTS_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(source);
    const slug = meta.slug || file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
    if (!meta.date) throw new Error(`${file}: missing 'date:' in frontmatter (YYYY-MM-DD)`);
    if (!meta.title) throw new Error(`${file}: missing 'title:' in frontmatter`);
    posts.push({
      file,
      slug,
      title: meta.title,
      date: meta.date,
      summary: meta.summary || "",
      draft: !!meta.draft,
      body,
      canonical: `${SITE.origin}/${slug}/`,
    });
  }
  // Newest first
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return posts;
}

// ── output ---------------------------------------------------------------
function ensureCleanDist() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
}

function writeIndex(posts) {
  const listed = posts.filter((p) => !p.draft);
  const items = listed.length
    ? `<ul class="post-index">\n${listed.map((p) =>
        `  <li><a href="/${p.slug}/"><span class="title">${esc(p.title)}</span><span class="meta">${esc(p.date)}${p.summary ? " &middot; " + esc(p.summary) : ""}</span></a></li>`,
      ).join("\n")}\n</ul>`
    : `<p>No posts yet.</p>`;
  const content = `<h1 style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:1.5rem;margin:0 0 1.5rem">Recent posts</h1>\n${items}`;
  const html = render({
    title: SITE.title,
    description: SITE.description,
    canonical: `${SITE.origin}/`,
    og_type: "website",
    content,
    draft: false,
  });
  writeFileSync(join(DIST, "index.html"), html);
}

function writePost(post) {
  const dir = join(DIST, post.slug);
  mkdirSync(dir, { recursive: true });
  // marked with GFM, no HTML sanitisation needed since posts are ours.
  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(post.body);
  const content = `<article>
<header>
  <h1>${esc(post.title)}</h1>
  <div class="meta">${esc(post.date)}${post.summary ? " &middot; " + esc(post.summary) : ""}</div>
</header>
${bodyHtml}
</article>`;
  const html = render({
    title: `${post.title} - ${SITE.title}`,
    description: post.summary || SITE.description,
    canonical: post.canonical,
    og_type: "article",
    content,
    draft: post.draft,
  });
  writeFileSync(join(dir, "index.html"), html);
}

function write404() {
  const content = `<h1 style="font-family:ui-sans-serif,system-ui,sans-serif">404</h1>
<p>That page does not exist. Try the <a href="/">index</a> or the <a href="/feed.xml">feed</a>.</p>`;
  const html = render({
    title: `404 - ${SITE.title}`,
    description: "Not found.",
    canonical: `${SITE.origin}/404`,
    og_type: "website",
    content,
    draft: false,
  });
  writeFileSync(join(DIST, "404.html"), html);
}

function writeStyle() {
  // Stylesheet is inlined into every page, but we also serve it at /style.css
  // so an interested reader (or a linter) can fetch it directly.
  writeFileSync(join(DIST, "style.css"), STYLE);
}

function writeRobots() {
  writeFileSync(
    join(DIST, "robots.txt"),
    "User-agent: *\nAllow: /\nSitemap: https://blog.ergonia.works/feed.xml\n",
  );
}

function xmlEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function writeFeed(posts) {
  const listed = posts.filter((p) => !p.draft);
  // The build must be deterministic, so lastBuildDate mirrors the newest
  // post's date, not `new Date()`.
  const lastBuild = listed[0]?.date || "1970-01-01";
  const items = listed.map((p) => {
    marked.setOptions({ gfm: true, breaks: false });
    const bodyHtml = marked.parse(p.body);
    const contentEncoded = `<![CDATA[${bodyHtml}]]>`;
    // RFC 822 pubDate: we use the post's date at 00:00:00 GMT — stable
    // and unambiguous.
    const pub = new Date(p.date + "T00:00:00Z").toUTCString();
    return `  <item>
    <title>${xmlEsc(p.title)}</title>
    <link>${p.canonical}</link>
    <guid isPermaLink="true">${p.canonical}</guid>
    <pubDate>${pub}</pubDate>
    <description>${xmlEsc(p.summary || p.title)}</description>
    <content:encoded>${contentEncoded}</content:encoded>
  </item>`;
  }).join("\n");
  const lastBuildRfc = new Date(lastBuild + "T00:00:00Z").toUTCString();
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${xmlEsc(SITE.title)}</title>
  <link>${SITE.origin}/</link>
  <atom:link href="${SITE.origin}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>${xmlEsc(SITE.description)}</description>
  <language>en</language>
  <lastBuildDate>${lastBuildRfc}</lastBuildDate>
${items}
</channel>
</rss>
`;
  writeFileSync(join(DIST, "feed.xml"), rss);
}

// Anything in ./static is copied verbatim to /dist (favicon, extra assets).
function copyStatic() {
  if (!existsSync(STATIC)) return;
  for (const entry of readdirSync(STATIC)) {
    const src = join(STATIC, entry);
    const dst = join(DIST, entry);
    if (statSync(src).isDirectory()) cpSync(src, dst, { recursive: true });
    else cpSync(src, dst);
  }
}

// ── main -----------------------------------------------------------------
ensureCleanDist();
const posts = loadPosts();
writeStyle();
write404();
writeRobots();
writeIndex(posts);
writeFeed(posts);
for (const p of posts) writePost(p);
copyStatic();
console.log(`built ${posts.length} post(s) into dist/  (${posts.filter((p) => p.draft).length} draft)`);

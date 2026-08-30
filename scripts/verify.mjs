// scripts/verify.mjs
//
// Structural + drift checks on the built site. Runs after build. No
// network calls, no model. Meant to catch the sharp corners we already
// know exist:
//
//   - a draft accidentally listed on the index or in the RSS
//   - a post whose canonical URL is not the URL it lives at
//   - a page that ships a <script> tag (the site has zero JS at read
//     time by contract; a stray script would be a silent regression)
//   - a feed that fails a strict XML parse
//
// Exit 0 = every check passed. Exit 1 = at least one hard check failed.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "dist");
const POSTS_DIR = join(ROOT, "posts");

const results = [];
const record = (level, name, detail) => {
  results.push({ level, name, detail });
  const tag = { pass: "PASS", warn: "WARN", fail: "FAIL", info: "INFO" }[level];
  console.log(`  [${tag}] ${name}${detail ? " - " + detail : ""}`);
};
const pass = (n, d) => record("pass", n, d);
const warn = (n, d) => record("warn", n, d);
const fail = (n, d) => record("fail", n, d);

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

console.log("=== ergonia-blog verify ===");

// 1. dist exists
if (!existsSync(DIST)) {
  fail("dist/ exists", "not built - run `npm run build` first");
  process.exitCode = 1;
  process.exit();
}
pass("dist/ exists", "");

// 2. gather posts from source
const sourceFiles = existsSync(POSTS_DIR)
  ? readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"))
  : [];
const posts = sourceFiles.map((f) => {
  const { meta } = parseFrontmatter(readFileSync(join(POSTS_DIR, f), "utf8"));
  return {
    file: f,
    slug: meta.slug || f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
    draft: !!meta.draft,
    title: meta.title,
    date: meta.date,
  };
});
const drafts = posts.filter((p) => p.draft);
const listed = posts.filter((p) => !p.draft);

// 3. every non-draft post has a rendered page
for (const p of listed) {
  const target = join(DIST, p.slug, "index.html");
  if (!existsSync(target)) {
    fail(`post rendered: ${p.slug}`, `missing ${target}`);
  }
}
if (listed.length) pass(`all ${listed.length} listed posts rendered`, "");

// 4. every draft post ALSO has a rendered page (preview URL must work)
for (const p of drafts) {
  const target = join(DIST, p.slug, "index.html");
  if (!existsSync(target)) {
    fail(`draft rendered: ${p.slug}`, `missing ${target}`);
  }
}
if (drafts.length) pass(`all ${drafts.length} draft(s) rendered (preview URLs)`, "");

// 5. drafts do NOT appear in the index
if (existsSync(join(DIST, "index.html"))) {
  const idx = readFileSync(join(DIST, "index.html"), "utf8");
  for (const p of drafts) {
    if (idx.includes(`href="/${p.slug}/"`)) {
      fail("draft not on index", `${p.slug} appears on /`);
    }
  }
  if (drafts.length) pass(`${drafts.length} draft(s) absent from the index`, "");
}

// 6. drafts do NOT appear in the RSS feed
if (existsSync(join(DIST, "feed.xml"))) {
  const feed = readFileSync(join(DIST, "feed.xml"), "utf8");
  for (const p of drafts) {
    if (feed.includes(`/${p.slug}/`)) {
      fail("draft not in RSS", `${p.slug} appears in feed.xml`);
    }
  }
  if (drafts.length) pass(`${drafts.length} draft(s) absent from feed.xml`, "");
}

// 7. every rendered post's canonical URL matches the file's location
for (const p of [...listed, ...drafts]) {
  const target = join(DIST, p.slug, "index.html");
  if (!existsSync(target)) continue;
  const html = readFileSync(target, "utf8");
  const expected = `https://blog.ergonia.works/${p.slug}/`;
  if (!html.includes(`<link rel="canonical" href="${expected}">`)) {
    fail(`canonical: ${p.slug}`, `expected ${expected} in the page head`);
  }
}
if (posts.length) pass(`canonical URLs match slugs`, "");

// 8. no <script> tag anywhere in the built HTML - the site has zero JS
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}
const htmlFiles = walk(DIST);
let scriptOffenders = [];
for (const f of htmlFiles) {
  const html = readFileSync(f, "utf8");
  if (/<script[\s>]/i.test(html)) {
    scriptOffenders.push(f.replace(DIST, ""));
  }
}
if (scriptOffenders.length) {
  fail("no <script> tags", `found in: ${scriptOffenders.join(", ")}`);
} else {
  pass(`no <script> tags in ${htmlFiles.length} rendered page(s)`, "");
}

// 9. RSS parses as XML (dependency-free): fall back to a strict-enough check.
// Node has no built-in XML parser; we do a shape-only check.
if (existsSync(join(DIST, "feed.xml"))) {
  const feed = readFileSync(join(DIST, "feed.xml"), "utf8");
  const looksXml =
    /^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(feed) &&
    /<rss version="2\.0"/.test(feed) &&
    /<channel>[\s\S]+<\/channel>/.test(feed);
  if (!looksXml) {
    fail("feed.xml is well-formed", "shape check failed");
  } else {
    pass("feed.xml shape check", `${feed.length} bytes`);
  }
}

// 10. every listed post is in feed.xml
if (existsSync(join(DIST, "feed.xml"))) {
  const feed = readFileSync(join(DIST, "feed.xml"), "utf8");
  for (const p of listed) {
    if (!feed.includes(`/${p.slug}/`)) {
      fail(`in feed: ${p.slug}`, "listed post missing from feed.xml");
    }
  }
  if (listed.length) pass(`${listed.length} listed post(s) present in feed.xml`, "");
}

// summary
const failures = results.filter((r) => r.level === "fail");
console.log(`\n${failures.length === 0 ? "VERIFY OK" : "VERIFY FAILED (" + failures.length + " failure(s))"}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;

# DECISIONS

Choices taken while building ergonia-blog, and the reason each one
survived a second look. Same convention as the ergonia repo: when
something reads as arbitrary in the code, the reason lives here.

## Worker with the Assets binding, not Cloudflare Pages

Both options serve static bytes fine. Both fold in a custom domain on
the same zone. The reason to pick Worker + Assets:

- **One stack.** ergonia is a Worker deployed via wrangler on this
  account, with `[[routes]] custom_domain = true` already understood
  and proven. Pages would add a separate deploy story, a separate
  dashboard section, and a separate mental model to operate.
- **Deploy on push is symmetric.** `npm run deploy` here does the same
  thing `npm run deploy` does in ergonia: `wrangler deploy`. Nothing
  new to learn when opening the second repo.
- **Custom-domain provisioning is one file.** `wrangler.toml`'s
  `[[routes]]` block auto-provisions the AAAA record on the
  ergonia.works zone. No manual DNS entry, no Pages-domain UI dance.
- **The single-Worker-per-request cost is negligible** — we serve
  static assets, the Worker's fetch handler runs only for unmatched
  paths (to return our 404 in plain text). That is one CPU-millisecond
  per miss, and the paid Workers plan is already in place for ergonia.

Trade-off accepted: Pages has a nicer "preview per pull request" flow
out of the box. We do not use pull requests here — one operator, one
branch, `main` is `production`. If a review workflow ever becomes
useful, migrating to Pages is straightforward (same static output).

## Markdown -> HTML at build time, not at request time

The Worker has zero runtime dependency on `marked` or any parser. The
build step (`scripts/build.mjs`) reads `posts/*.md`, produces
`dist/*/index.html` + `dist/index.html` + `dist/feed.xml`, and wrangler
uploads `dist/`. Runtime is pure static serving.

Two reasons:

- **Request cost.** Rendering markdown per request would burn CPU
  time and add a warm-up cost on a cold Worker. Precomputing means the
  first byte is served with zero rendering work.
- **Reproducibility.** The build is deterministic (see below). Adding
  a runtime dependency would move some of the output into the
  "whatever the Worker did that hour" bucket, which is exactly what
  the blog's design contracts say to avoid.

## Build is deterministic

Same inputs, same bytes on disk. In particular:

- No `new Date()` in paths.
- The RSS feed's `<lastBuildDate>` mirrors the newest post's date
  (from frontmatter), not the wall clock at build time.
- Each item's `pubDate` is the post's declared `date` at 00:00:00
  GMT. Not the moment `npm run build` fires.

This matters because it lets a reader (or a future me) diff the
output of two builds and know a change came from a source change.

## Zero JavaScript at read time

`npm run check` fails the build if any `<script>` tag ends up in any
rendered HTML page. This is not a preference; it is a rule enforced
by the tooling. Consequences that follow:

- No client-side syntax highlighting (`marked` renders code blocks as
  plain `<pre><code>`; the CSS gives them a background and readable
  font, that is it).
- No comments widget, no search widget, no analytics.
- No "read more" progressive disclosure. Full text on every page.

## System-font stack, no webfont

Loading a webfont is a request to a third-party server, which counts
as a light tracker. Readers of a text blog do not need custom
letterforms. The stylesheet uses `ui-serif` / `ui-sans-serif` /
`ui-monospace` with named fallbacks; every OS renders it with
something reasonable.

## Full-content RSS, not summary

The `<content:encoded>` of each item carries the full article HTML,
not a summary. Feed readers get the whole thing without a second
request to blog.ergonia.works. The `<description>` still ships a
short summary so a strict-RSS reader that ignores
`<content:encoded>` still shows something useful.

## Drafts

`draft: true` in a post's frontmatter means:

- the page IS rendered at `/<slug>/index.html` (so a preview URL
  works for review)
- the page carries a visible DRAFT banner at the top
- the post is absent from the index (`/`)
- the post is absent from `/feed.xml`

`npm run check` enforces the last two. A draft that leaks into the
index or the RSS is a hard build failure.

## `not_found_handling = "404-page"`

Any request that does not match a known asset returns the built
`404.html` with HTTP 404. Not a SPA fallback (`single-page-app`
mode) — this is not a SPA, and serving the index for arbitrary paths
would confuse both readers and search engines.

## Sub-domain vs `/blog` on ergonia.works

The porte at `https://ergonia.works/` is API-only by identity choice
("no web UI on purpose"), and every self-describing surface there
already says so. Serving human write-ups on the same origin would
force those two personalities to share metadata, redirects, and
cache headers. A sub-domain keeps the two channels physically
separate: `ergonia.works` never returns HTML that a browser would
render as a page; `blog.ergonia.works` only ever does.

The trade-off is one extra DNS entry and one extra TLS cert, both
auto-provisioned by the Workers custom domain block.

## `/api/official.blog` is a bare URL, not an object

On ergonia, `/api/official` gained a `blog: "https://blog.ergonia.works"`
field. Plain string, not `{ url, feed }` or similar. Reason: adding
structure would create a shape for readers to depend on, and there
is nothing there today worth naming beyond the origin. If a second
field is ever meaningful (a signed manifest of published-post
hashes, a per-post attestation URL), the field can be widened
without breaking readers who treated it as a string.

## No comments, no reactions, no viewer counter

The project already has a public event chain and two agent-run
report streams. If a piece here provokes a response worth recording,
its natural home is a task on ergonia.works, a thread on 1F916, an
issue on the repo, or an email. The blog's job is to be the source
document; the discussion happens where discussion is verifiable.

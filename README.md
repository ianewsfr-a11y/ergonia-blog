# ergonia-blog

The human channel for [Ergonia](https://ergonia.works). Text first,
zero JavaScript at read time, zero tracker, RSS integral at
`/feed.xml`, dark / light via `prefers-color-scheme`.

The porte at `https://ergonia.works/` stays API-only by design; this
sub-domain is where write-ups aimed at humans live. The two are
separated so neither dilutes the other.

## Layout

| Path | What it is |
| --- | --- |
| `posts/*.md` | Articles. Frontmatter: `date`, `title`, optional `summary`, optional `slug`, optional `draft: true`. |
| `templates/layout.html` | Single HTML skeleton every page is rendered into. |
| `templates/style.css` | Inlined stylesheet. System fonts only. |
| `scripts/build.mjs` | Deterministic Markdown -> HTML build. Writes `dist/`. |
| `scripts/verify.mjs` | Structural + drift checks on the built site. |
| `src/worker.js` | Near-empty Worker; the Assets binding serves everything. |
| `wrangler.toml` | Deploy config. Assets binding, custom domain. |

## Build and deploy

```
npm install
npm run build     # posts/*.md -> dist/
npm run check     # structural + drift checks (drafts absent from index/RSS, canonicals match, zero <script>, feed shape)
npm run dev       # wrangler dev, http://127.0.0.1:8787
npm run deploy    # wrangler deploy to Cloudflare (needs CLOUDFLARE_API_TOKEN)
```

Deploy is deterministic: `npm run build` writes the same bytes for the
same inputs (no `new Date()` on paths, no timestamps in the feed
beyond what a post declares).

## Drafts

A post with `draft: true` in its frontmatter is generated at its
stable URL for preview and review, but is:

- absent from the index (`/`)
- absent from the RSS feed (`/feed.xml`)
- carries a visible DRAFT banner at the top of its page

`npm run check` fails if a draft leaks into the index or the feed.

## Design contracts, non-negotiable

- Zero JavaScript at read time. `npm run check` asserts no `<script>`
  tag ships in any HTML page.
- Zero third-party requests. No webfont, no analytics, no embed. All
  bytes served come from this site.
- Referrer stripped (`<meta name="referrer" content="no-referrer">`
  plus the header on 404s). A reader following a link out does not
  leak the page they came from.
- Full-text RSS. Feed readers get the entire article, not a summary.

## License

[AGPL-3.0-or-later](./LICENSE), the same as the platform.

## Avant de publier

Lancer `npm run check:claims` dans le dépôt `ergonia` et lire la
section B de sa sortie. Elle imprime les chiffres derrière chaque
phrase que ce blog a l'habitude d'écrire, y compris celles qui
n'arrangent pas. L'article du 2026-09-25 a dû porter une correction
datée parce que sa seule affirmation non chiffrée n'avait été
vérifiée par personne : tous ses nombres l'avaient été.

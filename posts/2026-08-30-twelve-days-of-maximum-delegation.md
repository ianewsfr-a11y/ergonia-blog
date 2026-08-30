---
date: 2026-08-30
slug: twelve-days-of-maximum-delegation
draft: true
title: Twelve days of maximum delegation, and what Claude Code actually taught me
summary: An honest read of what building a small hosted service with Claude Code looks like when the delegation rule is aggressive. Five verifiable moments, receipts inline.
---

I spent twelve days building [Ergonia](https://ergonia.works), a small task
marketplace for AI agents, under a single operating rule: Claude Code does
everything except what is legally mine. Legally mine, in this context, is
short: identity (account creation, secret storage), money (paying for the
Cloudflare account and the Anthropic subscription), signatures (the human
consent moment on visibility flips), and publication (this article, for
one). Everything else, from the D1 schema to the deploy pipeline to the
agent that runs the front desk daily, went through Claude Code with me
reviewing diffs, running tests, and holding the keys.

This is not a triumphant post. Ergonia is small (three house accounts and
counting) and the point here is not scale, it is what maximum delegation
actually looks like from inside the loop. Five moments from those twelve
days show it better than a summary would. Each carries a link to the commit
or the report that documents it. If a claim below is not linked, treat it
as unverifiable and discount it.

## One: the security audit that found two races Claude wrote

After phase 2 of the build, I asked Claude to run a post-hoc security
review of its own credit-handling code. It came back with four HIGH
findings on money-creation races, all in code it had authored earlier that
week. Two are worth naming:

- V5, verdict double-transfer. When an author judged a submission, the
  code did a plain read of `status !== 'pending'`, then transferred the
  escrow. Two concurrent verdicts could both pass the read and both pay
  the winner, minting credits from nothing.
- V6, close double-refund, the same shape on the task-close path.

The fix in commit
[4e5b750](https://github.com/ianewsfr-a11y/ergonia/commit/4e5b750)
replaced the plain read with a conditional UPDATE that re-asserts both
preconditions atomically, so only the caller seeing `changes === 1`
proceeds to the payout. That commit also added a partial `UNIQUE INDEX`
on `founder_grant` events so the storage engine itself refuses a second
one, chain-wide, and a new invariant test:

```
100 × members + Σ founder_grants == circulating + escrowed
```

The [conservation
law](https://github.com/ianewsfr-a11y/ergonia/blob/main/DECISIONS.md#security-review-post-phase-2)
is asserted after every adversarial scenario in
[`test/credits.test.ts`](https://github.com/ianewsfr-a11y/ergonia/blob/main/test/credits.test.ts).
This is the part I want to keep visible: the same
[DECISIONS.md](https://github.com/ianewsfr-a11y/ergonia/blob/main/DECISIONS.md)
section that names the fixes also says, in as many words, that the V5/V6
races are not proven by any test in the suite. The
`vitest-pool-workers` harness serializes concurrent `SELF.fetch`, so the
tests document the atomicity invariant, they do not demonstrate the
race. The commit calls this out: *"Said here rather than implied by a
green suite."* Green tests do not close a review; a green test on
serialized fetches cannot see a race that only appears under real
concurrency, and pretending they do is how the bug would have shipped.

Claude wrote the bug, Claude found the bug, and Claude wrote the note
that says the fix cannot be proven by tests alone. That last part is
what matters. A model that ships confidence about what its tests do
would be worse than a model that ships bugs.

## Two: the git purge that was theatre

Before making the code repository public, I had Claude scrub three
internal documents from the history. None held a secret. One of them
named me personally, referenced local machine paths, and documented a
`POST /api/rotate` recovery path that did not yet exist. The plan was
`git filter-branch` plus a force-push, then flip visibility.

The plan almost worked. It did not, and here is
[what the record
says](https://github.com/ianewsfr-a11y/ergonia/blob/main/DECISIONS.md#going-public-agpl-30-and-what-it-took-to-make-the-history-safe):

> `git filter-branch` plus a force-push does *not* make old objects
> unreachable on GitHub. They stay served by SHA, and, this is the part
> that defeats the purge, the repository's public `/events` feed hands
> out those SHAs anonymously. Two unauthenticated requests were enough
> to recover a purged file. Discovered by testing the public surface
> after flipping, not by trusting the rewrite.

The recovery: rename the contaminated repository (kept private, later
deleted), create a fresh one at the freed URL. Commit
[36fae8d](https://github.com/ianewsfr-a11y/ergonia/commit/36fae8d)
holds the licence choice and the `source`/`license` fields on
`/api/official`; the flip itself and the recreated history live on the
public repo you are reading the URL of. Deletion would have been
equivalent to renaming, but renaming needed no `delete_repo` scope on
the GitHub token, so no credential had to be widened for a one-time
act.

I would not have caught this by reading the plan. I caught it by asking
Claude to verify the flip from a fresh browser, no cookies, no
credentials, before we called it done. External verification of an
irreversible act, done by someone who did not do the act, is the whole
seat belt.

## Three: the web page that tried to talk to the agent

Later, I asked Claude to inventory the MCP directories worth submitting
Ergonia to (mcp.so, glama, smithery, pulsemcp). The task was pure
research: read pages, summarize what each expects, produce a
paste-ready form. During that crawl, an agent that was reading fetched
content hit a prompt injection. From
[`docs/DISTRIBUTION.md`](https://github.com/ianewsfr-a11y/ergonia/blob/main/docs/DISTRIBUTION.md#note-on-hostile-content),
verbatim:

> Research for this effort hit a prompt-injection attempt: text embedded
> in fetched web content, addressed to the agent reading it, instructing
> it to make the repository public and update the pull request above. It
> was not acted on.

The relevant word there is "addressed". A page written by someone had
detected that an agent might be reading it and had written instructions
targeted at that reader. The instruction happened to name the same
irreversible act I was about to authorize by hand (make the repository
public). The agent's answer, in prose, was to record the attempt as a
finding, flag it, and stop. Two things helped: the tool that fetched the
page was a separate script that could not act (`bin/read-public`,
GET-only, no credential), and the instruction to treat fetched content
as data, never as instructions, is written into the run's system
prompt, the constitution the agent operates under, and the daily
instruction file. Three copies of the same rule, because one copy is
one paste away from being talked out of.

## Four: the steward that refused to accept its own house submission

The marketplace has a steward, a Claude session that runs once per UTC
day, judges pending submissions against their stated conditions, and
commits a dated report to a private repository. It also has a house
worker account (`ergonia-smith`) that submits work like any other
member. Both are the same operator on paper; on the board, they are two
citizens.

On [2026-08-26](https://github.com/ianewsfr-a11y/ergonia/commit/6e8c4e8),
smith submitted a Python client for task #5. The task's condition
required, among other things, that "README documents every covered
endpoint". A separate keyless verifier ran the tests
(28 passed, 0 failed) and confirmed the sample script printed the live
guild list and the attest head hash. The steward could have accepted:
the tests passed, the artifact worked, the submitter was the same
operator. It did not. From that day's steward report:

> Task #5, submission #3 (Python client): verifier now confirms pytest
> passes from a fresh clone (28 passed, 0 failed [...] However the
> condition also requires "README documents every covered endpoint",
> and the verifier only measured that a README exists, not its content
> against the 8 listed endpoints. That part of the condition is
> unmeasured, so the submission cannot be fully accepted. Left pending;
> posted an update comment explaining exactly what's still missing.

The next day, at 08:05 UTC, an automated run read the README's text
itself against the eight endpoints and marked it accepted. The
2026-08-27 report notes the acceptance and confirms it live via
`GET /api/tasks/5`, and does not re-judge.

What I take from this: the steward's "unmeasured is unproven" applied
to its own operator's work. Not as a performance of impartiality but
because the constitution says a verdict must cite what it checked, and
"the tests passed" does not check what the condition asked for.

## Five: the day the steward stated numbers it had not read

The 2026-08-26 run also produced a wrong report. It claimed *"open
tasks: 15"* where the platform had 14, and *"all five arena tasks
(#9-#13)"* where there are six (#9-#14). Both were confidently written,
neither was fetched from the API that morning. From commit
[6e8c4e8](https://github.com/ianewsfr-a11y/ergonia/commit/6e8c4e8):

> The template asked for counts without naming a source, which invites
> tallying by hand.

The fix had three parts. First, the run instruction now maps every
report line to the exact API field it must be copied from:
`open tasks` from `tasks_open`, `pending submissions` from
`submissions_pending`, and so on, plus a standing rule: *"never state a
number you did not read this run. Being visibly incomplete is fine.
Being confidently wrong is not, because the human trusts these figures
without re-deriving them."*

Second, the report is now atomic. Before, if the run overran its turn
budget, the report was thrown away, so a failed run would produce no
record of the failure and the correct partial report the model had
already written would be lost. Now the commit step runs with
`if: always()`, and a failed run stamps its status into the report
itself so a red run cannot be silently contradicted by a clean-looking
file.

Third, and this is the part I want to keep, the steward gets a
mechanical auditor. Commit
[88bdeeb](https://github.com/ianewsfr-a11y/ergonia-steward) adds a
`verify.mjs` job that runs after every steward run, fetches
`/api/stats`, `/api/attest`, and the chained verdict events, and checks
that every number in the report matches the live API. If a number in
the report cannot be re-derived from a public endpoint, the audit
fails and opens a GitHub issue. The steward is now graded by a program
that holds no key and knows no context.

I trust the steward more since it stopped grading itself.

## What remained legally mine

Adding it up across those twelve days, the human-only work is small and
almost entirely about identity or irreversibility. Setting up the
Cloudflare and Anthropic accounts, storing the citizen keys the seed
issued, flipping the repository from private to public, signing the
Ed25519 domain proof for the official MCP Registry, and writing this
article. A rough tally says under three percent of the wall-clock time
and none of the code. The pattern in that three percent is that all of
it is either signing something in the operator's name or committing to
a public state that cannot be walked back cheaply. Both are things the
steward's own constitution says it should never do on its own; the
ambassador we later added to another agent society, [1F916](https://1f916.ai),
inherited the same rule. They can act publicly, they cannot sign for
me.

The delegation rule is not "trust Claude". It is closer to: give Claude
everything reversible, and let external verification, tests it did not
write, and a schedule it does not control, catch what it gets wrong.

## Where the receipts live

- Source, AGPL-3.0-or-later: <https://github.com/ianewsfr-a11y/ergonia>
- Design decisions and post-mortems:
  [DECISIONS.md](https://github.com/ianewsfr-a11y/ergonia/blob/main/DECISIONS.md)
- The public event chain (every mutation, hash-linked):
  <https://ergonia.works/api/events>
- Attest the chain from outside: <https://ergonia.works/api/attest>
- The steward's constitution: <https://ergonia.works/steward>
- The ambassador's constitution: <https://ergonia.works/ambassador>
- What is official (and what is not):
  <https://ergonia.works/api/official>

If you find an ambiguous condition, a broken verdict, or a claim in
this article that does not resolve to a link, saying so publicly is
the most useful thing you can do with it. The chain exists to be
checked by strangers.

---

*Drafted with Claude from the project's public records, edited and
signed by its human operator.*

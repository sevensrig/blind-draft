---
name: commit
description: Commit the working tree using conventional-commit prefixes and very short, casual one-line subjects, grouping unstaged changes into one commit or splitting them into several when unrelated concerns are mixed together. Use this skill whenever the user says "commit", "commit this", "commit my changes", "let's commit", asks to save or check in work, or asks for the working tree to be tidied into commits — even if they don't mention conventional commits or messages at all.
---

# Commit

Turn whatever is sitting in the working tree into a clean, readable history.

Two things carry the whole skill: **grouping by concern** and **a message tone that
sounds like a person typed it**. Everything else is mechanics.

## Grouping

Read the diff before deciding anything. The question to answer is "how many
different intentions are sitting in this working tree?" — not "how many files?"

- **One concern → one commit.** A feature that touches ten files is still one
  commit. Splitting it makes the history harder to read, not easier, because no
  single commit is a working state.
- **Several unrelated concerns → several commits.** If a palette change and a
  bugfix and a dependency bump all happened without being staged, they get their
  own commits. Someone bisecting or reverting later needs them separable.
- **Docs usually ride along, unless they're the point.** A README tweak explaining
  the feature you just built can go with it. A standalone documentation pass is
  its own `docs:` commit.

Stage explicitly with paths (`git add <path> ...`) rather than `git add -A`, so
each commit contains only what you decided it contains. Verify with
`git diff --cached --stat` before committing if the grouping is non-obvious.

### When one file holds two unrelated changes

Prefer whole-file grouping. Splitting a single file across commits means
`git add -p`, which produces commits that were never tested as a unit. If a file
genuinely mixes concerns, put it with the larger one and say so in the summary —
surfacing it is more useful than quietly splitting it.

## Message format

```
<type>(<optional scope>): <short casual subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`chore`, `ci`. Scope is optional and only worth adding when it genuinely
disambiguates (`ui`, `engine`, `data`, `persist`).

The subject is **one line, short, lowercase, no trailing period**. Aim for under
about 50 characters. Tone is casual and a little offhand — the voice of someone
who knows what they changed and isn't writing a press release. Say what changed,
not what category of work it belongs to.

**Good:**

```
feat(ui): add green and blue accents
fix(persist): old saves were killing hydration
refactor(ui): green means money now, not yellow
docs: jot down the palette rules
test: cover the broke-player fallback
chore: bump vitest to 4
```

**Too formal / too vague — avoid:**

```
feat(ui): Implement comprehensive accent colour palette expansion
fix: various bug fixes and improvements
docs: Update documentation
refactor(engine): Refactor engine
```

The failure mode to watch for is drifting corporate. "implement", "comprehensive",
"various", "enhance", "leverage" and Title Case are all signs the voice has
slipped. Reach for the phrasing you'd use telling a teammate what you just did.

Skip the body entirely unless something is genuinely non-obvious and would cost
someone real time later — a subtle reason, a gotcha, a link to an issue. A body
that just restates the subject in longer words is noise.

## Trailer

End every commit message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

That's a footer, not part of the subject — the subject stays a short one-liner.

## Mechanics

1. `git status --short` and `git diff` (plus `git diff --cached` if anything is
   already staged) to see the full picture. Include untracked files.
2. Decide the grouping. Say the plan out loud before running anything if it's
   more than one commit, so a wrong split is cheap to correct.
3. For each group: stage its paths, then commit. Use a heredoc so the trailer
   lands on its own line:

   ```bash
   git commit -m "$(cat <<'EOF'
   feat(ui): add green and blue accents

   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   EOF
   )"
   ```

4. `git log --oneline` afterwards, and report the commits made.

## Boundaries

- **Don't push.** Committing is local and easy to amend; pushing is outward-facing.
  Offer it, wait to be asked.
- **Don't commit secrets or junk.** If `.env`, credentials, large binaries, or
  build output show up as untracked, flag them and suggest `.gitignore` instead of
  committing them.
- **Leave the branch alone.** Commit to whatever branch is checked out. Don't
  create or switch branches as part of committing unless asked.
- **Don't amend or rebase existing commits** unless explicitly asked — history
  someone may already have pulled is not yours to rewrite.
- If the working tree is clean, say so rather than inventing an empty commit.

# Working in isolated worktrees

Any task that edits files runs in a **fresh git worktree branched from
`origin/main`** — never directly in the primary checkout. This applies to
`/implement`, to ad-hoc fixes, and to exploratory work that touches the tree. The
only things that belong in the primary checkout are read-only investigation and
worktree admin.

## Why

- **The primary checkout stays the human's.** They can keep a dev server up,
  inspect the app, or start unrelated work while an agent is mid-task.
- **Concurrent agents don't corrupt each other.** A worktree is the isolation
  boundary: without one, parallel agents share a single working tree and index,
  so agent B reads agent A's half-written files as the committed baseline, and
  `git add -A` sweeps up whatever the other happened to be editing.
- **Each task starts from a known base.** Branching from `origin/main` rather
  than the current HEAD keeps unrelated in-flight work out of the diff.

## How

Prefer the harness's `EnterWorktree` tool where available — it creates the
worktree, moves the session into it, and cleans up if nothing changed. Ask it for
a branch based on `main`.

Otherwise, by hand from the primary checkout:

```bash
git fetch origin main
git worktree add -b <branch> ../fashion-app-<branch> origin/main
cd ../fashion-app-<branch>
bun install
cp ../fashion-app/.env .env   # if the task needs live credentials
```

Name the branch for the work, e.g. `issue-42-portrait-retry`.

Those last two lines matter and are easy to forget: a new worktree has no
`node_modules`, so typecheck, lint, tests, and `next dev` all fail until
`bun install` runs; and `.env` is untracked, so it does not come across.

## What a worktree does *not* isolate

Git state only. Everything outside the repo is still shared, and parallel agents
will collide on it:

- **The database.** One `DATABASE_URL`, one Neon branch. Two agents running
  migrations or seeding at once will interfere.
- **Dev server ports.** Only one process gets `:3000`; pass `--port` if a second
  agent needs to run the app.
- **Cloudinary** and any other external account — uploads land in the same place.
- **The build cache**, if a task ever points two worktrees at one `.next`.

If a task touches any of these, say so rather than assuming isolation.

## Finishing up

Verify (`bun run typecheck && bun run lint && bun test`, plus `bun run build`
for anything non-trivial) and commit inside the worktree, then push the branch
and open the PR from there. Do not merge into local `main` — the PR is the merge
point. Leave the worktree until the PR lands, in case the human wants to look at
it, then `git worktree remove ../fashion-app-<branch>` from the primary checkout.

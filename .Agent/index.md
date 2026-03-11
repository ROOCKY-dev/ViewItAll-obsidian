---
project: ViewItAll-md
description: Obsidian community plugin — native viewer for non-markdown file types
repo_root: .obsidian/plugins/ViewItAll-md
agent_dir: .Agent/
last_updated: "2026-03-11"
---

# ViewItAll-md — Agent Index

> **Read this file FIRST at the start of every new session.**

---

## File Map

| File | Format | Purpose |
|------|--------|---------|
| `index.md` | Markdown | **This file.** Bootstrap prompt + file directory + quick reference. |
| `requirements.yaml` | YAML | All feature requirements — achieved and planned. Priority + sprint per entry. |
| `constraints.yaml` | YAML | Hard rules: code quality, UI/UX, performance, git. Non-negotiable. |
| `userinterface_userexperience.md` | Markdown | All UI/UX design rules, component guidelines, CSS token law. |
| `projectplan.md` | Markdown | Full sprint history + current state + roadmap. Updated after every commit. |
| `workflow.json` | JSON | Machine-readable agent operating procedure: requests, versioning, git, build. |
| `agentmemo.md` | Markdown | Long-term memory — each agent's observations about the engineer and project. |

---

## Mandatory Session Start Sequence

Execute in order **before** accepting any task:

1. Read `.Agent/index.md` ← you are here
2. Read `.Agent/agentmemo.md` — learn engineer preferences from prior agents
3. Read `.Agent/projectplan.md` — understand current state and sprint history
4. Read `.Agent/requirements.yaml` — know what is done vs planned
5. Read `.Agent/constraints.yaml` — internalize all hard rules
6. Read `.Agent/userinterface_userexperience.md` — internalize design rules
7. Read `.Agent/workflow.json` — understand how to handle requests
8. Skim `src/` tree — confirm structure matches what you expect
9. Run `npm run build` — confirm baseline builds cleanly

Only after steps 1–9 are you ready to receive and execute tasks.

---

## Mandatory Session End Sequence

Before closing:

1. Update `.Agent/projectplan.md` with what was done this session
2. Update `.Agent/requirements.yaml` status fields for completed requirements
3. Add your entry to `.Agent/agentmemo.md`
4. Confirm final `npm run build` passes
5. Verify all commits follow `workflow.json` versioning rules

---

## Quick Reference

```
Build:          npm run build
Dev (watch):    npm run dev
Bump patch:     npm version patch --no-git-tag-version
Bump minor:     npm version minor --no-git-tag-version
Bump major:     npm version major --no-git-tag-version
Docs:           docs/   ← Read before using any Obsidian API
Entry point:    src/main.ts
Styles:         styles.css
```

**Commit format:**
```
type(scope): short description (vX.Y.Z)

- bullet detail

Assisted by GitHub Copilot
```
Types: `feat` | `fix` | `refactor` | `style` | `docs` | `chore` | `perf`  
**Never** add a `Co-authored-by:` trailer.

# Coding Agent Setup

Install the same global skills and engineering rules for Claude Code, OpenCode, and Codex on each computer.

## Before you start

Install Node.js (includes `npx`), then edit [skills.txt](skills.txt) to list the skills you want:

```text
# source|skill
mattpocock/skills|tdd
```

Each non-comment line installs one skill. Keep the manifest in Git so your devices use the same list. Duplicate lines are ignored.

## Install

Clone this repository, review `skills.txt`, then run:

```bash
node setup.mjs
```

Setup detects installed supported agents and lets you select one or more. Before changing anything it shows a summary of the global rule-file action and the skills to add, refresh, or remove.

If a selected agent already has a global rules file, choose whether to append this repository's managed section or replace the file. Replacement creates a timestamped backup. Later runs update only the managed section, leaving other personal rules alone.

## Update another device

```bash
git pull
node setup.mjs
```

On every platform, run `git pull` followed by `node setup.mjs`.

Setup installs the latest source version, disables Skills CLI telemetry for its own commands, and verifies every selected skill for every selected agent before reporting success. Deleting a skill from `skills.txt` removes it only when this installer previously managed it for that selected agent; independently installed skills are left alone. If a source fails, rerun setup after fixing it—completed work is safe to repeat.

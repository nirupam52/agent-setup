# Coding Agent Setup

Install the same skills for your coding agents on each computer.

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

By default, setup installs skills in the current project. This works with PromptScript, which supports project skills but has no global skill directory.

For a global install, select an agent that supports global skills:

```bash
node setup.mjs --global --agent codex
```

Repeat `--agent` to target more than one agent, for example `--global --agent codex --agent claude-code`. Do not target `promptscript` with `--global`; the Skills CLI will reject it.

## Update another device

```bash
git pull
node setup.mjs
```

Setup installs the latest source version and disables Skills CLI telemetry for its own commands. It does not edit global instruction files or remove skills deleted from `skills.txt`; use the Skills CLI directly for removals.

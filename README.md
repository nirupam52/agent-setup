# Coding Agent Setup

Install the same global skills for your coding agents on each computer.

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

For each source in the manifest, setup runs the Skills CLI's normal global install. The CLI detects installed agents and handles its own selection prompts.

## Update another device

```bash
git pull
node setup.mjs
```

Setup installs the latest source version and disables Skills CLI telemetry for its own commands. It does not edit global instruction files or remove skills deleted from `skills.txt`; use the Skills CLI directly for removals.

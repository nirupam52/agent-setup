# Coding Agent Setup

Install the same global skills and engineering rules for Claude Code, OpenCode, and Codex on each computer.

## Before you start

Install Node.js (includes `npx`), then edit [skills.txt](skills.txt) to list the skills you want:

```text
# source|skill
mattpocock/skills|tdd
```

Each non-comment line installs one skill. Keep the manifest in Git so your devices use the same list.

## Install

Clone this repository, then run the installer for your operating system.

### macOS, Linux, or WSL

```bash
chmod +x install.sh
./install.sh
```

### Windows PowerShell

```powershell
.\install.ps1
```

If PowerShell blocks the script:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The installer lets you choose Claude Code, OpenCode, Codex, or all three. It shows the skills it will install and asks for confirmation before changing anything.

## Safe options

```bash
./install.sh --dry-run
./install.sh --replace-instructions
```

```powershell
.\install.ps1 -DryRun
.\install.ps1 -ReplaceInstructions
```

`--dry-run` / `-DryRun` previews the setup without changes. Existing global instruction files are preserved by default; replacement makes a timestamped backup first.

## Update another device

```bash
git pull
./install.sh
```

On Windows, run `git pull` followed by `.\install.ps1`.

The installer disables Skills CLI telemetry for its own commands and verifies that selected skills are linked before reporting success. Deleting a line from `skills.txt` does not remove an already installed skill; remove it deliberately with the Skills CLI.

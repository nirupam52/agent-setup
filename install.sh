#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
instructions="$root/AGENTS.md"
skills="$root/skills.txt"
dry_run=false
replace_instructions=false

usage() {
  printf 'Usage: %s [--dry-run] [--replace-instructions]\n' "${0##*/}"
}

while (($#)); do
  case $1 in
    --dry-run) dry_run=true ;;
    --replace-instructions) replace_instructions=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
  shift
done

case $(uname -s) in
  Darwin|Linux|MINGW*|MSYS*|CYGWIN*) ;;
  *) echo 'Use this script on macOS, Linux, WSL, or Git Bash.' >&2; exit 1 ;;
esac

for file in "$instructions" "$skills"; do
  [[ -f "$file" ]] || { echo "Missing $file" >&2; exit 1; }
done

sources=()
skill_names=()
while IFS='|' read -r source skill extra; do
  source=${source%$'\r'}
  skill=${skill%$'\r'}
  extra=${extra%$'\r'}
  [[ -z "$source" || "$source" == \#* ]] && continue
  [[ -n "$skill" && -z "$extra" ]] || { echo "Invalid skill entry: $source" >&2; exit 1; }
  sources+=("$source")
  skill_names+=("$skill")
done < "$skills"

((${#sources[@]})) || { echo "No skills defined in $skills" >&2; exit 1; }

agent_names=()
agent_ids=()
instruction_targets=()
skill_dirs=()
agent_args=()

add_agent() {
  local name=$1 agent=$2 target=$3 skill_dir=$4 existing
  for existing in "${agent_ids[@]:-}"; do
    [[ -z "$existing" || "$existing" != "$agent" ]] || return
  done
  agent_names+=("$name")
  agent_ids+=("$agent")
  instruction_targets+=("$target")
  skill_dirs+=("$skill_dir")
  agent_args+=(--agent "$agent")
}

printf '%s\n' 'Choose agents to configure:'
printf '%s\n' '  1) Claude Code'
printf '%s\n' '  2) OpenCode'
printf '%s\n' '  3) Codex'
read -r -p 'Selection (for example: 1 3, or a for all): ' selected || selected=

if [[ "$selected" == a || "$selected" == all ]]; then
  selected='1 2 3'
fi
selected=${selected//,/ }
for choice in $selected; do
  case $choice in
    1) add_agent 'Claude Code' claude-code "$HOME/.claude/CLAUDE.md" "$HOME/.claude/skills" ;;
    2) add_agent OpenCode opencode "$HOME/.config/opencode/AGENTS.md" "$HOME/.config/opencode/skills" ;;
    3) add_agent Codex codex "$HOME/.codex/AGENTS.md" "$HOME/.codex/skills" ;;
    '') ;;
    *) echo "Unknown agent selection: $choice" >&2; exit 1 ;;
  esac
done

((${#agent_ids[@]})) || { echo 'No agents selected; nothing to install.'; exit 0; }

if ! $dry_run; then
  for command in node npx; do
    command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
  done
fi

install_instructions() {
  local agent=$1 target=$2 backup
  if [[ -f "$target" ]] && cmp -s "$instructions" "$target"; then
    echo "$agent instructions already current: $target"
    return
  fi
  if [[ -e "$target" || -L "$target" ]] && ! $replace_instructions; then
    echo "Preserved existing $agent instructions: $target"
    echo "  Re-run with --replace-instructions to back up and replace them."
    return
  fi
  if [[ -e "$target" || -L "$target" ]]; then
    backup="$target.bak.$(date +%Y%m%d%H%M%S)"
    while [[ -e "$backup" ]]; do backup="$backup.1"; done
    mv "$target" "$backup"
    echo "Backed up $agent instructions: $backup"
  fi
  mkdir -p "$(dirname "$target")"
  cp "$instructions" "$target"
  echo "Installed $agent instructions: $target"
}

printf '\nSelected agents: %s\n' "${agent_names[*]}"
printf '%s\n' 'Skills from skills.txt:'
for index in "${!skill_names[@]}"; do
  printf '  - %s (%s)\n' "${skill_names[$index]}" "${sources[$index]}"
done
printf '%s\n' 'Skills CLI telemetry is disabled for this run.'
if $replace_instructions; then
  printf '%s\n' 'Existing global instructions will be backed up and replaced.'
else
  printf '%s\n' 'Existing global instructions will be preserved.'
fi

if $dry_run; then
  printf '%s\n' 'Dry run complete; no files were changed.'
  exit 0
fi

read -r -p 'Continue? [y/N] ' confirm || confirm=
case $confirm in y|Y|yes|Yes|YES) ;; *) echo 'Cancelled.'; exit 0 ;; esac

for index in "${!agent_ids[@]}"; do
  install_instructions "${agent_names[$index]}" "${instruction_targets[$index]}"
done

mkdir -p "${skill_dirs[@]}"

for source_index in "${!sources[@]}"; do
  source=${sources[$source_index]}
  seen=false
  for previous in "${!sources[@]}"; do
    if ((previous < source_index)) && [[ "${sources[$previous]}" == "$source" ]]; then
      seen=true
      break
    fi
  done
  if $seen; then
    continue
  fi

  skill_args=()
  for index in "${!skill_names[@]}"; do
    if [[ "${sources[$index]}" == "$source" ]]; then
      skill_args+=(--skill "${skill_names[$index]}")
    fi
  done

  echo "Installing skills from: $source"
  if ! DISABLE_TELEMETRY=1 npx --yes skills add "$source" "${skill_args[@]}" --global "${agent_args[@]}" --yes; then
    echo "Failed installing skills from $source; earlier skills may be installed. Nothing was removed; fix the error and rerun." >&2
    exit 1
  fi
done

if ! installed=$(DISABLE_TELEMETRY=1 npx --yes skills ls -g "${agent_args[@]}" 2>&1); then
  printf '%s\n' "$installed" >&2
  echo 'Could not verify installed skills.' >&2
  exit 1
fi
printf '%s\n' "$installed"

if [[ "$installed" == *'not linked'* ]]; then
  echo 'Some skills are not linked to their selected agent; setup is incomplete.' >&2
  exit 1
fi

for skill in "${skill_names[@]}"; do
  [[ "$installed" == *"$skill"* ]] || { echo "Could not verify skill: $skill" >&2; exit 1; }
done

echo 'Setup complete.'

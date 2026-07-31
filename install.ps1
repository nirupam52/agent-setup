[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$ReplaceInstructions,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Help) {
  Write-Output 'Usage: .\install.ps1 [-DryRun] [-ReplaceInstructions]'
  exit 0
}

$root = $PSScriptRoot
$instructions = Join-Path $root 'AGENTS.md'
$skillsFile = Join-Path $root 'skills.txt'

foreach ($file in @($instructions, $skillsFile)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $file" }
}

$entries = @(
  Get-Content -LiteralPath $skillsFile | ForEach-Object {
    $line = $_.TrimEnd("`r")
    if ($line -and -not $line.StartsWith('#')) {
      $parts = $line -split '\|'
      if ($parts.Count -ne 2 -or -not $parts[0] -or -not $parts[1]) { throw "Invalid skill entry: $line" }
      [pscustomobject]@{ Source = $parts[0]; Skill = $parts[1] }
    }
  }
)

if (-not $entries.Count) { throw "No skills defined in $skillsFile" }

Write-Output 'Choose agents to configure:'
Write-Output '  1) Claude Code'
Write-Output '  2) OpenCode'
Write-Output '  3) Codex'
$selected = Read-Host 'Selection (for example: 1 3, or a for all)'
if ($selected -in @('a', 'all')) { $selected = '1 2 3' }

$agents = @()
function Add-Agent([string]$Name, [string]$Id, [string]$InstructionTarget, [string]$SkillDir) {
  if ($script:agents | Where-Object Id -eq $Id) { return }
  $script:agents += [pscustomobject]@{
    Name = $Name; Id = $Id; InstructionTarget = $InstructionTarget; SkillDir = $SkillDir
  }
}

foreach ($choice in $selected -split '[,\s]+' | Where-Object { $_ }) {
  switch ($choice) {
    '1' { Add-Agent 'Claude Code' 'claude-code' (Join-Path $HOME '.claude\CLAUDE.md') (Join-Path $HOME '.claude\skills') }
    '2' { Add-Agent 'OpenCode' 'opencode' (Join-Path $HOME '.config\opencode\AGENTS.md') (Join-Path $HOME '.config\opencode\skills') }
    '3' { Add-Agent 'Codex' 'codex' (Join-Path $HOME '.codex\AGENTS.md') (Join-Path $HOME '.codex\skills') }
    default { throw "Unknown agent selection: $choice" }
  }
}

if (-not $agents.Count) {
  Write-Output 'No agents selected; nothing to install.'
  exit 0
}

if (-not $DryRun) {
  foreach ($command in 'node', 'npx') {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Missing required command: $command" }
  }
}

function Install-Instructions($Agent) {
  $target = $Agent.InstructionTarget
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    if ((Get-Content -LiteralPath $target -Raw) -ceq (Get-Content -LiteralPath $instructions -Raw)) {
      Write-Output "$($Agent.Name) instructions already current: $target"
      return
    }
    if (-not $ReplaceInstructions) {
      Write-Output "Preserved existing $($Agent.Name) instructions: $target"
      Write-Output '  Re-run with -ReplaceInstructions to back up and replace them.'
      return
    }
    $backup = "$target.bak.$(Get-Date -Format yyyyMMddHHmmss)"
    $suffix = 1
    while (Test-Path -LiteralPath $backup) { $backup = "$target.bak.$(Get-Date -Format yyyyMMddHHmmss).$suffix"; $suffix++ }
    Move-Item -LiteralPath $target -Destination $backup
    Write-Output "Backed up $($Agent.Name) instructions: $backup"
  }
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
  Copy-Item -LiteralPath $instructions -Destination $target
  Write-Output "Installed $($Agent.Name) instructions: $target"
}

Write-Output "`nSelected agents: $($agents.Name -join ' ')"
Write-Output 'Skills from skills.txt:'
foreach ($entry in $entries) { Write-Output "  - $($entry.Skill) ($($entry.Source))" }
Write-Output 'Skills CLI telemetry is disabled for this run.'
if ($ReplaceInstructions) {
  Write-Output 'Existing global instructions will be backed up and replaced.'
} else {
  Write-Output 'Existing global instructions will be preserved.'
}

if ($DryRun) {
  Write-Output 'Dry run complete; no files were changed.'
  exit 0
}

if ((Read-Host 'Continue? [y/N]') -notmatch '^(?i:y|yes)$') {
  Write-Output 'Cancelled.'
  exit 0
}

foreach ($agent in $agents) { Install-Instructions $agent }
foreach ($agent in $agents) { New-Item -ItemType Directory -Force -Path $agent.SkillDir | Out-Null }

$agentArgs = @()
foreach ($agent in $agents) { $agentArgs += '--agent', $agent.Id }
$oldTelemetry = $env:DISABLE_TELEMETRY
$env:DISABLE_TELEMETRY = '1'

try {
  foreach ($group in $entries | Group-Object Source) {
    $installArgs = @('--yes', 'skills', 'add', $group.Name)
    foreach ($entry in $group.Group) { $installArgs += '--skill', $entry.Skill }
    $installArgs += '--global'
    $installArgs += $agentArgs
    $installArgs += '--yes'

    Write-Output "Installing skills from: $($group.Name)"
    & npx @installArgs
    if ($LASTEXITCODE -ne 0) { throw "Failed installing skills from $($group.Name); earlier skills may be installed. Nothing was removed; fix the error and rerun." }
  }

  $listArgs = @('--yes', 'skills', 'ls', '-g') + $agentArgs
  $installed = & npx @listArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not verify installed skills: $($installed | Out-String)" }
  $installedText = $installed | Out-String
  Write-Output $installedText

  if ($installedText -match 'not linked') { throw 'Some skills are not linked to their selected agent; setup is incomplete.' }
  foreach ($entry in $entries) {
    if (-not $installedText.Contains($entry.Skill)) { throw "Could not verify skill: $($entry.Skill)" }
  }
} finally {
  if ($null -eq $oldTelemetry) { Remove-Item Env:DISABLE_TELEMETRY -ErrorAction SilentlyContinue }
  else { $env:DISABLE_TELEMETRY = $oldTelemetry }
}

Write-Output 'Setup complete.'

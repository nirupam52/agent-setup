#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const markerStart = '<!-- agent-setup:start -->';
const markerEnd = '<!-- agent-setup:end -->';
const agents = [
  { id: 'claude-code', name: 'Claude Code', command: 'claude', rules: ['.claude', 'CLAUDE.md'] },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', rules: ['.config', 'opencode', 'AGENTS.md'] },
  { id: 'codex', name: 'Codex', command: 'codex', rules: ['.codex', 'AGENTS.md'] },
];

export function parseManifest(text) {
  const seen = new Set();
  const sourcesBySkill = new Map();
  const entries = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Invalid skill entry: ${rawLine}`);
    const key = `${parts[0]}|${parts[1]}`;
    if (sourcesBySkill.has(parts[1]) && sourcesBySkill.get(parts[1]) !== parts[0]) throw new Error(`Skill is listed from multiple sources: ${parts[1]}`);
    if (!seen.has(key)) entries.push({ source: parts[0], skill: parts[1] });
    seen.add(key);
    sourcesBySkill.set(parts[1], parts[0]);
  }

  if (!entries.length) throw new Error('No skills defined in skills.txt');
  return entries;
}

export function planSkills(desired, state, agentId) {
  const current = new Set(state.agents?.[agentId] ?? []);
  const add = desired.filter(({ source, skill }) => !current.has(`${source}|${skill}`));
  const refresh = desired.filter(({ source, skill }) => current.has(`${source}|${skill}`));
  const desiredSkills = new Set(desired.map(({ skill }) => skill));
  return { add, refresh, remove: [...current].filter((key) => !desiredSkills.has(key.split('|')[1])) };
}

function home() {
  return process.env.USERPROFILE || process.env.HOME || process.cwd();
}

function statePath() {
  return join(home(), '.agent-setup', 'managed-skills.json');
}

function readState() {
  const file = statePath();
  if (!existsSync(file)) return { version: 1, agents: {} };
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (state?.version !== 1 || !state.agents || typeof state.agents !== 'object' || Object.values(state.agents).some((skills) => !Array.isArray(skills) || skills.some((skill) => typeof skill !== 'string'))) {
      throw new Error('unsupported state format');
    }
    return state;
  } catch {
    throw new Error(`Cannot read installer state: ${file}`);
  }
}

function writeState(state) {
  const file = statePath();
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, file);
}

function commandExists(command) {
  if (process.platform === 'win32') {
    return spawnSync('powershell.exe', ['-NoProfile', '-Command', `Get-Command ${command} -ErrorAction SilentlyContinue`], { stdio: 'ignore' }).status === 0;
  }
  return spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
}

function detectedAgents() {
  return agents.filter(({ command }) => commandExists(command));
}

function rulePath(agent) {
  return join(home(), ...agent.rules);
}

function managedRules(rules) {
  return `${markerStart}\n${rules.trim()}\n${markerEnd}\n`;
}

export function mergeRules(existing, rules) {
  const content = managedRules(rules);
  if (existing.includes(markerStart) && existing.includes(markerEnd)) {
    return existing.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}\\r?\\n?`), content);
  }
  return `${existing.trimEnd()}\n\n${content}`;
}

function rulePlan(agent) {
  const target = rulePath(agent);
  if (!existsSync(target)) return { agent, target, action: 'create' };
  const existing = readFileSync(target, 'utf8');
  if (!existing.trim()) return { agent, target, action: 'create' };
  if (existing.includes(markerStart) && existing.includes(markerEnd)) return { agent, target, action: 'update' };
  return { agent, target, action: 'choose' };
}

function applyRules(plan, rules) {
  const content = managedRules(rules);
  mkdirSync(dirname(plan.target), { recursive: true });
  if (plan.action === 'create' || plan.action === 'replace') {
    if (existsSync(plan.target) && plan.action !== 'create') {
      const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
      let backup = `${plan.target}.bak.${timestamp}`;
      let suffix = 1;
      while (existsSync(backup)) backup = `${plan.target}.bak.${timestamp}.${suffix++}`;
      renameSync(plan.target, backup);
      console.log(`Backed up ${plan.agent.name} rules: ${backup}`);
    }
    writeFileSync(plan.target, content);
    return;
  }

  writeFileSync(plan.target, mergeRules(readFileSync(plan.target, 'utf8'), rules));
}

function runNpx(args) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['--yes', 'skills', ...args], {
    encoding: 'utf8',
    env: { ...process.env, DISABLE_TELEMETRY: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `Skills CLI failed: ${command} ${args.join(' ')}`);
  return result.stdout;
}

function grouped(entries) {
  const groups = new Map();
  for (const entry of entries) groups.set(entry.source, [...(groups.get(entry.source) ?? []), entry.skill]);
  return groups;
}

export function missingSkills(entries, installed, agent) {
  return entries.filter(({ skill }) => !installed.some((entry) => entry.name === skill && Array.isArray(entry.agents) && entry.agents.includes(agent.name)));
}

export function linkedManagedSkill(installed, agent, key) {
  const [source, skill] = key.split('|');
  return installed.find((entry) => entry.name === skill && entry.source === source && Array.isArray(entry.agents) && entry.agents.includes(agent.name));
}

function verify(entries, selected) {
  for (const agent of selected) {
    const installed = JSON.parse(runNpx(['ls', '-g', '--agent', agent.id, '--json']));
    const missing = missingSkills(entries, installed, agent);
    if (missing.length) throw new Error(`${missing.map(({ skill }) => skill).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not linked to ${agent.name}`);
  }
}

function printSummary(selected, desired, rulePlans, skillPlans) {
  console.log('\nSetup summary (latest skill versions):');
  console.log(`  Agents: ${selected.map(({ name }) => name).join(', ')}`);
  console.log('  Requested skills:');
  for (const [source, skills] of grouped(desired)) {
    console.log(`    ${source}: ${skills.join(', ')}`);
  }
  for (const plan of rulePlans) console.log(`  Rules: ${plan.agent.name} — ${plan.action} (${plan.target})`);
  for (const [agentId, plan] of skillPlans) {
    const agent = agents.find(({ id }) => id === agentId);
    console.log(`  Skills: ${agent.name}`);
    if (plan.add.length) console.log(`    Add: ${plan.add.map(({ skill }) => skill).join(', ')}`);
    if (plan.refresh.length) console.log(`    Refresh: ${plan.refresh.map(({ skill }) => skill).join(', ')}`);
    if (plan.remove.length) console.log(`    Remove: ${plan.remove.map((key) => key.split('|')[1]).join(', ')}`);
  }
}

async function selectAgents(available, ask) {
  console.log('Detected coding agents:');
  available.forEach((agent, index) => console.log(`  ${index + 1}) ${agent.name}`));
  const selected = (await ask('Select one or more (for example: 1 2): ')).trim().split(/[\s,]+/).filter(Boolean);
  const indexes = [...new Set(selected.map(Number))];
  if (!indexes.length || indexes.some((index) => !Number.isInteger(index) || !available[index - 1])) throw new Error('Select one or more detected agents.');
  return indexes.map((index) => available[index - 1]);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node setup.mjs');
    return;
  }

  const desired = parseManifest(readFileSync(join(root, 'skills.txt'), 'utf8'));
  const rules = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  const available = detectedAgents();
  if (!available.length) throw new Error('No supported coding agents were detected. Install Claude Code, OpenCode, or Codex, then rerun setup.');

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const selected = await selectAgents(available, (question) => prompt.question(question));
    const state = readState();
    const rulePlans = selected.map((agent) => rulePlan(agent));
    for (const plan of rulePlans.filter(({ action }) => action === 'choose')) {
      const answer = (await prompt.question(`${plan.agent.name} already has rules at ${plan.target}. Append a managed section, replace it, or cancel? [a/r/c] `)).trim().toLowerCase();
      if (answer === 'c' || answer === 'cancel') return;
      if (answer === 'r' || answer === 'replace') plan.action = 'replace';
      else if (answer === 'a' || answer === 'append') plan.action = 'append';
      else throw new Error('Choose append, replace, or cancel.');
    }

    const skillPlans = new Map(selected.map((agent) => [agent.id, planSkills(desired, state, agent.id)]));
    printSummary(selected, desired, rulePlans, skillPlans);
    if (!/^(y|yes)$/i.test((await prompt.question('Continue? [y/N] ')).trim())) return;

    for (const [source, skills] of grouped(desired)) {
      console.log(`Installing latest skills from: ${source}`);
      const sourceEntries = desired.filter((entry) => entry.source === source);
      runNpx(['add', source, ...skills.flatMap((skill) => ['--skill', skill]), '--global', ...selected.flatMap(({ id }) => ['--agent', id]), '--yes']);
      for (const agent of selected) {
        state.agents[agent.id] = [...new Set([...(state.agents[agent.id] ?? []), ...sourceEntries.map(({ source: managedSource, skill }) => `${managedSource}|${skill}`)])];
      }
      writeState(state);
    }
    for (const [agentId, plan] of skillPlans) {
      const agent = agents.find(({ id }) => id === agentId);
      const installed = JSON.parse(runNpx(['ls', '-g', '--agent', agentId, '--json']));
      for (const key of plan.remove) {
        const [, skill] = key.split('|');
        if (linkedManagedSkill(installed, agent, key)) {
          console.log(`Removing managed skill from ${agentId}: ${skill}`);
          runNpx(['remove', '--global', '--agent', agentId, '--skill', skill, '--yes']);
        } else {
          console.log(`Leaving independently managed skill on ${agentId}: ${skill}`);
        }
        state.agents[agentId] = state.agents[agentId].filter((managed) => managed !== key);
        writeState(state);
      }
    }
    verify(desired, selected);
    for (const plan of rulePlans) applyRules(plan, rules);
    for (const agent of selected) state.agents[agent.id] = desired.map(({ source, skill }) => `${source}|${skill}`);
    writeState(state);
    console.log('Setup complete.');
  } finally {
    prompt.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

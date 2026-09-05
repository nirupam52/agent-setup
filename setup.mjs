#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export function parseManifest(text) {
  const seen = new Set();
  const entries = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Invalid skill entry: ${rawLine}`);
    const [source, skill] = parts;
    const key = `${source}|${skill}`;
    if (!seen.has(key)) entries.push({ source, skill });
    seen.add(key);
  }

  if (!entries.length) throw new Error('No skills defined in skills.txt');
  return entries;
}

export function groupBySource(entries) {
  const groups = new Map();
  for (const { source, skill } of entries) groups.set(source, [...(groups.get(source) ?? []), skill]);
  return groups;
}

export function parseOptions(argv) {
  let global = false;
  const agents = [];

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--global' || option === '-g') {
      global = true;
      continue;
    }
    if (option === '--agent' || option === '-a') {
      const agent = argv[index + 1];
      if (!agent || agent.startsWith('-')) throw new Error(`${option} requires an agent name`);
      agents.push(agent);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${option}`);
  }

  if (global && !agents.length) {
    throw new Error('Global installation requires at least one --agent with a global skills directory');
  }
  return { global, agents };
}

export function installArgs(source, skills, { global = false, agents = [] } = {}) {
  const args = ['add', source, ...skills.flatMap((skill) => ['--skill', skill])];
  if (global) args.push('--global');
  for (const agent of agents) args.push('--agent', agent);
  return args;
}

export function npxInvocation(args, platform = process.platform) {
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npx.cmd', ...args] };
  return { command: 'npx', args };
}

function runSkills(args) {
  const invocation = npxInvocation(['--yes', 'skills', ...args]);
  const result = spawnSync(invocation.command, invocation.args, { stdio: 'inherit', env: { ...process.env, DISABLE_TELEMETRY: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node setup.mjs [--global --agent <agent>] [--agent <agent> ...]');
    return;
  }

  const options = parseOptions(process.argv.slice(2));
  for (const [source, skills] of groupBySource(parseManifest(readFileSync(join(root, 'skills.txt'), 'utf8')))) {
    console.log(`Installing from ${source}: ${skills.join(', ')}`);
    runSkills(installArgs(source, skills, options));
    if (process.exitCode) return;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`Setup failed: ${error.message}`);
    process.exitCode = 1;
  }
}


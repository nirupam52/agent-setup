import assert from 'node:assert/strict';
import test from 'node:test';

import { linkedManagedSkill, mergeRules, missingSkills, npxInvocation, parseManifest, planSkills } from '../setup.mjs';

test('parses a manifest once per source and skill', () => {
  assert.deepEqual(
    parseManifest('# source|skill\nacme/tools|lint\nacme/tools|lint\nobra/tools|verify\n'),
    [
      { source: 'acme/tools', skill: 'lint' },
      { source: 'obra/tools', skill: 'verify' },
    ],
  );
});

test('plans additions, refreshes, and managed removals per agent', () => {
  const desired = [
    { source: 'acme/tools', skill: 'lint' },
    { source: 'obra/tools', skill: 'verify' },
  ];
  const state = {
    version: 1,
    agents: {
      codex: ['acme/tools|lint', 'old/tools|legacy'],
    },
  };

  assert.deepEqual(planSkills(desired, state, 'codex'), {
    add: [{ source: 'obra/tools', skill: 'verify' }],
    refresh: [{ source: 'acme/tools', skill: 'lint' }],
    remove: ['old/tools|legacy'],
  });
});

test('does not remove a skill when its source changes', () => {
  assert.deepEqual(
    planSkills([{ source: 'new/tools', skill: 'lint' }], { version: 1, agents: { codex: ['old/tools|lint'] } }, 'codex'),
    { add: [{ source: 'new/tools', skill: 'lint' }], refresh: [], remove: [] },
  );
});

test('requires every requested skill to be linked to the selected agent', () => {
  assert.deepEqual(
    missingSkills([{ source: 'acme/tools', skill: 'lint' }], [{ name: 'lint', agents: ['Claude Code'] }], { name: 'Codex' }),
    [{ source: 'acme/tools', skill: 'lint' }],
  );
});

test('does not claim ownership when a manual source replaced a managed skill', () => {
  assert.equal(
    linkedManagedSkill([{ name: 'lint', source: 'manual/tools', agents: ['Codex'] }], { name: 'Codex' }, 'old/tools|lint'),
    undefined,
  );
});

test('uses cmd.exe to launch npx on Windows', () => {
  assert.deepEqual(
    npxInvocation(['--version'], 'win32'),
    { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npx.cmd', '--version'] },
  );
});

test('updates only the managed rule section', () => {
  const first = mergeRules('my personal rule\n', 'shared rule');
  const second = mergeRules(first, 'new shared rule');

  assert.match(first, /my personal rule/);
  assert.match(second, /new shared rule/);
  assert.equal([...second.matchAll(/agent-setup:start/g)].length, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { groupBySource, npxInvocation, parseManifest } from '../setup.mjs';

test('parses and de-duplicates manifest entries', () => {
  assert.deepEqual(
    parseManifest('# source|skill\nacme/tools|lint\nacme/tools|lint\nhttps://example.com/skill?ref=one&tag=two|verify\n'),
    [
      { source: 'acme/tools', skill: 'lint' },
      { source: 'https://example.com/skill?ref=one&tag=two', skill: 'verify' },
    ],
  );
});

test('rejects malformed manifest entries', () => {
  assert.throws(() => parseManifest('acme/tools|lint|ignored\n'), /Invalid skill entry/);
});

test('groups skills into one CLI call per source', () => {
  assert.deepEqual(
    [...groupBySource([
      { source: 'acme/tools', skill: 'lint' },
      { source: 'obra/tools', skill: 'verify' },
      { source: 'acme/tools', skill: 'format' },
    ])],
    [
      ['acme/tools', ['lint', 'format']],
      ['obra/tools', ['verify']],
    ],
  );
});

test('uses cmd.exe for the Windows npx shim', () => {
  assert.deepEqual(
    npxInvocation(['--version'], 'win32'),
    { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npx.cmd', '--version'] },
  );
});

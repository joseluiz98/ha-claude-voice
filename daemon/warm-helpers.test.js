'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractToolSummary } = require('./warm-helpers.js');

test('Bash: prefere description sobre command', () => {
  const s = extractToolSummary('Bash', {
    command: 'curl -s "http://supervisor/core/api/config" -H "Authorization: Bearer x"',
    description: 'Check alexa expose config',
  });
  assert.equal(s, 'Check alexa expose config');
});

test('sem description: cai pro command', () => {
  const s = extractToolSummary('Bash', { command: 'ls -la' });
  assert.equal(s, 'ls -la');
});

test('corte em 200 chars, não 90', () => {
  const long = 'x'.repeat(300);
  const s = extractToolSummary('Bash', { description: long });
  assert.equal(s.length, 200);
});

test('outras ferramentas mantêm file_path/pattern', () => {
  assert.equal(extractToolSummary('Read', { file_path: '/config/x.yaml' }), '/config/x.yaml');
  assert.equal(extractToolSummary('Grep', { pattern: 'foo' }), 'foo');
});

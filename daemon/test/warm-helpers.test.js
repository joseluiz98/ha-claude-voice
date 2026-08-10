// /share/claude-voice/test/warm-helpers.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const h = require('../warm-helpers.js');

test('buildUserMessage produces a single JSON line ending in newline', () => {
  const line = h.buildUserMessage('oi');
  assert.ok(line.endsWith('\n'));
  const j = JSON.parse(line);
  assert.strictEqual(j.type, 'user');
  assert.strictEqual(j.message.role, 'user');
  assert.strictEqual(j.message.content, 'oi');
});

test('parseResultEvent extracts result/session/error from a result event', () => {
  const r = h.parseResultEvent({ type: 'result', subtype: 'success', result: ' pronto ', session_id: 'abc', is_error: false });
  assert.deepStrictEqual(r, { result: 'pronto', sessionId: 'abc', isError: false });
});

test('parseResultEvent returns null for non-result events', () => {
  assert.strictEqual(h.parseResultEvent({ type: 'assistant' }), null);
  assert.strictEqual(h.parseResultEvent({ type: 'system', subtype: 'init' }), null);
});

test('classifyClaudeError detects weekly usage limit + reset time', () => {
  const c = h.classifyClaudeError({ type: 'result', is_error: true, result: 'You have reached your weekly usage limit. Resets 2026-06-29T03:00:00Z' });
  assert.strictEqual(c.kind, 'usage_limited');
  assert.strictEqual(c.limitWindow, 'weekly');
  assert.strictEqual(c.resetsAt, '2026-06-29T03:00:00Z');
});

test('classifyClaudeError detects 5h usage limit', () => {
  const c = h.classifyClaudeError({ type: 'result', is_error: true, result: '5-hour usage limit reached. Try again at 2026-06-22T18:00:00Z' });
  assert.strictEqual(c.kind, 'usage_limited');
  assert.strictEqual(c.limitWindow, '5h');
  assert.strictEqual(c.resetsAt, '2026-06-22T18:00:00Z');
});

test('classifyClaudeError detects auth expiry', () => {
  const c = h.classifyClaudeError({ type: 'result', is_error: true, result: 'OAuth token expired, please run claude login' });
  assert.strictEqual(c.kind, 'auth_expired');
});

test('classifyClaudeError returns other for an unrelated error', () => {
  const c = h.classifyClaudeError({ type: 'result', is_error: true, result: 'tool failed: connection refused' });
  assert.strictEqual(c.kind, 'other');
});

test('classifyClaudeError returns null when not an error', () => {
  assert.strictEqual(h.classifyClaudeError({ type: 'result', is_error: false, result: 'ok' }), null);
});

test('shouldReset fires on max turns', () => {
  const cfg = { resetMode: 'inband', resetIdleMs: 600000, resetMaxTurns: 12, resetMaxAgeMs: 7200000 };
  assert.strictEqual(h.shouldReset({ lastTurnAt: Date.now(), turns: 12, startedAt: Date.now() }, Date.now(), cfg), 'max_turns');
});

test('shouldReset fires on idle only in inband mode', () => {
  const now = 1_000_000_000;
  const st = { lastTurnAt: now - 700000, turns: 1, startedAt: now - 700000 };
  assert.strictEqual(h.shouldReset(st, now, { resetMode: 'inband', resetIdleMs: 600000, resetMaxTurns: 12, resetMaxAgeMs: 7200000 }), 'idle');
  assert.strictEqual(h.shouldReset(st, now, { resetMode: 'respawn', resetIdleMs: 600000, resetMaxTurns: 12, resetMaxAgeMs: 7200000 }), null);
});

test('shouldReset returns null when nothing tripped', () => {
  const now = 1_000_000_000;
  assert.strictEqual(h.shouldReset({ lastTurnAt: now, turns: 1, startedAt: now }, now, { resetMode: 'inband', resetIdleMs: 600000, resetMaxTurns: 12, resetMaxAgeMs: 7200000 }), null);
});

test('nextBackoffMs walks the schedule and clamps to last', () => {
  const s = [0, 30000, 60000, 300000];
  assert.strictEqual(h.nextBackoffMs(0, s), 0);
  assert.strictEqual(h.nextBackoffMs(2, s), 60000);
  assert.strictEqual(h.nextBackoffMs(9, s), 300000);
});

test('shouldReset fires on max_age before idle', () => {
  const now = 10_000_000;
  const st = { lastTurnAt: now, turns: 1, startedAt: now - 7_200_001 };
  assert.strictEqual(h.shouldReset(st, now, { resetMode: 'inband', resetIdleMs: 600000, resetMaxTurns: 12, resetMaxAgeMs: 7200000 }), 'max_age');
});

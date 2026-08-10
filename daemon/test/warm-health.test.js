// /share/claude-voice/test/warm-health.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { WarmClaude } = require('../warm-claude.js');

test('healthOf: estados saudáveis viram ok', () => {
  assert.strictEqual(WarmClaude.healthOf('online'), 'ok');
  assert.strictEqual(WarmClaude.healthOf('starting'), 'ok');
});

test('healthOf: usage_limited vira paused (autocura, não pede gente)', () => {
  assert.strictEqual(WarmClaude.healthOf('usage_limited'), 'paused');
});

test('healthOf: estados terminais viram stuck', () => {
  assert.strictEqual(WarmClaude.healthOf('auth_expired'), 'stuck');
  assert.strictEqual(WarmClaude.healthOf('failed'), 'stuck');
});

// D13: este é o caso que prova o fail-safe e impede a blacklist de voltar por
// descuido. Um estado novo não classificado PRECISA alertar, não passar batido.
test('healthOf: estado desconhecido vira stuck (fail-safe)', () => {
  assert.strictEqual(WarmClaude.healthOf('algo_novo'), 'stuck');
  assert.strictEqual(WarmClaude.healthOf(undefined), 'stuck');
  assert.strictEqual(WarmClaude.healthOf(null), 'stuck');
});

test('getStatus expõe health junto do state cru', () => {
  const wc = new WarmClaude({}, () => {});
  wc.state = 'auth_expired';
  const s = wc.getStatus();
  assert.strictEqual(s.state, 'auth_expired');
  assert.strictEqual(s.health, 'stuck');
});

test('start() emite mudança de estado, para o HA saber na hora', () => {
  const seen = [];
  const cfg = {
    claudeBin: __dirname + '/fixtures/fake-claude.sh',
    cwd: '/tmp', home: '/tmp',
    permissionMode: 'auto', model: 'fake', fallbackModel: '',
    appendSystemPrompt: '', allowedTools: [], mcpConfig: '/dev/null',
    maxConsecutiveFailures: 0, // stop() mata o fixture; sem isto o _onClose
    // tenta calcular backoff com cfg.backoffSchedule ausente e estoura depois
    // que o teste já terminou (SIGKILL é assíncrono).
  };
  const wc = new WarmClaude(cfg, () => {});
  wc.onStateChange = (state, detail) => seen.push(state);
  try {
    wc.start();
    assert.strictEqual(wc.state, 'online');
    assert.deepStrictEqual(seen, ['online'], 'start() precisa emitir exatamente um evento online');
  } finally {
    wc.stop();   // mata o sleep; sem isso o teste deixa processo órfão
  }
});

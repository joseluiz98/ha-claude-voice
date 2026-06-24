// /share/claude-voice/warm-helpers.js
'use strict';

// Envelope de entrada (stream-json). Confirmado no Spike 1: content como string funciona.
function buildUserMessage(text) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: String(text) } }) + '\n';
}

function parseResultEvent(obj) {
  if (!obj || obj.type !== 'result') return null;
  return { result: (obj.result || '').trim(), sessionId: obj.session_id || null, isError: obj.is_error === true };
}

function extractResetsAt(text) {
  const m = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  return m ? m[0] : null;
}

function classifyClaudeError(obj) {
  if (!obj || obj.type !== 'result' || obj.is_error !== true) return null;
  const text = `${obj.result || ''} ${obj.subtype || ''} ${obj.error || ''}`;
  if (/oauth|authenticat|logged out|token expired|please run .*login|invalid api key|not logged in/i.test(text))
    return { kind: 'auth_expired', limitWindow: null, resetsAt: null };
  if (/usage limit|rate limit|limit reached|too many requests|quota/i.test(text)) {
    const weekly = /week/i.test(text);
    return { kind: 'usage_limited', limitWindow: weekly ? 'weekly' : '5h', resetsAt: extractResetsAt(text) };
  }
  return { kind: 'other', limitWindow: null, resetsAt: null };
}

function shouldReset(state, now, cfg) {
  if (state.turns >= cfg.resetMaxTurns) return 'max_turns';
  if ((now - state.startedAt) >= cfg.resetMaxAgeMs) return 'max_age';
  if (cfg.resetMode === 'inband' && (now - state.lastTurnAt) >= cfg.resetIdleMs) return 'idle';
  return null;
}

function nextBackoffMs(attempts, schedule) {
  const i = Math.min(attempts, schedule.length - 1);
  return schedule[i];
}

module.exports = { buildUserMessage, parseResultEvent, classifyClaudeError, shouldReset, nextBackoffMs };

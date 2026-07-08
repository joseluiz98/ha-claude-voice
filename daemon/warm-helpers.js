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

function extractToolSummary(name, input) {
  if (!input || typeof input !== 'object') return '';
  const CAP = 200;
  // Bash traz `description` (intenção legível) — muito mais útil que o comando cru.
  if (typeof input.description === 'string' && input.description.trim())
    return input.description.slice(0, CAP);
  if (typeof input.command === 'string') return input.command.slice(0, CAP);
  if (typeof input.file_path === 'string') return input.file_path.slice(0, CAP);
  if (typeof input.pattern === 'string') return input.pattern.slice(0, CAP);
  const haFields = ['entity_id', 'domain', 'area_id', 'device_id', 'query'];
  for (const f of haFields) {
    if (typeof input[f] === 'string') return input[f].slice(0, CAP);
  }
  return JSON.stringify(input).slice(0, CAP);
}

module.exports = { buildUserMessage, parseResultEvent, classifyClaudeError, shouldReset, nextBackoffMs, extractToolSummary };

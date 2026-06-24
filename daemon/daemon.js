#!/usr/bin/env node
/*
 * Claude Voice Daemon — ponte HTTP Node-RED(Alexa skill) -> Claude Code headless.
 * Roda no Advanced SSH addon, supervisionado por wrapper.sh (respawn + flag restart).
 *
 * Modelo de conversa: ASSÍNCRONO PURO.
 *   NR responde o ack à Alexa em <8s; o daemon processa e FALA a resposta pela
 *   integração alexa_media do HA (imune a ruído; o mic já fechou).
 *   Continuidade de contexto por usuário via `claude --resume` (TTL).
 *
 * Endpoints:
 *   GET  /health  -> { ok, version, uptimeSec, metrics }
 *   POST /ask     -> Bearer token. body:
 *        { prompt, sessionKey?, speak?=true, speakTarget?="alexa_media_last_called",
 *          wait?=false, allowedTools?, timeoutMs? }
 *      wait=false (voz): responde 202 {ok,accepted} na hora; fala depois.
 *      wait=true  (teste): responde {ok,result,sessionId,durationMs} ao terminar.
 *
 * Config: /share/claude-voice/config.json   Log: /share/claude-voice/daemon.log
 */
'use strict';
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const DIR = '/share/claude-voice';
const CONFIG_PATH = `${DIR}/config.json`;
const LOG_PATH = `${DIR}/daemon.log`;
const LOG_CONV_DIR = `${DIR}/conversations`;
const CLAUDE_BIN = '/share/npm-global/bin/claude';
const VERSION = '0.5.0';
const HA_SENSOR = 'sensor.claude_voice_status';
const HEARTBEAT_MS = 30000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const SPEAK_MAXLEN = 600;
const START = Date.now();

// Persona de voz: respostas são FALADAS por uma Echo, então precisam ser curtas
// e sem markdown. Também freia o "flailing" (sem --max-turns nesta CLI).
const VOICE_SYSTEM_PROMPT = [
  'Você é o Jarvis, o assistente de voz da casa, respondendo por uma Echo (Alexa).',
  'Suas respostas são FALADAS em voz alta. Por isso:',
  '- Responda em português do Brasil, em no máximo 1 ou 2 frases curtas.',
  '- Texto puro: sem markdown, listas, blocos de código, emojis ou URLs.',
  '- Vá direto ao ponto, sem preâmbulo ("claro", "com certeza", etc.).',
  '- Você tem ACESSO PLENO: ferramentas do Home Assistant, shell (Bash) e a API REST do HA (use $SUPERVISOR_TOKEN com http://supervisor/core/api/).',
  '- Para LER estado de qualquer entidade (inclusive as que o MCP não expõe, ex: input_select.maquina_de_lavar) use SEMPRE o comando exato /data/claude-voice-workdir/ha_read.sh <entity_id> — é o jeito rápido e padrão de ler estado. Para AÇÕES (ligar/desligar, etc.) use as ferramentas do HA ou curl POST na REST.',
  '- Seja econômico: se não conseguir em poucas tentativas, diga de forma breve que não conseguiu.',
  '- Operações destrutivas são barradas automaticamente por segurança. Se algo for bloqueado, explique em uma frase em vez de insistir.',
].join('\n');

function loadConfig() {
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (_) {}
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) {}
  if (!cfg.token) cfg.token = crypto.randomBytes(24).toString('hex');
  cfg.port = cfg.port || 8585;
  cfg.defaultAllowedTools = cfg.defaultAllowedTools || [
    'mcp__homeassistant__GetLiveContext',
    'mcp__homeassistant__GetDateTime',
    'mcp__homeassistant__todo_get_items',
    'mcp__homeassistant__HassTurnOn',
    'mcp__homeassistant__HassTurnOff',
    'mcp__homeassistant__HassLightSet',
    'mcp__homeassistant__HassClimateSetTemperature',
    'mcp__homeassistant__HassSetVolume',
    'mcp__homeassistant__HassMediaPause',
    'mcp__homeassistant__HassMediaUnpause',
    'Read', 'Grep', 'Glob',
    // Helper read-only (GET em /states/) pré-aprovado: leituras pulam o
    // classificador auto e ficam mais rápidas. Escritas seguem no auto.
    'Bash(/data/claude-voice-workdir/ha_read.sh:*)',
  ];
  // Acesso pleno: nada hard-blocked; o classificador do --permission-mode auto gateia.
  cfg.disallowedTools = cfg.disallowedTools || [];
  cfg.defaultTimeoutMs = cfg.defaultTimeoutMs || 240000;
  // Latência: modelo rápido + MCP mínimo (só HA/NR, evita carregar 8 servidores).
  cfg.model = cfg.model || 'claude-sonnet-4-6';
  cfg.fallbackModel = cfg.fallbackModel || 'claude-opus-4-8';
  // auto = classificador nativo (Sonnet) decide seguro/destrutivo + sonda anti-injeção.
  // Exige Sonnet/Opus (por isso fallback é Opus, não Haiku).
  cfg.permissionMode = cfg.permissionMode || 'auto';
  cfg.mcpConfig = cfg.mcpConfig || `${DIR}/mcp-voice.json`;
  cfg.voiceSystemPrompt = cfg.voiceSystemPrompt || VOICE_SYSTEM_PROMPT;
  cfg.resetMode = cfg.resetMode || 'respawn';           // 'inband' não suportado (Spike 2)
  cfg.inbandResetLine = cfg.inbandResetLine || '';
  cfg.resetIdleMs = cfg.resetIdleMs || 10 * 60 * 1000;
  cfg.resetMaxTurns = cfg.resetMaxTurns || 12;
  cfg.resetMaxAgeMs = cfg.resetMaxAgeMs || 2 * 60 * 60 * 1000;
  cfg.turnTimeoutMs = cfg.turnTimeoutMs || 90 * 1000;
  cfg.backoffSchedule = cfg.backoffSchedule || [0, 30000, 60000, 300000];
  cfg.maxConsecutiveFailures = cfg.maxConsecutiveFailures || 3;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  fs.chmodSync(CONFIG_PATH, 0o600);
  return cfg;
}
const CFG = loadConfig();

const { WarmClaude } = require('./warm-claude.js');
const warm = new WarmClaude({
  claudeBin: CLAUDE_BIN, cwd: '/data/claude-voice-workdir', home: '/root',
  model: CFG.model, fallbackModel: CFG.fallbackModel, permissionMode: CFG.permissionMode,
  appendSystemPrompt: CFG.voiceSystemPrompt, allowedTools: CFG.defaultAllowedTools, mcpConfig: CFG.mcpConfig,
  resetMode: CFG.resetMode, inbandResetLine: CFG.inbandResetLine, resetIdleMs: CFG.resetIdleMs,
  resetMaxTurns: CFG.resetMaxTurns, resetMaxAgeMs: CFG.resetMaxAgeMs,
  backoffSchedule: CFG.backoffSchedule, maxConsecutiveFailures: CFG.maxConsecutiveFailures,
}, log);
warm.onStateChange = (state, detail) => {
  postHeartbeat();
  if (state === 'usage_limited') {
    const when = detail && detail.resetsAt ? ` Retoma por volta de ${detail.resetsAt}.` : '';
    const win = detail && detail.limitWindow === 'weekly' ? 'semanal' : 'das últimas horas';
    notifyJose(`Claude por voz pausado: limite de uso ${win} atingido.${when}`);
  } else if (state === 'auth_expired') {
    notifyJose('Claude por voz parado: login do Claude expirou — rode "claude" no SSH para reautenticar.');
  } else if (state === 'failed') {
    notifyJose('Claude por voz falhou após várias tentativas de reinício.');
  }
};
warm.start();

const metrics = { requestsTotal: 0, errorsTotal: 0, spokenTotal: 0, lastRequestAt: null, lastDurationMs: null, lastError: null, busy: 0 };
const sessions = new Map(); // sessionKey -> { id, lastUsed }

function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch (_) {}
  process.stdout.write(line);
}

function logConversation(entry) {
  try {
    fs.mkdirSync(LOG_CONV_DIR, { recursive: true, mode: 0o700 });
    const date = entry.ts.slice(0, 10); // YYYY-MM-DD (ts já é ISO string)
    const file = `${LOG_CONV_DIR}/${date}.ndjson`;
    const exists = fs.existsSync(file);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    if (!exists) fs.chmodSync(file, 0o600);
  } catch (_) {}
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function authOk(req) {
  const m = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const a = Buffer.from(m[1]); const b = Buffer.from(CFG.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Limpa texto pra TTS: remove markdown e aparа.
function forSpeech(s) {
  let t = (s || '').toString()
    .replace(/```[\s\S]*?```/g, ' ')      // blocos de código
    .replace(/`([^`]*)`/g, '$1')          // inline code
    .replace(/\*\*([^*]*)\*\*/g, '$1')    // bold
    .replace(/\*([^*]*)\*/g, '$1')        // italic
    .replace(/^#{1,6}\s*/gm, '')          // headers
    .replace(/^\s*[-*]\s+/gm, '')         // bullets
    .replace(/\s+/g, ' ').trim();
  if (t.length > SPEAK_MAXLEN) t = t.slice(0, SPEAK_MAXLEN).replace(/\s+\S*$/, '') + '…';
  return t;
}

// Fala via alexa_media (notify.<target>) usando a REST do supervisor.
function speak(target, message) {
  const token = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN;
  if (!token) { log('SPEAK skip: sem token'); return; }
  const payload = JSON.stringify({ message, data: { type: 'tts' } });
  const req = http.request({
    host: 'supervisor', method: 'POST', path: `/core/api/services/notify/${target}`,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, r => { r.resume(); if (r.statusCode >= 300) log('SPEAK http', r.statusCode); else metrics.spokenTotal++; });
  req.on('error', e => log('SPEAK err:', e.message));
  req.write(payload); req.end();
}

// Notificação de infra: SEMPRE só o José (nunca a Karla), espelha o padrão do Pulsar.
function notifyJose(message) {
  const token = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN;
  if (!token) { log('NOTIFY skip: sem token'); return; }
  const payload = JSON.stringify({ title: 'Claude Voice', message });
  const req = http.request({
    host: 'supervisor', method: 'POST', path: '/core/api/services/notify/mobile_app_iphone_de_jose_luiz',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, r => { r.resume(); if (r.statusCode >= 300) log('NOTIFY http', r.statusCode); });
  req.on('error', e => log('NOTIFY err:', e.message));
  req.write(payload); req.end();
}

function postHeartbeat() {
  const token = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN;
  if (!token) return;
  const w = warm.getStatus();
  const payload = JSON.stringify({
    state: w.warm ? 'online' : w.state,
    attributes: {
      friendly_name: 'Claude Voice Daemon', icon: 'mdi:robot-happy', version: VERSION,
      last_seen: new Date().toISOString(), uptime_sec: Math.round((Date.now() - START) / 1000),
      requests_total: metrics.requestsTotal, errors_total: metrics.errorsTotal, spoken_total: metrics.spokenTotal,
      last_request_at: metrics.lastRequestAt, last_duration_ms: metrics.lastDurationMs, last_error: metrics.lastError,
      busy: metrics.busy, active_sessions: sessions.size, port: CFG.port,
      warm: w.warm, claude_state: w.state, turns_since_reset: w.turns, process_age_sec: w.ageSec,
      last_respawn_reason: w.lastRespawnReason, limit_window: w.limitWindow, limit_resets_at: w.limitResetsAt,
    },
  });
  const req = http.request({ host: 'supervisor', method: 'POST', path: `/core/api/states/${HA_SENSOR}`,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, r => { r.resume(); if (r.statusCode >= 300) log('HEARTBEAT http', r.statusCode); });
  req.on('error', e => log('HEARTBEAT err:', e.message));
  req.write(payload); req.end();
}

function getSession(key) {
  if (!key) return null;
  const s = sessions.get(key);
  if (s && (Date.now() - s.lastUsed) < SESSION_TTL_MS) return s.id;
  if (s) sessions.delete(key);
  return null;
}
function setSession(key, id) {
  if (!key || !id) return;
  sessions.set(key, { id, lastUsed: Date.now() });
  // poda
  for (const [k, v] of sessions) if ((Date.now() - v.lastUsed) >= SESSION_TTL_MS) sessions.delete(k);
}

// Roda o claude headless; retorna { result, sessionId } via JSON.
function runClaude({ prompt, resumeId, allowedTools, timeoutMs }, cb) {
  const args = ['-p', prompt, '--output-format', 'json',
    '--permission-mode', CFG.permissionMode,
    '--model', CFG.model,
    '--append-system-prompt', CFG.voiceSystemPrompt,
    '--allowedTools', (allowedTools && allowedTools.length ? allowedTools : CFG.defaultAllowedTools).join(' ')];
  if (CFG.disallowedTools && CFG.disallowedTools.length) args.push('--disallowedTools', CFG.disallowedTools.join(' '));
  if (CFG.fallbackModel) args.push('--fallback-model', CFG.fallbackModel);
  if (CFG.mcpConfig) args.push('--mcp-config', CFG.mcpConfig, '--strict-mcp-config');
  if (resumeId) args.push('--resume', resumeId);
  // Latência: cwd em workdir enxuto (CLAUDE.md mínimo de voz) em vez de /root,
  // que arrastava o /share/CLAUDE.md de ~35KB a cada chamada. HOME segue /root
  // para o claude achar a auth (~/.claude.json) e o MCP cache.
  const child = spawn(CLAUDE_BIN, args, { cwd: '/data/claude-voice-workdir', env: { ...process.env, HOME: '/root' } });
  let out = '', err = '', done = false;
  const killer = setTimeout(() => { if (!done) { done = true; child.kill('SIGKILL'); cb(new Error('timeout')); } }, timeoutMs || CFG.defaultTimeoutMs);
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => err += d);
  child.on('error', e => { if (!done) { done = true; clearTimeout(killer); cb(e); } });
  child.on('close', code => {
    if (done) return; done = true; clearTimeout(killer);
    if (code !== 0) return cb(new Error(`exit ${code}: ${err.trim().slice(0, 300)}`));
    try { const j = JSON.parse(out); cb(null, { result: (j.result || '').trim(), sessionId: j.session_id }); }
    catch (e) { cb(new Error('parse: ' + out.slice(0, 200))); }
  });
}

function handleAsk(j, respond) {
  const prompt = (j.prompt || '').toString().trim();
  if (!prompt) return respond(400, { ok: false, error: 'missing prompt' });
  const wait = j.wait === true;
  const dryRun = j.dryRun === true;
  const speakBack = j.speak !== false;
  const target = (j.speakTarget || 'alexa_media_last_called').toString();
  const key = j.sessionKey ? j.sessionKey.toString() : null;
  const resumeId = getSession(key);
  const t0 = Date.now();
  metrics.requestsTotal++; metrics.lastRequestAt = new Date().toISOString(); metrics.busy++;
  log('ASK:', wait ? '[wait]' : '[async]', key ? `key=${key.slice(0,8)}` : '', JSON.stringify(prompt).slice(0, 160));

  const finish = (e, data) => {
    const durationMs = Date.now() - t0;
    metrics.lastDurationMs = durationMs; metrics.busy--;
    const w = warm.getStatus();
    if (e) {
      metrics.errorsTotal++; metrics.lastError = e.message; log('ERR:', e.message, `(${durationMs}ms)`); postHeartbeat();
      if (!dryRun) logConversation({ ts: new Date(t0).toISOString(), prompt, response: null, ok: false, error: e.message, durationMs, sessionKey: key, sessionId: null, speakTarget: target, warmState: w.state, mode: CFG.mode || 'fast' });
      if (!wait && speakBack) speak(target, 'Desculpa, tive um problema ao processar seu pedido.');
      if (wait) respond(500, { ok: false, error: e.message, durationMs });
      return;
    }
    setSession(key, data.sessionId);
    log('OK:', `(${durationMs}ms)`, JSON.stringify(data.result).slice(0, 160)); postHeartbeat();
    if (!dryRun) logConversation({ ts: new Date(t0).toISOString(), prompt, response: data.result, ok: true, error: null, durationMs, sessionKey: key, sessionId: data.sessionId, speakTarget: target, warmState: w.state, mode: CFG.mode || 'fast' });
    if (!wait && speakBack) speak(target, forSpeech(data.result));
    if (wait) respond(200, { ok: true, result: data.result, sessionId: data.sessionId, durationMs });
  };

  // async puro: confirma na hora, processa depois
  if (!wait) respond(202, { ok: true, accepted: true });
  warm.ask(prompt, j.timeoutMs || CFG.turnTimeoutMs)
    .then(data => finish(null, { result: data.result, sessionId: data.sessionId }))
    .catch(err => finish(err));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health')
    return send(res, 200, { ok: true, version: VERSION, uptimeSec: Math.round((Date.now() - START) / 1000), metrics, activeSessions: sessions.size });
  if (req.method === 'POST' && req.url === '/ask') {
    if (!authOk(req)) { log('AUTH FAIL from', req.socket.remoteAddress); return send(res, 401, { ok: false, error: 'unauthorized' }); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let j; try { j = JSON.parse(body); } catch (_) { return send(res, 400, { ok: false, error: 'invalid json' }); }
      handleAsk(j, (code, obj) => send(res, code, obj));
    });
    return;
  }
  send(res, 404, { ok: false, error: 'not found' });
});

server.listen(CFG.port, '0.0.0.0', () => {
  log(`claude-voice daemon v${VERSION} ouvindo em 0.0.0.0:${CFG.port}`);
  postHeartbeat(); setInterval(postHeartbeat, HEARTBEAT_MS);
});
process.on('SIGTERM', () => { log('SIGTERM, encerrando'); process.exit(0); });

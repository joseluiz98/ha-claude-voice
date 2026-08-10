// /share/claude-voice/warm-claude.js
'use strict';
const { spawn } = require('child_process');
const H = require('./warm-helpers.js');

class WarmClaude {
  constructor(cfg, log = () => {}) {
    this.cfg = cfg; this.log = log;
    this.child = null; this.buf = '';
    this.queue = []; this.current = null; // {resolve, reject, timer, start}
    this.state = 'starting'; // starting|online|failed|usage_limited|auth_expired
    this.turns = 0; this.startedAt = 0; this.lastTurnAt = 0;
    this.lastRespawnReason = null; this.limitWindow = null; this.limitResetsAt = null;
    this._currentTools = []; this._mcpServers = [];
  }

  start() {
    const c = this.cfg;
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--permission-mode', c.permissionMode, '--model', c.model];
    if (c.fallbackModel) args.push('--fallback-model', c.fallbackModel);
    args.push('--append-system-prompt', c.appendSystemPrompt,
      '--allowedTools', c.allowedTools.join(' '),
      '--mcp-config', c.mcpConfig, '--strict-mcp-config');
    const child = spawn(c.claudeBin, args, { cwd: c.cwd, env: { ...process.env, HOME: c.home } });
    this.child = child;
    this.buf = ''; this.startedAt = Date.now(); this.lastTurnAt = Date.now(); this.turns = 0;
    this.state = 'online';
    this.child.stdout.on('data', d => this._onStdout(d));
    this.child.stderr.on('data', d => this.log('WARM stderr:', d.toString().slice(0, 200)));
    this.child.on('close', code => { if (this.child === child) this._onClose(code); });
    this.child.on('error', e => this.log('WARM spawn err:', e.message));
    this.log(`WARM started pid=${this.child.pid}`);
    // D14: sem isto, a recuperação é silenciosa e o HA só descobre no heartbeat
    // periódico seguinte (até 30s depois). O handler de onStateChange não tem
    // ramo para 'online', então nenhuma notificação nova dispara — só o
    // postHeartbeat() imediato.
    this._emitState(null);
  }

  _onStdout(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      if (!line.trim()) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      const cls = H.classifyClaudeError(j);
      if (cls && this.current) { this._handleError(cls); continue; }
      const res = H.parseResultEvent(j);
      if (res && this.current) { this._completeTurn(res); continue; }
      if (j.type === 'system' && j.mcp_servers) {
        this._mcpServers = j.mcp_servers.map(s => s.name || s);
      }
      if (j.type === 'assistant' && Array.isArray(j.message && j.message.content)) {
        for (const block of j.message.content) {
          if (block.type === 'tool_use') {
            this._currentTools.push({
              name: block.name,
              summary: H.extractToolSummary(block.name, block.input),
            });
          }
        }
      }
    }
  }

  _completeTurn(res) {
    const cur = this.current; this.current = null;
    clearTimeout(cur.timer);
    const turnNumber = this.turns + 1;
    this.turns++; this.lastTurnAt = Date.now(); this._failures = 0;
    cur.resolve({ result: res.result, sessionId: res.sessionId, durationMs: Date.now() - cur.start, tools: [...this._currentTools], turnNumber });
    this._drain();
  }

  _onClose(code) {
    this.log(`WARM closed code=${code}`);
    if (this.current) { const cur = this.current; this.current = null; clearTimeout(cur.timer); cur.reject(new Error('process closed')); }
    if (this.state === 'usage_limited' || this.state === 'auth_expired') return; // pausa proposital
    this._failures = (this._failures || 0) + 1;
    if (this._failures > this.cfg.maxConsecutiveFailures) { this.state = 'failed'; this._emitState({ failures: this._failures }); return; }
    const wait = H.nextBackoffMs(this._failures - 1, this.cfg.backoffSchedule);
    this.lastRespawnReason = `crash code=${code}`;
    this.log(`WARM respawn em ${wait}ms (falha ${this._failures})`);
    setTimeout(() => { this.start(); this._drain(); }, wait);
  }

  _emitState(detail) {
    this.log(`WARM state=${this.state}`, detail ? JSON.stringify(detail) : '');
    if (this.onStateChange) this.onStateChange(this.state, detail || null);
  }

  _handleError(cls) {
    const cur = this.current; this.current = null; if (cur) clearTimeout(cur.timer);
    if (cls.kind === 'usage_limited') {
      this.state = 'usage_limited'; this.limitWindow = cls.limitWindow; this.limitResetsAt = cls.resetsAt;
      this._emitState({ limitWindow: cls.limitWindow, resetsAt: cls.resetsAt });
      if (cur) cur.reject(Object.assign(new Error('usage_limited'), cls));
      this._scheduleResume(cls.resetsAt);
      return;
    }
    if (cls.kind === 'auth_expired') {
      this.state = 'auth_expired'; this._emitState(null);
      if (cur) cur.reject(Object.assign(new Error('auth_expired'), cls));
      return; // sem respawn; precisa re-login manual
    }
    // 'other' → trata como falha de turno; rejeita e segue online
    if (cur) cur.reject(Object.assign(new Error('turn_error'), cls));
    this._drain();
  }

  _scheduleResume(resetsAt) {
    let ms = 5 * 60 * 1000; // fallback se não veio horário
    if (resetsAt) { const d = Date.parse(resetsAt) - Date.now(); if (d > 0) ms = d + 5000; }
    ms = Math.min(ms, 7 * 24 * 3600 * 1000); // teto: 1 semana
    this.log(`WARM usage_limited; retoma em ${Math.round(ms / 1000)}s`);
    clearTimeout(this._resumeTimer);
    this._resumeTimer = setTimeout(() => {
      this.state = 'starting'; this.limitWindow = null; this.limitResetsAt = null;
      this.stop(); this.start(); this._drain();
    }, ms);
  }

  ask(prompt, turnTimeoutMs) {
    return new Promise((resolve, reject) => {
      this.queue.push({ prompt, turnTimeoutMs, resolve, reject });
      this._drain();
    });
  }

  _maybeReset() {
    if (this.current) return;
    const reason = H.shouldReset({ lastTurnAt: this.lastTurnAt, turns: this.turns, startedAt: this.startedAt }, Date.now(), this.cfg);
    if (!reason) return;
    this.lastRespawnReason = `reset:${reason}`;
    this.log(`WARM reset (${reason}) mode=${this.cfg.resetMode}`);
    if (this.cfg.resetMode === 'inband' && this.cfg.inbandResetLine) {
      this.child.stdin.write(this.cfg.inbandResetLine); // linha exata do Spike 2
      this.turns = 0; this.startedAt = Date.now(); this.lastTurnAt = Date.now();
    } else {
      this.stop(); this.start(); // respawn: recicla o processo
    }
  }

  _drain() {
    this._maybeReset();
    if (this.current || this.queue.length === 0) return;
    if (this.state !== 'online' || !this.child || this.child.killed) { const q = this.queue.shift(); return q.reject(new Error('not online: ' + this.state)); }
    const q = this.queue.shift();
    const start = Date.now();
    const timer = setTimeout(() => {
      if (!this.current) return;
      const c = this.current; this.current = null;
      c.reject(new Error('turn timeout'));
      // Turno travado = processo suspeito (ex: MCP hang). Mata pra evitar que um
      // result atrasado contamine o próximo turno; Task 5 fará o respawn no _onClose.
      this.stop();
      this._drain();
    }, q.turnTimeoutMs);
    this.current = { resolve: q.resolve, reject: q.reject, timer, start };
    this._currentTools = [];
    this.child.stdin.write(H.buildUserMessage(q.prompt));
  }

  // D13: whitelist dos saudáveis, NÃO blacklist dos ruins. Estado novo que
  // ninguém classificou cai em 'stuck' e alerta, em vez de passar por saudável.
  static healthOf(state) {
    if (state === 'online' || state === 'starting') return 'ok';
    if (state === 'usage_limited') return 'paused';
    return 'stuck';
  }

  getStatus() {
    return { warm: this.state === 'online', state: this.state,
      health: WarmClaude.healthOf(this.state), turns: this.turns,
      ageSec: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      lastRespawnReason: this.lastRespawnReason, limitWindow: this.limitWindow, limitResetsAt: this.limitResetsAt };
  }

  stop() { if (this.child && !this.child.killed) this.child.kill('SIGKILL'); }
}

module.exports = { WarmClaude };

// CSS do painel Jarvis Logbook.
// Servido como JS de propósito, e não como .css: um segundo estático atrás do
// Cloudflare precisaria do mesmo cache-bust ?v=VERSION, e quando ficasse velho
// não quebraria com erro — só renderizaria torto.
export const CSS = `
        jarvis-logbook { display:block; }
        @media (max-width: 760px) {
          :root.jl-sheet-open, html.jl-sheet-open body { overflow:hidden !important; }
        }
        .jl {
          --jl-mono: ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace;
          --jl-accent: var(--primary-color, #2f6df6);
          --jl-power: #7c5cff; --jl-fast: #1f8fff;
          --jl-err: var(--error-color, #e5484d);
          --jl-ok: var(--success-color, #2faf63);
          --jl-border: var(--divider-color, rgba(128,128,128,.22));
          --jl-surface: var(--card-background-color, #fff);
          --jl-bg: var(--primary-background-color, #f5f6f8);
          --jl-text: var(--primary-text-color, #1c1f24);
          --jl-dim: var(--secondary-text-color, #8a929c);
          /* escala tipográfica: base derivada dos tamanhos antigos × ~1.4, em rem */
          --jl-fs-xs: 0.8rem;   /* ~13px  (antes 9–9.5px labels/th/h4/trace-n) */
          --jl-fs-sm: 0.94rem;  /* ~15px  (antes 10.5–12px badge/mono/trace/live) */
          --jl-fs: 1.13rem;     /* ~18px  (antes 13–13.5px corpo/tabela/filtros) */
          --jl-fs-lg: 1.35rem;  /* ~22px  (antes 15–18px botões/close) */
          --jl-fs-xl: 1.63rem;  /* ~26px  (antes 19px número das stats) */
          font-family: var(--paper-font-body1_-_font-family, "Segoe UI", system-ui, sans-serif);
          color: var(--jl-text);
          font-size: var(--jl-fs);
          animation: jl-fade .32s ease both;
        }
        @keyframes jl-fade { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }

        .jl .jl-hdr {
          position: sticky; top: 0; z-index: 4;
          display: flex; align-items: center; gap: 4px;
          height: var(--header-height, 56px); padding: 0 8px;
          background: color-mix(in srgb, var(--jl-bg) 88%, transparent);
          -webkit-backdrop-filter: saturate(1.4) blur(8px); backdrop-filter: saturate(1.4) blur(8px);
          border-bottom: 1px solid var(--jl-border);
        }
        .jl .jl-menu {
          display: none; align-items: center; justify-content: center;
          flex: 0 0 auto; width: 48px; height: 48px; padding: 0; cursor: pointer;
          border: none; border-radius: 50%; background: transparent; color: var(--jl-text);
        }
        .jl[data-menu="1"] .jl-menu { display: inline-flex; }
        .jl .jl-menu svg { fill: currentColor; }
        .jl .jl-menu:hover { background: color-mix(in srgb, var(--jl-text) 10%, transparent); }
        .jl .jl-title { font-size: var(--jl-fs-lg); font-weight: 600; letter-spacing: -.01em; }

        .jl .toolbar {
          position: sticky; top: var(--header-height, 56px); z-index: 3;
          background: color-mix(in srgb, var(--jl-bg) 88%, transparent);
          -webkit-backdrop-filter: saturate(1.4) blur(8px); backdrop-filter: saturate(1.4) blur(8px);
          padding: 16px 18px 12px; border-bottom: 1px solid var(--jl-border);
        }
        .jl .stats { display:flex; gap:10px; flex-wrap:wrap; }
        .jl .stat {
          display:flex; flex-direction:column; min-width:74px; padding:9px 13px;
          border:1px solid var(--jl-border); border-radius:13px; background:var(--jl-surface);
        }
        .jl .stat b { font-family:var(--jl-mono); font-size:var(--jl-fs-xl); font-weight:650; letter-spacing:-.02em; line-height:1.05; }
        .jl .stat small { margin-top:3px; font-size:var(--jl-fs-xs); text-transform:uppercase; letter-spacing:.09em; color:var(--jl-dim); }

        .jl .filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; }
        .jl .filters input, .jl .filters select {
          font:inherit; font-size:var(--jl-fs); padding:6px 11px; color:var(--jl-text);
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface);
        }
        .jl .filters input:focus, .jl .filters select:focus {
          outline:none; border-color:var(--jl-accent);
          box-shadow:0 0 0 3px color-mix(in srgb, var(--jl-accent) 22%, transparent);
        }
        .jl .filters #jl-q { flex:1 1 180px; min-width:150px; }
        /* flex:0 0 auto proíbe o encolhimento em vez de contar com o min-width:auto
           calcular o tamanho intrínseco certo — que é onde o WebKit diverge, e o
           consumo é em iPhone. */
        .jl .filters > #jl-range { flex: 0 0 auto; max-width: 100%; }
        .jl .rp-field { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .jl .filters button {
          font:inherit; font-family:var(--jl-mono); font-size:var(--jl-fs-lg); line-height:1; cursor:pointer;
          width:32px; height:32px; color:var(--jl-text);
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface);
          transition:background .12s, border-color .12s;
        }
        .jl .filters button:hover { background:color-mix(in srgb, var(--jl-accent) 12%, var(--jl-surface)); border-color:var(--jl-accent); }
        .jl .filters label { display:inline-flex; align-items:center; gap:6px; font-size:var(--jl-fs); color:var(--jl-dim); cursor:pointer; }
        .jl .live {
          margin-left:auto; font-family:var(--jl-mono); font-size:var(--jl-fs-sm); font-weight:600;
          color:var(--jl-ok); display:inline-flex; align-items:center; gap:6px; letter-spacing:.02em;
        }
        .jl .live:not(:empty)::before {
          content:""; width:7px; height:7px; border-radius:50%; background:currentColor;
          box-shadow:0 0 0 4px color-mix(in srgb, var(--jl-ok) 22%, transparent); animation:jl-pulse 1.5s ease-in-out infinite;
        }
        @keyframes jl-pulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }

        .jl .wrap { display:flex; gap:16px; align-items:flex-start; padding:8px 18px 28px; }
        .jl .list { flex:1; min-width:0; }
        .jl p.empty, .jl p.note { color:var(--jl-dim); font-size:var(--jl-fs); padding:18px 4px; }
        .jl p.note { padding:8px 4px 0; font-size:var(--jl-fs-sm); }

        .jl table { width:100%; border-collapse:separate; border-spacing:0; font-size:var(--jl-fs); }
        .jl thead th {
          text-align:left; font-size:var(--jl-fs-xs); font-weight:600; text-transform:uppercase; letter-spacing:.09em;
          color:var(--jl-dim); padding:6px 11px 9px; border-bottom:1px solid var(--jl-border); white-space:nowrap;
        }
        .jl tbody td { padding:10px 11px; border-bottom:1px solid color-mix(in srgb, var(--jl-border) 55%, transparent); vertical-align:top; }
        .jl tbody tr { cursor:pointer; transition:background .12s; }
        .jl tbody tr:hover { background:color-mix(in srgb, var(--jl-accent) 7%, transparent); }
        .jl tbody tr.err { background:color-mix(in srgb, var(--jl-err) 8%, transparent); box-shadow:inset 3px 0 0 var(--jl-err); }
        .jl tbody tr.sel { background:color-mix(in srgb, var(--jl-accent) 13%, transparent); box-shadow:inset 3px 0 0 var(--jl-accent); }
        .jl .mono { font-family:var(--jl-mono); font-size:var(--jl-fs-sm); color:var(--jl-dim); white-space:nowrap; }
        .jl .trunc { max-width:22vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .jl .c-day { display: none; }
        .jl thead th[colspan] {
          font-family:var(--jl-mono); font-size:var(--jl-fs-sm); text-transform:none; letter-spacing:0;
          color:var(--jl-text); padding-top:16px;
        }
        .jl thead th[colspan] small { color:var(--jl-dim); }

        .jl .badge {
          display:inline-flex; font-family:var(--jl-mono); font-size:var(--jl-fs-sm); font-weight:600; letter-spacing:.02em;
          padding:2px 9px; border-radius:999px; background:color-mix(in srgb, var(--jl-dim) 20%, transparent); color:var(--jl-dim);
        }
        .jl .badge.b-power { background:color-mix(in srgb, var(--jl-power) 18%, transparent); color:var(--jl-power); }
        .jl .badge.b-fast  { background:color-mix(in srgb, var(--jl-fast) 18%, transparent); color:var(--jl-fast); }
        .jl .dot { display:inline-block; width:9px; height:9px; border-radius:50%; }
        .jl .dot.ok  { background:var(--jl-ok);  box-shadow:0 0 0 3px color-mix(in srgb, var(--jl-ok) 18%, transparent); }
        .jl .dot.err { background:var(--jl-err); box-shadow:0 0 0 3px color-mix(in srgb, var(--jl-err) 18%, transparent); }

        .jl .detail {
          width:340px; flex-shrink:0; align-self:flex-start;
          position:sticky; top: calc(var(--header-height, 56px) + 52px);
          max-height: calc(100vh - var(--header-height, 56px) - 76px); overflow:auto;
          border:1px solid var(--jl-border); border-radius:15px; background:var(--jl-surface);
          padding:16px 18px 20px; box-shadow:0 10px 34px -18px rgba(0,0,0,.4);
          animation:jl-slide .2s ease both;
        }
        @keyframes jl-slide { from { opacity:0; transform:translateX(10px); } to { opacity:1; transform:none; } }
        .jl .detail.hidden { display:none; }
        .jl .detail .d-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:var(--jl-fs); padding-bottom:12px; margin-bottom:6px; border-bottom:1px solid var(--jl-border); }
        .jl .detail #jl-close {
          margin-left:auto; cursor:pointer; font-size:var(--jl-fs-lg); line-height:1; width:26px; height:26px; border-radius:7px;
          border:1px solid var(--jl-border); background:transparent; color:var(--jl-dim); transition:background .12s, color .12s;
        }
        .jl .detail #jl-close:hover { background:color-mix(in srgb, var(--jl-err) 14%, transparent); color:var(--jl-err); border-color:var(--jl-err); }
        .jl .detail h4 { margin:14px 0 5px; font-size:var(--jl-fs-xs); text-transform:uppercase; letter-spacing:.09em; color:var(--jl-dim); }
        .jl .detail .d-body { font-size:var(--jl-fs); line-height:1.5; white-space:pre-wrap; word-break:break-word; }
        .jl .detail .meta { font-family:var(--jl-mono); font-size:var(--jl-fs-sm); line-height:1.85; color:var(--jl-dim); word-break:break-all; }
        .jl .detail .meta b { color:var(--jl-text); font-weight:600; }
        .jl .scrim { display:none; }
        .jl .detail .d-grip { display:none; }

        .jl .rp { position:relative; display:inline-block; }
        .jl .rp-field {
          font:inherit; font-size:var(--jl-fs); padding:6px 11px; cursor:pointer; white-space:nowrap;
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface); color:var(--jl-text);
        }
        .jl .rp-pop {
          position:absolute; z-index:30; top:calc(100% + 6px); left:0; display:flex; gap:0;
          border:1px solid var(--jl-border); border-radius:14px; background:var(--jl-surface);
          box-shadow:0 12px 40px -12px rgba(0,0,0,.45); overflow:hidden;
        }
        .jl .rp-pop.hidden { display:none; }
        .jl .rp-presets { display:flex; flex-direction:column; padding:8px; gap:2px; border-right:1px solid var(--jl-border); min-width:130px; }
        .jl .rp-presets button {
          flex: 0 0 auto; white-space: nowrap;
          font:inherit; font-size:var(--jl-fs); text-align:left; padding:7px 12px; cursor:pointer;
          border:none; border-radius:8px; background:transparent; color:var(--jl-text);
        }
        .jl .rp-presets button:hover { background:color-mix(in srgb, var(--jl-accent) 12%, transparent); }
        .jl .rp-cal { padding:12px 14px; }
        .jl .rp-cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font-weight:600; }
        .jl .rp-cal-head button { font:inherit; cursor:pointer; border:none; background:transparent; color:var(--jl-text); font-size:var(--jl-fs-lg); width:32px; height:32px; border-radius:8px; }
        .jl .rp-grid { display:grid; grid-template-columns:repeat(7,34px); gap:2px; }
        .jl .rp-grid .dow { text-align:center; font-size:var(--jl-fs-xs); color:var(--jl-dim); padding-bottom:4px; }
        .jl .rp-grid .cell { text-align:center; padding:7px 0; border-radius:8px; cursor:pointer; font-size:var(--jl-fs); }
        .jl .rp-grid .cell.out { color:var(--jl-dim); opacity:.5; }
        .jl .rp-grid .cell:hover { background:color-mix(in srgb, var(--jl-accent) 14%, transparent); }
        .jl .rp-grid .cell.in { background:color-mix(in srgb, var(--jl-accent) 16%, transparent); }
        .jl .rp-grid .cell.edge { background:var(--jl-accent); color:#fff; }

        @media (max-width: 760px) {
          .jl .wrap { flex-direction:column; }
          /* table-layout:fixed é o que faz o ellipsis funcionar de verdade: sem
             ele a célula cresce até caber o conteúdo e a tabela estoura. */
          .jl table { table-layout: fixed; }
          .jl thead th, .jl tbody td { padding: 10px 8px; }
          .jl .c-data, .jl .c-user, .jl .c-mode, .jl .c-dur, .jl .c-status { display: none; }
          .jl .c-hora { width: 56px; }
          .jl .c-day {
            display: block; font-family: var(--jl-mono); font-size: var(--jl-fs-xs);
            color: var(--jl-dim); white-space: nowrap;
          }
          .jl .trunc { max-width: none; width: auto; }
          /* Trava de segurança. NÃO mover para .jl: overflow-x:hidden faz o
             overflow-y computar como auto, o elemento vira contêiner de rolagem
             e o .toolbar sticky passa a grudar nele em vez da viewport. */
          .jl .list { overflow-x: hidden; }
          .jl .detail {
            position:fixed; inset:auto 0 0 0; width:auto; top:auto; max-height:82vh;
            border-radius:18px 18px 0 0; box-shadow:0 -10px 40px -10px rgba(0,0,0,.5); z-index:20;
            animation:jl-sheet .22s ease both;
          }
          @keyframes jl-sheet { from { transform:translateY(100%); } to { transform:none; } }
          .jl .scrim {
            display:block;
            position:fixed; inset:0; z-index:19; background:rgba(0,0,0,.5);
            -webkit-backdrop-filter:blur(1px); backdrop-filter:blur(1px);
            touch-action:none; animation:jl-fade .18s ease both;
          }
          .jl .scrim.hidden { display:none; }
          .jl .detail { overscroll-behavior:contain; }
          .jl .detail .d-grip {
            display:block; width:40px; height:4px; margin:-4px auto 10px; border-radius:999px;
            background:var(--jl-border); touch-action:none;
          }
        }
        @media (max-width: 480px) {
          /* 3 colunas em 393pt deixam 123px por coluna ≈ 14 caracteres. Com a
             Resposta fora, o Prompt fica com ~280px ≈ 31 caracteres, e a
             resposta continua a um toque no detalhe. */
          .jl .c-resp { display: none; }
        }
        .jl .detail .d-trace {
          display: flex; flex-direction: column; gap: 0;
          border: 1px solid var(--jl-border); border-radius: 9px; overflow: hidden;
        }
        .jl .detail .d-trace-step {
          display: grid; grid-template-columns: 22px 1fr;
          gap: 0 6px; padding: 5px 10px; align-items: baseline;
          border-bottom: 1px solid color-mix(in srgb, var(--jl-border) 50%, transparent);
          font-family: var(--jl-mono); font-size: var(--jl-fs-sm); transition: background .1s;
        }
        .jl .detail .d-trace-step:last-child { border-bottom: none; }
        .jl .detail .d-trace-step:hover {
          background: color-mix(in srgb, var(--jl-accent) 6%, transparent);
        }
        .jl .detail .d-trace-n {
          color: var(--jl-accent); font-weight: 700; font-size: var(--jl-fs-xs);
          text-align: right; padding-top: 1px; opacity: .7;
        }
        .jl .detail .d-trace-name {
          color: var(--jl-text); font-weight: 600; font-size: var(--jl-fs-sm); line-height: 1.35;
        }
        .jl .detail .d-trace-sum {
          grid-column: 2; color: var(--jl-dim); font-size: var(--jl-fs-xs);
          white-space: normal; overflow-wrap: anywhere;
          display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
          overflow: hidden; line-height: 1.35; opacity: .8;
        }
`;

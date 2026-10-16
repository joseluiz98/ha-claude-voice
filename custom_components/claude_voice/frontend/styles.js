import { MOBILE_QUERY } from "./format.js";

// CSS do painel Jarvis Logbook.
// Servido como JS de propósito, e não como .css: um .css seria um estático a
// mais atrás do Cloudflare e, quando ficasse velho, não quebraria com erro —
// só renderizaria torto. Como módulo ES ele herda o segmento de versão do
// caminho estático (STATIC_URL/VERSION/…), igual aos demais imports relativos.
export const CSS = `
        jarvis-logbook { display:block; }
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
        /* Içado para fora de qualquer @media: keyframes só produzem efeito onde
           são referenciados (as folhas :modal do detalhe e do seletor) —
           aninhado numa media query, ficaria inerte fora dela. */
        @keyframes jl-sheet { from { transform:translateY(100%); } to { transform:none; } }

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
        .jl .jl-menu:focus-visible,
        .jl .rp-field:focus-visible,
        .jl .rp-presets button:focus-visible,
        .jl .rp-cal-head button:focus-visible,
        .jl .rp-grid .cell:focus-visible,
        .jl .filters #jl-refresh:focus-visible,
        .jl #jl-close:focus-visible {
          outline: 2px solid var(--jl-accent); outline-offset: 2px;
        }
        .jl .filters #jl-q { flex:1 1 180px; min-width:150px; }
        /* O campo de data tem largura natural (white-space:nowrap no .rp-field).
           flex:0 0 auto só impede que a linha do flex o comprima abaixo disso;
           max-width:100% é o teto que faz o ellipsis do .rp-field ser alcançável
           num intervalo longo em tela estreita, em vez de estourar a toolbar.
           NÃO existe aqui nenhuma regra genérica de ".filters button": o campo de
           data É um <button class="rp-field"> dentro de .filters (e o popover do
           picker também vive aqui dentro, com seus presets, setas e células).
           Um seletor de botão genérico neste escopo casaria em todos eles e
           venceria por especificidade — foi exatamente assim que o campo de data
           ficou preso em 32px. Estilo de botão aqui: sempre por id/classe. */
        .jl .filters > #jl-range { flex: 0 0 auto; max-width: 100%; }
        .jl .filters label { display:inline-flex; align-items:center; gap:6px; font-size:var(--jl-fs); color:var(--jl-dim); cursor:pointer; }
        /* Injetado por jarvis-logbook.js dentro de #jl-live quando a inscrição de
           realtime falha ("↻ atualizar"). É um botão de texto: largura pelo
           conteúdo, altura pelo padding — nunca uma caixa quadrada. */
        .jl .filters #jl-refresh {
          font:inherit; font-family:var(--jl-mono); font-size:var(--jl-fs-sm); line-height:1.2; cursor:pointer;
          padding:6px 11px; color:var(--jl-text); white-space:nowrap;
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface);
          transition:background .12s, border-color .12s;
        }
        .jl .filters #jl-refresh:hover { background:color-mix(in srgb, var(--jl-accent) 12%, var(--jl-surface)); border-color:var(--jl-accent); }
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

        @keyframes jl-slide { from { opacity:0; transform:translateX(10px); } to { opacity:1; transform:none; } }
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
        .jl .rp { position:relative; display:inline-block; max-width:100%; }
        /* Bloco ÚNICO do campo de data — os dois blocos que existiam (um só com o
           teto/ellipsis, outro com a caixa) viviam a 88 linhas de distância e
           foram o que escondeu, na revisão, que algo mais estava fixando a
           largura. Largura = conteúdo (nowrap); max-width:100% + ellipsis são a
           rede para um intervalo longo ("2026-08-01 → 2026-08-31") numa toolbar
           estreita: sem eles o botão estoura a linha, com eles ele encolhe até o
           teto do #jl-range e degrada em reticências. No caso normal nenhum dos
           dois tem efeito. */
        .jl .rp-field {
          font:inherit; font-size:var(--jl-fs); padding:6px 11px; cursor:pointer; white-space:nowrap;
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface); color:var(--jl-text);
          max-width:100%; overflow:hidden; text-overflow:ellipsis;
          transition:background .12s, border-color .12s;
        }
        /* O realce de hover do campo vinha de carona na regra órfã
           ".jl .filters button" — a mesma que o esmagava em 32px. Removida ela,
           o campo ficou sem nenhuma resposta ao mouse. Devolvido aqui com o
           padrão dos outros controles (#jl-refresh, presets, células): tinta de
           acento no fundo e na borda. Por classe, nunca por seletor genérico de
           botão dentro de .filters — ver o comentário do #jl-range acima. */
        .jl .rp-field:hover {
          background:color-mix(in srgb, var(--jl-accent) 12%, var(--jl-surface));
          border-color:var(--jl-accent);
        }
        .jl .rp-pop {
          display:flex; gap:0;
          border:1px solid var(--jl-border); border-radius:14px; background:var(--jl-surface);
          box-shadow:0 12px 40px -12px rgba(0,0,0,.45); overflow:hidden;
        }
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
        /* Bloco único da célula do calendário. As declarações de reset de botão
           (font/border/background/color) vinham num segundo bloco lá embaixo,
           herdado de quando a célula era <span>; fundidas aqui. A ordem não muda
           nada: todo modificador (.out, .in, .edge, :hover) tem 4 classes de
           especificidade contra as 3 desta regra e continua vencendo. */
        .jl .rp-grid .cell {
          font:inherit; font-size:var(--jl-fs); text-align:center; padding:7px 0;
          border:none; border-radius:8px; background:transparent; color:var(--jl-text); cursor:pointer;
        }
        .jl .rp-grid .cell.out { color:var(--jl-dim); opacity:.5; }
        .jl .rp-grid .cell:hover { background:color-mix(in srgb, var(--jl-accent) 14%, transparent); }
        .jl .rp-grid .cell.in { background:color-mix(in srgb, var(--jl-accent) 16%, transparent); }
        .jl .rp-grid .cell.edge { background:var(--jl-accent); color:#fff; }

        .jl .rp-inner { display: flex; }

        /* presets como faixa de chips rolável */
        .jl [data-presets="chips"] .rp-inner { flex-direction: column; }
        .jl [data-presets="chips"] .rp-presets {
          flex-direction: row; flex-wrap: nowrap; gap: 8px; min-width: 0;
          overflow-x: auto; overscroll-behavior-x: contain;
          border-right: none; border-bottom: 1px solid var(--jl-border);
          padding: 4px 4px 12px;
        }
        .jl [data-presets="chips"] .rp-presets button {
          min-height: 40px; padding: 0 14px; border: 1px solid var(--jl-border);
          border-radius: 999px; text-align: center;
        }
        .jl [data-presets="chips"] .rp-cal { padding: 12px 0 0; }
        .jl [data-presets="chips"] .rp-grid {
          grid-template-columns: repeat(7, minmax(0, 1fr));
          max-width: 320px; margin: 0 auto;
        }
        .jl [data-presets="chips"] .rp-grid .cell { min-height: 40px; }

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
        }
        @media (max-width: 480px) {
          /* 3 colunas em 393pt deixam 123px por coluna ≈ 14 caracteres. Com a
             Resposta fora, o Prompt fica com ~280px ≈ 31 caracteres, e a
             resposta continua a um toque no detalhe. */
          .jl .c-resp { display: none; }
        }
        /* Spec 2026-10-16: folhas e gaveta vivem na camada superior (<dialog>
           modal / popover manual). Lá nenhum ancestral com transform ou
           backdrop-filter prende o position:fixed, e o scroll da página não
           mexe na posição — era o que escondia a folha com listas longas. */
        :root.jl-sheet-open, html.jl-sheet-open body { overflow: hidden !important; }

        .jl dialog.detail, .jl dialog.rp-sheet {
          margin: 0; padding: 0; border: none; overflow: hidden;
          max-width: 100%; max-height: 100%;
          color: var(--jl-text); background: var(--jl-surface);
        }
        /* o display do autor venceria o display:none do user agent */
        .jl dialog:not([open]):not(:popover-open) { display: none; }
        .jl .sheet-body {
          box-sizing: border-box; height: 100%; overflow: auto; overscroll-behavior: contain;
          padding: 8px 18px 20px;
        }
        .jl .d-grip {
          display: block; width: 40px; height: 4px; margin: 4px auto 12px;
          border-radius: 999px; background: var(--jl-border); touch-action: none;
        }

        /* Folha (celular): sempre 90% da altura visível, presa ao rodapé. */
        .jl .detail:modal, .jl .rp-sheet:modal {
          position: fixed; inset: auto 0 0 0; width: 100%;
          height: 90vh; height: 90dvh;
          border-radius: 18px 18px 0 0; box-shadow: 0 -10px 40px -10px rgba(0,0,0,.5);
          /* backwards, não both: "both" prende transform:none depois da
             animação e o arrasto da alça (sheet.js) deixa de acompanhar o dedo. */
          animation: jl-sheet .22s ease backwards;
        }
        .jl .detail::backdrop, .jl .rp-sheet::backdrop { background: rgba(0,0,0,.5); }

        /* Gaveta (desktop): do topo ao rodapé, à direita, sem fundo escuro; a
           tabela atrás continua com a largura toda e clicável. O display:block
           explícito não depende de o user agent liberar <dialog popover>. */
        .jl .detail:popover-open {
          display: block;
          position: fixed; inset: 0 0 0 auto; width: min(480px, 40vw);
          height: 100vh; height: 100dvh;
          border-left: 1px solid var(--jl-border); box-shadow: -14px 0 40px -18px rgba(0,0,0,.45);
          animation: jl-slide .2s ease both;
        }
        .jl .detail:popover-open .d-grip { display: none; }

        /* Popover do seletor (desktop): posição vem do JS (popoverPosition). */
        .jl .rp-pop:popover-open {
          position: fixed; inset: auto; margin: 0; padding: 0; color: var(--jl-text);
        }
        .jl .rp-pop:not(:popover-open) { display: none; }

        @media ${MOBILE_QUERY} {
          .jl .jl-hdr, .jl .toolbar { position: static; }
          .jl .detail #jl-close { width: 40px; height: 40px; font-size: var(--jl-fs-xl); }
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
        @media (prefers-reduced-motion: reduce) {
          .jl, .jl *, .jl *::before, .jl *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
          .jl .live:not(:empty)::before { animation: none; opacity: 1; }
        }
`;

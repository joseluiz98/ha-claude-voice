'use strict';
/* Teste do speech-format: casos unitários dos buracos + regressão nas respostas reais. */
const assert = require('assert');
const fs = require('fs');
const { forSpeech, needsRewrite } = require('../speech-format.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ FAIL: ${name}${detail ? '\n      ' + detail : ''}`); }
}
function noneOf(s, chars) { return chars.every(c => !s.includes(c)); }

console.log('== Casos unitários (buracos identificados) ==');

// Tabelas
let r = forSpeech('| Card | Função |\n|---|---|\n| Mushroom | minimalista |');
check('tabela sem pipes', !r.includes('|'), JSON.stringify(r));
check('tabela sem separador ---', !r.includes('---'), JSON.stringify(r));

// Régua horizontal
r = forSpeech('Primeira coisa.\n\n---\n\nSegunda coisa.');
check('regua --- some', !r.includes('---'), JSON.stringify(r));

// Links e URLs
r = forSpeech('Veja [a doc](https://home-assistant.io/x) para detalhes.');
check('link vira texto', r.includes('a doc') && !r.includes('http'), JSON.stringify(r));
r = forSpeech('Fonte: https://github.com/foo/bar e www.exemplo.com aqui.');
check('URLs cruas removidas', !r.includes('http') && !r.includes('www.'), JSON.stringify(r));

// Seção Sources no fim
r = forSpeech('A resposta é X.\n\nSources:\n- [doc](https://a.com)\n- [outro](https://b.com)');
check('secao Sources removida', !r.toLowerCase().includes('sources') && !r.includes('http'), JSON.stringify(r));

// Emojis
r = forSpeech('Opção 1 ✅ recomendada ⭐ mas cara 💰 evite ❌');
check('emojis removidos', noneOf(r, ['✅', '⭐', '💰', '❌']), JSON.stringify(r));

// Setas
r = forSpeech('Settings → Voice → Alexa');
check('setas removidas', !r.includes('→'), JSON.stringify(r));

// Listas numeradas
r = forSpeech('Passos:\n1. Ligue a TV\n2. Espere\n3. Descubra');
check('lista numerada sem marcador', !/\b1\.\s/.test(r) && r.includes('Ligue a TV'), JSON.stringify(r));

// entity_id snake_case
r = forSpeech('Troquei para media_player.living_room_samsung_un58au7700_2021_crystal_uhd agora.');
check('entity_id vira nome falavel',
  r.includes('living room samsung') && !r.includes('media_player.'), JSON.stringify(r));
// domínio normal NÃO deve ser mexido
r = forSpeech('O estado está off e on.');
check('palavras normais intactas', r.includes('off') && r.includes('on'), JSON.stringify(r));

// Truncamento em frase completa
const longo = 'Primeira frase completa aqui. '.repeat(30);
r = forSpeech(longo);
check('trunca <= limite+1', r.length <= 601, `len=${r.length}`);
check('trunca em frase (termina com . ou …)', /[.…]$/.test(r), JSON.stringify(r.slice(-40)));

// needsRewrite
check('needsRewrite: resposta curta boa = false', needsRewrite('Hoje tem Espanha x Áustria às 16h.') === false);
check('needsRewrite: relatorio longo = true', needsRewrite('x'.repeat(500)) === true);
check('needsRewrite: tabela = true', needsRewrite('| a | b |\n| c | d |') === true);
check('needsRewrite: header markdown = true', needsRewrite('## Título\ntexto') === true);

console.log('\n== Regressão: respostas reais gravadas ==');
const dir = '/share/claude-voice/conversations';
const files = ['2026-07-02.ndjson', '2026-07-03.ndjson']
  .map(f => `${dir}/${f}`).filter(fs.existsSync);
let recs = [];
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (line.trim()) recs.push(JSON.parse(line));
  }
}
recs = recs.slice(-10).filter(x => x.response);
for (const rec of recs) {
  const out = forSpeech(rec.response);
  // Invariantes: nada de pipe/asterisco/hash/backtick/http/emoji sobra na fala
  const clean = noneOf(out, ['|', '#', '`', '```']) && !/https?:\/\//.test(out) && !EMOJI(out);
  check(`fala limpa p/ prompt "${(rec.prompt || '').slice(0, 30)}..."`, clean, JSON.stringify(out.slice(0, 120)));
}
function EMOJI(s) { return /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(s); }

console.log(`\n== Resultado: ${pass} pass, ${fail} fail ==`);
process.exit(fail ? 1 : 0);

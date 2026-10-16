// Bottom sheet compartilhado pelo detalhe do registro (celular) e pelo date picker.
// O estado de "folha aberta" vive aqui, e não espalhado entre os consumidores:
// é o que garante a regra de nunca haver duas folhas abertas.
// Cada folha é um <dialog> aberto com showModal(): vai para a camada superior
// do navegador (top layer), onde nenhum ancestral nem o scroll da página mexe
// na posição, e o fundo escuro é o ::backdrop do próprio dialog.

let atual = null;
// Ouvintes de cancel/backdrop ligados uma vez por <dialog>: reabrir não pode duplicá-los.
const ligados = new WeakSet();

export function currentSheetEl() {
  return atual ? atual.el : null;
}

function ligar(el) {
  if (ligados.has(el)) return;
  ligados.add(el);
  // Esc / "voltar" do Android: o <dialog> fecharia sozinho e deixaria a trava de
  // scroll e a exclusão mútua presas. Todo fechamento passa por closeSheet().
  el.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (atual && atual.el === el) closeSheet();
  });
  // O conteúdo vive num único .sheet-body que ocupa a folha inteira: um clique
  // cujo alvo é o próprio <dialog> só pode ter vindo do ::backdrop.
  el.addEventListener("click", (e) => {
    if (e.target === el && atual && atual.el === el) closeSheet();
  });
}

export function openSheet({ el, onClose }) {
  if (atual && atual.el !== el) closeSheet();
  ligar(el);
  el.style.transform = "";
  if (!el.open) el.showModal();
  document.documentElement.classList.add("jl-sheet-open");
  atual = { el, onClose: onClose || null };
  bindSheetDrag(el);
}

export function closeSheet() {
  if (!atual) return;
  const { el, onClose } = atual;
  // zerado ANTES do callback: o consumidor costuma chamar closeSheet() de volta
  // ao limpar seu próprio estado, e a reentrada precisa sair aqui.
  atual = null;
  el.style.transform = "";
  if (el.open) el.close();
  document.documentElement.classList.remove("jl-sheet-open");
  if (onClose) onClose();
}

// Mudança de regime (folha -> gaveta): solta o estado compartilhado e fecha o
// modal SEM disparar onClose — o detalhe reabre como gaveta com a seleção
// intacta. Fechar de verdade seria perda de trabalho; não soltar deixaria a
// trava de scroll presa no <html>, que é do HA inteiro. Só age se `el` for
// MESMO a folha corrente.
export function releaseSheet(el) {
  if (!atual || atual.el !== el) return;
  atual = null;
  el.style.transform = "";
  el.style.transition = "";
  if (el.open) el.close();
  document.documentElement.classList.remove("jl-sheet-open");
}

// Arrastar a alça para baixo dispensa a folha. Sem alça, não há gesto.
// Exportado: consumidores cujo miolo reescreve o innerHTML depois de abrir
// (ex.: RangePicker ao navegar de mês) trocam a .d-grip por um nó novo, sem os
// handlers — precisam poder rechamar isto após cada re-render.
export function bindSheetDrag(el) {
  const grip = el.querySelector(".d-grip");
  if (!grip) return;
  let inicioY = null;
  let dy = 0;
  grip.ontouchstart = (e) => {
    if (!e.touches || !e.touches.length) return;
    inicioY = e.touches[0].clientY;
    dy = 0;
    el.style.transition = "none";
  };
  grip.ontouchmove = (e) => {
    if (inicioY == null || !e.touches || !e.touches.length) return;
    dy = e.touches[0].clientY - inicioY;
    if (dy > 0) el.style.transform = `translateY(${dy}px)`;
  };
  grip.ontouchend = () => {
    el.style.transition = "";
    if (dy > 90) closeSheet();
    else el.style.transform = "";
    inicioY = null;
    dy = 0;
  };
}

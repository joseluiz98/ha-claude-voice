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
  // Só fecha se o gesto também COMEÇOU no fundo: selecionar texto arrastando
  // até a faixa escura gera um click no ancestral comum (o <dialog>).
  let inicio = null;
  el.addEventListener("pointerdown", (e) => { inicio = e.target; });
  el.addEventListener("click", (e) => {
    const doFundo = e.target === el && (inicio === null || inicio === el);
    inicio = null;
    if (doFundo && atual && atual.el === el) closeSheet();
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

// Arrastar para baixo dispensa a folha: pela alça ou por qualquer ponto do
// conteúdo, desde que ele esteja rolado até o topo (como as folhas nativas).
// O touchmove faz preventDefault enquanto o gesto é da folha; sem isso, puxar
// a folha para baixo virava o pull-to-refresh da página (recarregava o HA).
// Handlers por propriedade no próprio <dialog> (não passivos, e sobrevivem ao
// innerHTML do conteúdo). Gaveta (não ocupa a largura toda) não arrasta.
export function bindSheetDrag(el) {
  let inicioY = null;
  let dy = 0;
  let arrastando = false;
  const corpo = () => el.querySelector(".sheet-body");
  el.ontouchstart = (e) => {
    inicioY = null;
    if (!e.touches || !e.touches.length) return;
    if (el.getBoundingClientRect().width < window.innerWidth - 1) return;
    inicioY = e.touches[0].clientY;
    dy = 0;
    arrastando = false;
  };
  el.ontouchmove = (e) => {
    if (inicioY == null || !e.touches || !e.touches.length) return;
    dy = e.touches[0].clientY - inicioY;
    if (!arrastando) {
      const c = corpo();
      if (dy > 0 && (!c || c.scrollTop <= 0)) {
        arrastando = true;
        el.style.transition = "none";
      } else {
        inicioY = null;   // gesto de rolagem do conteúdo: não é da folha
        return;
      }
    }
    e.preventDefault();
    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };
  el.ontouchend = () => {
    if (arrastando) {
      el.style.transition = "";
      if (dy > 90) closeSheet();
      else el.style.transform = "";
    }
    inicioY = null;
    dy = 0;
    arrastando = false;
  };
}

// Bottom sheet compartilhado pelo detalhe do registro e pelo date picker.
// O estado de "folha aberta" vive aqui, e não espalhado entre os consumidores:
// é o que garante a regra de nunca haver duas folhas nem dois scrims.

let atual = null;

export function currentSheetEl() {
  return atual ? atual.el : null;
}

export function openSheet({ el, scrim, onClose }) {
  if (atual && atual.el !== el) closeSheet();
  el.classList.remove("hidden");
  el.style.transform = "";
  if (scrim) {
    scrim.classList.remove("hidden");
    scrim.onclick = () => closeSheet();
  }
  document.documentElement.classList.add("jl-sheet-open");
  atual = { el, scrim, onClose: onClose || null };
  bindSheetDrag(el);
}

export function closeSheet() {
  if (!atual) return;
  const { el, scrim, onClose } = atual;
  // zerado ANTES do callback: o consumidor costuma chamar closeSheet() de volta
  // ao limpar seu próprio estado, e a reentrada precisa sair aqui.
  atual = null;
  el.classList.add("hidden");
  el.style.transform = "";
  if (scrim) scrim.classList.add("hidden");
  document.documentElement.classList.remove("jl-sheet-open");
  if (onClose) onClose();
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

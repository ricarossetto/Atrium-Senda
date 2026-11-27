// Esqueleto de carregamento com revelação do conteúdo.
//
// Comportamento (inspirado na transição "Skeleton loader and reveal", de transitions.dev, e
// reescrito com os tokens de movimento do ATRIUM): enquanto os dados não chegam, barras
// pulsam no lugar do conteúdo; quando chegam, o esqueleto some em fade com leve desfoque e o
// conteúdo real aparece no mesmo espaço. As duas camadas ficam empilhadas numa grade, então
// o espaço não muda de altura na troca, e o esqueleto sai do fluxo ao terminar.
//
// É só apresentação: não busca dados, não grava nada e não toca no estado. Com movimento reduzido
// a troca é imediata e nada pulsa.

const SLOT_CLASS = 'v2-skeleton-slot';
const FALLBACK_REVEAL_MS = 340;
const MIN_ROWS = 1;
const MAX_ROWS = 8;

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

/** Barras do esqueleto: "lines" (texto corrido) ou "list" (itens com título e linha de apoio). */
export function skeletonMarkup({ variant = 'lines', rows = 3 } = {}) {
  const count = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.trunc(Number(rows)) || 3));
  if (variant === 'list') {
    const item = '<div class="v2-skeleton-row"><span class="v2-skeleton-bar is-title"></span><span class="v2-skeleton-bar is-meta"></span></div>';
    return `<div class="v2-skeleton-bars is-list">${item.repeat(count)}</div>`;
  }
  return `<div class="v2-skeleton-bars is-lines">${'<span class="v2-skeleton-bar"></span>'.repeat(count)}</div>`;
}

/** Slot em carregamento dentro do container, ou null. */
function loadingSlot(container) {
  const slot = container?.firstElementChild;
  return slot?.classList?.contains(SLOT_CLASS) && slot.dataset?.state === 'loading' ? slot : null;
}

function writeContent(target, content) {
  if (!target) return;
  if (content === null || content === undefined) return;
  if (typeof content === 'string') target.innerHTML = content;
  else target.replaceChildren(content);
}

function revealMilliseconds(windowRef, slot) {
  const raw = windowRef?.getComputedStyle?.(slot)?.getPropertyValue?.('--v2-skeleton-reveal-duration')?.trim() || '';
  const match = raw.match(/^([\d.]+)(ms|s)$/);
  if (!match) return FALLBACK_REVEAL_MS;
  return Math.round(Number(match[1]) * (match[2] === 's' ? 1000 : 1));
}

/** Conclui a revelação: mostra o conteúdo, apaga o esqueleto depois do fade e libera a altura. */
function finishReveal(container, slot) {
  if (!slot || slot.dataset.state !== 'loading') return;
  const windowRef = container.ownerDocument?.defaultView;
  slot.dataset.state = 'revealed';
  container.removeAttribute?.('aria-busy');
  slot.querySelector(':scope > .sr-only')?.remove();
  const skeleton = slot.querySelector(':scope > .v2-skeleton');
  const reduced = Boolean(windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const done = () => {
    skeleton?.remove();
    slot.dataset.state = 'done';
  };
  if (reduced || !windowRef?.setTimeout) { done(); return; }
  windowRef.setTimeout(done, revealMilliseconds(windowRef, slot) + 40);
}

/**
 * Troca o conteúdo do container por um esqueleto pulsando. Devolve `{ slot, content, reveal }`:
 * `content` é o elemento em que o chamador escreve o conteúdo real; `reveal()` faz a troca.
 *
 * - `label`: texto lido por leitores de tela enquanto carrega (o esqueleto em si é decorativo).
 * - `autoReveal`: revela sozinho quando `aria-busy` do `content` vira "false", para fluxos que
 *   já marcam o fim do carregamento nesse elemento.
 */
export function showSkeleton(container, { label = 'Carregando…', variant = 'lines', rows = 3, markup = '', autoReveal = false } = {}) {
  if (!container) return null;
  container.innerHTML = `<div class="${SLOT_CLASS}" data-state="loading">`
    + `<p class="sr-only" role="status">${escapeText(label)}</p>`
    + `<div class="v2-skeleton is-pulsing" aria-hidden="true">${markup || skeletonMarkup({ variant, rows })}</div>`
    + '<div class="v2-skeleton-content"></div>'
    + '</div>';
  container.setAttribute('aria-busy', 'true');
  const slot = container.firstElementChild;
  const content = slot.querySelector(':scope > .v2-skeleton-content');
  const reveal = () => finishReveal(container, slot);
  const windowRef = container.ownerDocument?.defaultView;
  if (autoReveal && windowRef?.MutationObserver) {
    const observer = new windowRef.MutationObserver(() => {
      if (content.getAttribute('aria-busy') === 'false') { observer.disconnect(); reveal(); }
    });
    observer.observe(content, { attributes: true, attributeFilter: ['aria-busy'] });
  }
  return { slot, content, reveal };
}

/**
 * Coloca o conteúdo real no container. Se há um esqueleto em carregamento, faz a troca com a
 * transição; se não há (o container foi refeito, ou nunca mostrou esqueleto), só escreve o
 * conteúdo, sem animação e sem deixar `aria-busy` preso.
 */
export function revealInto(container, content) {
  if (!container) return;
  const slot = loadingSlot(container);
  if (!slot) {
    writeContent(container, content);
    container.removeAttribute?.('aria-busy');
    return;
  }
  writeContent(slot.querySelector(':scope > .v2-skeleton-content'), content);
  finishReveal(container, slot);
}

/** Há um esqueleto em carregamento neste container? */
export function isSkeletonLoading(container) {
  return Boolean(loadingSlot(container));
}

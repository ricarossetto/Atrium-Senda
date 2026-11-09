/**
 * ATRIUM — Tamanho de painéis laterais (maximizar/restaurar).
 *
 * Contrato:
 * - Estado efêmero no próprio DOM (`data-panel-size="maximized"`), nunca no Store,
 *   na `revision` ou em `localStorage`.
 * - Alterna sobre o MESMO DOM: não fecha/reabre, não recria formulário, não perde
 *   valores, seleção, foco ou rolagem, e não dispara request.
 * - O controle é `[data-panel-size-toggle]` dentro do painel; `aria-pressed`, nome
 *   acessível e ícone refletem o estado.
 * - Em telas estreitas, onde o painel já ocupa a viewport, o controle fica oculto
 *   (o CSS do shell cuida disso) e o estado maximizado é inerte.
 * - Escape e fechamento continuam com o contrato existente do painel.
 */

export const PANEL_SIZE_ATTR = 'data-panel-size';
export const PANEL_MAXIMIZED = 'maximized';
const ANIMATION_CLASS = 'is-panel-size-shifting';

export function isPanelMaximized(panel) {
  return panel?.getAttribute?.(PANEL_SIZE_ATTR) === PANEL_MAXIMIZED;
}

export function panelSizeToggle(panel) {
  return panel?.querySelector?.('[data-panel-size-toggle]') || null;
}

export function syncPanelSizeControl(panel) {
  const button = panelSizeToggle(panel);
  if (!button) return false;
  const maximized = isPanelMaximized(panel);
  const label = maximized ? 'Restaurar painel' : 'Maximizar painel';
  button.setAttribute('aria-pressed', maximized ? 'true' : 'false');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  const use = button.querySelector('use');
  if (use) {
    // Preserva o caminho oficial do sprite (incluindo o cache-busting) do próprio botão.
    const base = (use.getAttribute('href') || '').split('#')[0] || 'assets/icons/atrium-ui-icons.svg';
    use.setAttribute('href', `${base}#atrium-icon-${maximized ? 'restore' : 'maximize'}`);
  }
  return true;
}

export function setPanelSize(panel, maximized) {
  if (!panel?.setAttribute) return false;
  if (maximized) panel.setAttribute(PANEL_SIZE_ATTR, PANEL_MAXIMIZED);
  else panel.removeAttribute(PANEL_SIZE_ATTR);
  syncPanelSizeControl(panel);
  return isPanelMaximized(panel);
}

export function resetPanelSize(panel) {
  if (!panel?.removeAttribute) return;
  panel.removeAttribute(PANEL_SIZE_ATTR);
  panel.classList.remove(ANIMATION_CLASS);
}

export function togglePanelSize(panel, { documentRef = globalThis.document, duration = 320 } = {}) {
  if (!panel) return false;
  const next = !isPanelMaximized(panel);
  setPanelSize(panel, next);
  panel.classList.remove(ANIMATION_CLASS);
  // Reflow local para reiniciar a animação sem acumular frames.
  void panel.offsetWidth;
  panel.classList.add(ANIMATION_CLASS);
  const clear = () => panel.classList.remove(ANIMATION_CLASS);
  const view = documentRef?.defaultView;
  if (typeof panel.addEventListener === 'function') panel.addEventListener('animationend', clear, { once: true });
  if (view?.setTimeout) view.setTimeout(clear, Number(duration) || 320);
  return next;
}

/**
 * Instala o toggle num contêiner estável quando o PRÓPRIO painel é recriado a cada
 * render (ex.: inspetor de contatos). O painel é resolvido pelo seletor a partir do
 * botão, então o vínculo sobrevive à re-renderização do conteúdo. Devolve o cleanup.
 */
export function installPanelSizeToggleFor(root, panelSelector, { documentRef = globalThis.document } = {}) {
  if (!root?.addEventListener) return () => {};
  const onClick = event => {
    const button = event.target?.closest?.('[data-panel-size-toggle]');
    if (!button) return;
    const panel = button.closest(panelSelector);
    if (!panel || !root.contains(panel)) return;
    event.preventDefault();
    togglePanelSize(panel, { documentRef });
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

/**
 * Instala o toggle por delegação no painel (o conteúdo pode ser re-renderizado sem
 * perder o vínculo) e sincroniza o controle já existente. Devolve o cleanup.
 */
export function installPanelSizeToggle(panel, { documentRef = globalThis.document } = {}) {
  if (!panel?.addEventListener) return () => {};
  const onClick = event => {
    const button = event.target?.closest?.('[data-panel-size-toggle]');
    if (!button || !panel.contains(button)) return;
    event.preventDefault();
    togglePanelSize(panel, { documentRef });
  };
  panel.addEventListener('click', onClick);
  syncPanelSizeControl(panel);
  return () => panel.removeEventListener('click', onClick);
}

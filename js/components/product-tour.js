/**
 * Tour de primeiro acesso: leva a pessoa pelas telas e destaca a área de cada parada.
 * Só navega e destaca. Não grava nada nos dados do escritório.
 */
import { mountTotpGuide } from './totp-guide.js?v=3.1.0';

const GAP = 12;
const SPOT_PADDING = 8;
const VIEWPORT_MARGIN = 16;
const DOCK_BELOW = 768;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Escolhe onde o cartão cabe sem cobrir o destaque. Sem espaço, fica no canto inferior direito. */
export function placeTourCard({ spot, card, viewport }) {
  const { width, height } = viewport;
  if (width < DOCK_BELOW) return { dock: true, left: VIEWPORT_MARGIN, top: height - card.height - VIEWPORT_MARGIN };
  const inX = left => clamp(left, VIEWPORT_MARGIN, width - card.width - VIEWPORT_MARGIN);
  const inY = top => clamp(top, VIEWPORT_MARGIN, height - card.height - VIEWPORT_MARGIN);
  if (spot) {
    if (spot.top + spot.height + GAP + card.height + VIEWPORT_MARGIN <= height) return { dock: false, left: inX(spot.left), top: spot.top + spot.height + GAP };
    if (spot.top - GAP - card.height >= VIEWPORT_MARGIN) return { dock: false, left: inX(spot.left), top: spot.top - GAP - card.height };
    if (spot.left + spot.width + GAP + card.width + VIEWPORT_MARGIN <= width) return { dock: false, left: spot.left + spot.width + GAP, top: inY(spot.top) };
    if (spot.left - GAP - card.width >= VIEWPORT_MARGIN) return { dock: false, left: spot.left - GAP - card.width, top: inY(spot.top) };
  }
  return { dock: false, left: width - card.width - VIEWPORT_MARGIN * 2, top: height - card.height - VIEWPORT_MARGIN * 2 };
}

export function createProductTour({ documentRef = document, windowRef = window, buildSteps, navigate, escapeHtml, onFinish = () => {}, onStepAction = () => {}, onChoice = async () => {} }) {
  let steps = [];
  let index = 0;
  let root = null;
  let spotEl = null;
  let cardEl = null;
  let previousFocus = null;
  let shell = null;
  let frame = 0;
  let stopGuide = () => {};

  const isOpen = () => Boolean(root);

  function targetOf(step) {
    // A lista permite outro alvo no celular, onde parte do topo fica recolhida.
    return [...documentRef.querySelectorAll(step.target)].find(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }) || null;
  }

  function measure(step) {
    const element = targetOf(step);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const { innerWidth: width, innerHeight: height } = windowRef;
    const cardHeight = cardEl?.offsetHeight || 0;
    // No celular o cartão fica embaixo: o destaque usa só o espaço acima dele.
    const bottomLimit = width < DOCK_BELOW ? height - cardHeight - VIEWPORT_MARGIN * 2 : height - VIEWPORT_MARGIN;
    const left = Math.max(box.left - SPOT_PADDING, 4);
    const top = Math.max(box.top - SPOT_PADDING, 4);
    const right = Math.min(box.right + SPOT_PADDING, width - 4);
    const bottom = Math.min(box.bottom + SPOT_PADDING, bottomLimit);
    if (bottom - top < 24) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  function layout() {
    if (!root) return;
    const step = steps[index];
    const spot = measure(step);
    root.classList.toggle('has-spot', Boolean(spot));
    if (spot) {
      spotEl.style.transform = `translate(${spot.left}px, ${spot.top}px)`;
      spotEl.style.width = `${spot.width}px`;
      spotEl.style.height = `${spot.height}px`;
    }
    const place = placeTourCard({
      spot,
      card: { width: cardEl.offsetWidth, height: cardEl.offsetHeight },
      viewport: { width: windowRef.innerWidth, height: windowRef.innerHeight }
    });
    cardEl.classList.toggle('is-docked', place.dock);
    cardEl.style.transform = `translate(${Math.round(place.left)}px, ${Math.round(place.top)}px)`;
  }

  function scheduleLayout() {
    windowRef.cancelAnimationFrame(frame);
    frame = windowRef.requestAnimationFrame(layout);
  }

  function renderCard(step) {
    const total = steps.length;
    const example = step.example
      ? `<div class="product-tour-example"><span>Exemplo</span><strong>${escapeHtml(step.example.title)}</strong><small>${escapeHtml(step.example.detail)}</small></div>`
      : '';
    const note = step.note ? `<p class="product-tour-note">${escapeHtml(step.note)}</p>` : '';
    const last = index === total - 1;
    const primary = step.actionLabel || (last ? 'Concluir' : 'Continuar');
    const listTag = step.listKind === 'facts' ? 'ul' : 'ol';
    const list = step.list ? `<${listTag} class="product-tour-list">${step.list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</${listTag}>` : '';
    const forward = step.choices
      ? step.choices.map(choice => `<button type="button" class="button ${choice.value ? 'gold' : 'ghost'}" data-tour-choice="${choice.value}">${escapeHtml(choice.label)}</button>`).join('')
      : `<button type="button" class="button gold" data-tour-next>${escapeHtml(primary)}</button>`;
    const doNow = step.doNowLabel ? `<button type="button" class="button ghost" data-tour-do-now>${escapeHtml(step.doNowLabel)}</button>` : '';
    cardEl.innerHTML = `
      <div class="product-tour-progress" aria-hidden="true"><span style="width:${((index + 1) / total) * 100}%"></span></div>
      <h2 id="productTourTitle">${escapeHtml(step.title)}</h2>
      <p id="productTourBody">${escapeHtml(step.body)}</p>
      ${list}
      ${step.guide ? '<div data-tour-guide></div>' : ''}
      ${example}
      ${note}
      <div class="product-tour-meta">
        <span class="product-tour-count">${index + 1} de ${total}</span>
        <button type="button" class="product-tour-skip" data-tour-skip>${escapeHtml(step.skipLabel || 'Pular tour')}</button>
      </div>
      <div class="product-tour-footer">
        <div class="product-tour-actions">
          ${index > 0 ? '<button type="button" class="button ghost" data-tour-back>Voltar</button>' : ''}
          ${doNow}
          ${forward}
        </div>
      </div>`;
    stopGuide();
    stopGuide = step.guide ? mountTotpGuide(cardEl.querySelector('[data-tour-guide]'), { windowRef }) : () => {};
    cardEl.querySelector('[data-tour-skip]').addEventListener('click', () => finish('skipped'));
    cardEl.querySelector('[data-tour-back]')?.addEventListener('click', () => show(index - 1));
    cardEl.querySelector('[data-tour-next]')?.addEventListener('click', () => {
      if (index < steps.length - 1) show(index + 1);
      else finish('completed', step.action);
    });
    cardEl.querySelector('[data-tour-do-now]')?.addEventListener('click', () => finish('completed', step.doNow));
    cardEl.querySelectorAll('[data-tour-choice]').forEach(button => button.addEventListener('click', () => choose(step, button.dataset.tourChoice === 'true')));
  }

  function show(next) {
    index = clamp(next, 0, steps.length - 1);
    const step = steps[index];
    navigate(step.view);
    renderCard(step);
    // A tela acabou de trocar: leva a área para a vista antes de medir.
    windowRef.requestAnimationFrame(() => {
      const element = targetOf(step);
      // No celular o cartão ocupa a parte de baixo: a área precisa ficar logo abaixo do topo.
      if (windowRef.innerWidth < DOCK_BELOW && element) {
        element.style.scrollMarginTop = '176px';
        element.scrollIntoView({ block: 'start', inline: 'nearest' });
        element.style.scrollMarginTop = '';
      } else {
        element?.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      layout();
      (cardEl.querySelector('[data-tour-next]') || cardEl.querySelector('[data-tour-choice]'))?.focus();
      windowRef.setTimeout(scheduleLayout, 180);
    });
  }

  // A resposta muda o roteiro: quem tem certificado segue para o envio e o QR Code.
  async function choose(step, value) {
    cardEl.querySelectorAll('button').forEach(button => { button.disabled = true; });
    await onChoice(step.id, value);
    if (!root) return;
    steps = buildSteps();
    const position = steps.findIndex(item => item.id === step.id);
    if (!steps.length) return finish('completed');
    const next = position >= 0 ? position + 1 : index;
    if (next >= steps.length) return finish('completed');
    show(next);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish('skipped');
    } else if (event.key === 'ArrowRight' && index < steps.length - 1 && !steps[index].choices) {
      show(index + 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      show(index - 1);
    } else if (event.key === 'Tab') {
      const focusable = [...cardEl.querySelectorAll('button')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  function start() {
    if (root) return false;
    steps = buildSteps();
    if (!steps.length) return false;
    previousFocus = documentRef.activeElement;
    root = documentRef.createElement('div');
    root.id = 'productTour';
    root.className = 'product-tour';
    root.innerHTML = '<div class="product-tour-veil"></div><div class="product-tour-spot" aria-hidden="true"></div><section class="product-tour-card" role="dialog" aria-modal="true" aria-labelledby="productTourTitle" aria-describedby="productTourBody"></section>';
    documentRef.body.append(root);
    spotEl = root.querySelector('.product-tour-spot');
    cardEl = root.querySelector('.product-tour-card');
    shell = documentRef.getElementById('appShell');
    if (shell) shell.inert = true;
    documentRef.addEventListener('keydown', onKeydown, true);
    windowRef.addEventListener('resize', scheduleLayout);
    documentRef.addEventListener('scroll', scheduleLayout, true);
    show(0);
    return true;
  }

  function finish(outcome, action = null) {
    if (!root) return;
    stopGuide();
    documentRef.removeEventListener('keydown', onKeydown, true);
    windowRef.removeEventListener('resize', scheduleLayout);
    documentRef.removeEventListener('scroll', scheduleLayout, true);
    windowRef.cancelAnimationFrame(frame);
    if (shell) shell.inert = false;
    root.remove();
    root = null;
    onFinish(outcome);
    if (action) onStepAction(action);
    else if (previousFocus?.isConnected) previousFocus.focus?.();
  }

  return Object.freeze({ start, finish, isOpen });
}

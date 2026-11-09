const activeAnimations = new WeakMap();

export function focusPageControl(documentRef, viewSelector, dataAttribute, value, fallback) {
  const view = documentRef.querySelector(viewSelector);
  const control = [...(view?.querySelectorAll(`[${dataAttribute}]`) || [])]
    .find(button => button.getAttribute(dataAttribute) === String(value) && !button.disabled);
  const replacement = control || view?.querySelector(`[${dataAttribute}="${fallback}"]:not([disabled])`)
    || view?.querySelector(`[${dataAttribute}]:not([disabled])`);
  replacement?.focus({ preventScroll: true });
}

export function transitionPageContent(documentRef, selectors, direction, render) {
  const previous = documentRef && activeAnimations.get(documentRef);
  previous?.cancel();
  if (previous) activeAnimations.delete(documentRef);

  const result = render();
  if (!direction || documentRef?.documentElement?.dataset?.ui !== 'v2') return result;
  const windowRef = documentRef?.defaultView;
  if (!windowRef || windowRef.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return result;
  const candidates = typeof selectors === 'string' ? selectors : selectors?.v2;
  for (const selector of Array.isArray(candidates) ? candidates : [candidates]) {
    if (!selector) continue;
    const element = documentRef.querySelector?.(selector);
    if (!element?.getClientRects?.().length || typeof element.animate !== 'function') continue;
    const duration = Number.parseFloat(windowRef.getComputedStyle(element).getPropertyValue('--v2-duration-base')) || 200;
    const animation = element.animate([
      { opacity: 0.6, transform: `translateX(${direction > 0 ? 8 : -8}px)` },
      { opacity: 1, transform: 'translateX(0)' }
    ], { duration, easing: 'cubic-bezier(.2, 0, 0, 1)' });
    activeAnimations.set(documentRef, animation);
    animation.finished.then(() => {
      if (activeAnimations.get(documentRef) === animation) activeAnimations.delete(documentRef);
    }, () => {});
    break;
  }
  return result;
}

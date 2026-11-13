import { TOTP_SLIDES } from '../core/setup-how-to.js?v=3.1.0';

const SLIDE_MS = 3800;

/**
 * Passo a passo animado do QR Code. Passa sozinho, e dá para pausar ou navegar.
 * Quem pede menos movimento no sistema começa pausado.
 */
export function mountTotpGuide(container, { windowRef = window } = {}) {
  if (!container) return () => {};
  const reduced = windowRef.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  let index = 0;
  let timer = null;
  let playing = !reduced;
  container.classList.add('totp-guide');
  container.innerHTML = `
    <div class="totp-guide-frame">
      ${TOTP_SLIDES.map((slide, position) => `<img src="assets/images/authenticator/${slide.image}" alt="" loading="lazy" data-totp-slide="${position}"${position ? ' hidden' : ''}>`).join('')}
    </div>
    <div class="totp-guide-copy">
      <span class="totp-guide-count" data-totp-count></span>
      <p data-totp-caption aria-live="polite"></p>
      <div class="totp-guide-controls">
        <button type="button" class="button ghost" data-totp-prev>Anterior</button>
        <button type="button" class="button ghost" data-totp-play></button>
        <button type="button" class="button ghost" data-totp-next>Próximo</button>
      </div>
    </div>`;
  const render = () => {
    container.querySelectorAll('[data-totp-slide]').forEach(image => { image.hidden = Number(image.dataset.totpSlide) !== index; });
    container.querySelector('[data-totp-count]').textContent = `Passo ${index + 1} de ${TOTP_SLIDES.length}`;
    container.querySelector('[data-totp-caption]').textContent = TOTP_SLIDES[index].caption;
    container.querySelector('[data-totp-play]').textContent = playing ? 'Pausar' : 'Reproduzir';
  };
  const stop = () => { windowRef.clearInterval(timer); timer = null; };
  const go = next => { index = (next + TOTP_SLIDES.length) % TOTP_SLIDES.length; render(); };
  const play = () => { stop(); if (playing) timer = windowRef.setInterval(() => go(index + 1), SLIDE_MS); };
  const manual = next => { playing = false; stop(); go(next); };
  container.querySelector('[data-totp-prev]').addEventListener('click', () => manual(index - 1));
  container.querySelector('[data-totp-next]').addEventListener('click', () => manual(index + 1));
  container.querySelector('[data-totp-play]').addEventListener('click', () => { playing = !playing; play(); render(); });
  render();
  play();
  return stop;
}

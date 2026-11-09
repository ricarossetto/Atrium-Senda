// Falha ao baixar um arquivo do sistema deixa a tela de pé, mas com zeros que parecem dados reais.
// Tenta de novo uma vez e, se continuar, cobre a tela com um aviso. Carrega antes de tudo e não importa nada.
(() => {
  const REQUIRED = /\/js\/(?:app\/bootstrap|auth|runtime-config)\.js(?:\?|$)/;
  const RETRY_KEY = 'atrium_boot_retry_at';
  const RETRY_WINDOW_MS = 60_000;
  let shown = false;

  function retriedRecently() {
    try {
      return Date.now() - Number(sessionStorage.getItem(RETRY_KEY) || 0) < RETRY_WINDOW_MS;
    } catch {
      return true;
    }
  }

  function markRetry() {
    try {
      sessionStorage.setItem(RETRY_KEY, String(Date.now()));
    } catch {
      // Sem armazenamento não há como limitar a nova tentativa; o aviso aparece direto.
    }
  }

  function showFailure() {
    if (shown) return;
    shown = true;
    const render = () => {
      const box = document.createElement('div');
      box.className = 'boot-failure';
      box.setAttribute('role', 'alert');
      const title = document.createElement('h1');
      title.textContent = 'Não foi possível carregar o Atrium';
      const detail = document.createElement('p');
      detail.textContent = 'Uma parte do sistema não chegou ao seu navegador. Seus dados não foram alterados, mas os números desta tela não valem até a página carregar por inteiro.';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Recarregar';
      button.addEventListener('click', () => location.reload());
      box.append(title, detail, button);
      document.body.prepend(box);
    };
    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
  }

  window.addEventListener('error', event => {
    const target = event.target;
    if (!target || target.tagName !== 'SCRIPT' || !REQUIRED.test(target.src || '')) return;
    if (retriedRecently()) {
      showFailure();
      return;
    }
    markRetry();
    location.reload();
  }, true);
})();

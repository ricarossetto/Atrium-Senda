// ATRIUM — reautenticação genérica (step-up senha + código) para mutações administrativas.
// O backend responde 403 com sinal de reautenticação (código, header ou mensagem oficial);
// o chamador refaz a mutação mesclando { password, code } no body.
// Cancelamento implícito (modal fechado sem submeter, troca de view) nunca executa a mutação
// (deny-by-default). Múltiplos chamadores concorrentes compartilham a mesma operação (single-flight).

export function createReauthRunner({ openModal, closeModal, getCurrentView = null, getModalMode = null }) {
  let pending = null;

  function cancelPrompt() {
    if (!pending) return;
    const current = pending;
    pending = null;
    current.resolvers.forEach(resolve => resolve(null));
  }

  function promptCredentials() {
    if (pending) {
      return new Promise(resolve => {
        pending.resolvers.push(resolve);
      });
    }
    const resolvers = [];
    const promise = new Promise(resolve => {
      resolvers.push(resolve);
    });
    const currentPrompt = { resolvers };
    pending = currentPrompt;

    openModal('reauth', 'Confirme sua identidade', 'Reautenticação para ação sensível', [
      { name: 'password', label: 'Senha de acesso', type: 'password', required: true },
      { name: 'code', label: 'Código do autenticador', type: 'text', required: true, placeholder: '000000' }
    ], {
      onSubmit: async values => {
        if (pending !== currentPrompt) return;
        const password = String(values?.password || '');
        const code = String(values?.code || '').trim();
        if (!password || !code) throw new Error('Informe a senha e o código do autenticador.');
        pending = null;
        currentPrompt.resolvers.forEach(resolve => resolve({ password, code }));
        closeModal();
      }
    });

    return promise;
  }

  async function isReauthResponse(response) {
    if (!response || response.status !== 403) return false;
    if (typeof response.headers?.get === 'function' && response.headers.get('x-atrium-reauth') === 'required') {
      return true;
    }
    const clone = typeof response.clone === 'function' ? response.clone() : null;
    if (clone) {
      const data = await clone.json().catch(() => ({}));
      if (data?.code === 'REAUTH_REQUIRED') return true;
      if (typeof data?.message === 'string' && /reautentica/i.test(data.message)) return true;
    }
    return false;
  }

  function canOpenPrompt(startView) {
    if (startView !== null && typeof getCurrentView === 'function' && getCurrentView() !== startView) return false;
    if (pending) return true;
    if (typeof getModalMode === 'function') {
      const mode = getModalMode();
      if (mode && mode.mode !== 'reauth') return false;
    }
    return true;
  }

  async function withReauth(exec) {
    const startView = typeof getCurrentView === 'function' ? getCurrentView() : null;
    const initialResponse = await exec({});
    if (!initialResponse || initialResponse.status !== 403) return initialResponse;
    const requiresReauth = await isReauthResponse(initialResponse);
    if (!requiresReauth || !canOpenPrompt(startView)) return initialResponse;

    const credentials = await promptCredentials();
    if (!credentials) {
      // Cancelamento do prompt (ESC, fechar, troca de view, modal substituído):
      // a mutação sensível não é repetida e o chamador recebe a resposta inicial
      // marcada para distinguir cancelamento de credencial recusada.
      try { initialResponse.reauthCancelled = true; } catch { /* Response selado */ }
      return initialResponse;
    }

    if (startView !== null && typeof getCurrentView === 'function' && getCurrentView() !== startView) {
      return initialResponse;
    }
    return exec(credentials);
  }

  return { withReauth, promptCredentials, cancelPrompt };
}

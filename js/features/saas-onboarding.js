/**
 * ATRIUM — SaaS Multi-Tenant Onboarding Feature
 * 
 * Permite a qualquer advogado ou banca de advocacia criar um novo escritório
 * isolado em segundos diretamente pelo domínio raiz (atrium.adv.br).
 */

export function createSaasOnboardingFeature(options = {}) {
  const fetchFn = options.fetchFn || window.fetch.bind(window);

  async function checkSlugAvailability(slug) {
    if (!slug || slug.length < 3) return { valid: false, reason: 'Mínimo de 3 caracteres.' };
    try {
      const res = await fetchFn(`/api/saas/check-slug?slug=${encodeURIComponent(slug)}`);
      return await res.json();
    } catch {
      return { valid: false, reason: 'Não foi possível verificar no momento.' };
    }
  }

  async function registerOffice(payload) {
    const res = await fetchFn('/api/saas/register-office', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Falha ao criar o escritório.');
    }
    return data;
  }

  function renderSaasModal(container, { onCreated } = {}) {
    const modalHtml = `
      <div id="saasRegisterBackdrop" class="modal-backdrop saas-modal-backdrop">
        <div class="modal-window saas-modal-window" role="dialog" aria-modal="true" aria-labelledby="saasModalTitle">
          <div class="modal-header">
            <div>
              <span class="badge gold">SaaS Multi-Tenant</span>
              <h2 id="saasModalTitle">Criar Novo Escritório no ATRIUM</h2>
              <p class="modal-subtitle">Crie seu espaço exclusivo com isolamento de dados, OAB e eproc TJRS.</p>
            </div>
            <button type="button" class="button ghost icon-only" id="btnCloseSaasModal" aria-label="Fechar">&times;</button>
          </div>

          <form id="saasRegisterForm" class="modal-body">
            <div class="form-group">
              <label for="saasOfficeName">Nome da Banca / Escritório *</label>
              <input type="text" id="saasOfficeName" required placeholder="Ex: Rossetto Advocacia & Consultoria" />
            </div>

            <div class="form-group">
              <label for="saasSlug">Endereço Web Exclusivo (Subdomínio) *</label>
              <div class="subdomain-input-group">
                <input type="text" id="saasSlug" required placeholder="meuescritorio" autocomplete="off" />
                <span class="subdomain-suffix">.atrium.adv.br</span>
              </div>
              <small id="saasSlugFeedback" class="field-feedback">Apenas letras minúsculas, números e hífens.</small>
            </div>

            <div class="form-row">
              <div class="form-group flex-2">
                <label for="saasOwnerName">Advogado(a) Responsável *</label>
                <input type="text" id="saasOwnerName" required placeholder="Seu nome completo" />
              </div>
              <div class="form-group flex-1">
                <label for="saasOab">OAB / UF *</label>
                <div class="oab-input-group">
                  <input type="text" id="saasOab" required placeholder="12345" />
                  <select id="saasOabUf" required>
                    <option value="RS" selected>RS</option>
                    <option value="SC">SC</option>
                    <option value="PR">PR</option>
                    <option value="SP">SP</option>
                    <option value="RJ">RJ</option>
                    <option value="DF">DF</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label for="saasOwnerEmail">E-mail Corporativo *</label>
              <input type="email" id="saasOwnerEmail" required placeholder="advogado@escritorio.adv.br" />
            </div>

            <div class="form-group">
              <label for="saasPassword">Senha de Acesso do Administrador *</label>
              <input type="password" id="saasPassword" required minlength="8" placeholder="Mínimo de 8 caracteres" />
            </div>

            <div id="saasFormError" class="alert error hidden"></div>

            <div class="modal-actions">
              <button type="button" class="button ghost" id="btnCancelSaas">Cancelar</button>
              <button type="submit" class="button primary" id="btnSubmitSaas">
                <span class="btn-text">Criar Meu Escritório 🚀</span>
                <span class="btn-spinner hidden">Criando ambiente isolado...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', modalHtml);

    const backdrop = document.getElementById('saasRegisterBackdrop');
    const form = document.getElementById('saasRegisterForm');
    const slugInput = document.getElementById('saasSlug');
    const slugFeedback = document.getElementById('saasSlugFeedback');
    const errorBox = document.getElementById('saasFormError');
    const btnSubmit = document.getElementById('btnSubmitSaas');
    const btnClose = document.getElementById('btnCloseSaasModal');
    const btnCancel = document.getElementById('btnCancelSaas');

    function close() {
      backdrop.remove();
    }

    btnClose?.addEventListener('click', close);
    btnCancel?.addEventListener('click', close);

    // Validação de slug em tempo real (com debounce)
    let debounceTimer;
    slugInput?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const raw = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      slugInput.value = raw;

      if (raw.length < 3) {
        slugFeedback.textContent = 'Mínimo de 3 caracteres.';
        slugFeedback.className = 'field-feedback';
        return;
      }

      slugFeedback.textContent = 'Verificando disponibilidade...';
      slugFeedback.className = 'field-feedback loading';

      debounceTimer = setTimeout(async () => {
        const check = await checkSlugAvailability(raw);
        if (check.valid) {
          slugFeedback.textContent = `✓ Disponível: https://${raw}.atrium.adv.br`;
          slugFeedback.className = 'field-feedback success';
        } else {
          slugFeedback.textContent = `✗ ${check.reason}`;
          slugFeedback.className = 'field-feedback error';
        }
      }, 350);
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('hidden');
      errorBox.textContent = '';
      btnSubmit.disabled = true;
      btnSubmit.querySelector('.btn-text').classList.add('hidden');
      btnSubmit.querySelector('.btn-spinner').classList.remove('hidden');

      try {
        const payload = {
          name: document.getElementById('saasOfficeName').value.trim(),
          slug: slugInput.value.trim().toLowerCase(),
          ownerName: document.getElementById('saasOwnerName').value.trim(),
          ownerEmail: document.getElementById('saasOwnerEmail').value.trim(),
          oab: document.getElementById('saasOab').value.trim(),
          oabUf: document.getElementById('saasOabUf').value,
          password: document.getElementById('saasPassword').value
        };

        const result = await registerOffice(payload);

        if (typeof onCreated === 'function') {
          onCreated(result);
        } else {
          // Redireciona para o novo subdomínio
          window.location.href = result.url || `https://${payload.slug}.atrium.adv.br/`;
        }
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.querySelector('.btn-text').classList.remove('hidden');
        btnSubmit.querySelector('.btn-spinner').classList.add('hidden');
      }
    });

    return { close };
  }

  return {
    checkSlugAvailability,
    registerOffice,
    renderSaasModal
  };
}

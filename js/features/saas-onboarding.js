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
        <section class="modal card saas-modal-window" role="dialog" aria-modal="true" aria-labelledby="saasModalTitle" style="max-width:540px; width:92%;">
          <header class="modal-header" style="display:flex; align-items:flex-start; justify-content:space-between; padding:20px 24px; border-bottom:1px solid var(--border);">
            <div>
              <p class="eyebrow" style="margin:0 0 4px; font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--gold);">Novo Escritório</p>
              <h3 id="saasModalTitle" style="margin:0; font-family:var(--font-serif); font-size:22px; color:var(--text-primary);">Cadastrar Escritório no ATRIUM</h3>
              <p style="margin:4px 0 0; font-size:12px; color:var(--text-secondary);">Crie seu espaço exclusivo com isolamento de dados, OAB e eproc TJRS.</p>
            </div>
            <button class="icon-button" id="btnCloseSaasModal" type="button" aria-label="Fechar modal" style="width:36px; height:36px; display:grid; place-items:center; border-radius:8px; border:1px solid var(--border); background:transparent; color:var(--text-secondary); cursor:pointer;">
              <svg class="atrium-icon" aria-hidden="true" focusable="false" style="width:16px; height:16px;"><use href="assets/icons/atrium-ui-icons.svg#atrium-icon-close"></use></svg>
            </button>
          </header>

          <form id="saasRegisterForm">
            <div class="modal-body" style="padding:22px 24px; display:flex; flex-direction:column; gap:16px;">
              <label style="display:flex; flex-direction:column; gap:6px;">
                <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-secondary);">Nome da Banca / Escritório *</span>
                <input type="text" id="saasOfficeName" required placeholder="Ex: Carvalho & Associados Advocacia" style="width:100%; min-height:42px; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-input); color:var(--text-primary); font-size:13px; box-sizing:border-box;">
              </label>

              <label style="display:flex; flex-direction:column; gap:6px;">
                <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-secondary);">Endereço Web Exclusivo (Subdomínio) *</span>
                <div class="subdomain-input-group" style="display:flex; align-items:center; border:1px solid var(--border); border-radius:8px; background:var(--surface-input); overflow:hidden;">
                  <input type="text" id="saasSlug" required placeholder="meuescritorio" autocomplete="off" style="flex:1; border:none; outline:none; background:transparent; padding:10px 12px; color:var(--text-primary); font-size:13px; min-height:42px; box-sizing:border-box;">
                  <span class="subdomain-suffix" style="padding:0 14px; font-size:12px; font-weight:700; color:var(--gold); background:rgba(212,175,55,0.08); border-left:1px solid var(--border); line-height:42px; user-select:none;">.atrium.adv.br</span>
                </div>
                <small id="saasSlugFeedback" class="field-feedback" style="font-size:11px; color:var(--text-muted); margin-top:2px;">Apenas letras minúsculas, números e hífens.</small>
              </label>

              <div style="display:grid; grid-template-columns:minmax(0, 1.25fr) minmax(0, 1fr); gap:12px;">
                <label style="display:flex; flex-direction:column; gap:6px; min-width:0;">
                  <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-secondary);">Advogado(a) Responsável *</span>
                  <input type="text" id="saasOwnerName" required placeholder="Dr(a). Nome Completo" style="width:100%; min-width:0; min-height:42px; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-input); color:var(--text-primary); font-size:13px; box-sizing:border-box;">
                </label>
                <label style="display:flex; flex-direction:column; gap:6px; min-width:0;">
                  <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-secondary);">OAB / UF *</span>
                  <div style="display:flex; gap:6px; width:100%; min-width:0; box-sizing:border-box;">
                    <input type="text" id="saasOab" required placeholder="000000" style="flex:1 1 auto; min-width:0; width:100%; min-height:42px; padding:10px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface-input); color:var(--text-primary); font-size:13px; box-sizing:border-box;">
                    <select id="saasOabUf" required style="flex:0 0 60px; width:60px; min-width:60px; min-height:42px; padding:8px 4px; text-align:center; border-radius:8px; border:1px solid var(--border); background:var(--surface-input); color:var(--text-primary); font-size:13px; box-sizing:border-box; cursor:pointer;">
                      <option value="RS" selected>RS</option>
                      <option value="SC">SC</option>
                      <option value="PR">PR</option>
                      <option value="SP">SP</option>
                      <option value="RJ">RJ</option>
                      <option value="MG">MG</option>
                      <option value="DF">DF</option>
                      <option value="BA">BA</option>
                      <option value="GO">GO</option>
                      <option value="PE">PE</option>
                      <option value="CE">CE</option>
                    </select>
                  </div>
                </label>
              </div>

              <label style="display:flex; flex-direction:column; gap:6px;">
                <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-secondary);">E-mail Corporativo *</span>
                <input type="email" id="saasOwnerEmail" required placeholder="advogado@escritorio.adv.br" style="width:100%; min-height:42px; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-input); color:var(--text-primary); font-size:13px; box-sizing:border-box;">
              </label>

              <label style="display:flex; flex-direction:column; gap:6px;">
                <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-secondary);">Senha de Acesso do Administrador *</span>
                <input type="password" id="saasPassword" required minlength="8" placeholder="Mínimo de 8 caracteres" style="width:100%; min-height:42px; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-input); color:var(--text-primary); font-size:13px; box-sizing:border-box;">
              </label>

              <div id="saasFormError" class="auth-feedback error hidden" style="padding:10px 14px; border-radius:8px; font-size:12px; line-height:1.45;"></div>
            </div>

            <footer class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; padding:16px 24px; border-top:1px solid var(--border); background:var(--surface-raised); border-radius:0 0 16px 16px;">
              <button type="button" class="button ghost" id="btnCancelSaas" style="min-height:40px; padding:0 16px;">Cancelar</button>
              <button type="submit" class="button gold" id="btnSubmitSaas" style="min-height:40px; padding:0 20px;">
                <span class="btn-text">Criar Meu Escritório</span>
                <span class="btn-spinner hidden">Criando ambiente isolado...</span>
              </button>
            </footer>
          </form>
        </section>
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

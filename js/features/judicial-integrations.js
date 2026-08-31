export function createJudicialIntegrationsFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch,
  escapeHtml = value => String(value ?? ''),
  showToast = () => {},
  audit = () => {},
  onSyncAll = async () => {},
  warn = () => {},
  presentation = null
} = {}) {
  let judicialStatus = null;
  let initialized = false;
  let pendingTotpAccounts = [];
  const byId = id => documentRef.getElementById(id);

  const feature = {
    get status() {
      return judicialStatus;
    },

    set status(value) {
      judicialStatus = value;
    },

    get initialized() {
      return initialized;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();
      byId('certificateGuideButton')?.addEventListener('click', () => feature.open());
      byId('judicialSetupClose')?.addEventListener('click', () => feature.close());
      byId('judicialSetupBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('judicialSetupBackdrop')) feature.close();
      });
      byId('certificateFileInput')?.addEventListener('change', event => {
        const fileName = byId('certificateFileName');
        if (fileName) fileName.textContent = event.target.files[0]?.name || 'Selecionar certificado';
      });
      byId('certificateSetupForm')?.addEventListener('submit', event => feature.saveCertificate(event));
      byId('portalQrInput')?.addEventListener('change', event => feature.readPortalQr(event.target.files[0]));
      byId('portalTotpForm')?.addEventListener('submit', event => feature.savePortalTotp(event));
      byId('removePortalTotpButton')?.addEventListener('click', () => feature.removePortalTotp());
      byId('resetJudicialConnectionsButton')?.addEventListener('click', () => feature.resetConnections());
      byId('syncJudicialNowButton')?.addEventListener('click', () => feature.syncNow());
      byId('portalCoverageList')?.addEventListener('click', event => {
        const button = event.target.closest('[data-configure-totp]');
        if (!button) return;
        byId('totpPortalSelect').value = button.dataset.configureTotp;
        byId('totpSetupSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
        byId('portalQrInput').focus();
      });
      return true;
    },

    async open() {
      byId('judicialSetupBackdrop')?.classList.remove('hidden');
      documentRef.body.style.overflow = 'hidden';
      presentation?.open?.();
      await feature.refreshStatus(true);
    },

    close() {
      const backdrop = byId('judicialSetupBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      if (byId('modalBackdrop')?.classList.contains('hidden')) documentRef.body.style.overflow = '';
      feature.clearSecrets();
      presentation?.close?.();
    },

    clearSecrets({ clearQr = false } = {}) {
      if (byId('portalTotpSecret')) byId('portalTotpSecret').value = '';
      if (byId('portalTotpCode')) byId('portalTotpCode').value = '';
      if (byId('certificatePassphrase')) byId('certificatePassphrase').value = '';
      if (clearQr && byId('portalQrInput')) byId('portalQrInput').value = '';
      pendingTotpAccounts = [];
      const accountField = byId('portalTotpAccountField');
      const accountSelect = byId('portalTotpAccountSelect');
      accountField?.classList?.add('hidden');
      if (accountSelect) accountSelect.innerHTML = '<option value="">Selecione a conta</option>';
    },

    async refreshStatus(showError = false) {
      try {
        const response = await secureFetch('/api/integrations/judicial', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível verificar o certificado.');
        judicialStatus = data;
        feature.renderStatus();
        return data;
      } catch (error) {
        if (showError) showToast(error.message, 'error');
        const chip = byId('certificateIntegrationStatus');
        if (chip) {
          chip.textContent = 'Servidor precisa ser reiniciado';
          chip.className = 'status-chip warning';
        }
        return null;
      }
    },

    renderStatus() {
      const status = judicialStatus;
      if (!status) return;
      const certificate = status.certificate || {};
      const portals = status.portals || [];
      const totpCount = portals.filter(portal => portal.totpConfigured).length;
      const setStatusIcon = (id, ok) => {
        const element = byId(id);
        if (element) {
          element.className = `setup-status-icon ${ok ? 'ok' : 'off'}`;
          element.textContent = ok ? '✓' : '·';
        }
      };
      setStatusIcon('setupCertificateIcon', certificate.valid);
      setStatusIcon('setupPjeOfficeIcon', status.pjeOffice?.available);
      setStatusIcon('setupTotpIcon', totpCount > 0);

      const certificateStatus = byId('setupCertificateStatus');
      if (certificateStatus) certificateStatus.textContent = certificate.valid ? 'A1 validado no Sandbox' : certificate.accessible ? 'Senha ou contêiner inválido' : 'Selecione o PFX';
      const pjeStatus = byId('setupPjeOfficeStatus');
      if (pjeStatus) pjeStatus.textContent = status.pjeOffice?.available ? 'Aplicativo oficial disponível' : 'Abra o PJeOffice Pro';
      const totpStatus = byId('setupTotpStatus');
      if (totpStatus) totpStatus.textContent = totpCount ? `${totpCount} portal(is) vinculado(s)` : 'Nenhum QR vinculado';

      const fileBadge = byId('certificateFileBadge');
      if (fileBadge) {
        fileBadge.textContent = certificate.valid ? (certificate.status === 'operational' ? 'A1 OPERATIONAL' : 'Certificado Ativo') : 'Não configurado';
        fileBadge.className = `status-chip ${certificate.valid ? 'connected' : 'muted'}`;
      }

      const activeCard = byId('a1ActiveCard');
      const certificateForm = byId('certificateSetupForm');
      const sandboxButton = byId('btnRunA1Sandbox');
      const replaceButton = byId('btnReplaceCertToggle');
      const holderName = byId('a1HolderName');
      const documentAndIssuer = byId('a1DocAndIssuer');
      if (sandboxButton) sandboxButton.onclick = () => feature.testA1Sandbox();
      if (replaceButton && certificateForm && activeCard) {
        replaceButton.onclick = () => {
          certificateForm.classList.toggle('hidden');
          replaceButton.textContent = certificateForm.classList.contains('hidden') ? 'Substituir' : 'Cancelar';
        };
      }

      if (certificate.valid || certificate.accessible) {
        activeCard?.classList.remove('hidden');
        certificateForm?.classList.add('hidden');
        if (holderName) holderName.textContent = certificate.summary?.holder || certificate.fileName || 'Certificado A1 Ativo';
        if (documentAndIssuer) {
          documentAndIssuer.textContent = `${certificate.summary?.documentMasked ? 'CPF ' + certificate.summary.documentMasked + ' · ' : ''}${certificate.summary?.issuer ? certificate.summary.issuer.split(',')[0] : 'ICP-Brasil'}${certificate.summary?.notAfter ? ' · Vigente até ' + new Date(certificate.summary.notAfter).toLocaleDateString('pt-BR') : ''}`;
        }
      } else {
        activeCard?.classList.add('hidden');
        certificateForm?.classList.remove('hidden');
      }

      const integrationChip = byId('certificateIntegrationStatus');
      if (integrationChip) {
        integrationChip.textContent = certificate.valid ? `A1 Operacional · ${totpCount} 2FA` : 'Configuração necessária';
        integrationChip.className = `status-chip ${certificate.valid ? 'connected' : 'warning'}`;
      }
      const integrationDetail = byId('certificateIntegrationDetail');
      if (integrationDetail) {
        integrationDetail.textContent = certificate.valid
          ? `${certificate.summary?.holder || certificate.fileName || 'Certificado'} validado com mTLS Sandbox. ${portals.filter(portal => portal.enabled).length} portal(is) habilitado(s) e ${totpCount} segundo(s) fator(es) protegido(s).`
          : 'Ative o A1, selecione os tribunais e vincule um QR novo de cada portal em um único assistente protegido.';
      }

      const coverageList = byId('portalCoverageList');
      if (coverageList) {
        const portalGroups = portals.reduce((groups, portal) => { (groups[portal.group || 'Outros tribunais'] ||= []).push(portal); return groups; }, {});
        coverageList.innerHTML = portals.length ? Object.entries(portalGroups).map(([group, items]) => `
          <section class="portal-coverage-group">
            <header><strong>${escapeHtml(group)}</strong><span>${items.length} portal(is)</span></header>
            ${items.map(portal => `
              <label class="portal-coverage-row ${portal.automationLevel === 'experimental' ? 'experimental' : ''}">
                <input type="checkbox" data-portal-enabled value="${escapeHtml(portal.id)}" ${portal.enabled ? 'checked' : ''}>
                <span><strong>${escapeHtml(portal.name)}</strong><small>${portal.automationLevel === 'experimental' ? 'Cobertura experimental · primeiro acesso acompanhado' : portal.supportsTotp ? portal.totpConfigured ? '2FA vinculado e verificado' : 'Sem QR/2FA vinculado' : 'Sessão com certificado, sem TOTP local'}</small></span>
                <span class="portal-method">${escapeHtml(portal.system || (portal.certificateMode === 'pjeoffice' ? 'PJeOffice oficial' : 'Certificado do Windows'))}</span>
                ${portal.supportsTotp ? `<button class="button ghost portal-qr-button" type="button" data-configure-totp="${escapeHtml(portal.id)}">${portal.totpConfigured ? 'Trocar QR' : 'Vincular 2FA'}</button>` : '<span></span>'}
              </label>`).join('')}
          </section>`).join('') : '<div class="setup-loading">Nenhum portal com certificado foi configurado.</div>';
      }

      const totpSelect = byId('totpPortalSelect');
      if (totpSelect) {
        const selectedPortal = totpSelect.value;
        totpSelect.innerHTML = `<option value="">Selecione o tribunal</option>${portals.filter(portal => portal.supportsTotp).map(portal => `<option value="${escapeHtml(portal.id)}">${escapeHtml(portal.name)}${portal.totpConfigured ? ' · vinculado' : ''}</option>`).join('')}`;
        if (portals.some(portal => portal.id === selectedPortal && portal.supportsTotp)) totpSelect.value = selectedPortal;
      }

      const launchButton = byId('launchPortalLoginButton');
      if (launchButton) {
        launchButton.disabled = Boolean(status.interactiveCollectorRunning);
        launchButton.textContent = status.interactiveCollectorRunning ? 'Primeira conexão em andamento…' : 'Abrir primeira conexão';
      }
    },

    async testA1Sandbox() {
      const button = byId('btnRunA1Sandbox');
      if (button) { button.disabled = true; button.textContent = '🧪 Executando Sandbox...'; }
      try {
        const response = await secureFetch('/api/integrations/judicial/a1/sandbox', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao executar sandbox do certificado.');
        const sandbox = data.sandbox || {};
        if (sandbox.steps) {
          for (const step of sandbox.steps) {
            const element = byId(`chkStep-${step.id}`);
            if (element) {
              const ok = step.status === 'OK';
              element.innerHTML = `<span>${escapeHtml(step.name)}:</span> <strong style="color:${ok ? '#4ade80' : '#f87171'}">${ok ? '✓ OK' : '✗ Falha'}</strong>`;
            }
          }
        }
        if (sandbox.operational) {
          showToast('Certificado A1 validado 100% no Sandbox (mTLS + Playwright + Assinatura)!', 'success');
          const chip = byId('certificateFileBadge');
          if (chip) { chip.textContent = 'A1 OPERATIONAL'; chip.className = 'status-chip connected'; }
        } else showToast(`A1 Sandbox: ${sandbox.errorMessage || 'Falha na validação'}`, 'error');
      } catch (error) {
        showToast(`Erro no Sandbox: ${error.message}`, 'error');
      } finally {
        if (button) { button.disabled = false; button.textContent = '🧪 Testar Certificado no Sandbox'; }
      }
    },

    async saveCertificate(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const file = byId('certificateFileInput')?.files[0];
      const passphrase = byId('certificatePassphrase')?.value;
      if (!file || !passphrase) return showToast('Selecione o PFX e informe a senha atual.', 'error');
      feature.setFormBusy(form, true);
      try {
        if (file.size > 5_000_000) throw new Error('O certificado deve ter no máximo 5 MB.');
        const pfxBase64 = await feature.fileToBase64(file);
        await feature.request('/api/integrations/judicial/certificate', { fileName: file.name, pfxBase64, passphrase });
        form.reset();
        const fileName = byId('certificateFileName');
        if (fileName) fileName.textContent = 'Selecionar certificado';
        audit('Certificado A1 configurado', 'Contêiner validado pelo Windows e armazenado cifrado no agente local.');
        showToast('Certificado validado com sucesso! Sincronizando dados judiciais...', 'success');
        await feature.refreshStatus();
        await onSyncAll({ silent: true });
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        feature.setFormBusy(form, false);
      }
    },

    async readPortalQr(file) {
      const status = byId('portalQrStatus');
      const secretInput = byId('portalTotpSecret');
      if (secretInput) secretInput.value = '';
      pendingTotpAccounts = [];
      byId('portalTotpAccountField')?.classList?.add('hidden');
      if (!file) {
        status.textContent = 'Selecionar QR code';
        return;
      }
      status.textContent = 'Decodificando imagem do QR code…';
      try {
        let raw = '';
        if (typeof windowRef.jsQR === 'function') {
          try {
            raw = await decodeQrWithJsQr(file, { windowRef, documentRef });
          } catch {
            warn('Falha ao ler QR com jsQR.');
          }
        }
        if (!raw && ('BarcodeDetector' in windowRef)) {
          try {
            const detector = new windowRef.BarcodeDetector({ formats: ['qr_code'] });
            const bitmap = await windowRef.createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            bitmap.close?.();
            raw = codes.find(code => code.rawValue)?.rawValue?.trim() || '';
          } catch {
            warn('Falha ao ler QR com BarcodeDetector.');
          }
        }
        if (!raw) throw new Error('Não foi possível ler o QR Code da imagem. Verifique se o enquadramento está nítido ou cole a chave manual Base32.');
        const parsed = await feature.request('/api/integrations/judicial/totp/parse', { qrData: raw });
        raw = '';
        const parsedAccounts = parsed.type === 'migration' ? parsed.accounts : [parsed.account];
        pendingTotpAccounts = (parsedAccounts || []).filter(account => account?.secret).map(account => ({
          name: String(account.name || 'Conta sem nome').slice(0, 160),
          issuer: String(account.issuer || 'Authenticator').slice(0, 160),
          secret: String(account.secret || ''),
          digits: Number(account.digits || 6)
        }));
        if (!pendingTotpAccounts.length) throw new Error('O QR foi lido, mas não contém uma conta TOTP válida.');

        const accountField = byId('portalTotpAccountField');
        const accountSelect = byId('portalTotpAccountSelect');
        if (pendingTotpAccounts.length > 1) {
          if (!accountSelect) throw new Error('O QR contém múltiplas contas, mas o seletor seguro não está disponível.');
          accountSelect.innerHTML = `<option value="">Selecione a conta</option>${pendingTotpAccounts.map((account, index) => `<option value="${index}">${escapeHtml(account.issuer)} · ${escapeHtml(account.name)}</option>`).join('')}`;
          accountField?.classList?.remove('hidden');
          status.textContent = `${file.name} · ${pendingTotpAccounts.length} contas encontradas`;
          showToast('QR lido. Selecione a conta judicial correta antes de validar o código.', 'success');
        } else {
          accountField?.classList?.add('hidden');
          if (accountSelect) accountSelect.innerHTML = '<option value="0">Conta TOTP identificada</option>';
          status.textContent = `${file.name} · QR lido com sucesso`;
          showToast('QR Code decodificado com sucesso! Digite o código de 6 dígitos para validar.', 'success');
        }
        byId('portalTotpCode').focus();
      } catch (error) {
        pendingTotpAccounts = [];
        byId('portalTotpAccountField')?.classList?.add('hidden');
        status.textContent = file.name;
        showToast(error.message, 'error');
      }
    },

    async savePortalTotp(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const portalId = byId('totpPortalSelect').value;
      let secret = String(byId('portalTotpSecret')?.value || '').trim();
      if (!secret && pendingTotpAccounts.length === 1) secret = pendingTotpAccounts[0].secret;
      if (!secret && pendingTotpAccounts.length > 1) {
        const selectedValue = byId('portalTotpAccountSelect')?.value || '';
        const selectedIndex = selectedValue === '' ? -1 : Number(selectedValue);
        if (Number.isInteger(selectedIndex) && selectedIndex >= 0) secret = pendingTotpAccounts[selectedIndex]?.secret || '';
      }
      const code = byId('portalTotpCode').value;
      if (!portalId || !secret || !/^\d{6}$/.test(code)) {
        const accountHint = pendingTotpAccounts.length > 1 && !byId('portalTotpAccountSelect')?.value ? ' Selecione também a conta do QR.' : '';
        return showToast(`Selecione o portal, o QR/chave e informe o código atual de seis dígitos.${accountHint}`, 'error');
      }
      feature.setFormBusy(form, true);
      try {
        await feature.request('/api/integrations/judicial/2fa', { portalId, secret, code });
        secret = '';
        feature.clearSecrets({ clearQr: true });
        if (byId('portalQrStatus')) byId('portalQrStatus').textContent = 'Selecionar QR code';
        audit('Segundo fator judicial ativado', `${judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · código TOTP validado.`);
        showToast('QR validado. O segundo fator desse portal está ativo.', 'success');
        await feature.refreshStatus();
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        feature.setFormBusy(form, false);
      }
    },

    async removePortalTotp() {
      const portalId = byId('totpPortalSelect').value;
      if (!portalId) return showToast('Selecione o portal cujo vínculo local deve ser removido.', 'error');
      try {
        await feature.request('/api/integrations/judicial/2fa', { portalId, remove: true });
        feature.clearSecrets();
        audit('Segundo fator judicial removido', `${judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · segredo local removido.`);
        showToast('Vínculo local removido. Isso não desativa o 2FA no portal.', 'success');
        await feature.refreshStatus();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },

    async savePortalCoverage() {
      const enabledIds = [...documentRef.querySelectorAll('[data-portal-enabled]:checked')].map(input => input.value);
      try {
        await feature.request('/api/integrations/judicial/portals', { enabledIds });
        audit('Cobertura judicial atualizada', `${enabledIds.length} portal(is) com certificado habilitado(s).`);
        showToast('Cobertura dos tribunais salva.', 'success');
        await feature.refreshStatus();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },

    async resetConnections() {
      const confirmed = windowRef.confirm('Isso removerá todos os QR Codes/2FA, desmarcará os tribunais e apagará as sessões judiciais locais. O certificado A1 será preservado. Continuar?');
      if (!confirmed) return;
      const button = byId('resetJudicialConnectionsButton');
      if (button) button.disabled = true;
      try {
        const result = await feature.request('/api/integrations/judicial/reset', { confirm: 'ZERAR_ACESSOS_JUDICIAIS' });
        feature.clearSecrets({ clearQr: true });
        audit('Acessos judiciais zerados', `QR/2FA, cobertura e sessões locais removidos. Certificado A1 ${result.certificatePreserved ? 'preservado' : 'não estava configurado'}.`);
        showToast(result.certificatePreserved ? 'Acessos zerados. O certificado A1 foi preservado.' : 'Acessos zerados; nenhum certificado estava configurado.', 'success');
        await feature.refreshStatus();
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    },

    async syncNow() {
      const button = byId('syncJudicialNowButton');
      if (button) { button.disabled = true; button.textContent = 'Sincronizando acervo e intimações…'; }
      try {
        const synchronized = await onSyncAll({ silent: true });
        if (!synchronized) return false;
        showToast('Sincronização com DJEN e tribunais concluída com sucesso!', 'success');
        audit('Sincronização judicial autônoma', 'Coleta de intimações DJEN, DataJud e tribunais.');
        return true;
      } catch (error) {
        showToast(error.message || 'Falha ao sincronizar.', 'error');
        return false;
      } finally {
        if (button) { button.disabled = false; button.textContent = '✦ Sincronizar Acervo e Intimações Agora'; }
      }
    },

    async request(url, body) {
      const response = await secureFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'A configuração judicial não foi concluída.');
      return data;
    },

    setFormBusy(form, busy) {
      form.querySelectorAll('input, select, button').forEach(element => { element.disabled = busy; });
    },

    async fileToBase64(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return windowRef.btoa(binary);
    }
  };

  return feature;
}

async function decodeQrWithJsQr(file, { windowRef, documentRef }) {
  let imageSource;
  let objectUrl = '';
  try {
    if (typeof windowRef.createImageBitmap === 'function') {
      imageSource = await windowRef.createImageBitmap(file);
    } else {
      const ImageConstructor = windowRef.Image || globalThis.Image;
      imageSource = new ImageConstructor();
      const imageLoaded = new Promise((resolve, reject) => {
        imageSource.onload = () => resolve();
        imageSource.onerror = () => reject(new Error('Falha ao carregar arquivo de imagem.'));
      });
      objectUrl = windowRef.URL.createObjectURL(file);
      imageSource.src = objectUrl;
      await imageLoaded;
    }
    const sourceWidth = imageSource.naturalWidth || imageSource.width;
    const sourceHeight = imageSource.naturalHeight || imageSource.height;
    if (!sourceWidth || !sourceHeight) throw new Error('A imagem do QR não possui dimensões válidas.');

    const largestSide = Math.max(sourceWidth, sourceHeight);
    const normalizedScale = largestSide > 2400 ? 2400 / largestSide : 1;
    const scales = [...new Set([
      normalizedScale,
      Math.min(normalizedScale * 1.5, 3000 / largestSide),
      largestSide < 1000 ? Math.min(normalizedScale * 2, 3000 / largestSide) : normalizedScale,
      Math.max(normalizedScale * 0.75, 0.25)
    ].map(value => Number(value.toFixed(3))))];
    const transformations = ['original', 'grayscale', 'contrast'];

    for (const scale of scales) {
      for (const addQuietZone of [false, true]) {
        const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
        const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
        const padding = addQuietZone ? Math.max(16, Math.round(Math.max(scaledWidth, scaledHeight) * 0.06)) : 0;
        const canvas = documentRef.createElement('canvas');
        canvas.width = scaledWidth + padding * 2;
        canvas.height = scaledHeight + padding * 2;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        context.fillStyle = '#ffffff';
        context.fillRect?.(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(imageSource, padding, padding, scaledWidth, scaledHeight);
        const source = context.getImageData(0, 0, canvas.width, canvas.height);

        for (const transformation of transformations) {
          const candidate = transformation === 'original' ? source : transformQrPixels(source, transformation);
          const result = windowRef.jsQR(candidate.data, candidate.width, candidate.height, { inversionAttempts: 'attemptBoth' });
          if (result?.data) return String(result.data).trim();
        }
      }
    }
    return '';
  } finally {
    imageSource?.close?.();
    if (objectUrl) windowRef.URL.revokeObjectURL(objectUrl);
  }
}

function transformQrPixels(imageData, mode) {
  const data = new Uint8ClampedArray(imageData.data);
  let luminanceTotal = 0;
  for (let index = 0; index < data.length; index += 4) {
    luminanceTotal += Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  const threshold = luminanceTotal / Math.max(1, data.length / 4);
  for (let index = 0; index < data.length; index += 4) {
    const luminance = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    const value = mode === 'contrast' ? (luminance < threshold ? 0 : 255) : luminance;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  return { data, width: imageData.width, height: imageData.height };
}

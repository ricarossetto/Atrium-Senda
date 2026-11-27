// Captura completa da página de processo do eproc (assuntos, comarca, ficha da
// parte cliente e Informações Adicionais), portada do extrator da extensão
// "ATRIUM — Conector eproc" (extensions/atrium-eproc/eproc-extractor.js).
//
// Regras (AGENTS.md §21): `extractEprocFullCaptureInPage` roda DENTRO da página
// via page.evaluate. Ela é autossuficiente (sem imports, closures ou helpers
// externos) e recebe UM único argumento serializável. Somente leitura: abre
// seções recolhidas da própria página e faz GET da ficha da pessoa com a sessão
// já autenticada; nunca envia formulário nem pratica ato no portal.
// A chave do processo NÃO é devolvida aqui — ela segue o caminho do cofre.

export async function extractEprocFullCaptureInPage({ clientName = '', fetchPerson = true, waitMs = 125, personSheetOnly = false } = {}) {
  const cleanSpace = value => String(value ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const normalizeCompare = value => cleanSpace(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cleanDigits = value => String(value ?? '').replace(/\D/g, '');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const DATE_BR_RE = /\b(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?\b/;
  const formatCpf = v => { const d = cleanDigits(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cleanSpace(v); };
  const formatCnpj = v => { const d = cleanDigits(v); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : cleanSpace(v); };
  const toIsoDate = value => {
    const text = cleanSpace(value);
    const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  };
  const toIsoTimestamp = value => {
    const m = cleanSpace(value).match(DATE_BR_RE);
    if (!m) return '';
    const time = m[4] || '00:00:00';
    return `${m[3]}-${m[2]}-${m[1]}T${time.length === 5 ? `${time}:00` : time}`;
  };
  const parseCurrencyBrl = value => {
    const m = cleanSpace(value).match(/-?\d[\d.]*,\d{2}|-?\d[\d.]*/);
    if (!m) return null;
    const n = Number(m[0].includes(',') ? m[0].replace(/\./g, '').replace(',', '.') : m[0].replace(/\./g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const isVisible = el => {
    if (!el) return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    return !(style && (style.display === 'none' || style.visibility === 'hidden'));
  };
  const htmlToLogicalText = html => String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|dt|dd|fieldset|section|legend)>/gi, '\n')
    .replace(/<\/(?:td|th|label)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");

  // ---- Etapa 1: capa (órgão julgador → comarca) ----
  const coverField = (selectors, pattern) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el ? cleanSpace(el.tagName === 'INPUT' ? el.value : el.textContent) : '';
      if (text) return text;
    }
    for (const el of document.querySelectorAll('label, span, th, td, b, strong, dt')) {
      if (el.children.length > 2) continue;
      const own = cleanSpace(el.textContent);
      if (!own || own.length > 60 || !pattern.test(own)) continue;
      const stripped = cleanSpace(own.replace(pattern, '').replace(/^[:\s]+/, ''));
      if (stripped) return stripped;
      const next = el.nextElementSibling;
      const val = next ? cleanSpace(next.textContent) : '';
      if (val && !pattern.test(val)) return val;
    }
    return '';
  };
  const courtUnit = coverField(['#txtOrgaoJulgador', '[id*="OrgaoJulgador" i]'], /^[ÓO]rg[ãa]o\s*Julgador\s*:?/i);
  let county = '';
  {
    const explicit = courtUnit.match(/\bComarca\s+d[eoa]s?\s+(.+?)\s*(?:[-–]\s*[A-Z]{2})?$/i);
    const m = explicit ? null : courtUnit.match(/\b(?:de|da|do)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s]{2,40}?)(?:\s*[-–]\s*[A-Z]{2})?$/);
    if (explicit) county = cleanSpace(explicit[1]);
    else if (m && !/Justi[çc]a|N[úu]cleo|Federal|Estadual/i.test(m[1])) county = cleanSpace(m[1]);
  }
  const actionClass = coverField(['#txtClasse', '[id*="txtClasse" i]'], /^Classe\s*(?:da\s*a[çc][ãa]o)?\s*:?/i);

  // ---- Etapa 2: assuntos (expande "+ Assuntos" se necessário) ----
  const isSubjectsTable = table => {
    const header = normalizeCompare([...table.querySelectorAll('th')].map(th => th.textContent).join(' '));
    return header.includes('codigo') && header.includes('descricao');
  };
  const parseSubjects = () => {
    const subjects = [];
    for (const table of [...document.querySelectorAll('table')].filter(isSubjectsTable)) {
      for (const row of [...table.querySelectorAll('tr')].filter(tr => tr.querySelector('td'))) {
        const cells = [...row.querySelectorAll('td')].map(td => cleanSpace(td.textContent));
        if (cells.length < 2 || (!cells[0] && !cells[1])) continue;
        const principal = row.getAttribute('data-assunto-principal') === 'true'
          || /^(sim|s|yes|true|1)$/i.test(cells[2] || '');
        subjects.push({ code: cells[0], description: cells[1], principal });
      }
    }
    return subjects;
  };
  const findToggle = (directSelectors, regex) => {
    const notHistory = el => !/historico/i.test(`${el.getAttribute('href') || ''} ${el.getAttribute('title') || ''}`);
    for (const sel of directSelectors) {
      const el = [...document.querySelectorAll(sel)].filter(notHistory)[0];
      if (!el) continue;
      if (el.tagName === 'LEGEND') {
        const inner = [...el.querySelectorAll('a, button, [onclick]')].find(notHistory);
        if (inner) return inner;
      }
      return el;
    }
    return [...document.querySelectorAll('a, button, [onclick], legend')].filter(notHistory)
      .find(el => regex.test(cleanSpace(el.textContent || el.getAttribute('title') || ''))) || null;
  };
  let subjects = parseSubjects();
  const subjTable = [...document.querySelectorAll('table')].find(isSubjectsTable);
  if (!personSheetOnly && (!subjects.length || (subjTable && !isVisible(subjTable)))) {
    const toggle = findToggle(['#fldAssuntos legend a', '#fldAssuntos legend [onclick]', '#imgStatusAssunto', '#imgStatusAssuntos', '#fldAssuntos legend'], /^(?:\[\+\]|\+)?\s*Assuntos\b/i);
    if (toggle && typeof toggle.click === 'function') {
      toggle.click();
      for (let i = 0; i < 20 && !subjects.length; i += 1) {
        await sleep(waitMs);
        subjects = parseSubjects();
      }
    }
  }
  const principalItem = subjects.find(s => s.principal) || subjects[0] || null;
  const subject = principalItem
    ? (principalItem.code ? `${principalItem.code} — ${principalItem.description}` : principalItem.description)
    : '';
  let actionGroup = '';
  let actionType = '';
  {
    const desc = cleanSpace(principalItem?.description || '');
    const norm = normalizeCompare(desc);
    if (/direito previdenciario|previdenciari|beneficios em especie|aposentadoria|auxilio|incapacidade|pensao por morte|salario[- ]maternidade|bpc|loas|inss/.test(norm)) actionGroup = 'Previdenciário';
    else if (/direito do trabalho|trabalhista|rescisao/.test(norm)) actionGroup = 'Trabalhista';
    else if (/direito tributario|execucao fiscal|tributo/.test(norm)) actionGroup = 'Tributário';
    else if (/direito administrativo|servidor publico|licitacao/.test(norm)) actionGroup = 'Administrativo';
    else if (/direito do consumidor|consumidor/.test(norm)) actionGroup = 'Consumidor';
    else if (/familia|sucessoes|alimentos|divorcio|guarda|inventario/.test(norm)) actionGroup = 'Família e Sucessões';
    else if (/direito penal|crime|criminal/.test(norm)) actionGroup = 'Penal';
    else if (/direito civil|obrigacoes|responsabilidade civil|contratos/.test(norm)) actionGroup = 'Cível';
    else if (/^04/.test(cleanSpace(principalItem?.code || ''))) actionGroup = 'Previdenciário';
    if (desc) {
      let parts = desc.includes(',')
        ? desc.split(/,(?![^()]*\))/).map(cleanSpace).filter(Boolean)
        : desc.split(/\s+[/>]\s+|\s+[-–]\s+/).map(cleanSpace).filter(Boolean);
      if (parts.length >= 2 && /^direito\s+/i.test(normalizeCompare(parts[0]))) parts = [...parts].reverse();
      if (parts.length >= 2) {
        const normParent = normalizeCompare(parts[1]);
        actionType = !/^direito\s+/.test(normParent) && !/beneficios em especie/.test(normParent)
          ? `${parts[1]} — ${parts[0]}` : parts[0];
      } else {
        actionType = parts[0] || '';
      }
    } else {
      actionType = actionClass;
    }
  }

  // ---- Etapa 3: ficha "Consultar Pessoa" da parte cliente ----
  const parseAddressLine = rawLine => {
    const raw = cleanSpace(rawLine);
    if (!raw) return null;
    let zip = ''; let city = ''; let state = ''; let prefix = raw;
    const cepCity = raw.match(/\b(\d{5})-?(\d{3})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,60}?)\s*[-–/]\s*([A-Z]{2})\b/);
    if (cepCity) {
      zip = `${cepCity[1]}-${cepCity[2]}`; city = cleanSpace(cepCity[3]); state = cepCity[4];
      prefix = cleanSpace(raw.slice(0, cepCity.index));
    } else {
      const cep = raw.match(/\b(\d{5})-?(\d{3})\b/);
      if (cep) {
        zip = `${cep[1]}-${cep[2]}`;
        prefix = cleanSpace(raw.slice(0, cep.index));
        const tail = cleanSpace(raw.slice(cep.index + cep[0].length).replace(/^[\s\-–,/]+/, ''));
        const cu = tail.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,60}?)\s*[-–/]\s*([A-Z]{2})\b/);
        if (cu) { city = cleanSpace(cu[1]); state = cu[2]; }
      } else {
        const cu = raw.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,60}?)\s*[-–/]\s*([A-Z]{2})$/);
        if (cu) { city = cleanSpace(cu[1]); state = cu[2]; prefix = cleanSpace(raw.slice(0, cu.index)); }
      }
    }
    const parts = prefix.split(/\s+-\s+/).map(p => cleanSpace(p.replace(/^[,\s-]+|[,\s-]+$/g, ''))).filter(Boolean);
    let street = ''; let district = '';
    if (parts.length >= 3) { district = parts[parts.length - 1]; street = parts.slice(0, -1).join(', '); }
    else if (parts.length === 2) {
      if (/^(centro|zona|bairro|vila|jardim|parque|distrito)/i.test(parts[1]) || parts[0].includes(',')) { street = parts[0]; district = parts[1]; }
      else street = parts.join(', ');
    } else if (parts.length === 1) street = parts[0];
    const hasStreet = Boolean(street && /[A-Za-zÀ-ÿ]{2,}/.test(street) && !/^(?:s\/?n|sem\s+logradouro|n[ãa]o\s+informado)$/i.test(street));
    return { street, district, zip, city, state, hasStreet };
  };
  const optional = value => {
    const text = cleanSpace(value);
    return !text || /^(-|n[ãa]o\s+informad[oa]|n\/?a|sem\s+informa[çc][ãa]o)$/i.test(text) ? '' : text;
  };
  const parsePersonSheet = html => {
    const text = htmlToLogicalText(html).replace(
      /\s+(?=(?:-\s*)?(?:Tipo\s+Pessoa|CPF|CNPJ|Sexo|Data\s+de\s+Nasc\.?|Estado\s+Civil|Nacionalidade|Naturalidade|M[ãa]e|Pai|Profiss[ãa]o|Endere[çc]o(?:\s+(?:Residencial|Comercial|Correspond[êe]ncia))?|Data\s+de\s+Inclus[ãa]o|(?:Telefone\s+)?Celular|Telefone|E-?mail)\s*:)/gi,
      '\n'
    );
    const lines = text.split(/\r?\n/).map(cleanSpace).filter(Boolean);
    const valueOf = regex => {
      for (let i = 0; i < lines.length; i += 1) {
        const m = lines[i].match(regex);
        if (!m) continue;
        if (cleanSpace(m[1])) return cleanSpace(m[1]);
        const next = lines[i + 1] || '';
        return next && !/^(?:-\s*)?[A-ZÀ-ÿ][^:]{1,48}:(?:\s|$)/i.test(next) ? next : '';
      }
      return '';
    };
    const cpf = valueOf(/^CPF\s*:\s*(.*)$/i);
    const cnpj = valueOf(/^CNPJ\s*:\s*(.*)$/i);
    const addresses = [];
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(/^Endere[çc]o(?:\s+(Residencial|Comercial|Correspond[êe]ncia))?\s*:\s*(.*)$/i);
      if (!m) continue;
      let line = cleanSpace(m[2]);
      let cursor = i + 1;
      if (!line && lines[cursor] && !/^Data\s+de\s+Inclus/i.test(lines[cursor])) { line = lines[cursor]; cursor += 1; }
      let includedAt = '';
      for (let k = cursor; k < Math.min(lines.length, cursor + 3); k += 1) {
        const inc = lines[k].match(/^Data\s+de\s+Inclus[ãa]o\s*:\s*(.*)$/i);
        if (inc) { includedAt = toIsoTimestamp(cleanSpace(inc[1]) || lines[k + 1] || ''); break; }
      }
      const parsed = parseAddressLine(line);
      if (parsed) addresses.push({ type: m[1] ? cleanSpace(m[1]) : 'Residencial', ...parsed, includedAt });
    }
    addresses.sort((a, b) => (a.includedAt && b.includedAt ? b.includedAt.localeCompare(a.includedAt) : a.includedAt ? -1 : b.includedAt ? 1 : 0));
    const primary = addresses.find(a => a.hasStreet) || addresses.find(a => a.city || a.zip) || null;
    const email = optional(valueOf(/^(?:-\s*)?E-?mail\s*:\s*(.*)$/i));
    return {
      name: optional(valueOf(/^Nome\s*:\s*(.*)$/i)),
      document: cnpj ? formatCnpj(cnpj) : (cpf ? formatCpf(cpf) : ''),
      birthDate: toIsoDate(valueOf(/^Data\s+de\s+Nasc\.?\s*:\s*(.*)$/i)),
      motherName: optional(valueOf(/^M[ãa]e\s*:\s*(.*)$/i)),
      profession: optional(valueOf(/^Profiss[ãa]o\s*:\s*(.*)$/i)),
      address: primary?.street || '',
      district: primary?.district || '',
      zip: primary?.zip || '',
      city: primary?.city || '',
      state: primary?.state || '',
      mobile: optional(valueOf(/^(?:-\s*)?(?:(?:Telefone\s+)?Celular(?:\s*\/\s*AppMensagens)?|WhatsApp)\s*:\s*(.*)$/i)),
      email: /@/.test(email) ? email : ''
    };
  };
  // Modo usado na aba "Consultar Pessoa" que o próprio eproc abre.
  if (personSheetOnly) {
    const sheet = parsePersonSheet(document.body ? document.body.innerHTML : '');
    return { person: sheet, personStatus: sheet.document || sheet.address || sheet.birthDate ? 'ok' : 'empty' };
  }
  const personUrlOf = el => {
    const href = el.getAttribute('href') || '';
    const onclick = el.getAttribute('onclick') || '';
    let raw = '';
    if (href && !/^javascript:/i.test(href) && /(?:id_pessoa=|processa_resultado_subfrm|pessoa_fisica|pessoa_juridica)/i.test(href)) raw = href;
    else {
      for (const source of [href, onclick]) {
        const m = source.match(/['"]([^'"]*(?:processa_resultado_subfrm|id_pessoa=)[^'"]*)['"]/i);
        if (m) { raw = m[1]; break; }
      }
    }
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      return url.origin === location.origin ? url.href : '';
    } catch { return ''; }
  };
  let person = null;
  let personStatus = 'skipped';
  let personLinkHint = null;
  const targetName = normalizeCompare(clientName);
  if (fetchPerson && targetName) {
    const anchors = [...document.querySelectorAll('.infraNomeParte, .infraNomeParte a, a[data-parte], a[href*="id_pessoa"], a[onclick*="id_pessoa"], a[href*="processa_resultado_subfrm"], a[onclick*="processa_resultado_subfrm"]')];
    const anchor = anchors.find(a => normalizeCompare(a.textContent) === targetName)
      || anchors.find(a => { const t = normalizeCompare(a.textContent); return t && (t.includes(targetName) || targetName.includes(t)); });
    let url = anchor ? personUrlOf(anchor) : '';
    if (!url && anchor) {
      const cell = anchor.closest('td, li, div') || anchor.parentElement;
      for (const el of cell ? cell.querySelectorAll('a, img, span, button, [onclick]') : []) {
        url = personUrlOf(el);
        if (url) break;
      }
    }
    // Sem link direto: o eproc abre "Consultar Pessoa" por script ao clicar no
    // nome. Clica (só consulta), lê a janela (iframe ou modal) e fecha.
    let popupSeen = false;
    if (!url && anchor && typeof anchor.click === 'function') {
      const readPopup = () => {
        for (const frame of document.querySelectorAll('iframe')) {
          try {
            const doc = frame.contentDocument;
            const html = doc?.body?.innerHTML || '';
            if (/Consultar\s+Pessoa|Tipo\s+Pessoa|CPF\s*:|CNPJ\s*:/i.test(htmlToLogicalText(html))) return { html, doc };
          } catch { /* iframe de outra origem: ignorado */ }
        }
        for (const box of document.querySelectorAll('#divInfraModalDialog, .infraModal, .ui-dialog, .modal.show, .modal.in, dialog[open]')) {
          const html = box.innerHTML || '';
          if (/Consultar\s+Pessoa|Tipo\s+Pessoa|CPF\s*:|CNPJ\s*:/i.test(htmlToLogicalText(html))) return { html, doc: null, box };
        }
        return null;
      };
      anchor.click();
      let popup = null;
      for (let i = 0; i < 32 && !popup; i += 1) {
        await sleep(waitMs);
        popup = readPopup();
        // Espera o conteúdo carregar (o iframe pode aparecer vazio primeiro).
        if (popup && !/CPF\s*:|CNPJ\s*:|Endere[çc]o/i.test(htmlToLogicalText(popup.html))) popup = null;
      }
      if (popup) {
        popupSeen = true;
        person = parsePersonSheet(popup.html);
        personStatus = person.document || person.address || person.birthDate ? 'ok' : 'empty';
        const isClose = el => /^(?:fechar|close)$/i.test(cleanSpace(el.value || el.textContent || el.getAttribute('aria-label') || ''));
        const closeBtn = [...(popup.doc ? popup.doc.querySelectorAll('button, a, input[type="button"]') : [])].find(isClose)
          || [...document.querySelectorAll('#divInfraModalDialog button, #divInfraModalDialog a, .ui-dialog button, .ui-dialog-titlebar-close, .infraModalFechar, .modal .close, dialog[open] button')].find(el => isClose(el) || /close|fechar/i.test(el.className || ''));
        if (closeBtn && typeof closeBtn.click === 'function') closeBtn.click();
      }
    }
    if (!url && !popupSeen) {
      personStatus = 'link_not_found';
      // Diagnóstico sem dados sensíveis: só a forma do link, nunca hash ou id.
      const shape = el => {
        const raw = `${el.getAttribute('href') || ''} ${el.getAttribute('onclick') || ''}`;
        return raw.replace(/hash=[^&'"\s]+/gi, 'hash=…').replace(/\d{3,}/g, '#').slice(0, 160);
      };
      const nameMatches = [...document.querySelectorAll('a, span')].filter(el => {
        const t = normalizeCompare(el.textContent);
        return t && t.length < 120 && (t === targetName || t.includes(targetName));
      }).slice(0, 4);
      personLinkHint = {
        candidatos: anchors.length,
        nomeEncontrado: nameMatches.length,
        formas: nameMatches.map(el => `${el.tagName.toLowerCase()}.${el.className || '-'} ${shape(el)}`.trim()),
        celula: (() => {
          const cell = anchor ? (anchor.closest('td') || anchor.parentElement) : null;
          if (!cell) return [];
          return [...cell.querySelectorAll('*')].filter(el => [...el.attributes].some(a => /^(?:href|onclick|data-|title)/i.test(a.name)))
            .slice(0, 8)
            .map(el => `${el.tagName.toLowerCase()} ` + [...el.attributes]
              .filter(a => /^(?:href|onclick|title|data-)/i.test(a.name))
              .map(a => `${a.name}=${a.value.replace(/hash=[^&'"\s]+/gi, 'hash=…').replace(/\d{3,}/g, '#').slice(0, 120)}`)
              .join(' '));
        })()
      };
    }
    else if (url) {
      try {
        const response = await fetch(url, { credentials: 'include', method: 'GET' });
        if (!response.ok) personStatus = `http_${response.status}`;
        else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          const ct = response.headers.get('content-type') || '';
          let charset = (ct.match(/charset=([^;\s"']+)/i) || [])[1] || '';
          if (!charset) {
            const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
            charset = (head.match(/<meta[^>]+charset=["']?([^"'\s/>;]+)/i) || [])[1] || '';
          }
          const html = /iso-8859-1|latin1|windows-1252|cp1252/i.test(charset)
            ? new TextDecoder('windows-1252').decode(bytes)
            : new TextDecoder('utf-8').decode(bytes);
          person = parsePersonSheet(html);
          personStatus = person.document || person.address || person.birthDate ? 'ok' : 'empty';
        }
      } catch {
        personStatus = 'fetch_failed';
      }
    }
  }

  // ---- Etapa 4: Informações Adicionais (sem a chave) ----
  const findAdditional = () => {
    for (const sel of ['#fldInformacoesAdicionais', '[id*="InformacoesAdicionais" i]', '[id*="InfAdicional" i]']) {
      const el = document.querySelector(sel);
      if (el && el.tagName !== 'IMG') return el;
    }
    const legend = [...document.querySelectorAll('legend, h3, h4, .infraLegenda')]
      .find(el => /Informa[çc][õo]es\s+Adicionais/i.test(cleanSpace(el.textContent)));
    return legend ? (legend.closest('fieldset, section, div') || legend.parentElement) : null;
  };
  const pairsOf = container => {
    const pairs = [];
    const seen = new Set();
    const push = (rawLabel, rawValue) => {
      const label = cleanSpace(String(rawLabel || '').replace(/:+$/, ''));
      const value = cleanSpace(rawValue);
      if (!label || label.length > 90 || label.startsWith('(') || /^Informa[çc][õo]es\s+Adicionais$/i.test(label)) return;
      const key = normalizeCompare(label);
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({ label, value });
    };
    container.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('th, td')];
      if (cells.length >= 2) {
        push(cells[0].textContent, cells[1].textContent);
        if (cells.length >= 4) push(cells[2].textContent, cells[3].textContent);
      }
    });
    container.querySelectorAll('dt').forEach(dt => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === 'DD') push(dt.textContent, dd.textContent);
    });
    const lines = htmlToLogicalText(container.innerHTML).split(/\r?\n/).map(cleanSpace).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const idx = lines[i].indexOf(':');
      if (idx <= 1 || idx > 80) continue;
      let val = cleanSpace(lines[i].slice(idx + 1));
      if (!val && lines[i + 1] && !lines[i + 1].includes(':')) val = lines[i + 1];
      push(lines[i].slice(0, idx), val);
    }
    return pairs;
  };
  let section = findAdditional();
  if (!section || pairsOf(section).length < 3) {
    const toggle = findToggle(['#fldInformacoesAdicionais legend a', '#fldInformacoesAdicionais legend [onclick]', '#imgStatusInfAdicional', '#legInfAdicional', '#fldInformacoesAdicionais legend'], /^(?:\[\+\]|\+)?\s*Informa[çc][õo]es\s+Adicionais\b/i);
    if (toggle && typeof toggle.click === 'function') {
      toggle.click();
      for (let i = 0; i < 18; i += 1) {
        await sleep(waitMs);
        section = findAdditional();
        if (section && pairsOf(section).length >= 3) break;
      }
    }
  }
  const KEY_LABEL_RE = /^Chave(?:\s*(?:do\s*)?Processo|\s*de\s*(?:Acesso|Consulta))?$/i;
  const pairs = section ? pairsOf(section).filter(p => p.value !== '' && !KEY_LABEL_RE.test(p.label)) : [];
  const find = re => (pairs.find(p => re.test(p.label)) || {}).value || '';
  const caseValueFormatted = find(/^Valor\s*(?:da)?\s*Causa$/i);

  return {
    courtUnit,
    county,
    actionClass,
    subjects,
    subject,
    actionGroup,
    actionType,
    person,
    personStatus,
    personLinkHint,
    additional: {
      caseValue: parseCurrencyBrl(caseValueFormatted),
      caseValueFormatted,
      nb: find(/^Benef[íi]cio\s*Prev\.?$/i),
      justicaGratuita: find(/^Justi[çc]a\s*Gratuita$/i),
      additionalInfo: pairs.slice(0, 40)
    }
  };
}

/** Comarca declarada no nome do órgão ("… da Comarca de X"). Sem palpite. */
export function countyFromCourtText(text) {
  const m = String(text || '').replace(/\s+/g, ' ').trim().match(/\bComarca\s+d[eoa]s?\s+(.+?)\s*(?:[-–]\s*[A-Z]{2})?$/i);
  return m ? m[1].trim() : '';
}

const isBlank = value => !String(value ?? '').trim()
  || /^(?:n[ãa]o\s+informad[oa]|-|sem\s+assunto|indefinid[oa])$/i.test(String(value).trim());

/**
 * Aplica a captura completa ao registro do processo e ao contato do cliente,
 * preenchendo somente campos em branco ou genéricos (campo manual vence).
 * Devolve a lista de campos preenchidos.
 */
export function applyEprocFullCapture(proc, capture, { contact = null } = {}) {
  const filled = [];
  if (!proc || !capture) return filled;
  const setIfBlank = (target, key, value, label = key) => {
    if (!target || value === undefined || value === null || String(value).trim() === '') return;
    if (!isBlank(target[key])) return;
    target[key] = value;
    filled.push(label);
  };
  setIfBlank(proc, 'courtUnit', capture.courtUnit);
  setIfBlank(proc, 'county', capture.county || countyFromCourtText(proc.court));
  setIfBlank(proc, 'subject', capture.subject);
  setIfBlank(proc, 'actionType', capture.actionType);
  setIfBlank(proc, 'actionGroup', capture.actionGroup);
  if (Array.isArray(capture.subjects) && capture.subjects.length && !(Array.isArray(proc.subjects) && proc.subjects.length)) {
    proc.subjects = capture.subjects.map(s => ({ code: String(s.code || ''), description: String(s.description || ''), principal: Boolean(s.principal) }));
    filled.push('subjects');
  }
  const add = capture.additional || {};
  setIfBlank(proc, 'caseValue', add.caseValueFormatted);
  setIfBlank(proc, 'benefitNumber', add.nb);
  if (Array.isArray(add.additionalInfo) && add.additionalInfo.length) {
    // Dado da fonte (nunca contém a chave): substitui a leitura anterior.
    proc.eprocAdditionalInfo = add.additionalInfo
      .filter(p => !/chave/i.test(p.label))
      .map(p => ({ label: String(p.label), value: String(p.value) }));
  }
  const person = capture.person;
  if (contact && person) {
    for (const key of ['document', 'birthDate', 'motherName', 'profession', 'address', 'district', 'zip', 'city', 'state', 'mobile', 'email']) {
      setIfBlank(contact, key, person[key], `contact.${key}`);
    }
    if (person.document && isBlank(contact.cpf)) contact.cpf = person.document;
  }
  return filled;
}

/**
 * Diagnóstico somente leitura: classifica processos com "Cadastro incompleto"
 * pela origem, para saber quantos nunca passaram pela página do eproc.
 */
export function diagnoseIncompleteProcesses(processes = [], missingFieldsOf) {
  const report = { total: 0, incomplete: 0, djenOnly: 0, eprocVisitedMissing: 0, otherSource: 0, byField: {}, enqueueableDjen: 0 };
  for (const proc of Array.isArray(processes) ? processes : []) {
    if (!proc || proc.deletedAt) continue;
    report.total += 1;
    const missing = missingFieldsOf(proc);
    if (!missing.length) continue;
    report.incomplete += 1;
    for (const field of missing) report.byField[field] = (report.byField[field] || 0) + 1;
    const tags = Array.isArray(proc.tags) ? proc.tags : [];
    const source = `${proc.source || ''} ${proc.origin || ''} ${proc.system || ''}`.toLowerCase();
    const visited = tags.includes('varredura-a1') || Boolean(proc.lastSyncAt && /eproc/.test(source)) || Boolean(proc.eprocEnrichment);
    if (visited) report.eprocVisitedMissing += 1;
    else if (/djen|cnj|datajud/.test(source) || tags.includes('djen')) {
      report.djenOnly += 1;
      // eproc só atende CNJ de justiça estadual/federal com eproc (segmento 4 ou 8).
      const digits = String(proc.number || '').replace(/\D/g, '');
      if (digits.length === 20 && ['4', '8'].includes(digits[13])) report.enqueueableDjen += 1;
    } else report.otherSource += 1;
  }
  return report;
}

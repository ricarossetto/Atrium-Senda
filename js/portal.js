(() => {
  'use strict';

  const STORAGE_KEY = 'jurisflow_storage_v1';
  const TERMINAL_STATUSES = ['concluida'];
  const KANBAN_COLUMNS = [
    { id: 'triagem', title: 'Entrada & triagem', color: '#c9a84c' },
    { id: 'prioridade', title: 'Prioridade', color: '#e5a84b' },
    { id: 'andamento', title: 'Em andamento', color: '#6f9fd8' },
    { id: 'aguardando', title: 'Aguardando', color: '#a887c7' },
    { id: 'revisao', title: 'Revisão', color: '#d68a67' },
    { id: 'concluida', title: 'Concluída', color: '#40b879' }
  ];

  const now = new Date();
  const isoDate = (offset = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  const sampleState = {
    version: 1,
    terms: [{
      id: 'term-principal',
      name: 'Ricardo De Luca Rossetto',
      registration: 'OAB/RS 135294',
      oabNumber: '135294',
      oabUf: 'RS',
      active: true,
      primary: true
    }],
    sources: [
      { id: 'external-calendar', name: 'Agenda Externa (Webcal)', short: 'CAL', method: 'Webcal/iCal', status: 'planned', lastCheck: null, detail: 'Sincronize com Google Agenda, Outlook ou Apple' },
      { id: 'djen-cnj', name: 'DJEN / CNJ Oficial', short: 'CNJ', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Conector de diários e publicações' },
      { id: 'datajud-cnj', name: 'DataJud / CNJ', short: 'DJD', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Enriquecimento de andamentos processuais' },
      { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' }
    ],
    intimations: [
      {
        id: 'int-demo-1', source: 'DJEN Oficial', status: 'nova', unread: true,
        title: 'Publicação identificada para conferência', process: '0000000-00.2026.8.21.0000',
        client: 'Cliente Modelo', court: 'Tribunal de Justiça · Vara Cível', publishedAt: isoDate(0),
        text: 'Intimação de demonstração. Quando os coletores estiverem ativos, o texto original da publicação ou da notificação oficial será preservado neste espaço.',
        term: 'Ricardo De Luca Rossetto · OAB/RS 135294', createdAt: new Date().toISOString()
      },
      {
        id: 'int-demo-2', source: 'Diário Eletrônico', status: 'triagem', unread: false,
        title: 'Movimentação processual aguardando análise', process: '5000000-00.2026.4.04.0000',
        client: 'Processo de demonstração', court: 'Justiça Federal · Vara Federal', publishedAt: isoDate(-1),
        text: 'Conteúdo ilustrativo para testar a triagem, a criação de tarefas e a vinculação ao Kanban.',
        term: 'Ricardo De Luca Rossetto · OAB/RS 135294', createdAt: new Date(Date.now() - 86400000).toISOString()
      }
    ],
    tasks: [
      { id: 'task-demo-1', title: 'Conferir publicação importada', description: 'Validar o conteúdo original antes de definir qualquer prazo.', status: 'triagem', source: 'Demonstração', client: 'Cliente Modelo', process: '0000000-00.2026.8.21.0000', deadline: isoDate(1), priority: 'urgente', responsible: 'Advogado', createdAt: new Date().toISOString() },
      { id: 'task-demo-2', title: 'Revisar minuta processual', description: 'Segunda conferência do documento antes do protocolo.', status: 'revisao', source: 'Interna', client: 'Processo de demonstração', process: '5000000-00.2026.4.04.0000', deadline: isoDate(4), priority: 'normal', responsible: 'Advogado', createdAt: new Date().toISOString() },
      { id: 'task-demo-3', title: 'Confirmar documentos com cliente', description: 'Aguardar o envio dos documentos complementares.', status: 'aguardando', source: 'Interna', client: 'Cliente Modelo', process: '', deadline: isoDate(7), priority: 'importante', responsible: 'Equipe', createdAt: new Date().toISOString() }
    ],
    processes: [
      { id: 'proc-demo-1', number: '0000000-00.2026.8.21.0000', client: 'Cliente Modelo', court: 'TJ · 1ª Vara Cível', secrecy: false, lastMovement: 'Publicação recebida para triagem', lastMovementAt: isoDate(0), monitoring: 'active' },
      { id: 'proc-demo-2', number: '5000000-00.2026.4.04.0000', client: 'Processo de demonstração', court: 'TRF · 2ª Vara Federal', secrecy: true, lastMovement: 'Movimentação capturada pelo conector', lastMovementAt: isoDate(-1), monitoring: 'attention' }
    ],
    contacts: [],
    customPrompts: [],
    customLinks: [],
    configuration: {
      users: [], monitoredTerms: [], taskDefinitions: [], actionGroups: [], actionTypes: [], stages: [], goals: [], origins: [], partners: [], inboxSections: [], notificationAssignments: [], integrations: [], sourceProducts: []
    },
    agenda: [
      { id: 'agenda-demo-1', title: 'Audiência de conciliação / instrução', date: isoDate(1), time: '09:30', source: 'Interna', client: 'Cliente Modelo', process: '0000000-00.2026.8.21.0000' },
      { id: 'agenda-demo-2', title: 'Prazo fatal para recurso', date: isoDate(4), time: '17:00', source: 'Demonstração', client: 'Processo de demonstração', process: '5000000-00.2026.4.04.0000' }
    ],
    audit: [
      { id: 'audit-initial', at: new Date().toISOString(), action: 'Atrium Senda inicializado', detail: 'Ambiente pronto para uso com registros de demonstração.', actor: 'Sistema' }
    ],
    settings: {
      officeName: 'Keller Advogados',
      officeSlogan: 'Sociedade de Advogados',
      lawyerName: 'Ricardo De Luca Rossetto',
      lawyerOab: 'OAB/RS 135294',
      lawyerCpfCnpj: '000.000.000-00',
      lawyerEmail: 'contato@keller.adv.br',
      lawyerPhone: '(51) 99999-9999',
      lawyerAddress: 'Endereço Profissional — Porto Alegre/RS',
      externalCalendarUrl: '',
      demoMode: true,
      calendarConfigured: false,
      collectorConfigured: false,
      dismissedBanner: false
    }
  };

  const deepClone = value => JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  function decodeHtmlEntities(value) {
    if (!value) return '';
    const ENTITY_MAP = {
      '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
      '&ccedil;': 'ç', '&Ccedil;': 'Ç',
      '&aacute;': 'á', '&Aacute;': 'Á', '&eacute;': 'é', '&Eacute;': 'É', '&iacute;': 'í', '&Iacute;': 'Í', '&oacute;': 'ó', '&Oacute;': 'Ó', '&uacute;': 'ú', '&Uacute;': 'Ú',
      '&agrave;': 'à', '&Agrave;': 'À', '&egrave;': 'è', '&Egrave;': 'È', '&igrave;': 'ì', '&Igrave;': 'Ì', '&ograve;': 'ò', '&Ograve;': 'Ò', '&ugrave;': 'ù', '&Ugrave;': 'Ù',
      '&atilde;': 'ã', '&Atilde;': 'Ã', '&otilde;': 'õ', '&Otilde;': 'Õ', '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
      '&acirc;': 'â', '&Acirc;': 'Â', '&ecirc;': 'ê', '&Ecirc;': 'Ê', '&icirc;': 'î', '&Icirc;': 'Î', '&ocirc;': 'ô', '&Ocirc;': 'Ô', '&ucirc;': 'û', '&Ucirc;': 'Û',
      '&auml;': 'ä', '&Auml;': 'Ä', '&euml;': 'ë', '&Euml;': 'Ë', '&iuml;': 'ï', '&Iuml;': 'Ï', '&ouml;': 'ö', '&Ouml;': 'Ö', '&uuml;': 'ü', '&Uuml;': 'Ü',
      '&ordf;': 'ª', '&ordm;': 'º', '&deg;': '°', '&sect;': '§', '&copy;': '©', '&reg;': '®', '&trade;': '™',
      '&ndash;': '–', '&mdash;': '—', '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”', '&bull;': '•', '&hellip;': '…'
    };
    let text = String(value);
    for (const [entity, char] of Object.entries(ENTITY_MAP)) {
      text = text.replaceAll(entity, char);
      text = text.replaceAll(entity.toUpperCase(), char);
    }
    text = text.replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(Number(dec)); } catch { return _; }
    });
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _; }
    });
    return text;
  }
  function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/```([\s\S]*?)```/g, (match, p1) => `<pre><code>${p1.trim()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/^### (.*$)/gim, '<h4 style="color:var(--gold);margin:10px 0 4px 0;">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 style="color:var(--gold);margin:12px 0 6px 0;">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 style="color:var(--gold);margin:14px 0 8px 0;">$1</h2>');
    html = html.replace(/^\s*[-•]\s+(.*)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    const lines = html.split('\n\n');
    html = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<pre') || trimmed.startsWith('<li')) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return html;
  }
  const normalizeText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const formatDate = value => {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
  };
  const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Nunca';
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ACT_RULES = [
    { regex: /\b(embargos?\s+de\s+declara[cç][aã]o|embargos?\s+declarat[oó]rios?)\b/i, category: 'Embargos de Declaração', days: 5, priority: 'importante', label: 'Embargos (5d)', css: 'embargos' },
    { regex: /\b(audi[eê]nc|sess[aã]o\s+de\s+julgamento|designad.{0,30}audi)\b/i, category: 'Audiência', days: 7, priority: 'urgente', label: 'Audiência (7d prep)', css: 'audiencia' },
    { regex: /\b(apelac|agravo\s+de\s+instrumento|recurso\s+inominado|recurso\s+especial|recurso\s+extraordin[aá]rio|recurso\s+ordin[aá]rio|recurs(o|ar))\b/i, category: 'Recurso', days: 15, priority: 'importante', label: 'Recurso (15d)', css: 'recurso' },
    { regex: /\b(contestac|contestaç|conteste|defes(a|ar)|apresentar\s+defesa)\b/i, category: 'Contestação', days: 15, priority: 'importante', label: 'Contestação (15d)', css: 'contestacao' },
    { regex: /\b(cumprimento\s+de\s+senten[cç]|pague|pagamento.{0,30}volunt|multa.{0,30}10%|execu[cç][aã]o)\b/i, category: 'Cumprimento de Sentença', days: 15, priority: 'urgente', label: 'Cumprimento (15d)', css: 'cumprimento' },
    { regex: /\b(manifest|impugn|r[eé]plic|especifica(r|cao|ção).{0,20}prov|contrarraz)\b/i, category: 'Manifestação', days: 15, priority: 'normal', label: 'Manifestação (15d)', css: 'manifestacao' },
    { regex: /\b(edital|recupera[cç][aã]o\s+judicial|fal[eê]ncia|concedo\s+o\s+prazo)\b/i, category: 'Edital / Geral', days: 15, priority: 'normal', label: 'Edital (15d)', css: 'recurso' },
    { regex: /\b(senten[cç]|ac[oó]rd[aã]o)\b/i, category: 'Sentença / Acórdão', days: 15, priority: 'importante', label: 'Sentença (15d)', css: 'recurso' },
    { regex: /\b(decis[aã]o)\b/i, category: 'Decisão Interlocutória', days: 15, priority: 'normal', label: 'Decisão (15d)', css: 'recurso' },
    { regex: /\b(despacho|ato\s+ordinat[oó]rio)\b/i, category: 'Despacho', days: 15, priority: 'normal', label: 'Despacho (15d)', css: 'rotina' }
  ];

  function classifyIntimationAct(text = '', title = '', type = '') {
    const combined = `${title} ${type} ${text}`;
    
    // 1. Extração de prazo explícito mencionado diretamente na decisão/despacho (ex: "prazo de 10 dias", "em 5 dias", "prazo de 30 dias")
    const explicitMatch = combined.match(/\bprazo\s+(?:de\s+)?(\d{1,2})\s+dias?\b/i) || combined.match(/\bno\s+prazo\s+de\s+(\d{1,2})\s+dias?\b/i) || combined.match(/\bem\s+(\d{1,2})\s+dias?\b/i);
    const explicitDays = explicitMatch ? parseInt(explicitMatch[1], 10) : null;

    for (const rule of ACT_RULES) {
      if (rule.regex.test(combined)) {
        if (explicitDays && explicitDays !== rule.days && explicitDays > 0 && explicitDays <= 60) {
          return {
            ...rule,
            days: explicitDays,
            label: `${rule.category.split(' ')[0]} (${explicitDays}d)`
          };
        }
        return rule;
      }
    }

    if (explicitDays && explicitDays > 0 && explicitDays <= 60) {
      return { category: 'Intimação', days: explicitDays, priority: 'normal', label: `Intimação (${explicitDays}d)`, css: 'rotina' };
    }

    // Regra Padrão do CPC: Quando não há certeza ou para prazos gerais, o padrão é SEMPRE 15 dias úteis
    return { category: 'Prazo Geral', days: 15, priority: 'normal', label: 'Prazo Geral (15d)', css: 'rotina' };
  }

  function addDays(isoString, days) {
    if (!isoString) return '';
    const date = new Date(`${String(isoString).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function totalTimeMinutes(timeLogs = []) {
    return (Array.isArray(timeLogs) ? timeLogs : []).reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
  }

  function formatMinutes(minutes) {
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  function getOfficeIdentity() {
    const s = Store?.state?.settings || {};
    const primaryTerm = Store?.state?.terms?.[0] || {};
    const authUser = window.KellerAuth?.currentUser || {};
    const lawyerName = s.lawyerName || primaryTerm.name || authUser.displayName || 'Dr(a). Advogado(a) Titular';
    const lawyerOab = s.lawyerOab || primaryTerm.registration || 'OAB/UF 000000';
    return {
      officeName: s.officeName || 'Advocacia Integrada',
      officeSlogan: s.officeSlogan || 'Escritório',
      officeLogo: s.officeLogo || '',
      lawyerName: lawyerName,
      lawyerOab: lawyerOab,
      lawyerCpf: s.lawyerCpfCnpj || '000.000.000-00',
      lawyerAddress: s.lawyerAddress || 'Sede Profissional',
      city: s.city || 'São Paulo/SP'
    };
  }

  function generateProcuracaoText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO OUTORGANTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const rg = contact?.rg ? `, RG nº ${contact.rg}` : '';
    const prof = contact?.profession ? `, ${contact.profession}` : '';
    const civil = contact?.maritalStatus ? `, estado civil ${contact.maritalStatus}` : '';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ') || '[ENDEREÇO COMPLETO]';
    const procNumber = process?.number ? ` nos autos do processo nº ${process.number}` : '';

    return `PROCURAÇÃO "AD JUDICIA ET EXTRA"

OUTORGANTE:
${name}, brasileiro(a)${civil}${prof}, inscrito(a) no CPF/MF sob o nº ${doc}${rg}, residente e domiciliado(a) em ${address}.

OUTORGADO:
${id.lawyerName.toUpperCase()}, advogado(a) regularmente inscrito(a) nos quadros da Ordem dos Advogados do Brasil sob o nº ${id.lawyerOab}, com escritório profissional em ${id.officeName}, estabelecido em ${id.lawyerAddress}.

PODERES:
Por este instrumento particular de mandato, o(a) OUTORGANTE nomeia e constitui o OUTORGADO seu procurador, conferindo-lhe amplos poderes para o foro em geral, com a cláusula "AD JUDICIA ET EXTRA", em qualquer Juízo, Instância ou Tribunal, bem como perante quaisquer órgãos públicos ou privados, autarquias e cartórios, podendo propor contra quem de direito as ações competentes e defendê-lo(a) nas que lhe forem propostas${procNumber}.

PODERES ESPECIAIS:
Nos termos do Artigo 105 do Código de Processo Civil (Lei nº 13.105/2015), são conferidos poderes especiais para confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, firmar compromissos ou acordos judiciais e extrajudiciais, receber valores, passar recibo e dar plena, geral e irrevogável quitação, bem como substabelecer esta a outrem, com ou sem reserva de poderes.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${name}
CPF: ${doc}`;
  }

  function generateContratoText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO CLIENTE/CONTRATANTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state].filter(Boolean).join(', ') || '[ENDEREÇO DO CONTRATANTE]';
    const feeType = process?.feeType || 'exito';
    const feePct = process?.feePercentage || '30';
    const feeFixed = process?.feeAmount ? `R$ ${process.feeAmount}` : 'a combinar';
    const feeDetails = feeType === 'exito'
      ? `Honorários contratuais de ${feePct}% (quota litis) incidentes sobre o proveito econômico auferido pelo CONTRATANTE ao final da demanda.`
      : feeType === 'fixo'
      ? `Honorários fixos no valor de ${feeFixed}, a serem adimplidos conforme cronograma acordado.`
      : `Honorários mistos no valor fixo de ${feeFixed} acrescidos de ${feePct}% sobre o êxito econômico auferido.`;

    return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS

Pelo presente instrumento particular, de um lado:

CONTRATANTE: ${name}, inscrito(a) no CPF/CNPJ nº ${doc}, com domicílio em ${address}.

CONTRATADO: ${id.officeName.toUpperCase()}, representado(a) por ${id.lawyerName}, inscrito(a) na ${id.lawyerOab}, com sede profissional em ${id.lawyerAddress}.

As partes acima qualificadas celebram o presente Contrato, mediante as seguintes cláusulas:

CLÁUSULA PRIMEIRA - DO OBJETO
O CONTRATADO prestará assistência jurídica e patrocínio dos interesses do CONTRATANTE${process?.number ? ` nos autos do processo nº ${process.number}` : ''}, abrangendo o ajuizamento, acompanhamento e defesas necessárias até a decisão final da instância ordinária.

CLÁUSULA SEGUNDA - DOS HONORÁRIOS
Pelos serviços profissionais prestados, o CONTRATANTE pagará ao CONTRATADO:
${feeDetails}

Parágrafo Único: Os honorários de sucumbência eventualmente arbitrados por juízo pertencem integralmente e com exclusividade ao CONTRATADO, sem qualquer compensação com os honorários contratuais, na forma do Art. 23 da Lei nº 8.906/94 (Estatuto da Advocacia).

CLÁUSULA TERCEIRA - DAS DESPESAS E CUSTAS
Todas as custas processuais, preparos recursais, despesas com certidões, cópias e honorários periciais correrão por conta do CONTRATANTE.

CLÁUSULA QUARTA - DO FORO
Fica eleito o foro da Comarca de ${contact?.city || id.city} para dirimir quaisquer dúvidas oriundas deste contrato.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_____________________________________        _____________________________________
CONTRATANTE: ${name}                        CONTRATADO: ${id.lawyerName} · ${id.lawyerOab}`;
  }

  function generateDeclaracaoHipoText(contact) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO DECLARANTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const rg = contact?.rg ? `, RG nº ${contact.rg}` : '';
    const prof = contact?.profession ? `, profissão: ${contact.profession}` : '';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state].filter(Boolean).join(', ') || '[ENDEREÇO DO DECLARANTE]';

    return `DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA (JUSTIÇA GRATUITA)

Eu, ${name}, brasileiro(a)${prof}, inscrito(a) no CPF/MF sob o nº ${doc}${rg}, residente e domiciliado(a) em ${address},

DECLARO, para todos os fins de direito e sob as penas da lei, em especial para atendimento ao disposto no Artigo 98 e seguintes do Código de Processo Civil (Lei nº 13.105/2015) e na Lei nº 1.060/1950, que não disponho de condições financeiras suficientes para arcar com as custas processuais, taxas judiciárias e honorários periciais ou sucumbenciais sem prejuízo do meu sustento próprio e de minha família.

Por ser a expressão fiel da verdade, firmo a presente declaração.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${name}
CPF: ${doc}`;
  }

  function generateProcuracaoPrevText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO OUTORGANTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const rg = contact?.rg ? `, RG nº ${contact.rg}` : '';
    const prof = contact?.profession ? `, profissão: ${contact.profession}` : '';
    const civil = contact?.maritalStatus ? `, estado civil ${contact.maritalStatus}` : '';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ') || '[ENDEREÇO COMPLETO]';
    const nbText = process?.nb ? ` (NB nº ${process.nb})` : '';

    return `PROCURAÇÃO ESPECIAL PREVIDENCIÁRIA "AD JUDICIA ET EXTRA"

OUTORGANTE:
${name}, brasileiro(a)${civil}${prof}, inscrito(a) no CPF sob o nº ${doc}${rg}, residente e domiciliado(a) em ${address}.

OUTORGADO:
${id.lawyerName.toUpperCase()}, advogado(a), ${id.lawyerOab}, com endereço profissional em ${id.officeName}, situado em ${id.lawyerAddress}.

PODERES ESPECÍFICOS PREVIDENCIÁRIOS:
Por este instrumento, o(a) OUTORGANTE confere ao(s) OUTORGADO(S) amplos poderes gerais para o foro ("AD JUDICIA ET EXTRA"), bem como PODERES ESPECIAIS para representá-lo(a) perante o INSTITUTO NACIONAL DO SEGURO SOCIAL (INSS), Juizados Especiais Federais, Varas Federais e Tribunais Regionais Federais${nbText}, podendo:
1. Requerer, acompanhar, prestar esclarecimentos, interpor recursos e assinar termos referentes a quaisquer benefícios previdenciários e assistenciais (Aposentadorias, Auxílios por Incapacidade, Pensões, BPC/LOAS);
2. Ter vista e extrair cópias de Processos Administrativos Previdenciários (PAP) e do Cadastro Nacional de Informações Sociais (CNIS);
3. Transigir, desistir, firmar acordos judiciais e extrajudiciais, renunciar ao excedente de 60 salários mínimos para expedição de RPV;
4. RECEBER E DAR QUITAÇÃO de valores decorrentes de Requisições de Pequeno Valor (RPV) e Precatórios Judiciais, bem como assinar guias, recibos e declarações de quitação.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${name}
CPF: ${doc}`;
  }

  function generateTermoRenunciaText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO CLIENTE]';
    const procNumber = process?.number || '[NÚMERO DO PROCESSO]';

    return `NOTIFICAÇÃO DE RENÚNCIA AO MANDATO JUDICIAL (ART. 112 DO CPC)

AO(À) ILUSTRÍSSIMO(A) SENHOR(A):
${name}

Ref.: Ação Judicial nº ${procNumber}

Prezado(a) Senhor(a),

Pelo presente instrumento, venho NOTIFICÁ-LO(A) de que, por motivos de foro íntimo, RENUNCIO aos poderes que me foram outorgados por Vossa Senhoria para representá-lo(a) nos autos do processo em epígrafe.

Em cumprimento ao disposto no Artigo 112, § 1º, da Lei nº 13.105/2015 (Código de Processo Civil), informo que continuarei a representá-lo(a) nos referidos autos durante os próximos 10 (dez) dias seguintes à ciência desta notificação, a fim de evitar qualquer prejuízo processual, cabendo a Vossa Senhoria constituir novo procurador para prosseguimento do feito.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${id.lawyerName}
${id.lawyerOab} - ${id.officeName}


CIENTE DO(A) NOTIFICADO(A): Em ___/___/______

Assinatura: _____________________________________________`;
  }

  function generateSubstabelecimentoText(contact, process) {
    const id = getOfficeIdentity();
    const procNumber = process?.number ? ` nos autos do processo nº ${process.number}` : '';

    return `SUBSTABELECIMENTO

SUBSTABELECENTE:
${id.lawyerName.toUpperCase()}, advogado(a), ${id.lawyerOab}, com escritório profissional em ${id.lawyerAddress}.

SUBSTABELECIDO(A):
[NOME DO ADVOGADO SUBSTABELECIDO], advogado(a) inscrito(a) na OAB/[UF] sob o nº [000.000], com escritório em [ENDEREÇO PROFISSIONAL].

PODERES:
Substabeleço, [COM / SEM] RESERVA DE IGUAIS PODERES, no(a) advogado(a) acima qualificado(a), todos os poderes que me foram outorgados por ${contact?.name || '[NOME DO CLIENTE]'}${procNumber}, para o fim específico de praticar todos os atos judiciais e extrajudiciais necessários ao fiel cumprimento do mandato.

${id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${id.lawyerName}
${id.lawyerOab}`;
  }

  function generateQuesitosPrevText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO AUTOR/SEGURADO]';
    const doc = contact?.document || '[CPF]';
    const procNumber = process?.number || '[NÚMERO DO PROCESSO]';
    const court = process?.court || '[VARA FEDERAL / JEF COMPETENTE]';
    const nb = process?.nb ? ` (NB nº ${process.nb})` : '';

    return `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DO(A) ${court.toUpperCase()}

Processo nº: ${procNumber}
Autor(a): ${name} (CPF nº ${doc})
Réu: INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS${nb}

${name.toUpperCase()}, já devidamente qualificado(a) nos autos da AÇÃO PREVIDENCIÁRIA em epígrafe, vem, por intermédio de seu(sua) procurador(a) infra-assinado(a), apresentar os seus:

QUESITOS DA PARTE AUTORA PARA A PERÍCIA MÉDICA JUDICIAL (ART. 465, § 1º, III DO CPC)

1. Qual a especialidade médica do(a) Ilustre Perito(a) e qual a atividade laborativa habitual declarada e comprovada pela parte Autora?
2. A parte Autora é portadora de alguma lesão, enfermidade ou sequela física/mental? Qual(is) o(s) respectivo(s) CID(s)?
3. A referida enfermidade decorre de acidente de trabalho, doença profissional ou possui nexo causal com as atividades laborativas desempenhadas?
4. Em razão da patologia diagnosticada, a parte Autora apresenta incapacidade para o exercício de sua profissão habitual ou de qualquer outra atividade laborativa que lhe garanta o sustento?
5. A incapacidade apurada é de caráter temporário ou permanente? É total ou parcial?
6. É possível estimar a Data de Início da Doença (DID) e a Data de Início da Incapacidade (DII)? Em quais exames, laudos e elementos clínicos o(a) Sr(a). Perito(a) se baseou para fixar tais marcos temporais?
7. Há indicação de intervenção cirúrgica, reabilitação profissional ou tratamentos medicamentosos contínuos?
8. No caso de não ser constatada incapacidade atual, restou evidenciada redução permanente da capacidade laborativa para a atividade que habitualmente exercia (hipótese de Auxílio-Acidente - Art. 86 da Lei 8.213/91)?
9. Queira o(a) Sr(a). Perito(a) prestar outros esclarecimentos que entender pertinentes para a justa resolução da lide.

Termos em que,
Pede deferimento.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${id.lawyerName}
${id.lawyerOab} - ${id.officeName}`;
  }

  function generatePrestacaoContasRpvText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO CLIENTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const procNumber = process?.number || '[NÚMERO DO PROCESSO]';
    const nb = process?.nb ? ` (NB nº ${process.nb})` : '';

    const grossAmount = Number(process?.requisitionAmount || process?.feeAmount || 0);
    const feePct = Number(process?.feePercentage || 30);
    const contractualFee = grossAmount > 0 ? (grossAmount * (feePct / 100)) : 0;
    const netAmount = grossAmount > 0 ? (grossAmount - contractualFee) : 0;

    const formattedGross = grossAmount > 0 ? `R$ ${grossAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ [VALOR BRUTO]';
    const formattedFee = contractualFee > 0 ? `R$ ${contractualFee.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${feePct}%)` : `[${feePct}% de Honorários]`;
    const formattedNet = netAmount > 0 ? `R$ ${netAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ [VALOR LÍQUIDO]';

    return `TERMO DE PRESTAÇÃO DE CONTAS E RECIBO DE REPASSE (RPV / ALVARÁ JUDICIAL)

CLIENTE / BENEFICIÁRIO(A):
${name}, inscrito(a) no CPF sob o nº ${doc}.

PROCESSO VINCULADO:
Processo nº: ${procNumber}${nb}
Juízo / Tribunal: ${process?.court || 'Justiça Federal / Estadual'}

DISCRIMINAÇÃO DOS VALORES RECEBIDOS E REPASSADOS:
1. VALOR BRUTO LEVANTADO (RPV / Alvará): ................... ${formattedGross}
2. (-) HONORÁRIOS ADVOCATÍCIOS CONTRATUAIS (${feePct}%): .. ${formattedFee}
3. (=) VALOR LÍQUIDO REPASSADO AO CLIENTE: ................ ${formattedNet}

DECLARAÇÃO DE QUITAÇÃO:
Pelo presente instrumento, o(a) CLIENTE declara que recebeu do escritório ${id.officeName}, por intermédio de seu(sua) procurador(a) ${id.lawyerName} (${id.lawyerOab}), a exata quantia líquida de ${formattedNet}, referente ao pagamento integral do crédito judicial oriundo do processo supramencionado.

Com o recebimento do referido valor, o(a) CLIENTE confere a mais ampla, geral, rasa e irrevogável QUITAÇÃO quanto aos valores decorrentes da presente ação judicial, nada mais tendo a reclamar a qualquer título, no presente ou no futuro.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${name}
CPF: ${doc}
(Beneficiário / Outorgante)


_________________________________________________________
${id.lawyerName}
${id.lawyerOab} - ${id.officeName}
(Advogado / Outorgado)`;
  }

  function generateRequerimentoInssText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO REQUERENTE]';
    const doc = contact?.document || '[CPF]';
    const nb = process?.nb ? `NB nº ${process.nb}` : '[NÚMERO DO BENEFÍCIO / PROTOCOLO]';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ') || '[ENDEREÇO DO REQUERENTE]';

    return `ILUSTRÍSSIMO(A) SENHOR(A) CHEFE DA AGÊNCIA DA PREVIDÊNCIA SOCIAL (INSS / APS)

REQUERIMENTO ADMINISTRATIVO DE CÓPIA INTEGRAL DE PROCESSO E REVISÃO

REQUERENTE:
${name}, brasileiro(a), inscrito(a) no CPF sob o nº ${doc}, residente e domiciliado(a) em ${address}, vem, por intermédio de seu(sua) procurador(a) legalmente constituído(a) ${id.lawyerName} (${id.lawyerOab}), com escritório profissional em ${id.lawyerAddress}, requerer o que segue:

1. DO OBJETO DO REQUERIMENTO:
O(A) Requerente é titular / postulante do benefício previdenciário ${nb}, processado perante esta Autarquia Federal.

2. DOS PEDIDOS:
Diante do exposto e com fundamento no Art. 5º, incisos XXXIII e XXXIV da Constituição Federal e no Art. 6º-A da Lei nº 8.213/91, requer:
a) O FORNECIMENTO DE CÓPIA INTEGRAL EM FORMATO DIGITAL (PDF) do Processo Administrativo (PAP), contendo todos os laudos periciais médicos (SABIC/PMF), pareceres da contadoria, extrato CNIS e decisões administrativas;
b) Seja conferida prioridade na tramitação deste pedido em razão das normas regulamentares vigentes;
c) Que todas as notificações e intimações referentes ao presente requerimento sejam dirigidas ao(à) procurador(a) subscritor(a).

Nestes termos,
Pede e aguarda deferimento.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${id.lawyerName}
${id.lawyerOab} - ${id.officeName}`;
  }

  function isBrazilianHoliday(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 1 && d === 1) return true;
    if (m === 4 && d === 21) return true;
    if (m === 5 && d === 1) return true;
    if (m === 9 && d === 7) return true;
    if (m === 10 && d === 12) return true;
    if (m === 11 && d === 2) return true;
    if (m === 11 && d === 15) return true;
    if (m === 11 && d === 20) return true;
    if (m === 12 && d === 25) return true;
    return false;
  }

  function isForenseRecess(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 12 && d >= 20) return true;
    if (m === 1 && d <= 20) return true;
    return false;
  }

  function isBusinessDay(date, excludeRecess = true) {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    if (excludeRecess && isForenseRecess(date)) return false;
    if (isBrazilianHoliday(date)) return false;
    return true;
  }

  function calculateLegalDeadline(startDateStr, totalDays = 15, options = {}) {
    const countBusiness = options.businessDays !== false;
    const isDouble = Boolean(options.doubleDeadline);
    const effectiveDays = isDouble ? totalDays * 2 : totalDays;
    
    let current = new Date(`${String(startDateStr).slice(0, 10)}T00:00:00`);
    if (isNaN(current.getTime())) current = new Date();

    // Art. 224 CPC: Exclui o dia do começo
    current.setDate(current.getDate() + 1);

    while (!isBusinessDay(current)) {
      current.setDate(current.getDate() + 1);
    }

    if (!countBusiness) {
      current.setDate(current.getDate() + (effectiveDays - 1));
      while (!isBusinessDay(current)) {
        current.setDate(current.getDate() + 1);
      }
      return current.toISOString().slice(0, 10);
    }

    let counted = 1;
    while (counted < effectiveDays) {
      current.setDate(current.getDate() + 1);
      if (isBusinessDay(current)) {
        counted += 1;
      }
    }

    return current.toISOString().slice(0, 10);
  }

  const daysUntil = value => {
    if (!value) return Infinity;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Math.ceil((date - today) / 86400000);
  };

  const Store = {
    state: null,
    revision: null,
    saveTimer: null,
    flushPromise: Promise.resolve(),
    async load() {
      let persisted = null;
      try {
        const response = await window.KellerAuth.secureFetch('/api/state', { headers: { Accept: 'application/json' } });
        if (response.ok) { const payload = await response.json(); persisted = payload.state; this.revision = payload.revision || null; }
      } catch { /* usa migração local ou demonstração */ }
      if (!persisted) {
        try { persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* armazenamento antigo inválido */ }
      }
      this.state = persisted?.version === 1 ? persisted : deepClone(sampleState);
      this.ensureShape();
      this.save();
    },
    ensureShape() {
      ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'audit', 'contacts', 'customPrompts', 'customLinks'].forEach(key => {
        if (!Array.isArray(this.state[key])) this.state[key] = [];
      });
      this.state.configuration = { ...(this.state.configuration || {}) };
      const defaultOffice = window.OFFICE_DEFAULT_DATA || {};
      for (const key of ['taskDefinitions', 'actionTypes', 'actionGroups', 'stages', 'origins', 'goals', 'users', 'inboxSections', 'notificationAssignments', 'integrations']) {
        if (!Array.isArray(this.state.configuration[key]) || this.state.configuration[key].length === 0) {
          if (Array.isArray(defaultOffice[key]) && defaultOffice[key].length > 0) {
            this.state.configuration[key] = deepClone(defaultOffice[key]);
          } else {
            this.state.configuration[key] = [];
          }
        }
      }
      this.state.settings = { ...sampleState.settings, ...(this.state.settings || {}) };
      if (Array.isArray(this.state.sources)) {
        this.state.sources.forEach(s => {
          if (s.id === 'djen') s.id = 'djen-cnj';
          if (s.id === 'datajud') s.id = 'datajud-cnj';
        });
        const seen = new Set();
        this.state.sources = this.state.sources.filter(s => {
          if (!s?.id || seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
      }
      if (Array.isArray(this.state.processes)) {
        this.state.processes.forEach(p => {
          if (p.feeType === 'exito' && (p.feePercentage === '30' || !p.feePercentage) && (!p.feeAmount || p.feeAmount === '')) {
            p.feeType = '';
            p.feePercentage = '';
            p.feeStatus = '';
          }
        });
      }
      if (!this.state.terms.length) this.state.terms.unshift(deepClone(sampleState.terms[0]));
      if (this.state.terms[0]) {
        if (!this.state.terms[0].registration || this.state.terms[0].registration === 'OAB/UF 000000') {
          this.state.terms[0].registration = 'OAB/RS 135294';
          this.state.terms[0].oabNumber = '135294';
          this.state.terms[0].oabUf = 'RS';
        }
        if (!this.state.terms[0].name || this.state.terms[0].name === 'Dr(a). Advogado(a) Titular') {
          this.state.terms[0].name = 'Ricardo De Luca Rossetto';
        }
      }
      const authUser = window.KellerAuth?.currentUser;
      if (authUser?.displayName && this.state.terms[0]) {
        this.state.terms[0].name = authUser.displayName;
        if (!this.state.settings.lawyerName || this.state.settings.lawyerName === 'Dr(a). Advogado(a) Titular') {
          this.state.settings.lawyerName = authUser.displayName;
        }
      }
    },
    save() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => { this.flushPromise = this.flushPromise.then(() => this.flush()); }, 250);
    },
    async flush() {
      clearTimeout(this.saveTimer); this.saveTimer = null;
      try {
        const response = await window.KellerAuth.secureFetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: this.state, revision: this.revision }), keepalive: true });
        if (response.status === 409) {
          window.KellerCentral?.App.toast('Os dados foram atualizados em outra aba. Recarregando a versão mais recente…', 'error');
          setTimeout(() => window.location.reload(), 700); return false;
        }
        if (!response.ok && response.status !== 401) throw new Error('Estado não persistido.');
        if (response.ok) { this.revision = (await response.json()).revision || this.revision; localStorage.removeItem(STORAGE_KEY); }
        return response.ok;
      } catch { return false; }
    },
    audit(action, detail, actor = 'Advogado') {
      const author = window.KellerAuth?.currentUser?.displayName || actor;
      this.state.audit.unshift({ id: uid('audit'), at: new Date().toISOString(), action, detail, actor: author });
      this.state.audit = this.state.audit.slice(0, 250);
      this.save();
    },
    upsert(collection, record, externalKey = 'id') {
      const index = this.state[collection].findIndex(item => item[externalKey] === record[externalKey]);
      if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
      else this.state[collection].unshift(record);
      this.save();
      return record;
    }
  };

  function sortRecords(records, sortConfig) {
    if (!sortConfig || !sortConfig.field) return records;
    const { field, direction } = sortConfig;
    const modifier = direction === 'desc' ? -1 : 1;
    return [...records].sort((a, b) => {
      let valA = a[field];
      let valB = b[field];
      if (field === 'registeredAt') {
        valA = a.registeredAt || a.createdAt || '';
        valB = b.registeredAt || b.createdAt || '';
      }
      if (field === 'lastMovementAt') {
        valA = a.lastMovementAt || '';
        valB = b.lastMovementAt || '';
      }
      if (valA === undefined || valA === null || valA === '') return 1;
      if (valB === undefined || valB === null || valB === '') return -1;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB, 'pt-BR', { numeric: true, sensitivity: 'base' }) * modifier;
      }
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });
  }

  function updateTableSortHeaders(tableId, currentSort) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.querySelectorAll('th[data-sort-field]').forEach(th => {
      const field = th.dataset.sortField;
      const indicator = th.querySelector('.sort-indicator');
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (field === currentSort.field) {
        if (currentSort.direction === 'asc') {
          th.classList.add('sorted-asc');
          if (indicator) indicator.textContent = '▲';
        } else {
          th.classList.add('sorted-desc');
          if (indicator) indicator.textContent = '▼';
        }
      } else {
        if (indicator) indicator.textContent = '↕';
      }
    });
  }

  const App = {
    currentView: 'dashboard',
    inboxFilter: 'pendentes',
    inboxSort: 'date-desc',
    currentTourSlide: 0,
    tempOfficeLogo: null,
    selectedIntimation: null,
    configurationSection: 'taskDefinitions',
    modalMode: null,
    judicialStatus: null,
    processSort: { field: 'registeredAt', direction: 'desc' },
    contactSort: { field: 'name', direction: 'asc' },
    agendaSelectedDate: null,
    agendaCalendarMonthOffset: 0,
    agendaTypeFilter: 'all',
    aiChatHistory: [],
    aiConfigured: false,
    isAiTyping: false,
    promptsFilter: { search: '', category: 'all', type: 'all' },
    async init() {
      await Store.load();
      this.bindNavigation();
      this.bindActions();
      this.renderAll();
      this.checkServerStatus();
      this.checkAiStatus();
      document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date());
      if (Store.state.settings.dismissedBanner) document.getElementById('environmentBanner').classList.add('hidden');
      this.checkFirstAccessTour();
      this.syncAll({ silent: true });
      this.autoSyncTimer = window.setInterval(() => this.syncWhenIdle(), 5 * 60 * 1000);
    },
    bindNavigation() {
      document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => this.switchView(button.dataset.view)));
      document.addEventListener('click', event => { const link = event.target.closest('[data-view-link]'); if (link) this.switchView(link.dataset.viewLink); });
      document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
      document.addEventListener('keydown', event => {
        if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
          event.preventDefault(); document.getElementById('globalSearch').focus();
        }
        if (event.key === 'Escape') {
          this.closeModal();
          this.closeJudicialSetup();
          this.closeOfficeSetup();
          this.closeGuidedTour();
          this.closeCalendarConfigModal();
          this.closeGeminiKeyModal();
        }
        if (event.key === 'Enter') {
          const interactive = event.target.closest('[data-view-link], [data-process-id], [data-contact-id], [data-agenda-id], [data-source-id], #primaryTermCard, .sidebar-office');
          if (interactive && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) { event.preventDefault(); interactive.click(); }
        }
      });
    },
    bindActions() {
      const byId = id => document.getElementById(id);
      byId('dismissBanner')?.addEventListener('click', () => { byId('environmentBanner')?.classList.add('hidden'); Store.state.settings.dismissedBanner = true; Store.save(); });
      byId('syncButton')?.addEventListener('click', () => this.syncAll());
      byId('agendaSyncButton')?.addEventListener('click', () => this.syncAll());
      byId('tourButton')?.addEventListener('click', () => this.openGuidedTour());
      byId('newTaskButton')?.addEventListener('click', () => this.openTaskModal());
      byId('newContactButton')?.addEventListener('click', () => this.openContactModal());
      byId('newAgendaButton')?.addEventListener('click', () => this.openAgendaModal());
      byId('newConfigurationButton')?.addEventListener('click', () => this.openConfigurationModal());
      byId('newIntimationButton')?.addEventListener('click', () => this.openIntimationModal());
      byId('newProcessButton')?.addEventListener('click', () => this.openProcessModal());
      byId('newTermButton')?.addEventListener('click', () => this.openTermModal());
      byId('primaryTermCard')?.addEventListener('click', () => {
        const term = Store.state.terms[0] || { id: uid('term'), name: 'Dr(a). Advogado(a) Titular', registration: 'OAB/UF 000000', type: 'oab', active: true };
        this.openTermModal(term);
      });

      // Personalização do Escritório
      document.querySelector('.sidebar-office')?.addEventListener('click', () => this.openOfficeSetup());
      byId('officeSetupClose')?.addEventListener('click', () => this.closeOfficeSetup());
      byId('officeSetupCancel')?.addEventListener('click', () => this.closeOfficeSetup());
      byId('officeSetupBackdrop')?.addEventListener('click', event => { if (event.target === byId('officeSetupBackdrop')) this.closeOfficeSetup(); });
      byId('btnChooseOfficeLogo')?.addEventListener('click', () => byId('officeLogoInput')?.click());
      byId('officeLogoInput')?.addEventListener('change', event => this.handleOfficeLogoUpload(event.target.files?.[0]));
      byId('btnRemoveOfficeLogo')?.addEventListener('click', () => { this.tempOfficeLogo = null; this.updateOfficeLogoPreview(); });
      byId('officeSetupForm')?.addEventListener('submit', event => this.handleOfficeSetupSubmit(event));

      // Apresentação Guiada (Tour)
      byId('tourCloseButton')?.addEventListener('click', () => this.closeGuidedTour());
      byId('tourSkipButton')?.addEventListener('click', () => this.closeGuidedTour());
      byId('tourPrevButton')?.addEventListener('click', () => this.showTourSlide(this.currentTourSlide - 1));
      byId('tourNextButton')?.addEventListener('click', () => this.showTourSlide(this.currentTourSlide + 1));
      byId('tourDots')?.addEventListener('click', event => {
        const dot = event.target.closest('.tour-dot');
        if (dot && dot.dataset.slideTarget !== undefined) this.showTourSlide(Number(dot.dataset.slideTarget));
      });

      byId('modalClose')?.addEventListener('click', () => this.closeModal());
      byId('modalCancel')?.addEventListener('click', () => this.closeModal());
      byId('modalBackdrop')?.addEventListener('click', event => { if (event.target === byId('modalBackdrop')) this.closeModal(); });
      byId('modalForm')?.addEventListener('submit', event => this.handleModalSubmit(event));
      byId('inboxFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-filter]'); if (!button) return;
        this.inboxFilter = button.dataset.filter;
        byId('inboxFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderInbox();
      });
      byId('inboxSortSelect')?.addEventListener('change', event => {
        this.inboxSort = event.target.value;
        this.renderInbox();
      });
      document.querySelectorAll('.list-head-sort').forEach(btn => {
        btn.addEventListener('click', () => {
          const col = btn.dataset.inboxSortCol;
          if (col === 'date') {
            this.inboxSort = this.inboxSort === 'date-desc' ? 'date-asc' : 'date-desc';
          } else if (col === 'deadline') {
            this.inboxSort = this.inboxSort === 'deadline-asc' ? 'deadline-desc' : 'deadline-asc';
          }
          if (byId('inboxSortSelect')) byId('inboxSortSelect').value = this.inboxSort;
          this.renderInbox();
        });
      });
      byId('processSearch')?.addEventListener('input', () => this.renderProcesses(byId('processSearch').value));
      byId('contactSearch')?.addEventListener('input', () => this.renderContacts(byId('contactSearch').value));
      byId('configurationSearch')?.addEventListener('input', () => this.renderConfiguration(byId('configurationSearch').value));
      byId('configurationTabs')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-config-section]'); if (!button) return;
        this.configurationSection = button.dataset.configSection;
        if (byId('configurationSearch')) byId('configurationSearch').value = '';
        this.renderConfiguration();
      });
      byId('globalSearch')?.addEventListener('input', event => this.globalSearch(event.target.value));
      byId('importIntimationButton')?.addEventListener('click', () => byId('jsonImportInput')?.click());
      byId('jsonImportInput')?.addEventListener('change', event => this.importJson(event.target.files[0]));
      byId('exportAuditButton')?.addEventListener('click', () => this.exportJson(Store.state.audit, `atrium-senda-auditoria-${isoDate()}.json`));

      // Agenda Externa
      byId('configureCalendarButton')?.addEventListener('click', () => this.openCalendarConfigModal());
      byId('calendarConfigClose')?.addEventListener('click', () => this.closeCalendarConfigModal());
      byId('calendarConfigCancel')?.addEventListener('click', () => this.closeCalendarConfigModal());
      byId('calendarConfigBackdrop')?.addEventListener('click', event => { if (event.target === byId('calendarConfigBackdrop')) this.closeCalendarConfigModal(); });
      byId('calendarConfigForm')?.addEventListener('submit', event => this.handleCalendarConfigSubmit(event));

      // Assistente IA (Google Gemini)
      byId('btnOpenGeminiKeyModal')?.addEventListener('click', () => this.openGeminiKeyModal());
      byId('geminiKeyClose')?.addEventListener('click', () => this.closeGeminiKeyModal());
      byId('geminiKeyCancel')?.addEventListener('click', () => this.closeGeminiKeyModal());
      byId('geminiKeyBackdrop')?.addEventListener('click', event => { if (event.target === byId('geminiKeyBackdrop')) this.closeGeminiKeyModal(); });
      byId('geminiKeyForm')?.addEventListener('submit', event => this.handleGeminiKeySubmit(event));
      byId('btnSaveQuickAiKey')?.addEventListener('click', () => this.handleQuickAiKeySubmit());
      byId('btnClearAiConversation')?.addEventListener('click', () => this.clearAiConversation());
      document.querySelectorAll('.quick-prompt-btn').forEach(btn => btn.addEventListener('click', () => this.sendQuickPrompt(btn.dataset.prompt)));
      byId('aiChatForm')?.addEventListener('submit', event => this.handleAiChatSubmit(event));
      byId('aiChatInput')?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          byId('aiChatForm').requestSubmit();
        }
      });

      byId('certificateGuideButton').addEventListener('click', () => this.openJudicialSetup());
      byId('judicialSetupClose').addEventListener('click', () => this.closeJudicialSetup());
      byId('judicialSetupBackdrop').addEventListener('click', event => { if (event.target === byId('judicialSetupBackdrop')) this.closeJudicialSetup(); });
      byId('certificateFileInput').addEventListener('change', event => { byId('certificateFileName').textContent = event.target.files[0]?.name || 'Selecionar certificado'; });
      byId('certificateSetupForm').addEventListener('submit', event => this.saveCertificate(event));
      byId('portalQrInput').addEventListener('change', event => this.readPortalQr(event.target.files[0]));
      byId('portalTotpForm').addEventListener('submit', event => this.savePortalTotp(event));
      byId('removePortalTotpButton').addEventListener('click', () => this.removePortalTotp());
      byId('resetJudicialConnectionsButton').addEventListener('click', () => this.resetJudicialConnections());
      byId('syncJudicialNowButton')?.addEventListener('click', () => this.syncJudicialNow());
      byId('portalCoverageList').addEventListener('click', event => {
        const button = event.target.closest('[data-configure-totp]'); if (!button) return;
        byId('totpPortalSelect').value = button.dataset.configureTotp;
        byId('totpSetupSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
        byId('portalQrInput').focus();
      });
      byId('kanbanFilterButton').addEventListener('click', event => { event.currentTarget.classList.toggle('active'); this.toast('Filtro pessoal aplicado ao quadro.', 'success'); });
      byId('quickDocGenButton')?.addEventListener('click', () => this.openDocumentGenerator());
      byId('btnGenDocProcess')?.addEventListener('click', () => this.openDocumentGenerator({ type: 'contrato_honorarios' }));
      byId('btnGenDocContact')?.addEventListener('click', () => this.openDocumentGenerator({ type: 'procuracao' }));
      byId('docGenClose')?.addEventListener('click', () => this.closeDocumentGenerator());
      byId('docGenCancel')?.addEventListener('click', () => this.closeDocumentGenerator());
      byId('docGeneratorBackdrop')?.addEventListener('click', event => { if (event.target === byId('docGeneratorBackdrop')) this.closeDocumentGenerator(); });
      byId('docGenTypeSelect')?.addEventListener('change', () => this.updateDocPreview());
      byId('docGenContactSelect')?.addEventListener('change', () => this.updateDocPreview());
      byId('docGenProcessSelect')?.addEventListener('change', () => this.updateDocPreview());
      byId('docGenCopyButton')?.addEventListener('click', () => this.copyDocToClipboard());
      byId('docGenDownloadButton')?.addEventListener('click', () => this.downloadDoc());

      // Importador de planilhas
      const dropzone = byId('importerDropzone');
      const fileInput = byId('importerFileInput');
      if (dropzone && fileInput) {
        byId('btnSelectSpreadsheet')?.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('drag-over');
          if (e.dataTransfer.files?.[0]) this.handleSpreadsheetUpload(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
          if (e.target.files?.[0]) this.handleSpreadsheetUpload(e.target.files[0]);
        });
        byId('importerCancelButton')?.addEventListener('click', () => this.cancelSpreadsheetImport());
        byId('importerCommitButton')?.addEventListener('click', () => this.commitSpreadsheetImport());
      }
      document.querySelectorAll('th[data-sort-table]').forEach(th => {
        th.addEventListener('click', () => {
          const table = th.dataset.sortTable;
          const field = th.dataset.sortField;
          if (table === 'process') {
            if (this.processSort.field === field) {
              this.processSort.direction = this.processSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
              this.processSort.field = field;
              this.processSort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
            }
            this.renderProcesses(byId('processSearch')?.value || '');
          } else if (table === 'contact') {
            if (this.contactSort.field === field) {
              this.contactSort.direction = this.contactSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
              this.contactSort.field = field;
              this.contactSort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
            }
            this.renderContacts(byId('contactSearch')?.value || '');
          }
        });
      });
      byId('agendaFilterTabs')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-agenda-filter]');
        if (!button) return;
        this.agendaTypeFilter = button.dataset.agendaFilter;
        byId('agendaFilterTabs').querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn === button));
        this.renderAgenda();
      });
      byId('agendaTodayButton')?.addEventListener('click', () => {
        this.agendaSelectedDate = isoDate();
        this.agendaCalendarMonthOffset = 0;
        this.renderAgenda();
        this.toast('Exibindo atividades de hoje.', 'success');
      });
      byId('agendaAllUpcomingButton')?.addEventListener('click', () => {
        this.agendaSelectedDate = null;
        this.renderAgenda();
        this.toast('Exibindo todas as atividades próximas.', 'success');
      });

      // Biblioteca de Prompts Jurídicos
      byId('promptsSearchInput')?.addEventListener('input', (e) => {
        this.promptsFilter.search = e.target.value;
        const btnClear = byId('btnClearPromptsSearch');
        if (btnClear) btnClear.classList.toggle('hidden', !e.target.value);
        this.renderPrompts();
      });
      byId('btnClearPromptsSearch')?.addEventListener('click', () => {
        const input = byId('promptsSearchInput');
        if (input) input.value = '';
        this.promptsFilter.search = '';
        byId('btnClearPromptsSearch')?.classList.add('hidden');
        this.renderPrompts();
        input?.focus();
      });
      byId('promptCategorySelect')?.addEventListener('change', (e) => {
        this.promptsFilter.category = e.target.value;
        const chipsContainer = byId('promptsCategoryChips');
        if (chipsContainer) {
          chipsContainer.querySelectorAll('.prompt-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.category === this.promptsFilter.category);
          });
        }
        this.renderPrompts();
      });
      byId('promptTypeSelect')?.addEventListener('change', (e) => {
        this.promptsFilter.type = e.target.value;
        this.renderPrompts();
      });
      byId('promptsCategoryChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.prompt-chip');
        if (!chip) return;
        const cat = chip.dataset.category || 'all';
        this.promptsFilter.category = cat;
        const select = byId('promptCategorySelect');
        if (select) select.value = cat;
        this.renderPrompts();
      });
      byId('btnNewPrompt')?.addEventListener('click', () => this.openNewPromptModal());
      byId('btnNewLink')?.addEventListener('click', () => this.openNewLinkModal());
      byId('promptsGrid')?.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('[data-copy-prompt]');
        if (copyBtn) {
          const promptId = copyBtn.dataset.copyPrompt;
          const all = [...(Store.state.customPrompts || []), ...(window.PROMPTS_DATA || [])];
          const p = all.find(item => item.id === promptId);
          if (p) this.copyPrompt(p.prompt, copyBtn);
          return;
        }
        const useBtn = e.target.closest('[data-use-prompt]');
        if (useBtn) {
          const promptId = useBtn.dataset.usePrompt;
          const all = [...(Store.state.customPrompts || []), ...(window.PROMPTS_DATA || [])];
          const p = all.find(item => item.id === promptId);
          if (p) this.usePromptInAi(p.prompt);
          return;
        }
        const editBtn = e.target.closest('[data-edit-prompt]');
        if (editBtn) {
          const promptId = editBtn.dataset.editPrompt;
          const p = (Store.state.customPrompts || []).find(item => item.id === promptId);
          if (p) this.openNewPromptModal(p);
          return;
        }
        const deleteBtn = e.target.closest('[data-delete-prompt]');
        if (deleteBtn) {
          const promptId = deleteBtn.dataset.deletePrompt;
          const idx = (Store.state.customPrompts || []).findIndex(p => p.id === promptId);
          if (idx >= 0) {
            const removed = Store.state.customPrompts.splice(idx, 1)[0];
            Store.audit('Prompt personalizado excluído', removed?.title || promptId);
            Store.save();
            this.renderPrompts();
            this.toast('Prompt excluído com sucesso.', 'success');
          }
          return;
        }
      });
      byId('customLinksGrid')?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('[data-delete-link]');
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const linkId = deleteBtn.dataset.deleteLink;
          const idx = (Store.state.customLinks || []).findIndex(l => l.id === linkId);
          if (idx >= 0) {
            const removed = Store.state.customLinks.splice(idx, 1)[0];
            Store.audit('Link útil excluído', removed?.title || linkId);
            Store.save();
            this.renderLinks();
            this.toast('Link útil excluído com sucesso.', 'success');
          }
          return;
        }
      });
      byId('configurationList')?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('[data-delete-config]');
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const index = Number(deleteBtn.dataset.deleteConfig);
          const list = Store.state.configuration[this.configurationSection];
          if (Array.isArray(list) && index >= 0 && index < list.length) {
            const removed = list.splice(index, 1)[0];
            Store.audit('Configuração removida', `${this.configurationSection} · ${typeof removed === 'string' ? removed : (removed?.name || 'item')}`);
            Store.save();
            this.renderConfiguration();
            this.toast('Item removido com sucesso.', 'success');
          }
          return;
        }
      });
    },
    switchView(view) {
      this.currentView = view;
      document.querySelectorAll('.view').forEach(element => element.classList.toggle('active', element.id === `view-${view}`));
      document.querySelectorAll('.nav-item[data-view]').forEach(element => element.classList.toggle('active', element.dataset.view === view));
      const section = document.getElementById(`view-${view}`);
      if (section) {
        document.getElementById('viewTitle').textContent = section.dataset.title;
        document.getElementById('viewEyebrow').textContent = section.dataset.eyebrow;
      }
      if (view === 'prompts') this.renderPrompts();
      if (view === 'links') this.renderLinks();
      document.getElementById('sidebar').classList.remove('open');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    renderAll() {
      ['renderOfficeIdentity', 'renderMetrics', 'renderWeeklyDistribution', 'renderPriorities', 'renderActivity', 'renderSources', 'renderInbox', 'renderKanban', 'renderProcesses', 'renderContacts', 'renderAgenda', 'renderMonitoring', 'renderPrompts', 'renderLinks', 'renderConfiguration', 'renderAudit'].forEach(method => {
        try { this[method](); } catch (error) { console.error(`Falha em ${method}:`, error); }
      });
    },
    renderOfficeIdentity() {
      const s = Store?.state?.settings || {};
      const officeName = s.officeName || 'Keller Advogados';
      const officeSlogan = s.officeSlogan || 'Desde 1983';
      const officeLogo = s.officeLogo || '';

      const nameEl = document.getElementById('sidebarOfficeName');
      const labelEl = document.getElementById('sidebarOfficeLabel');
      const avatarEl = document.querySelector('.sidebar-office .office-avatar-icon');
      if (nameEl) nameEl.textContent = officeName;
      if (labelEl) labelEl.textContent = officeSlogan;

      if (avatarEl) {
        if (officeLogo) {
          avatarEl.innerHTML = `<img src="${escapeHtml(officeLogo)}" class="office-custom-logo" alt="Logo">`;
          avatarEl.style.background = 'transparent';
          avatarEl.style.backgroundImage = 'none';
        } else {
          avatarEl.innerHTML = '';
          avatarEl.style.backgroundImage = "url('assets/images/equipe.png')";
          avatarEl.style.backgroundSize = 'cover';
          avatarEl.style.backgroundPosition = 'center';
        }
      }
    },
    openOfficeSetup() {
      const s = Store.state.settings || {};
      const primaryTerm = Store.state.terms?.[0] || {};
      document.getElementById('officeInputName').value = s.officeName || 'Keller Advogados';
      document.getElementById('officeInputSlogan').value = s.officeSlogan || 'Desde 1983';
      document.getElementById('officeInputLawyer').value = s.lawyerName || primaryTerm.name || 'Ricardo De Luca Rossetto';
      document.getElementById('officeInputOab').value = s.lawyerOab || primaryTerm.registration || 'OAB/RS 135294';
      document.getElementById('officeInputAddress').value = s.lawyerAddress || '';
      document.getElementById('officeInputCity').value = s.city || '';

      this.tempOfficeLogo = s.officeLogo || null;
      this.updateOfficeLogoPreview();

      document.getElementById('officeSetupBackdrop').classList.remove('hidden');
    },
    closeOfficeSetup() {
      document.getElementById('officeSetupBackdrop').classList.add('hidden');
    },
    updateOfficeLogoPreview() {
      const preview = document.getElementById('officeLogoPreview');
      const removeBtn = document.getElementById('btnRemoveOfficeLogo');
      if (this.tempOfficeLogo) {
        preview.innerHTML = `<img src="${escapeHtml(this.tempOfficeLogo)}" alt="Prévia">`;
        removeBtn?.classList.remove('hidden');
      } else {
        preview.innerHTML = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10v2M15 10v2M9 15v2M15 15v2"/></svg>`;
        removeBtn?.classList.add('hidden');
      }
    },
    handleOfficeLogoUpload(file) {
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        this.toast('A imagem deve ter no máximo 2MB.', 'danger');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.tempOfficeLogo = e.target.result;
        this.updateOfficeLogoPreview();
        this.toast('Logo carregada com sucesso.', 'success');
      };
      reader.readAsDataURL(file);
    },
    handleOfficeSetupSubmit(event) {
      event.preventDefault();
      Store.state.settings.officeName = document.getElementById('officeInputName').value.trim();
      Store.state.settings.officeSlogan = document.getElementById('officeInputSlogan').value.trim();
      Store.state.settings.lawyerName = document.getElementById('officeInputLawyer').value.trim();
      Store.state.settings.lawyerOab = document.getElementById('officeInputOab').value.trim();
      Store.state.settings.lawyerAddress = document.getElementById('officeInputAddress').value.trim();
      Store.state.settings.city = document.getElementById('officeInputCity').value.trim();
      Store.state.settings.officeLogo = this.tempOfficeLogo;

      if (Store.state.terms?.[0]) {
        Store.state.terms[0].name = Store.state.settings.lawyerName;
        Store.state.terms[0].registration = Store.state.settings.lawyerOab;
      }

      Store.audit('Identidade do escritório atualizada', Store.state.settings.officeName);
      Store.save();
      this.renderOfficeIdentity();
      this.renderMonitoring();
      this.closeOfficeSetup();
      this.toast('Identidade do escritório salva com sucesso!', 'success');
    },
    checkFirstAccessTour() {
      const seen = localStorage.getItem('jurisflow_tour_seen') || Store.state.settings?.guidedTourSeen;
      if (!seen) {
        window.setTimeout(() => this.openGuidedTour(), 600);
      }
    },
    openGuidedTour() {
      this.currentTourSlide = 0;
      this.showTourSlide(0);
      document.getElementById('guidedTourBackdrop').classList.remove('hidden');
    },
    closeGuidedTour() {
      document.getElementById('guidedTourBackdrop').classList.add('hidden');
      localStorage.setItem('jurisflow_tour_seen', 'true');
      Store.state.settings.guidedTourSeen = true;
      Store.save();
    },
    showTourSlide(index) {
      const slides = document.querySelectorAll('.tour-slide');
      const dots = document.querySelectorAll('.tour-dot');
      const total = slides.length;
      if (index < 0) index = 0;
      if (index >= total) {
        this.closeGuidedTour();
        this.toast('Apresentação concluída! Bom trabalho.', 'success');
        return;
      }
      this.currentTourSlide = index;

      slides.forEach((s, i) => s.classList.toggle('active', i === index));
      dots.forEach((d, i) => d.classList.toggle('active', i === index));

      const prevBtn = document.getElementById('tourPrevButton');
      const nextBtn = document.getElementById('tourNextButton');
      if (prevBtn) prevBtn.style.display = index > 0 ? 'inline-block' : 'none';
      if (nextBtn) nextBtn.textContent = index === total - 1 ? '🚀 Concluir e Começar' : 'Próximo →';
    },
    renderMetrics() {
      const newIntimations = Store.state.intimations.filter(item => item.status === 'nova').length;
      const deadlines = Store.state.tasks.filter(task => !TERMINAL_STATUSES.includes(task.status) && daysUntil(task.deadline) >= 0 && daysUntil(task.deadline) <= 7).length;
      const activeTasks = Store.state.tasks.filter(task => !TERMINAL_STATUSES.includes(task.status)).length;
      const activeSources = Store.state.sources.filter(source => source.status === 'ok').length;
      document.getElementById('metricInbox').textContent = newIntimations;
      document.getElementById('metricDeadlines').textContent = deadlines;
      document.getElementById('metricTasks').textContent = activeTasks;
      document.getElementById('metricSources').textContent = `${activeSources}/${Store.state.sources.length}`;
      document.getElementById('inboxBadge').textContent = newIntimations;
      document.getElementById('notificationDot').style.display = newIntimations ? '' : 'none';
      document.getElementById('heroSummary').textContent = newIntimations || deadlines
        ? `${newIntimations} intimação(ões) nova(s) e ${deadlines} prazo(s) nos próximos sete dias precisam de conferência.`
        : 'Nenhuma ocorrência urgente foi identificada nas fontes ativas.';
    },
    renderWeeklyDistribution() {
      const activeTasks = Store.state.tasks.filter(t => !TERMINAL_STATUSES.includes(t.status));
      const dayCounts = [0, 0, 0, 0, 0];

      activeTasks.forEach(task => {
        if (!task.deadline) return;
        const parts = String(task.deadline).split('-');
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          if (!isNaN(d.getTime())) {
            const dayOfWeek = d.getDay(); // 0 Dom, 1 Seg, 2 Ter, 3 Qua, 4 Qui, 5 Sex, 6 Sab
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              dayCounts[dayOfWeek - 1]++;
            }
          }
        }
      });

      const maxCount = Math.max(...dayCounts, 1);
      const totalPrazos = dayCounts.reduce((a, b) => a + b, 0);
      const avg = totalPrazos > 0 ? (totalPrazos / 5).toFixed(1) : '0.0';

      for (let i = 0; i < 5; i++) {
        const count = dayCounts[i];
        const bar = document.getElementById(`chartBar${i}`);
        if (bar) {
          const pct = Math.max(25, Math.min(100, Math.round((count / maxCount) * 100)));
          bar.style.height = `${pct}%`;
          const valEl = bar.querySelector('.chart-val');
          if (valEl) valEl.textContent = count;
        }
      }

      const avgEl = document.getElementById('chartAvgStat');
      if (avgEl) avgEl.textContent = avg;
    },
    renderPriorities() {
      const tasks = Store.state.tasks
        .filter(task => !TERMINAL_STATUSES.includes(task.status))
        .sort((a, b) => (daysUntil(a.deadline) - daysUntil(b.deadline)) || (a.priority === 'urgente' ? -1 : 1))
        .slice(0, 4);
      document.getElementById('priorityList').innerHTML = tasks.length ? tasks.map((task, index) => `
        <button class="priority-item" data-task-id="${escapeHtml(task.id)}">
          <span class="priority-number">${index + 1}</span>
          <div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.client || task.process || 'Tarefa interna')} · ${formatDate(task.deadline)}</small></div>
          <span class="priority-status" style="background:${task.priority === 'urgente' ? 'var(--danger)' : task.status === 'revisao' ? 'var(--warning)' : 'var(--gold)'}"></span>
        </button>`).join('') : '<div class="empty-column">Nenhuma prioridade para hoje.</div>';
      document.querySelectorAll('#priorityList [data-task-id]').forEach(button => button.addEventListener('click', () => {
        const task = Store.state.tasks.find(item => item.id === button.dataset.taskId); if (task) this.openTaskModal(task);
      }));
    },
    renderActivity() {
      document.getElementById('activityTimeline').innerHTML = Store.state.audit.slice(0, 5).map(item => `
        <div class="timeline-item" data-view-link="audit" tabindex="0"><span class="timeline-marker"></span><div class="timeline-copy"><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.detail)}</span></div><time class="timeline-time">${formatDateTime(item.at)}</time></div>`).join('');
    },
    renderSources() {
      document.getElementById('sourceSummary').innerHTML = Store.state.sources.slice(0, 5).map(source => `
        <div class="source-summary-item" data-view-link="monitoring" tabindex="0"><span class="source-mark">${escapeHtml(source.short)}</span><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div><span class="health-dot ${source.status === 'ok' ? 'ok' : source.status === 'attention' ? 'attention' : 'off'}"></span></div>`).join('');
    },
    filteredIntimations() {
      const filter = this.inboxFilter;
      const sort = this.inboxSort || 'date-desc';

      let items = Store.state.intimations.filter(item => {
        if (filter === 'pendentes') return item.status !== 'prazo' && item.status !== 'tarefa' && item.status !== 'arquivada';
        if (filter === 'prazo') return item.status === 'prazo' || item.status === 'tarefa';
        if (filter === 'all') return true;
        if (filter === 'nova') return item.status === 'nova';
        if (filter === 'urgente') return Boolean(item.urgent || item.priority === 'urgente');
        if (filter === 'importante') return Boolean(item.important);
        if (filter === 'prazo-fatal') {
          const act = classifyIntimationAct(item.text, item.title, item.type);
          return item.fatalDeadline || act.days > 0;
        }
        return item.status === filter;
      });

      items.sort((a, b) => {
        const actA = classifyIntimationAct(a.text, a.title, a.type);
        const actB = classifyIntimationAct(b.text, b.title, b.type);
        const fatalA = a.fatalDeadline || (actA.days > 0 ? addDays(a.publishedAt || isoDate(), actA.days) : null);
        const fatalB = b.fatalDeadline || (actB.days > 0 ? addDays(b.publishedAt || isoDate(), actB.days) : null);

        if (sort === 'deadline-asc') {
          const dA = fatalA ? daysUntil(fatalA) : 99999;
          const dB = fatalB ? daysUntil(fatalB) : 99999;
          return dA - dB;
        }
        if (sort === 'deadline-desc') {
          const dA = fatalA ? daysUntil(fatalA) : -99999;
          const dB = fatalB ? daysUntil(fatalB) : -99999;
          return dB - dA;
        }
        if (sort === 'priority-urgent') {
          const urgA = (a.urgent || a.priority === 'urgente') ? 1 : 0;
          const urgB = (b.urgent || b.priority === 'urgente') ? 1 : 0;
          if (urgA !== urgB) return urgB - urgA;
          return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
        }
        if (sort === 'priority-important') {
          const impA = a.important ? 1 : 0;
          const impB = b.important ? 1 : 0;
          if (impA !== impB) return impB - impA;
          return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
        }
        if (sort === 'date-asc') {
          return new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0);
        }
        if (sort === 'process') {
          return String(a.process || '').localeCompare(String(b.process || ''));
        }
        // default: date-desc
        return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
      });

      return items;
    },
    intimationParties(item) {
      const process = Store.state.processes.find(record => record.number === item.process);
      const direct = String(item.client || '').trim();
      if (direct && !/^(?:cliente|partes?) (?:não|nao) identificad/i.test(direct)) return direct;
      return [process?.client, process?.opposingParty].map(value => String(value || '').trim()).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' × ');
    },
    renderInbox() {
      const items = this.filteredIntimations();

      const dateBtn = document.querySelector('button[data-inbox-sort-col="date"]');
      const deadlineBtn = document.querySelector('button[data-inbox-sort-col="deadline"]');
      const dateIcon = document.getElementById('inboxSortIconDate');
      const deadlineIcon = document.getElementById('inboxSortIconDeadline');

      if (dateBtn && dateIcon) {
        dateBtn.classList.toggle('active', this.inboxSort === 'date-desc' || this.inboxSort === 'date-asc');
        dateIcon.textContent = this.inboxSort === 'date-asc' ? '▲' : this.inboxSort === 'date-desc' ? '▼' : '↕';
      }
      if (deadlineBtn && deadlineIcon) {
        deadlineBtn.classList.toggle('active', this.inboxSort === 'deadline-asc' || this.inboxSort === 'deadline-desc');
        deadlineIcon.textContent = this.inboxSort === 'deadline-asc' ? '▲' : this.inboxSort === 'deadline-desc' ? '▼' : '↕';
      }

      document.getElementById('inboxList').innerHTML = items.length ? items.map(item => {
        const act = classifyIntimationAct(item.text, item.title, item.type);
        const fatalDate = item.fatalDeadline || (act.days > 0 ? addDays(item.publishedAt || isoDate(), act.days) : null);
        const dLeft = fatalDate ? daysUntil(fatalDate) : null;
        const chipClass = dLeft !== null && dLeft <= 3 ? 'danger' : dLeft !== null && dLeft <= 7 ? 'warning' : 'normal';
        const urgentBadge = (item.urgent || item.priority === 'urgente') ? '<span class="badge-urgent">URGENTE</span>' : '';
        const importantBadge = item.important ? '<span class="badge-important">IMPORTANTE</span>' : '';
        const deadlineChip = fatalDate ? `<span class="deadline-chip ${chipClass}">${act.days ? `${act.days}d · ` : ''}fatal: ${formatDate(fatalDate)}</span>` : '<small style="color:var(--muted)">Sem prazo fatal</small>';

        return `
        <button class="inbox-row ${this.selectedIntimation === item.id ? 'active' : ''} ${(item.urgent || item.priority === 'urgente') ? 'is-urgent' : ''} ${item.important ? 'is-important' : ''}" data-intimation-id="${escapeHtml(item.id)}">
          <span class="inbox-primary">
            <i class="unread-dot ${item.unread ? '' : 'read'}"></i>
            <span>
              <div style="display:flex;align-items:center;flex-wrap:wrap;">${urgentBadge}${importantBadge}<strong>${escapeHtml(item.title)}</strong></div>
              <small class="inbox-case-line"><b>${escapeHtml(item.process || 'Sem processo vinculado')}</b>${this.intimationParties(item) ? `<em>· ${escapeHtml(this.intimationParties(item))}</em>` : '<em>· Partes ainda não identificadas</em>'}</small>
            </span>
          </span>
          <span class="source-label"><span class="act-chip ${act.css}">${escapeHtml(act.label)}</span></span>
          <span class="deadline-label">${deadlineChip}</span>
          <span class="date-label">${formatDate(item.publishedAt)}</span>
          <span>${this.statusChip(item.status)}</span>
        </button>`;
      }).join('') : '<div class="empty-detail"><span>✓</span><h3>Nenhuma ocorrência</h3><p>Não há intimações neste filtro ou ordenação.</p></div>';
      document.querySelectorAll('[data-intimation-id]').forEach(button => button.addEventListener('click', () => this.selectIntimation(button.dataset.intimationId)));
      if (this.selectedIntimation) this.renderIntimationDetail();
    },
    statusChip(status) {
      const labels = { nova: 'Nova', triagem: 'Em triagem', prazo: 'Prazo conferido', tarefa: 'Tarefa criada', arquivada: 'Arquivada' };
      const classes = { nova: 'warning', triagem: 'planned', prazo: 'connected', tarefa: 'connected', arquivada: 'muted' };
      return `<span class="status-chip ${classes[status] || 'muted'}">${labels[status] || escapeHtml(status)}</span>`;
    },
    selectIntimation(id) {
      this.selectedIntimation = id;
      const item = Store.state.intimations.find(record => record.id === id);
      if (item) { item.unread = false; Store.save(); }
      this.renderInbox(); this.renderMetrics();
    },
    renderIntimationDetail() {
      const item = Store.state.intimations.find(record => record.id === this.selectedIntimation);
      const container = document.getElementById('intimationDetail');
      if (!item) return;
      const act = classifyIntimationAct(item.text, item.title, item.type);
      const fatalDate = item.fatalDeadline || addDays(item.publishedAt || isoDate(), act.days);
      const dLeft = daysUntil(fatalDate);
      const isUrgent = Boolean(item.urgent || item.priority === 'urgente');
      const isImportant = Boolean(item.important);

      container.innerHTML = `
        <div class="detail-header">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
            ${this.statusChip(item.status)}
            <span class="act-chip ${act.css}">${escapeHtml(act.label)}</span>
            ${isUrgent ? '<span class="badge-urgent">URGENTE</span>' : ''}
            ${isImportant ? '<span class="badge-important">IMPORTANTE</span>' : ''}
          </div>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.court || 'Origem judicial não informada')}</p>
        </div>
        <div class="detail-meta">
          <div><small>Processo</small><strong>${escapeHtml(item.process || 'Não identificado')}</strong></div>
          <div><small>Partes</small><strong>${escapeHtml(this.intimationParties(item) || 'Ainda não identificadas')}</strong></div>
          <div><small>Publicação</small><strong>${formatDate(item.publishedAt)}</strong></div>
          <div><small>Prazo Fatal Estimado</small><strong>${formatDate(fatalDate)} (${act.days}d · ${dLeft >= 0 ? `${dLeft}d restantes` : 'vencido'})</strong></div>
        </div>
        <p class="eyebrow">Texto original preservado</p>
        <div class="original-text">${escapeHtml(item.text || 'Sem texto original.')}</div>
        <div class="detail-actions" style="display:flex;flex-wrap:wrap;gap:8px;">
          <button class="button gold" data-detail-action="ai-analyze">✦ Analisar com IA</button>
          <button class="button ghost btn-toggle-flag ${isUrgent ? 'active-urgent' : ''}" data-detail-action="toggle-urgent">${isUrgent ? 'Remover Urgência' : 'Marcar Urgente'}</button>
          <button class="button ghost btn-toggle-flag ${isImportant ? 'active-important' : ''}" data-detail-action="toggle-important">${isImportant ? 'Remover Destaque' : 'Marcar Importante'}</button>
          <button class="button ghost" data-detail-action="edit">Editar dados</button>
          <button class="button ghost" data-detail-action="triagem">Marcar em triagem</button>
          <button class="button ghost" data-detail-action="prazo">Confirmar triagem</button>
          <button class="button ghost" data-detail-action="task">Criar tarefa (${act.days}d)</button>
        </div>`;
      container.querySelectorAll('[data-detail-action]').forEach(button => button.addEventListener('click', () => this.handleIntimationAction(item, button.dataset.detailAction)));
    },
    handleIntimationAction(item, action) {
      if (action === 'ai-analyze') {
        this.switchView('assistant');
        setTimeout(() => {
          this.sendAiMessage(`Analise a seguinte intimação judicial recebida no sistema e responda com precisão:\n\n1. O que o magistrado/tribunal determinou?\n2. Qual é o prazo processual do CPC/CPP/CLT aplicável e como é feita a contagem em dias úteis?\n3. Qual é a medida judicial ou providência que o escritório deve adotar?\n\nProcesso: ${item.process || 'Não identificado'}\nTribunal: ${item.court || 'Não informado'}\nData da Publicação: ${formatDate(item.publishedAt)}\nTexto da Intimação:\n${item.text || ''}`);
        }, 150);
        return;
      }
      if (action === 'toggle-urgent') {
        const currentlyUrgent = Boolean(item.urgent || item.priority === 'urgente');
        if (currentlyUrgent) {
          item.urgent = false;
          item.priority = 'normal';
        } else {
          item.urgent = true;
          item.priority = 'urgente';
        }
        Store.audit(item.urgent ? 'Marcada como urgente' : 'Urgência removida', item.title);
        Store.save();
        this.renderAll();
        this.renderIntimationDetail();
        this.toast(item.urgent ? 'Intimação marcada como URGENTE!' : 'Urgência removida com sucesso.', 'success');
        return;
      }
      if (action === 'toggle-important') {
        item.important = !item.important;
        Store.audit(item.important ? 'Marcada como importante' : 'Destaque removido', item.title);
        Store.save();
        this.renderAll();
        this.renderIntimationDetail();
        this.toast(item.important ? 'Intimação marcada como IMPORTANTE!' : 'Destaque removido.', 'success');
        return;
      }
      if (action === 'edit') { this.openIntimationModal(item); return; }
      if (action === 'task') {
        const act = classifyIntimationAct(item.text, item.title, item.type);
        const suggestedDeadline = addDays(item.publishedAt || isoDate(), act.days);
        this.openTaskModal({
          title: `Analisar ${act.category}: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: suggestedDeadline,
          priority: (item.urgent || act.priority === 'urgente') ? 'urgente' : 'normal',
          status: 'triagem'
        });
        return;
      }
      item.status = action;
      Store.audit(action === 'prazo' ? 'Triagem confirmada' : 'Intimação colocada em triagem', `${item.title} · ${item.process || 'sem processo'}`);
      Store.save();
      this.renderAll();
      if (this.selectedIntimation === item.id && this.inboxFilter === 'pendentes' && action === 'prazo') {
        const remaining = this.filteredIntimations();
        this.selectedIntimation = remaining[0]?.id || null;
      }
      this.renderIntimationDetail();
      this.toast(action === 'prazo' ? 'Triagem confirmada! Intimação movida para Conferidas.' : 'Intimação em triagem.', 'success');
    },
    renderKanban() {
      const board = document.getElementById('kanbanBoard');
      board.innerHTML = KANBAN_COLUMNS.map(column => {
        const tasks = Store.state.tasks.filter(task => task.status === column.id);
        return `<section class="kanban-column" data-column="${column.id}"><header class="column-header"><div class="column-title"><i class="column-dot" style="background:${column.color}"></i>${escapeHtml(column.title)}<span class="column-count">${tasks.length}</span></div><span>···</span></header><div class="column-cards">${tasks.length ? tasks.map(task => this.taskCard(task)).join('') : '<div class="empty-column">Arraste tarefas para cá</div>'}</div></section>`;
      }).join('');
      board.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dragstart', () => { card.classList.add('dragging'); card.dataset.dragging = 'true'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); delete card.dataset.dragging; });
        card.addEventListener('click', event => {
          if (event.target.closest('.timesheet-btn')) return;
          const task = Store.state.tasks.find(item => item.id === card.dataset.taskId);
          if (task) this.openTaskModal(task);
        });
      });
      board.querySelectorAll('[data-timesheet-start]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.startTimeSheet(btn.dataset.timesheetStart);
        });
      });
      board.querySelectorAll('[data-timesheet-stop]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.stopTimeSheet();
        });
      });
      board.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('drag-over'); });
        column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
        column.addEventListener('drop', event => {
          event.preventDefault(); column.classList.remove('drag-over');
          const dragged = board.querySelector('.task-card[data-dragging="true"]');
          if (dragged) this.moveTask(dragged.dataset.taskId, column.dataset.column);
        });
      });
    },
    taskCard(task) {
      const overdue = daysUntil(task.deadline) < 0 && task.status !== 'concluida';
      const timeMins = totalTimeMinutes(task.timeLogs);
      const timeBadge = timeMins > 0 ? `<span class="task-timelog" title="Tempo total registrado no TimeSheet">⏱ ${formatMinutes(timeMins)}</span>` : '';
      const isTimerRunning = this.activeTimeSheetTaskId === task.id;
      const timerBtn = isTimerRunning
        ? `<button type="button" class="timesheet-btn active timesheet-live" data-timesheet-stop="${escapeHtml(task.id)}" title="Clique para pausar e salvar apontamento no TimeSheet">⏹ ${this.formatElapsedTimer()}</button>`
        : `<button type="button" class="timesheet-btn" data-timesheet-start="${escapeHtml(task.id)}" title="Iniciar cronômetro de TimeSheet">▶ Iniciar</button>`;

      const points = Number(task.points) || (task.priority === 'urgente' ? 25 : 10);
      return `<article class="task-card ${isTimerRunning ? 'timer-active' : ''}" draggable="true" data-task-id="${escapeHtml(task.id)}">
        <div class="task-top">
          <span class="task-source">${escapeHtml(task.source || 'INTERNA')}</span>
          <span class="task-badges">
            <b class="task-points" title="Pontuação TaskScore ADVBOX">✦ ${points} pts</b>
            ${timeBadge}
            ${task.priority === 'urgente' ? '<span class="task-priority" title="Urgente">!</span>' : ''}
          </span>
        </div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.description || 'Sem descrição')}</p>
        <div class="task-tags">
          ${task.client ? `<span>${escapeHtml(task.client)}</span>` : ''}
          ${task.process ? `<span>${escapeHtml(task.process)}</span>` : ''}
        </div>
        ${task.fatalDeadline ? `<div class="fatal-date">Prazo fatal: ${formatDate(task.fatalDeadline)}</div>` : ''}
        <footer class="task-footer">
          <div class="task-footer-left">
            <span class="task-date ${overdue ? 'overdue' : ''}">${overdue ? 'Atrasada · ' : ''}${formatDate(task.deadline)}</span>
            ${timerBtn}
          </div>
          <span class="task-avatar">${escapeHtml(this.initials(task.responsible || 'Ricardo'))}</span>
        </footer>
      </article>`;
    },
    startTimeSheet(taskId) {
      if (this.activeTimeSheetTaskId === taskId) return;
      this.stopTimeSheet();
      this.activeTimeSheetTaskId = taskId;
      this.timeSheetStartedAt = Date.now();
      clearInterval(this.timeSheetInterval);
      this.timeSheetInterval = setInterval(() => {
        const liveBtn = document.querySelector(`.timesheet-live[data-timesheet-stop="${this.activeTimeSheetTaskId}"]`);
        if (liveBtn) liveBtn.textContent = `⏹ ${this.formatElapsedTimer()}`;
      }, 1000);
      this.renderKanban();
      this.toast('Cronômetro TimeSheet iniciado na tarefa!', 'success');
    },
    stopTimeSheet() {
      if (!this.activeTimeSheetTaskId) return;
      const elapsedMs = Date.now() - this.timeSheetStartedAt;
      const minutes = Math.max(1, Math.round(elapsedMs / 60000));
      const task = Store.state.tasks.find(t => t.id === this.activeTimeSheetTaskId);
      if (task) {
        if (!Array.isArray(task.timeLogs)) task.timeLogs = [];
        task.timeLogs.push({
          id: uid('tlog'),
          minutes,
          date: isoDate(),
          author: window.KellerAuth?.currentUser?.displayName || 'Advogado',
          description: 'Apontamento via Cronômetro TimeSheet'
        });
        task.timeSpentMinutes = (task.timeSpentMinutes || 0) + minutes;
        Store.audit('TimeSheet registrado', `${task.title}: +${minutes} min`);
        Store.save();
      }
      clearInterval(this.timeSheetInterval);
      this.activeTimeSheetTaskId = null;
      this.timeSheetStartedAt = null;
      this.timeSheetInterval = null;
      this.renderKanban();
      this.toast(`TimeSheet: ${minutes} min adicionados à tarefa.`, 'success');
    },
    formatElapsedTimer() {
      if (!this.timeSheetStartedAt) return '00:00:00';
      const sec = Math.floor((Date.now() - this.timeSheetStartedAt) / 1000);
      const h = String(Math.floor(sec / 3600)).padStart(2, '0');
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      return `${h}:${m}:${s}`;
    },
    moveTask(taskId, status) {
      const task = Store.state.tasks.find(item => item.id === taskId); if (!task || task.status === status) return;
      const previous = task.status; task.status = status; task.updatedAt = new Date().toISOString();
      Store.audit('Tarefa movimentada', `${task.title}: ${previous} → ${status}`);
      this.renderAll(); this.toast('Tarefa movimentada com sucesso.', 'success');
    },
    renderProcesses(query = '') {
      const needle = normalizeText(query);
      let records = Store.state.processes.filter(item => !needle || normalizeText(`${item.number} ${item.client} ${item.court} ${item.county || ''} ${item.nb || ''} ${item.opposingParty || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle));
      records = sortRecords(records, this.processSort);
      updateTableSortHeaders('processTable', this.processSort);
      document.getElementById('processTableBody').innerHTML = records.length ? records.map(item => {
        const regDate = item.registeredAt || item.createdAt;
        let feeBadge = '';
        if (item.feeAmount && Number(item.feeAmount) > 0) {
          feeBadge = `<span class="fee-chip fixo">Valor: R$ ${Number(item.feeAmount).toLocaleString('pt-BR')}</span>`;
        } else if (item.feePercentage && Number(item.feePercentage) > 0) {
          const feeStatusClass = item.feeStatus === 'quitado' || item.feeStatus === 'em_dia' ? 'fee-status-paid' : item.feeStatus === 'pendente' ? 'fee-status-pending' : 'fee-status-waiting';
          feeBadge = `<span class="fee-chip ${escapeHtml(item.feeType || 'exito')}">${escapeHtml(item.feePercentage)}% êxito<span class="fee-status-badge ${feeStatusClass}">${escapeHtml(item.feeStatus || 'regular')}</span></span>`;
        } else if (item.feeType && item.feeType !== 'exito' && item.feeType !== 'none') {
          const feeStatusClass = item.feeStatus === 'quitado' || item.feeStatus === 'em_dia' ? 'fee-status-paid' : item.feeStatus === 'pendente' ? 'fee-status-pending' : 'fee-status-waiting';
          feeBadge = `<span class="fee-chip ${escapeHtml(item.feeType)}">${escapeHtml(item.feeType.toUpperCase())}<span class="fee-status-badge ${feeStatusClass}">${escapeHtml(item.feeStatus || 'regular')}</span></span>`;
        }

        const nbChip = item.nb ? `<span class="nb-chip" title="Número do Benefício INSS">NB ${escapeHtml(item.nb)}</span>` : '';
        const riskClass = item.risk === 'remoto' ? 'remoto' : item.risk === 'possivel' ? 'possivel' : 'provavel';
        const riskLabel = item.risk === 'remoto' ? 'Risco Alto' : item.risk === 'possivel' ? 'Risco Médio' : 'Êxito Provável';
        const riskChip = `<span class="risk-chip ${riskClass}" title="Probabilidade de Êxito Legal One">${riskLabel}</span>`;
        const isTjrs = String(item.number || '').includes('.8.21.') || String(item.court || '').toUpperCase().includes('TJRS');
        const tjrsBtn = isTjrs ? `<button type="button" class="btn-tjrs-consult" data-tjrs-consult="${escapeHtml(item.number)}" title="Consultar andamentos no microserviço oficial do TJRS">⚖ Consultar TJRS</button>` : '';

        const clientPos = item.clientPosition ? `<small style="color:var(--gold-soft);">${escapeHtml(item.clientPosition)}</small> ` : '';
        const opposingInfo = item.opposingParty ? `<small> vs ${escapeHtml(item.opposingParty)}</small>` : '';

        return `
        <tr data-process-id="${escapeHtml(item.id)}" tabindex="0">
          <td>
            <strong>${escapeHtml(item.number || item.protocol || 'Sem número')}</strong>
            <small>${item.secrecy ? 'Segredo de justiça' : 'Consulta pública'}${item.caseFolder ? ` · ${escapeHtml(item.caseFolder)}` : ''}</small>
            ${nbChip}
          </td>
          <td>
            ${clientPos}<strong>${escapeHtml(item.client)}</strong>${opposingInfo}
            ${feeBadge ? `<br>${feeBadge}` : ''}
          </td>
          <td>
            <strong>${escapeHtml(item.court || item.county || '—')}</strong>
            <small>${escapeHtml([item.actionType, item.judicialPhase || item.stage].filter(Boolean).join(' · '))}</small>
            <div>${riskChip}</div>
          </td>
          <td>
            <strong>${formatDate(regDate)}</strong>
            <small>${escapeHtml(item.source || 'eproc / Cadastro')}</small>
            ${tjrsBtn}
          </td>
          <td><strong>${escapeHtml(item.lastMovement || 'Sem movimentação')}</strong><small>${formatDate(item.lastMovementAt)}</small></td>
          <td>${item.monitoring === 'active' ? '<span class="status-chip connected">Monitorando</span>' : '<span class="status-chip warning">Atenção</span>'}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6">Nenhum processo encontrado.</td></tr>';

      document.querySelectorAll('#processTableBody [data-process-id]').forEach(row => row.addEventListener('click', event => {
        if (event.target.closest('.btn-tjrs-consult')) return;
        const item = Store.state.processes.find(record => record.id === row.dataset.processId);
        if (item) this.openProcessModal(item);
      }));

      document.querySelectorAll('#processTableBody [data-tjrs-consult]').forEach(btn => {
        btn.addEventListener('click', async event => {
          event.stopPropagation();
          const procNum = btn.dataset.tjrsConsult;
          const proc = Store.state.processes.find(p => p.number === procNum);
          this.toast(`Abrindo consulta oficial do processo ${procNum}…`);
          btn.disabled = true;
          try {
            const resp = await window.KellerAuth.secureFetch('/api/tjrs/consult', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ processNumber: procNum, courtUnit: proc?.courtUnit })
            });
            const result = await resp.json();
            if (result.ok && (result.directUrl || result.buscaUrl)) {
              window.open(result.directUrl || result.buscaUrl, '_blank', 'noopener,noreferrer');
              this.toast(result.message || 'Consulta aberta no tribunal.', 'success');
            } else {
              this.toast(result.message || 'Não foi possível obter o link do tribunal.', 'error');
            }
          } catch (err) {
            this.toast(`Falha na consulta ao tribunal: ${err.message}`, 'error');
          } finally {
            btn.disabled = false;
          }
        });
      });
    },
    renderContacts(query = '') {
      const needle = normalizeText(query);
      let records = Store.state.contacts.filter(item => !needle || normalizeText(`${item.name} ${item.document} ${item.mobile} ${item.phone} ${item.email} ${item.origin} ${item.contactRole || ''} ${item.leadOrigin || ''} ${item.city || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle));
      records = sortRecords(records, this.contactSort);
      updateTableSortHeaders('contactTable', this.contactSort);
      document.getElementById('contactCount').textContent = `${Store.state.contacts.length} contatos`;
      const roleMap = { cliente: 'Cliente', testemunha: 'Testemunha', perito: 'Perito Judicial', adverso: 'Adv. Adverso', correspondente: 'Correspondente', preposto: 'Preposto', outro: 'Outro' };
      document.getElementById('contactTableBody').innerHTML = records.length ? records.map(item => {
        const regDate = item.registeredAt || item.createdAt;
        const roleLabel = roleMap[item.contactRole] || (item.contactRole ? escapeHtml(item.contactRole) : 'Cliente');
        const roleBadge = `<span class="fee-chip fixo" style="font-size:0.72rem;padding:2px 6px;margin-right:4px;">${roleLabel}</span>`;
        const originLabel = item.leadOrigin ? escapeHtml(item.leadOrigin) : escapeHtml(item.origin || 'Direta');
        return `
        <tr data-contact-id="${escapeHtml(item.id)}" tabindex="0">
          <td>
            ${roleBadge}<strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.profession || 'Pessoa cadastrada')}</small>
          </td>
          <td><strong>${escapeHtml(item.document || '—')}</strong><small>${escapeHtml(item.rg || '')}</small></td>
          <td><strong>${escapeHtml(item.mobile || item.phone || '—')}</strong><small>${escapeHtml(item.email || '')}</small></td>
          <td><strong>${escapeHtml(item.city || '—')}</strong><small>${escapeHtml([item.state, item.country].filter(Boolean).join(' · '))}</small></td>
          <td><strong>${formatDate(regDate)}</strong><small>${item.externalId ? `ID ${escapeHtml(item.externalId)}` : 'Manual'}</small></td>
          <td>${originLabel}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6">Nenhum contato encontrado.</td></tr>';
      document.querySelectorAll('#contactTableBody [data-contact-id]').forEach(row => row.addEventListener('click', () => {
        const item = Store.state.contacts.find(record => record.id === row.dataset.contactId); if (item) this.openContactModal(item);
      }));
    },
    renderConfiguration(query = '') {
      const config = Store.state.configuration || {};
      const sections = [
        ['taskDefinitions', 'Tarefas'], ['users', 'Usuários'], ['actionGroups', 'Grupos'], ['actionTypes', 'Tipos de ação'], ['stages', 'Etapas'], ['origins', 'Origens'], ['goals', 'Metas'], ['inboxSections', 'Caixa de entrada'], ['notificationAssignments', 'Notificações'], ['integrations', 'Integrações']
      ];
      document.getElementById('configurationTabs').innerHTML = sections.map(([key, label]) => `<button class="${this.configurationSection === key ? 'active' : ''}" data-config-section="${key}">${label}</button>`).join('');
      document.getElementById('configurationMetrics').innerHTML = [
        ['Definições de tarefa', config.taskDefinitions?.length || 0], ['Tipos de ação', config.actionTypes?.length || 0], ['Etapas', config.stages?.length || 0], ['Usuários', config.users?.length || 0], ['Contatos importados', Store.state.contacts.length]
      ].map(([label, count]) => `<div class="configuration-metric"><strong>${count}</strong><span>${label}</span></div>`).join('');
      const label = sections.find(([key]) => key === this.configurationSection)?.[1] || 'Configuração';
      const raw = Array.isArray(config[this.configurationSection]) ? config[this.configurationSection] : [];
      const needle = normalizeText(query); const records = raw.map((item, index) => ({ item, index })).filter(({ item }) => !needle || normalizeText(typeof item === 'string' ? item : Object.values(item || {}).flat().join(' ')).includes(needle));
      document.getElementById('configurationHeading').textContent = label;
      document.getElementById('configurationCount').textContent = `${records.length} itens`;
      document.getElementById('configurationList').innerHTML = records.length ? records.map(({ item, index }) => this.configurationRow(item, index)).join('') : '<div class="empty-detail"><span>✓</span><h3>Nenhum item</h3><p>Não há registros nesta seção ou neste filtro.</p></div>';
      document.querySelectorAll('#configurationList [data-config-index]').forEach(row => row.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-config]')) return;
        const index = Number(row.dataset.configIndex); const item = raw[index]; if (item !== undefined) this.openConfigurationModal(item, index);
      }));
    },
    configurationRow(item, index) {
      if (typeof item === 'string') {
        return `
          <div class="configuration-row" data-config-index="${index}">
            <div class="config-row-info">
              <strong>${escapeHtml(item)}</strong>
              <span>Seção da caixa de entrada</span>
              <small>Ativa · clique para editar</small>
            </div>
            <button type="button" class="btn-delete-config-row" data-delete-config="${index}" title="Excluir este item">×</button>
          </div>`;
      }
      if (!item || typeof item !== 'object') return '';
      const primary = item.name || item.event || item.group || 'Configuração';
      const secondary = item.role || item.phase || item.group || item.publicationResponsible || item.method || (item.responsibles || []).join(', ') || item.status || '—';
      const meta = Number.isFinite(item.points) ? `<span class="config-points">${item.points} pontos</span>` : item.monthlyClosings == null && 'monthlyClosings' in item ? '<small>Meta não definida</small>' : `<small>${escapeHtml(item.registeredAt || item.status || 'Ativo')}</small>`;
      return `
        <div class="configuration-row" data-config-index="${index}">
          <div class="config-row-info">
            <strong>${escapeHtml(primary)}</strong>
            <span>${escapeHtml(secondary)}</span>
            ${meta}
          </div>
          <button type="button" class="btn-delete-config-row" data-delete-config="${index}" title="Excluir este item">×</button>
        </div>`;
    },
    openIntimationDetailModal(item) {
      if (!item) return;
      const act = classifyIntimationAct(item.text, item.title, item.type);
      const suggestedDeadline = addDays(item.publishedAt || isoDate(), act.days);
      const parties = this.intimationParties(item) || 'Partes ainda não identificadas';
      this.openModal('intimationDetail', 'Detalhes da intimação', 'Análise processual DJEN / Diário', [
        { name: 'title', label: 'Título do ato publicado', value: item.title, full: true },
        { name: 'process', label: 'Número do processo CNJ', value: item.process || 'Não identificado' },
        { name: 'parties', label: 'Partes vinculadas', value: parties },
        { name: 'court', label: 'Tribunal / Unidade judiciária', value: item.court || 'Não informado' },
        { name: 'publishedAt', label: 'Data da publicação', value: formatDate(item.publishedAt) },
        { name: 'actInfo', label: 'Classificação do ato e prazo sugerido', value: `${act.category.toUpperCase()} (${act.label}) — Prazo estimado: ${act.days} dias úteis (Vencimento sugerido: ${formatDate(suggestedDeadline)})`, full: true },
        { name: 'text', label: 'Teor integral da publicação', type: 'textarea', full: true, value: item.text || 'Sem texto original.' }
      ], { ...item, suggestedDeadline, _act: act });
      const submitButton = document.querySelector('#modalForm footer .button.gold');
      if (submitButton) submitButton.textContent = `Criar tarefa no Kanban (${act.days}d)`;
    },
    renderAgenda() {
      const selected = this.agendaSelectedDate;
      const typeFilter = this.agendaTypeFilter || 'all';

      // 1. Coletar eventos da agenda
      let events = Store.state.agenda.map(e => ({
        type: 'event',
        id: e.id,
        date: e.date,
        time: e.time || 'Dia inteiro',
        title: e.title,
        subtitle: `${e.client || e.process || 'Compromisso interno'}${e.location ? ` · ${e.location}` : ''}`,
        source: e.source || 'Interna',
        raw: e
      }));

      // 2. Coletar tarefas e prazos
      let tasks = Store.state.tasks.map(t => {
        const isFatal = Boolean(t.fatalDeadline);
        const targetDate = t.fatalDeadline || t.deadline;
        const timeMins = totalTimeMinutes(t.timeLogs);
        return {
          type: 'task',
          id: t.id,
          date: targetDate,
          time: isFatal ? 'Prazo fatal' : (t.time || 'Prazo interno'),
          title: t.title,
          subtitle: `${t.process ? `${t.process} · ` : ''}${t.client || 'Tarefa interna'}${t.points ? ` · ${t.points} pts` : ''}`,
          isFatal,
          status: t.status,
          timeMins,
          source: isFatal ? 'Fatal' : 'Tarefa',
          raw: t
        };
      });

      // 3. Coletar intimações publicadas
      let intimations = Store.state.intimations.map(i => {
        const act = classifyIntimationAct(i.text, i.title, i.type);
        const targetDate = i.publishedAt || (i.createdAt ? i.createdAt.slice(0, 10) : isoDate());
        return {
          type: 'intimation',
          id: i.id,
          date: targetDate,
          time: `${act.days}d prazo`,
          title: i.title,
          subtitle: `${i.process || 'Sem processo'} · ${this.intimationParties(i) || 'Partes não vinculadas'}`,
          act,
          source: 'Intimação',
          raw: i
        };
      });

      // Filtrar por data
      let allActivities = [];
      if (selected) {
        events = events.filter(e => e.date === selected);
        tasks = tasks.filter(t => t.date === selected);
        intimations = intimations.filter(i => i.date === selected);
      } else {
        const today = isoDate();
        events = events.filter(e => !e.date || e.date >= today);
        tasks = tasks.filter(t => !t.date || t.date >= today);
        intimations = intimations.filter(i => !i.date || i.date >= today);
      }

      // Aplicar filtro de tipo
      if (typeFilter === 'event') allActivities = [...events];
      else if (typeFilter === 'task') allActivities = [...tasks];
      else if (typeFilter === 'intimation') allActivities = [...intimations];
      else allActivities = [...events, ...tasks, ...intimations];

      // Ordenar cronologicamente
      allActivities.sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));

      // Atualizar cabeçalho
      const titleEl = document.getElementById('agendaDayTitle');
      const eyebrowEl = document.getElementById('agendaDayEyebrow');
      const badgesEl = document.getElementById('agendaDayBadges');
      if (titleEl && eyebrowEl) {
        if (selected) {
          eyebrowEl.textContent = selected === isoDate() ? 'Atividades de Hoje' : 'Atividades da Data Selecionada';
          titleEl.textContent = formatDate(selected);
        } else {
          eyebrowEl.textContent = 'Agenda Integrada';
          titleEl.textContent = 'Próximas atividades e prazos';
        }
      }
      if (badgesEl) {
        badgesEl.innerHTML = `
          <span class="status-chip planned">${events.length} evento(s)</span>
          <span class="status-chip connected">${tasks.length} prazo(s)/tarefa(s)</span>
          <span class="status-chip warning">${intimations.length} intimação(ões)</span>
        `;
      }

      // Renderizar lista
      const listEl = document.getElementById('agendaList');
      if (listEl) {
        listEl.innerHTML = allActivities.length ? allActivities.map(item => {
          const date = item.date ? new Date(`${item.date}T12:00:00`) : new Date();
          const validDate = !Number.isNaN(date.getTime());
          const dayNum = validDate ? String(date.getDate()).padStart(2, '0') : '—';
          const monthShort = validDate ? new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '') : '';

          let typeClass = '';
          let chipHtml = '';
          if (item.type === 'event') {
            typeClass = '';
            chipHtml = `<span class="status-chip ${item.source === 'ADVBOX' ? 'planned' : 'muted'}">${escapeHtml(item.source)}</span>`;
          } else if (item.type === 'task') {
            typeClass = item.isFatal ? 'fatal-type' : 'task-type';
            const timeBadge = item.timeMins > 0 ? `<span class="task-timelog">⏱ ${formatMinutes(item.timeMins)}</span>` : '';
            chipHtml = `<div style="display:flex;gap:5px;align-items:center;">${timeBadge}<span class="status-chip ${item.isFatal ? 'danger' : 'connected'}">${item.isFatal ? 'Prazo Fatal' : 'Tarefa'}</span></div>`;
          } else if (item.type === 'intimation') {
            typeClass = 'intimation-type';
            chipHtml = `<span class="act-chip ${item.act.css}">${escapeHtml(item.act.label)}</span>`;
          }

          return `
            <div class="agenda-item" data-agenda-activity-type="${item.type}" data-agenda-activity-id="${escapeHtml(item.id)}" tabindex="0">
              <div class="agenda-date ${typeClass}">
                <strong>${dayNum}</strong>
                <small>${monthShort}</small>
              </div>
              <div class="agenda-copy">
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.subtitle)} · ${escapeHtml(item.time)}</small>
              </div>
              ${chipHtml}
            </div>
          `;
        }).join('') : `<div class="empty-detail"><span>□</span><h3>Nenhuma atividade</h3><p>${selected ? 'Não há eventos, tarefas ou intimações para esta data.' : 'Nenhuma atividade próxima encontrada.'}</p></div>`;

        listEl.querySelectorAll('[data-agenda-activity-type]').forEach(row => {
          row.addEventListener('click', () => {
            const type = row.dataset.agendaActivityType;
            const id = row.dataset.agendaActivityId;
            if (type === 'event') {
              const ev = Store.state.agenda.find(r => r.id === id);
              if (ev) this.openAgendaModal(ev);
            } else if (type === 'task') {
              const task = Store.state.tasks.find(r => r.id === id);
              if (task) this.openTaskModal(task);
            } else if (type === 'intimation') {
              const intimation = Store.state.intimations.find(r => r.id === id);
              if (intimation) this.openIntimationDetailModal(intimation);
            }
          });
        });
      }

      this.renderMiniCalendar();
    },
    renderMiniCalendar() {
      const offset = this.agendaCalendarMonthOffset || 0;
      const baseDate = new Date();
      baseDate.setDate(1);
      baseDate.setMonth(baseDate.getMonth() + offset);
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);

      const days = [];
      for (let index = 0; index < first.getDay(); index++) {
        days.push('<span class="calendar-day muted"></span>');
      }

      const agendaEvents = Store.state.agenda || [];
      const tasks = Store.state.tasks || [];
      const intimations = Store.state.intimations || [];

      for (let day = 1; day <= last.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = agendaEvents.some(e => e.date === dateStr);
        const hasTask = tasks.some(t => t.deadline === dateStr);
        const hasFatal = tasks.some(t => t.fatalDeadline === dateStr);
        const hasIntimation = intimations.some(i => i.publishedAt === dateStr || (i.createdAt && i.createdAt.slice(0, 10) === dateStr));

        const indicators = [];
        if (hasEvent) indicators.push('<i class="cal-dot event" title="Compromisso"></i>');
        if (hasFatal) indicators.push('<i class="cal-dot fatal" title="Prazo fatal"></i>');
        else if (hasTask) indicators.push('<i class="cal-dot task" title="Tarefa/prazo"></i>');
        if (hasIntimation) indicators.push('<i class="cal-dot intimation" title="Intimação"></i>');

        const isToday = dateStr === isoDate();
        const isSelected = dateStr === this.agendaSelectedDate;

        days.push(`
          <button class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-cal-date="${dateStr}">
            <span>${day}</span>
            <span class="cal-indicators">${indicators.join('')}</span>
          </button>
        `);
      }

      const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(baseDate);
      const calEl = document.getElementById('miniCalendar');
      if (calEl) {
        calEl.innerHTML = `
          <header class="calendar-header">
            <h3>${monthName}</h3>
            <div class="calendar-nav">
              <button id="calPrevMonth" title="Mês anterior">◀</button>
              <button id="calNextMonth" title="Próximo mês">▶</button>
            </div>
          </header>
          <div class="calendar-grid">
            ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => `<span class="calendar-weekday">${d}</span>`).join('')}
            ${days.join('')}
          </div>
        `;

        calEl.querySelector('#calPrevMonth')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.agendaCalendarMonthOffset = (this.agendaCalendarMonthOffset || 0) - 1;
          this.renderMiniCalendar();
        });
        calEl.querySelector('#calNextMonth')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.agendaCalendarMonthOffset = (this.agendaCalendarMonthOffset || 0) + 1;
          this.renderMiniCalendar();
        });
        calEl.querySelectorAll('.calendar-day[data-cal-date]').forEach(btn => {
          btn.addEventListener('click', () => {
            const clickedDate = btn.dataset.calDate;
            if (this.agendaSelectedDate === clickedDate) {
              this.agendaSelectedDate = null;
            } else {
              this.agendaSelectedDate = clickedDate;
            }
            this.renderAgenda();
          });
        });
      }
    },
    renderMonitoring() {
      const term = Store.state.terms[0] || { name: 'Dr(a). Advogado(a) Titular', registration: 'OAB/UF 000000' };
      const nameEl = document.getElementById('primaryTermName');
      const regEl = document.getElementById('primaryTermRegistration');
      const avatarEl = document.getElementById('primaryTermAvatar');
      if (nameEl) nameEl.textContent = term.name || 'Dr(a). Advogado(a) Titular';
      if (regEl) regEl.textContent = `${term.registration || 'OAB/UF 000000'} · Advogado(a) monitorado(a) principal`;
      if (avatarEl) avatarEl.textContent = this.initials(term.name || 'AD');

      const issues = Store.state.sources.filter(source => ['attention', 'error'].includes(source.status)).length;
      document.getElementById('termSourceCount').textContent = Store.state.sources.length;
      document.getElementById('termIssueCount').textContent = issues;
      document.getElementById('termNewCount').textContent = Store.state.intimations.filter(item => item.status === 'nova').length;
      document.getElementById('monitorSourceList').innerHTML = Store.state.sources.map(source => `
        <div class="source-row" data-source-id="${escapeHtml(source.id)}" tabindex="0"><div class="source-name"><span class="source-mark">${escapeHtml(source.short)}</span><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div></div><span class="source-method">${escapeHtml(source.method)}</span><span class="source-check">${source.lastCheck ? formatDateTime(source.lastCheck) : 'Ainda não verificada'}</span><span>${source.status === 'ok' ? '<span class="status-chip connected">Ativo</span>' : source.status === 'attention' ? '<span class="status-chip warning">Atenção</span>' : source.status === 'error' ? '<span class="status-chip danger">Falha</span>' : source.status === 'planned' ? '<span class="status-chip planned">Preparado</span>' : '<span class="status-chip muted">Desativado</span>'}</span><span class="row-menu" aria-hidden="true">···</span></div>`).join('');
      document.querySelectorAll('#monitorSourceList [data-source-id]').forEach(row => row.addEventListener('click', () => {
        const source = Store.state.sources.find(item => item.id === row.dataset.sourceId); if (source) this.openSourceModal(source);
      }));
    },
    renderAudit() {
      const list = document.getElementById('auditList');
      if (!list) return;
      list.innerHTML = Store.state.audit.map(item => `<div class="audit-item"><time>${formatDateTime(item.at)}</time><div><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.detail)}</small></div><small>${escapeHtml(item.actor)}</small></div>`).join('');
    },
    initials(value) { return String(value).trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase(); },
    globalSearch(query) {
      if (!query.trim()) return;
      const needle = normalizeText(query);
      const processMatch = Store.state.processes.some(item => normalizeText(`${item.number} ${item.client}`).includes(needle));
      const contactMatch = Store.state.contacts.some(item => normalizeText(`${item.name} ${item.document} ${item.email}`).includes(needle));
      const taskMatch = Store.state.tasks.some(item => normalizeText(`${item.title} ${item.client} ${item.process}`).includes(needle));
      const intimationMatch = Store.state.intimations.some(item => normalizeText(`${item.title} ${item.client} ${item.process}`).includes(needle));
      if (processMatch) { this.switchView('processes'); document.getElementById('processSearch').value = query; this.renderProcesses(query); }
      else if (contactMatch) { this.switchView('contacts'); document.getElementById('contactSearch').value = query; this.renderContacts(query); }
      else if (intimationMatch) this.switchView('inbox');
      else if (taskMatch) this.switchView('kanban');
    },
    openModal(mode, title, eyebrow, fields, defaults = {}, topHtml = '') {
      this.modalMode = { mode, defaults };
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalEyebrow').textContent = eyebrow;
      document.getElementById('modalFields').innerHTML = `${topHtml}<div class="form-grid">${fields.map(field => {
        const value = defaults[field.name] ?? field.value ?? '';
        if (field.type === 'textarea') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><textarea id="field-${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
        if (field.type === 'select') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><select id="field-${field.name}" name="${field.name}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
        return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><input id="field-${field.name}" name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
      }).join('')}</div>`;
      document.querySelector('#modalForm footer .button.gold').textContent = /^(Editar|Detalhes)/.test(title) ? 'Salvar alterações' : 'Salvar';
      document.getElementById('modalBackdrop').classList.remove('hidden');
      setTimeout(() => document.querySelector('#modalFields input, #modalFields textarea')?.focus(), 20);
    },
    closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); this.modalMode = null; document.getElementById('modalForm').reset(); },
    openTaskModal(defaults = {}) {
      const definitions = Store.state.configuration?.taskDefinitions || [];
      const totalTime = totalTimeMinutes(defaults.timeLogs);
      const timeNote = totalTime > 0 ? `Tempo total acumulado nesta tarefa: ${formatMinutes(totalTime)}.` : '';
      const cleanDescription = decodeHtmlEntities(defaults.description || defaults.text || '');
      const cleanTitle = decodeHtmlEntities(defaults.title || '');

      let intimationCardHtml = '';
      if (cleanDescription) {
        intimationCardHtml = `
        <div class="task-intimation-card">
          <div class="task-intimation-header">
            <div class="task-intimation-title">
              <svg class="nav-svg" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Publicação / Texto da Intimação</span>
            </div>
            <div class="task-intimation-actions">
              <button type="button" class="task-btn-action" id="btnCopyTaskIntimation">Copiar texto</button>
              <button type="button" class="task-btn-action" id="btnAiAnalyzeTask">✦ Analisar com IA</button>
            </div>
          </div>
          <div class="task-intimation-body" id="taskIntimationBody">${escapeHtml(cleanDescription)}</div>
        </div>`;
      }

      this.openModal('task', defaults.id ? 'Editar tarefa' : 'Nova tarefa', 'Fluxo interno', [
        { name: 'title', label: 'Título da tarefa', required: true, full: true, placeholder: 'Ex: Manifestação sobre despacho do DJEN' },
        { name: 'taskDefinition', label: 'Definição de modelo', type: 'select', options: [{ value: '', label: 'Selecione um modelo de tarefa' }, ...definitions.map(item => ({ value: item.name, label: `${item.name} (${item.points} pts)` }))] },
        { name: 'process', label: 'Número do processo', placeholder: 'Ex: 5002086-73.2022.4.04.7133' },
        { name: 'client', label: 'Cliente', placeholder: 'Ex: Roberto Roque Junges' },
        { name: 'fatalDeadline', label: 'Prazo fatal', type: 'date', note: 'Prazo peremptório (sujeito à conferência humana).' },
        { name: 'deadline', label: 'Prazo interno', type: 'date' },
        { name: 'date', label: 'Data da atividade', type: 'date' },
        { name: 'time', label: 'Horário', type: 'time' },
        { name: 'responsible', label: 'Responsável principal', value: defaults.responsible || 'Ricardo' },
        { name: 'responsibles', label: 'Outros responsáveis', placeholder: 'Separe os nomes por vírgula' },
        { name: 'status', label: 'Coluna (Quadro Kanban)', type: 'select', options: KANBAN_COLUMNS.map(column => ({ value: column.id, label: column.title })) },
        { name: 'priority', label: 'Prioridade', type: 'select', options: [{value:'normal',label:'Normal'},{value:'importante',label:'Importante'},{value:'urgente',label:'Urgente'}] },
        { name: 'points', label: 'Pontuação', type: 'number', value: defaults.points || 0 },
        { name: 'addMinutes', label: 'Apontar tempo (minutos)', type: 'number', placeholder: 'Ex: 45', note: timeNote },
        { name: 'timeDescription', label: 'Atividade no apontamento', placeholder: 'Ex: Elaboração de minuta recursal' },
        { name: 'description', label: 'Comentário interno / orientações', type: 'textarea', full: true, note: 'Nunca registre senha, QR code ou segredo do certificado neste campo.' },
        { name: 'actionType', label: 'Tipo de ação' },
        { name: 'protocol', label: 'Protocolo / Local' }
      ], {
        status: 'triagem',
        priority: 'normal',
        source: 'Interna',
        ...defaults,
        title: cleanTitle,
        description: cleanDescription,
        taskDefinition: defaults.taskDefinition || (definitions.some(item => item.name === cleanTitle) ? cleanTitle : ''),
        responsibles: Array.isArray(defaults.responsibles) ? defaults.responsibles.join(', ') : (defaults.responsibles || '')
      }, intimationCardHtml);

      const selector = document.getElementById('field-taskDefinition');
      selector?.addEventListener('change', () => {
        const definition = definitions.find(item => item.name === selector.value); if (!definition) return;
        if (document.getElementById('field-title')) document.getElementById('field-title').value = definition.name;
        if (document.getElementById('field-points')) document.getElementById('field-points').value = definition.points;
      });

      document.getElementById('btnCopyTaskIntimation')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(cleanDescription);
          this.toast('Texto da intimação copiado com sucesso!', 'success');
        } catch {
          this.toast('Não foi possível copiar o texto.', 'error');
        }
      });

      document.getElementById('btnAiAnalyzeTask')?.addEventListener('click', () => {
        this.closeModal();
        this.switchView('assistant');
        const aiInput = document.getElementById('aiChatInput');
        if (aiInput) {
          aiInput.value = `Por favor, analise a seguinte intimação judicial, calcule os prazos em dias úteis (CPC/2015) e sugira as providências jurídicas cabíveis:\n\n${cleanDescription}`;
          aiInput.focus();
        }
      });
    },
    openIntimationModal(defaults = {}) {
      this.openModal('intimation', defaults.id ? 'Editar intimação' : 'Nova intimação', 'Registro judicial', [
        { name: 'title', label: 'Título / ato', required: true, full: true }, { name: 'process', label: 'Número do processo' }, { name: 'client', label: 'Cliente' },
        { name: 'court', label: 'Tribunal / órgão' }, { name: 'publishedAt', label: 'Data da publicação', type: 'date' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Manual',label:'Manual'},{value:'ADVBOX',label:'ADVBOX'},{value:'Legal One',label:'Legal One'},{value:'DJEN',label:'DJEN'}] },
        { name: 'text', label: 'Texto original', type: 'textarea', full: true, required: true }
      ], { publishedAt: isoDate(), source: 'Manual', ...defaults });
    },
    openProcessModal(defaults = {}) {
      const actionTypes = (Store.state.configuration?.actionTypes || []).map(a => ({ value: a.name, label: a.name }));
      const actionGroups = (Store.state.configuration?.actionGroups || []).map(g => ({ value: g.name, label: g.name }));

      this.openModal('process', defaults.id ? 'Detalhes do processo' : 'Cadastrar processo', 'Carteira processual', [
        { name: 'number', label: 'Número CNJ', full: true, placeholder: '0000000-00.0000.8.21.0000' },
        { name: 'oldNumber', label: 'Número antigo / físico', placeholder: 'Ex: 029/1.12.0001234-5' },
        { name: 'nb', label: 'NB — Número do Benefício (INSS)', placeholder: 'Ex: 123.456.789-0' },
        { name: 'client', label: 'Cliente principal', required: true },
        { name: 'clientPosition', label: 'Posição do cliente', type: 'select', options: [{value:'Autor(a)',label:'Autor(a)'},{value:'Réu / Ré',label:'Réu / Ré'},{value:'Exequente',label:'Exequente'},{value:'Executado(a)',label:'Executado(a)'},{value:'Reclamante',label:'Reclamante (Trabalhista)'},{value:'Reclamada',label:'Reclamada (Trabalhista)'},{value:'Terceiro Interessado',label:'Terceiro Interessado'},{value:'Litisconsorte',label:'Litisconsorte'}] },
        { name: 'opposingParty', label: 'Parte contrária principal', placeholder: 'Nome da parte adversa' },
        { name: 'actionGroup', label: 'Grupo de ação', type: actionGroups.length ? 'select' : 'text', options: [{value:'',label:'Selecione o grupo'}, ...actionGroups] },
        { name: 'actionType', label: 'Tipo de ação / Matéria', type: actionTypes.length ? 'select' : 'text', options: [{value:'',label:'Selecione o tipo de ação'}, ...actionTypes] },
        { name: 'judicialPhase', label: 'Fase processual', type: 'select', options: [{value:'Conhecimento',label:'Conhecimento'},{value:'Recursal',label:'Recursal'},{value:'Execução / Cumprimento',label:'Execução / Cumprimento'},{value:'Acordo',label:'Acordo'},{value:'Administrativo',label:'Administrativo'},{value:'Arquivado',label:'Arquivado'}] },
        { name: 'risk', label: 'Risco / Probabilidade de êxito', type: 'select', options: [{value:'provavel',label:'Provável (Alto êxito)'},{value:'possivel',label:'Possível (Médio risco)'},{value:'remoto',label:'Remoto (Alto risco)'}] },
        { name: 'stage', label: 'Etapa do fluxo' },
        { name: 'protocol', label: 'Protocolo / Local' },
        { name: 'caseFolder', label: 'Pasta física / Caso' },
        { name: 'court', label: 'Tribunal / Órgão', placeholder: 'Ex: TJRS, TRF4, TST' },
        { name: 'county', label: 'Comarca / Seção Judiciária', placeholder: 'Ex: Ijuí, Porto Alegre' },
        { name: 'courtUnit', label: 'Vara / Unidade Judiciária', placeholder: 'Ex: 1ª Vara Cível, 2ª Vara Federal' },
        { name: 'responsible', label: 'Responsável principal' },
        { name: 'registeredAt', label: 'Data de distribuição / cadastro', type: 'date' },
        { name: 'lastMovementAt', label: 'Data do último andamento', type: 'date' },
        { name: 'lastMovement', label: 'Último andamento', type: 'textarea', full: true },
        { name: 'feeType', label: 'Tipo de honorários', type: 'select', options: [{value:'',label:'Não definido'},{value:'exito',label:'Êxito (Quota Litis %)'},{value:'fixo',label:'Fixo (Pró-labore)'},{value:'misto',label:'Misto (Fixo + Êxito)'},{value:'mensal',label:'Mensalidade (Partido)'},{value:'horas',label:'Cobrança por Hora'}] },
        { name: 'feePercentage', label: 'Percentual de êxito (%)', type: 'number', placeholder: 'Ex: 30' },
        { name: 'feeAmount', label: 'Valor fixo / causa (R$)', type: 'number', placeholder: 'Ex: 5000' },
        { name: 'feeMonthly', label: 'Valor mensal (R$)', type: 'number', placeholder: 'Ex: 1500' },
        { name: 'feeStatus', label: 'Situação dos honorários', type: 'select', options: [{value:'em_dia',label:'Em dia / Regular'},{value:'aguardando_exito',label:'Aguardando êxito processual'},{value:'pendente',label:'Pendente / Cobrança'},{value:'quitado',label:'Quitado'}] },
        { name: 'requisitionType', label: 'Requisição judicial (RPV / Alvará)', type: 'select', options: [{value:'',label:'Nenhuma requisição ativa'},{value:'rpv_federal',label:'RPV Federal (TRF4)'},{value:'precatorio_federal',label:'Precatório Federal (TRF4)'},{value:'alvara_estadual',label:'Alvará Judicial Estadual (TJRS)'},{value:'alvara_trabalhista',label:'Alvará Trabalhista (TRT4)'}] },
        { name: 'requisitionAmount', label: 'Valor bruto requisitado (R$)', type: 'number', placeholder: 'Ex: 45000' },
        { name: 'requisitionBank', label: 'Banco depositário', type: 'select', options: [{value:'',label:'Não definido'},{value:'bb',label:'Banco do Brasil'},{value:'cef',label:'Caixa Econômica Federal'},{value:'banrisul',label:'Banrisul'},{value:'outro',label:'Outro banco'}] },
        { name: 'requisitionStatus', label: 'Status da requisição', type: 'select', options: [{value:'requisitado',label:'Requisitado / Expedido'},{value:'aguardando_deposito',label:'Aguardando Depósito Bancário'},{value:'disponivel_saque',label:'Disponível para Saque / Levantamento'},{value:'repassado',label:'Pago e Repassado ao Cliente'}] },
        { name: 'feeNotes', label: 'Condições de pagamento e faturamento', type: 'textarea', full: true },
        { name: 'secrecy', label: 'Visibilidade', type: 'select', options: [{value:'false',label:'Consulta pública'},{value:'true',label:'Segredo de justiça'}] },
        { name: 'monitoring', label: 'Monitoramento', type: 'select', options: [{value:'active',label:'Monitorando'},{value:'attention',label:'Precisa de atenção'}] },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], {
        secrecy: false,
        monitoring: 'active',
        feeStatus: 'em_dia',
        clientPosition: 'Autor(a)',
        judicialPhase: 'Conhecimento',
        risk: 'provavel',
        registeredAt: defaults.registeredAt || (defaults.createdAt ? defaults.createdAt.slice(0, 10) : isoDate()),
        ...defaults,
        secrecy: String(Boolean(defaults.secrecy))
      });
    },
    openContactModal(defaults = {}) {
      this.openModal('contact', defaults.id ? 'Detalhes do contato' : 'Novo contato', 'Cadastro de pessoas', [
        { name: 'name', label: 'Nome completo / razão social', required: true, full: true },
        { name: 'contactRole', label: 'Papel do contato', type: 'select', options: [{value:'cliente',label:'Cliente / Outorgante'},{value:'testemunha',label:'Testemunha'},{value:'perito',label:'Perito Judicial / Assistente'},{value:'adverso',label:'Advogado Adverso / Parte Contrária'},{value:'correspondente',label:'Correspondente Jurídico'},{value:'preposto',label:'Preposto / Representante'},{value:'outro',label:'Outro Contato'}] },
        { name: 'leadOrigin', label: 'Origem do contato / captação', type: 'select', options: [{value:'indicacao',label:'Indicação de Cliente'},{value:'parceria',label:'Parceria Profissional'},{value:'balcao',label:'Balcão / Atendimento Direto'},{value:'redes_sociais',label:'Redes Sociais / WhatsApp'},{value:'google_site',label:'Google / Site do Escritório'},{value:'convenio',label:'Convênio / Entidade Sindical'},{value:'outro',label:'Outra Origem'}] },
        { name: 'document', label: 'CPF / CNPJ' }, { name: 'rg', label: 'RG' },
        { name: 'birthDate', label: 'Data de nascimento', type: 'date' }, { name: 'profession', label: 'Profissão' }, { name: 'maritalStatus', label: 'Estado civil' },
        { name: 'mobile', label: 'Celular' }, { name: 'phone', label: 'Telefone' }, { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'origin', label: 'Origem (texto livre)' }, { name: 'city', label: 'Cidade' }, { name: 'state', label: 'Estado' },
        { name: 'address', label: 'Endereço', full: true }, { name: 'district', label: 'Bairro' }, { name: 'zip', label: 'CEP' },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], { source: 'Interna', contactRole: 'cliente', leadOrigin: 'indicacao', ...defaults });
    },
    openAgendaModal(defaults = {}) {
      this.openModal('agenda', defaults.id ? 'Detalhes do compromisso' : 'Novo compromisso', 'Agenda jurídica', [
        { name: 'title', label: 'Compromisso', required: true, full: true }, { name: 'date', label: 'Data', type: 'date', required: true }, { name: 'time', label: 'Horário', type: 'time' },
        { name: 'client', label: 'Cliente / partes' }, { name: 'process', label: 'Processo' }, { name: 'location', label: 'Local' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Interna',label:'Interna'},{value:'ADVBOX',label:'ADVBOX'},{value:'Agenda ADVBOX',label:'Agenda ADVBOX'}] },
        { name: 'description', label: 'Observações', type: 'textarea', full: true }
      ], { date: isoDate(), source: 'Interna', ...defaults });
    },
    openConfigurationModal(defaults = {}, index = null) {
      const section = this.configurationSection;
      const fieldsBySection = {
        taskDefinitions: [{name:'name',label:'Nome da tarefa',required:true,full:true},{name:'points',label:'Pontuação',type:'number'},{name:'phase',label:'Fase'}],
        users: [{name:'name',label:'Nome do usuário',required:true,full:true},{name:'role',label:'Função'},{name:'pointsGoal',label:'Meta de pontos'}],
        actionGroups: [{name:'name',label:'Grupo de ação',required:true,full:true},{name:'publicationResponsible',label:'Responsável pelas publicações',full:true}],
        actionTypes: [{name:'name',label:'Tipo de ação',required:true,full:true},{name:'group',label:'Grupo'}],
        stages: [{name:'name',label:'Etapa',required:true,full:true},{name:'classification',label:'Classificação'},{name:'phase',label:'Fase'}],
        origins: [{name:'name',label:'Origem',required:true,full:true}],
        goals: [{name:'group',label:'Grupo',required:true,full:true},{name:'monthlyClosings',label:'Meta mensal de fechamentos',type:'number'}],
        inboxSections: [{name:'value',label:'Nome da seção',required:true,full:true}],
        notificationAssignments: [{name:'event',label:'Evento',required:true,full:true},{name:'responsibles',label:'Responsáveis',full:true,placeholder:'Separe os nomes por vírgula'}],
        integrations: [{name:'name',label:'Integração',required:true,full:true},{name:'status',label:'Status'},{name:'method',label:'Método'}]
      };
      const fields = fieldsBySection[section] || [{ name: 'name', label: 'Nome', required: true, full: true }];
      const values = typeof defaults === 'string' ? { value: defaults } : { ...defaults };
      if (Array.isArray(values.responsibles)) values.responsibles = values.responsibles.join(', ');
      this.openModal('configuration', index === null ? 'Novo item de configuração' : 'Editar configuração', 'Estrutura do escritório', fields, { ...values, _section: section, _index: index });
    },
    openTermModal(defaults = {}) {
      const reg = defaults.registration || '';
      let defaultOab = defaults.oabNumber || '';
      let defaultUf = defaults.oabUf || '';
      if (!defaultOab && reg) {
        const ufMatch = reg.match(/([A-Z]{2})/i);
        if (ufMatch) defaultUf = ufMatch[1].toUpperCase();
        const numMatch = reg.replace(/\D/g, '');
        if (numMatch) defaultOab = numMatch;
      }
      if (!defaultUf) defaultUf = 'RS';

      const UF_OPTIONS = [
        { value: 'RS', label: 'RS — Rio Grande do Sul' },
        { value: 'SP', label: 'SP — São Paulo' },
        { value: 'SC', label: 'SC — Santa Catarina' },
        { value: 'PR', label: 'PR — Paraná' },
        { value: 'RJ', label: 'RJ — Rio de Janeiro' },
        { value: 'MG', label: 'MG — Minas Gerais' },
        { value: 'DF', label: 'DF — Distrito Federal' },
        { value: 'BA', label: 'BA — Bahia' },
        { value: 'GO', label: 'GO — Goiás' },
        { value: 'PE', label: 'PE — Pernambuco' },
        { value: 'CE', label: 'CE — Ceará' },
        { value: 'ES', label: 'ES — Espírito Santo' },
        { value: 'MT', label: 'MT — Mato Grosso' },
        { value: 'MS', label: 'MS — Mato Grosso do Sul' },
        { value: 'MA', label: 'MA — Maranhão' },
        { value: 'PA', label: 'PA — Pará' },
        { value: 'PB', label: 'PB — Paraíba' },
        { value: 'RN', label: 'RN — Rio Grande do Norte' },
        { value: 'AL', label: 'AL — Alagoas' },
        { value: 'SE', label: 'SE — Sergipe' },
        { value: 'PI', label: 'PI — Piauí' },
        { value: 'TO', label: 'TO — Tocantins' },
        { value: 'RO', label: 'RO — Rondônia' },
        { value: 'AC', label: 'AC — Acre' },
        { value: 'AM', label: 'AM — Amazonas' },
        { value: 'AP', label: 'AP — Amapá' },
        { value: 'RR', label: 'RR — Roraima' }
      ];

      this.openModal('term', defaults.id ? 'Editar termo monitorado' : 'Adicionar termo monitorado', 'Monitoramento DJEN & Tribunais', [
        { name: 'name', label: 'Nome completo ou razão social', required: true, full: true, placeholder: 'Ex: André da Silva', value: defaults.name || '' },
        { name: 'type', label: 'Tipo de identificador', type: 'select', full: true, options: [{ value: 'oab', label: 'Inscrição OAB (Advogado)' }, { value: 'document', label: 'CPF ou CNPJ' }, { value: 'name', label: 'Nome Textual' }] },
        { name: 'oabNumber', label: 'Número da OAB (somente números)', placeholder: 'Ex: 135294', note: 'Digite somente os números da sua OAB (ex: 135294 ou 029238 com zero à esquerda se tiver menos de 6 dígitos).' },
        { name: 'oabUf', label: 'Estado / Seccional (UF)', type: 'select', value: defaultUf, options: UF_OPTIONS },
        { name: 'document', label: 'CPF ou CNPJ', placeholder: 'Ex: 000.000.000-00 ou 00.000.000/0001-00' }
      ], { type: 'oab', oabNumber: defaultOab, oabUf: defaultUf, ...defaults });

      const typeSelect = document.getElementById('field-type');
      const oabNumberField = document.getElementById('field-oabNumber')?.closest('.field');
      const oabUfField = document.getElementById('field-oabUf')?.closest('.field');
      const docField = document.getElementById('field-document')?.closest('.field');

      const updateFieldsVisibility = () => {
        const val = typeSelect?.value || 'oab';
        if (val === 'oab') {
          if (oabNumberField) oabNumberField.style.display = '';
          if (oabUfField) oabUfField.style.display = '';
          if (docField) docField.style.display = 'none';
        } else if (val === 'document') {
          if (oabNumberField) oabNumberField.style.display = 'none';
          if (oabUfField) oabUfField.style.display = 'none';
          if (docField) docField.style.display = '';
        } else {
          if (oabNumberField) oabNumberField.style.display = 'none';
          if (oabUfField) oabUfField.style.display = 'none';
          if (docField) docField.style.display = 'none';
        }
      };

      typeSelect?.addEventListener('change', updateFieldsVisibility);
      updateFieldsVisibility();
    },
    openSourceModal(defaults = {}) {
      this.openModal('source', 'Detalhes da fonte', 'Monitoramento e integração', [
        { name: 'name', label: 'Fonte', required: true, full: true }, { name: 'short', label: 'Sigla' }, { name: 'method', label: 'Método' },
        { name: 'status', label: 'Situação', type: 'select', options: [{value:'ok',label:'Ativa'},{value:'attention',label:'Atenção'},{value:'error',label:'Falha'},{value:'planned',label:'Preparada'},{value:'off',label:'Desativada'}] },
        { name: 'detail', label: 'Detalhes operacionais', type: 'textarea', full: true, note: 'Não insira senhas, tokens ou conteúdo do certificado.' }
      ], defaults);
    },
    async openJudicialSetup() {
      document.getElementById('judicialSetupBackdrop').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      await this.refreshJudicialStatus(true);
    },
    closeJudicialSetup() {
      const backdrop = document.getElementById('judicialSetupBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      if (document.getElementById('modalBackdrop').classList.contains('hidden')) document.body.style.overflow = '';
      document.getElementById('portalTotpSecret').value = '';
      document.getElementById('portalTotpCode').value = '';
      document.getElementById('certificatePassphrase').value = '';
    },
    async refreshJudicialStatus(showError = false) {
      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/judicial', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível verificar o certificado.');
        this.judicialStatus = data;
        this.renderJudicialSetup();
      } catch (error) {
        if (showError) this.toast(error.message, 'error');
        const chip = document.getElementById('certificateIntegrationStatus');
        chip.textContent = 'Servidor precisa ser reiniciado'; chip.className = 'status-chip warning';
      }
    },
    renderJudicialSetup() {
      const status = this.judicialStatus; if (!status) return;
      const certificate = status.certificate || {};
      const portals = status.portals || [];
      const totpCount = portals.filter(portal => portal.totpConfigured).length;
      const setStatusIcon = (id, ok) => { const element = document.getElementById(id); element.className = `setup-status-icon ${ok ? 'ok' : 'off'}`; element.textContent = ok ? '✓' : '·'; };
      setStatusIcon('setupCertificateIcon', certificate.valid);
      setStatusIcon('setupPjeOfficeIcon', status.pjeOffice?.available);
      setStatusIcon('setupTotpIcon', totpCount > 0);
      document.getElementById('setupCertificateStatus').textContent = certificate.valid ? 'A1 validado pelo Windows' : certificate.accessible ? 'Senha ou contêiner inválido' : 'Selecione o PFX';
      document.getElementById('setupPjeOfficeStatus').textContent = status.pjeOffice?.available ? 'Aplicativo oficial disponível' : 'Abra o PJeOffice Pro';
      document.getElementById('setupTotpStatus').textContent = totpCount ? `${totpCount} portal(is) vinculado(s)` : 'Nenhum QR vinculado';
      const fileBadge = document.getElementById('certificateFileBadge');
      fileBadge.textContent = certificate.valid ? certificate.fileName || 'Certificado ativo' : 'Não configurado';
      fileBadge.className = `status-chip ${certificate.valid ? 'connected' : 'muted'}`;
      const cardChip = document.getElementById('certificateIntegrationStatus');
      cardChip.textContent = certificate.valid ? `A1 ativo · ${totpCount} 2FA` : 'Configuração necessária';
      cardChip.className = `status-chip ${certificate.valid ? 'connected' : 'warning'}`;
      document.getElementById('certificateIntegrationDetail').textContent = certificate.valid
        ? `${certificate.fileName || 'Certificado'} validado localmente. ${portals.filter(portal => portal.enabled).length} portal(is) habilitado(s) e ${totpCount} segundo(s) fator(es) protegido(s).`
        : 'Ative o A1, selecione os tribunais e vincule um QR novo de cada portal em um único assistente protegido.';
      const portalGroups = portals.reduce((groups, portal) => { (groups[portal.group || 'Outros tribunais'] ||= []).push(portal); return groups; }, {});
      document.getElementById('portalCoverageList').innerHTML = portals.length ? Object.entries(portalGroups).map(([group, items]) => `
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
      const selectedPortal = document.getElementById('totpPortalSelect').value;
      document.getElementById('totpPortalSelect').innerHTML = `<option value="">Selecione o tribunal</option>${portals.filter(portal => portal.supportsTotp).map(portal => `<option value="${escapeHtml(portal.id)}">${escapeHtml(portal.name)}${portal.totpConfigured ? ' · vinculado' : ''}</option>`).join('')}`;
      if (portals.some(portal => portal.id === selectedPortal && portal.supportsTotp)) document.getElementById('totpPortalSelect').value = selectedPortal;
      document.getElementById('launchPortalLoginButton').disabled = Boolean(status.interactiveCollectorRunning);
      document.getElementById('launchPortalLoginButton').textContent = status.interactiveCollectorRunning ? 'Primeira conexão em andamento…' : 'Abrir primeira conexão';
    },
    async saveCertificate(event) {
      event.preventDefault();
      const form = event.currentTarget; const file = document.getElementById('certificateFileInput').files[0];
      const passphrase = document.getElementById('certificatePassphrase').value;
      if (!file || !passphrase) return this.toast('Selecione o PFX e informe a senha atual.', 'error');
      this.setFormBusy(form, true);
      try {
        if (file.size > 5_000_000) throw new Error('O certificado deve ter no máximo 5 MB.');
        const pfxBase64 = await this.fileToBase64(file);
        await this.judicialRequest('/api/integrations/judicial/certificate', { fileName: file.name, pfxBase64, passphrase });
        form.reset(); document.getElementById('certificateFileName').textContent = 'Selecionar certificado';
        Store.audit('Certificado A1 configurado', 'Contêiner validado pelo Windows e armazenado cifrado no agente local.');
        this.toast('Certificado validado e protegido com sucesso.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
      finally { this.setFormBusy(form, false); }
    },
    async readPortalQr(file) {
      const status = document.getElementById('portalQrStatus');
      const secretInput = document.getElementById('portalTotpSecret');
      secretInput.value = '';
      if (!file) {
        status.textContent = 'Selecionar QR code';
        return;
      }
      status.textContent = 'Decodificando imagem do QR code…';

      try {
        let raw = '';

        // 1. Decodificação universal via jsQR (Canvas 2D, suportado em 100% dos navegadores)
        if (typeof window.jsQR === 'function') {
          try {
            const img = new Image();
            const imgLoaded = new Promise((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('Falha ao carregar arquivo de imagem.'));
            });
            const objectUrl = URL.createObjectURL(file);
            img.src = objectUrl;
            await imgLoaded;
            URL.revokeObjectURL(objectUrl);

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qrResult = window.jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth'
            });
            if (qrResult?.data) {
              raw = String(qrResult.data || '').trim();
            }
          } catch (err) {
            console.warn('Tentativa com jsQR:', err);
          }
        }

        // 2. Fallback via BarcodeDetector nativo (se disponível)
        if (!raw && ('BarcodeDetector' in window)) {
          try {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const bitmap = await createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            bitmap.close?.();
            raw = codes.find(code => code.rawValue)?.rawValue?.trim() || '';
          } catch (err) {
            console.warn('Tentativa com BarcodeDetector:', err);
          }
        }

        if (!raw) {
          throw new Error('Não foi possível ler o QR Code da imagem. Verifique se o enquadramento está nítido ou cole a chave manual Base32.');
        }

        secretInput.value = raw;
        status.textContent = `${file.name} · QR lido com sucesso`;
        this.toast('QR Code decodificado com sucesso! Digite o código de 6 dígitos para validar.', 'success');
        document.getElementById('portalTotpCode').focus();
      } catch (error) {
        status.textContent = file.name;
        this.toast(error.message, 'error');
      }
    },
    async savePortalTotp(event) {
      event.preventDefault(); const form = event.currentTarget;
      const portalId = document.getElementById('totpPortalSelect').value;
      const secret = document.getElementById('portalTotpSecret').value;
      const code = document.getElementById('portalTotpCode').value;
      if (!portalId || !secret || !/^\d{6}$/.test(code)) return this.toast('Selecione o portal, o QR/chave e informe o código atual de seis dígitos.', 'error');
      this.setFormBusy(form, true);
      try {
        await this.judicialRequest('/api/integrations/judicial/2fa', { portalId, secret, code });
        document.getElementById('portalTotpSecret').value = ''; document.getElementById('portalTotpCode').value = ''; document.getElementById('portalQrInput').value = '';
        document.getElementById('portalQrStatus').textContent = 'Selecionar QR code';
        Store.audit('Segundo fator judicial ativado', `${this.judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · código TOTP validado.`);
        this.toast('QR validado. O segundo fator desse portal está ativo.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
      finally { this.setFormBusy(form, false); }
    },
    async removePortalTotp() {
      const portalId = document.getElementById('totpPortalSelect').value;
      if (!portalId) return this.toast('Selecione o portal cujo vínculo local deve ser removido.', 'error');
      try {
        await this.judicialRequest('/api/integrations/judicial/2fa', { portalId, remove: true });
        document.getElementById('portalTotpSecret').value = ''; document.getElementById('portalTotpCode').value = '';
        Store.audit('Segundo fator judicial removido', `${this.judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · segredo local removido.`);
        this.toast('Vínculo local removido. Isso não desativa o 2FA no portal.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
    },
    async savePortalCoverage() {
      const enabledIds = [...document.querySelectorAll('[data-portal-enabled]:checked')].map(input => input.value);
      try {
        await this.judicialRequest('/api/integrations/judicial/portals', { enabledIds });
        Store.audit('Cobertura judicial atualizada', `${enabledIds.length} portal(is) com certificado habilitado(s).`);
        this.toast('Cobertura dos tribunais salva.', 'success'); await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
    },
    async resetJudicialConnections() {
      const confirmed = window.confirm('Isso removerá todos os QR Codes/2FA, desmarcará os tribunais e apagará as sessões judiciais locais. O certificado A1 será preservado. Continuar?');
      if (!confirmed) return;
      const button = document.getElementById('resetJudicialConnectionsButton'); button.disabled = true;
      try {
        const result = await this.judicialRequest('/api/integrations/judicial/reset', { confirm: 'ZERAR_ACESSOS_JUDICIAIS' });
        document.getElementById('portalTotpSecret').value = ''; document.getElementById('portalTotpCode').value = ''; document.getElementById('portalQrInput').value = '';
        Store.audit('Acessos judiciais zerados', `QR/2FA, cobertura e sessões locais removidos. Certificado A1 ${result.certificatePreserved ? 'preservado' : 'não estava configurado'}.`);
        this.toast(result.certificatePreserved ? 'Acessos zerados. O certificado A1 foi preservado.' : 'Acessos zerados; nenhum certificado estava configurado.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
      finally { button.disabled = false; }
    },
    async syncJudicialNow() {
      const button = document.getElementById('syncJudicialNowButton');
      if (button) {
        button.disabled = true;
        button.textContent = 'Sincronizando acervo e intimações…';
      }
      try {
        const res = await window.KellerAuth.secureFetch('/api/integrations/judicial/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json().catch(() => ({}));
        this.toast(data.message || 'Sincronização iniciada com sucesso em segundo plano!', 'success');
        Store.audit('Sincronização judicial autônoma', 'Coleta de intimações DJEN, DataJud e tribunais.');
        setTimeout(async () => {
          await this.refreshRuntime();
          this.renderAll();
          if (button) {
            button.disabled = false;
            button.textContent = '✦ Sincronizar Acervo e Intimações Agora';
          }
        }, 3000);
      } catch (error) {
        this.toast(error.message || 'Falha ao iniciar sincronização.', 'error');
        if (button) {
          button.disabled = false;
          button.textContent = '✦ Sincronizar Acervo e Intimações Agora';
        }
      }
    },
    async judicialRequest(url, body) {
      const response = await window.KellerAuth.secureFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'A configuração judicial não foi concluída.');
      return data;
    },
    async forgetTrustedDevice() {
      try {
        const response = await window.KellerAuth.secureFetch('/api/auth/trusted-device/revoke', { method: 'POST', headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'Não foi possível revogar a confiança.');
        document.getElementById('forgetTrustedDeviceButton').classList.add('hidden');
        Store.audit('Navegador removido da confiança', 'O próximo acesso exigirá senha e Authenticator.');
        this.toast('Confiança removida. O próximo acesso exigirá autenticação completa.', 'success');
      } catch (error) { this.toast(error.message, 'error'); }
    },
    setFormBusy(form, busy) { form.querySelectorAll('input, select, button').forEach(element => { element.disabled = busy; }); },
    async fileToBase64(file) {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return btoa(binary);
    },
    openCalendarConfigModal() {
      const url = Store.state.settings.calendarUrl || Store.state.settings.externalCalendarUrl || '';
      const input = document.getElementById('calendarInputUrl');
      if (input) input.value = url;
      const statusBox = document.getElementById('calendarConfigStatus');
      if (statusBox) { statusBox.className = 'calendar-sync-status hidden'; statusBox.textContent = ''; }
      document.getElementById('calendarConfigBackdrop').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      setTimeout(() => input?.focus(), 50);
    },
    closeCalendarConfigModal() {
      const backdrop = document.getElementById('calendarConfigBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      if (document.getElementById('modalBackdrop').classList.contains('hidden')) document.body.style.overflow = '';
    },
    async handleCalendarConfigSubmit(event) {
      event.preventDefault();
      const calendarUrl = document.getElementById('calendarInputUrl').value.trim();
      const statusBox = document.getElementById('calendarConfigStatus');
      const submitBtn = document.getElementById('calendarConfigSubmit');
      if (!calendarUrl) return this.toast('Informe a URL da agenda em formato Webcal ou iCal.', 'error');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sincronizando…';
      if (statusBox) {
        statusBox.className = 'calendar-sync-status warning';
        statusBox.textContent = 'Conectando e importando eventos da agenda externa…';
        statusBox.classList.remove('hidden');
      }

      try {
        const response = await window.KellerAuth.secureFetch('/api/calendar/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ calendarUrl })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao salvar configuração da agenda.');

        Store.state.settings.calendarUrl = calendarUrl;
        Store.state.settings.externalCalendarUrl = calendarUrl;
        Store.state.settings.calendarConfigured = true;
        Store.audit('Agenda externa configurada', `${data.imported || 0} compromissos sincronizados.`);
        Store.save();

        if (statusBox) {
          statusBox.className = data.error ? 'calendar-sync-status error' : 'calendar-sync-status success';
          statusBox.textContent = data.message || 'Agenda sincronizada com sucesso!';
        }
        this.toast(data.message || 'Agenda configurada com sucesso!', data.error ? 'error' : 'success');

        await this.syncAll();
        setTimeout(() => this.closeCalendarConfigModal(), 1200);
      } catch (error) {
        if (statusBox) {
          statusBox.className = 'calendar-sync-status error';
          statusBox.textContent = error.message;
        }
        this.toast(error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar e Sincronizar Agora';
      }
    },
    async checkAiStatus() {
      const chip = document.getElementById('aiKeyStatusChip');
      const banner = document.getElementById('aiOnboardingBanner');
      try {
        const response = await window.KellerAuth.secureFetch('/api/ai/status', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        this.aiConfigured = Boolean(data.configured || Store.state.settings.geminiApiKey);
        if (chip) {
          chip.textContent = this.aiConfigured ? 'Chave Ativa' : 'Chave não configurada';
          chip.className = this.aiConfigured ? 'status-chip connected' : 'status-chip warning';
        }
        if (banner) {
          banner.style.display = this.aiConfigured ? 'none' : 'block';
        }
      } catch {
        this.aiConfigured = Boolean(Store.state.settings.geminiApiKey);
        if (chip) {
          chip.textContent = this.aiConfigured ? 'Chave Ativa' : 'Chave não configurada';
          chip.className = this.aiConfigured ? 'status-chip connected' : 'status-chip warning';
        }
      }
    },
    openGeminiKeyModal() {
      const input = document.getElementById('geminiApiKeyInput');
      if (input) input.value = Store.state.settings.geminiApiKey || '';
      const feedback = document.getElementById('geminiKeyFeedback');
      if (feedback) { feedback.className = 'gemini-key-feedback hidden'; feedback.textContent = ''; }
      document.getElementById('geminiKeyBackdrop').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      setTimeout(() => input?.focus(), 50);
    },
    closeGeminiKeyModal() {
      const backdrop = document.getElementById('geminiKeyBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      if (document.getElementById('modalBackdrop').classList.contains('hidden')) document.body.style.overflow = '';
    },
    async saveGeminiKey(apiKey) {
      apiKey = String(apiKey || '').trim();
      if (!apiKey || apiKey.length < 20) {
        throw new Error('Chave inválida. Copie a chave completa gerada no Google AI Studio.');
      }
      const response = await window.KellerAuth.secureFetch('/api/ai/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ apiKey })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Falha ao validar chave com o Google Gemini.');

      if (data.revision) Store.revision = data.revision;
      Store.state.settings.geminiApiKey = apiKey;
      Store.audit('Chave Gemini configurada', `Assistente IA ativado com modelo ${data.model || 'gemini-3.5-flash-lite'}.`);
      await this.checkAiStatus();
      return data;
    },
    async handleGeminiKeySubmit(event) {
      event.preventDefault();
      const key = document.getElementById('geminiApiKeyInput').value.trim();
      const feedback = document.getElementById('geminiKeyFeedback');
      const submitBtn = document.getElementById('geminiKeySubmit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Validando chave com Google…';
      try {
        const result = await this.saveGeminiKey(key);
        if (feedback) {
          feedback.className = 'gemini-key-feedback success';
          feedback.textContent = result.message || 'Chave validada com sucesso!';
          feedback.classList.remove('hidden');
        }
        this.toast('Assistente IA ativado com sucesso!', 'success');
        setTimeout(() => this.closeGeminiKeyModal(), 1000);
      } catch (error) {
        if (feedback) {
          feedback.className = 'gemini-key-feedback error';
          feedback.textContent = error.message;
          feedback.classList.remove('hidden');
        }
        this.toast(error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Validar e Salvar Chave';
      }
    },
    async handleQuickAiKeySubmit() {
      const input = document.getElementById('aiQuickKeyInput');
      const btn = document.getElementById('btnSaveQuickAiKey');
      const key = input.value.trim();
      if (!key) return this.toast('Cole sua Gemini API Key antes de continuar.', 'error');
      btn.disabled = true;
      btn.textContent = 'Validando…';
      try {
        await this.saveGeminiKey(key);
        input.value = '';
        this.toast('Assistente Google Gemini ativado!', 'success');
      } catch (error) {
        this.toast(error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Ativar Assistente Gratuito';
      }
    },
    clearAiConversation() {
      this.aiChatHistory = [];
      const container = document.getElementById('aiChatMessages');
      if (container) {
        container.innerHTML = `
          <div class="ai-message assistant-message">
            <div class="message-avatar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
              </svg>
            </div>
            <div class="message-body">
              <div class="message-text">
                <p>Conversa reiniciada. Em que posso auxiliá-lo(a) agora com suas intimações, prazos ou minutas?</p>
              </div>
              <div class="message-meta">Assistente Atrium Senda</div>
            </div>
          </div>`;
      }
      this.toast('Conversa reiniciada.', 'success');
    },
    sendQuickPrompt(promptText) {
      const input = document.getElementById('aiChatInput');
      if (input) input.value = promptText;
      this.sendAiMessage(promptText);
    },
    handleAiChatSubmit(event) {
      event.preventDefault();
      const input = document.getElementById('aiChatInput');
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      this.sendAiMessage(message);
    },
    async sendAiMessage(messageText) {
      if (!messageText.trim()) return;
      if (this.isAiTyping) return;

      const container = document.getElementById('aiChatMessages');
      if (!container) return;

      if (!this.aiConfigured && !Store.state.settings.geminiApiKey) {
        this.openGeminiKeyModal();
        this.toast('Por favor, configure sua chave gratuita do Gemini para usar o assistente.', 'warning');
        return;
      }

      const userDiv = document.createElement('div');
      userDiv.className = 'ai-message user-message';
      userDiv.innerHTML = `
        <div class="message-avatar">EU</div>
        <div class="message-body">
          <div class="message-text">${escapeHtml(messageText).replace(/\n/g, '<br>')}</div>
          <div class="message-meta">Você · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</div>
        </div>`;
      container.appendChild(userDiv);

      this.isAiTyping = true;
      const typingDiv = document.createElement('div');
      typingDiv.className = 'ai-message assistant-message ai-typing-row';
      typingDiv.innerHTML = `
        <div class="message-avatar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
          </svg>
        </div>
        <div class="message-body">
          <div class="ai-typing-indicator">
            <span>Assistente formulando resposta…</span>
            <div class="ai-typing-dots"><span></span><span></span><span></span></div>
          </div>
        </div>`;
      container.appendChild(typingDiv);
      container.scrollTop = container.scrollHeight;

      let context = {};
      if (this.selectedIntimation) {
        const item = Store.state.intimations.find(r => r.id === this.selectedIntimation);
        if (item) context.intimation = item;
      }

      try {
        const response = await window.KellerAuth.secureFetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            message: messageText,
            context,
            history: this.aiChatHistory.slice(-12)
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao consultar a API do Google Gemini.');

        typingDiv.remove();

        const replyHtml = formatMarkdown(data.reply);
        const assistantDiv = document.createElement('div');
        assistantDiv.className = 'ai-message assistant-message';
        assistantDiv.innerHTML = `
          <div class="message-avatar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
            </svg>
          </div>
          <div class="message-body">
            <div class="message-text">${replyHtml}</div>
            <div class="message-meta">${data.model || 'Google Gemini Flash'} · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</div>
          </div>`;
        container.appendChild(assistantDiv);

        this.aiChatHistory.push({ role: 'user', text: messageText });
        this.aiChatHistory.push({ role: 'assistant', text: data.reply });
      } catch (error) {
        typingDiv.remove();
        const errDiv = document.createElement('div');
        errDiv.className = 'ai-message assistant-message';
        errDiv.innerHTML = `
          <div class="message-avatar" style="background:rgba(255,77,79,0.2);color:#ff4d4f;border-color:rgba(255,77,79,0.4);">!</div>
          <div class="message-body">
            <div class="message-text" style="background:#201111;border-color:#4a1c1c;color:#ff8585;">
              <p><strong>Erro na consulta ao Assistente IA:</strong> ${escapeHtml(error.message)}</p>
              <p style="font-size:12px;margin-top:6px;color:#c59999;">Verifique se a sua chave do Google Gemini foi inserida corretamente ou acesse <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--gold);text-decoration:underline;">Google AI Studio</a> para gerar uma nova chave gratuita.</p>
            </div>
          </div>`;
        container.appendChild(errDiv);
      } finally {
        this.isAiTyping = false;
        container.scrollTop = container.scrollHeight;
      }
    },
    copyPrompt(promptText, buttonElement) {
      if (!navigator.clipboard) {
        this.toast('Área de transferência indisponível neste navegador.', 'error');
        return;
      }
      navigator.clipboard.writeText(promptText).then(() => {
        if (buttonElement) {
          const originalText = buttonElement.innerHTML;
          buttonElement.innerHTML = `
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copiado!</span>`;
          buttonElement.classList.add('copied');
          setTimeout(() => {
            buttonElement.innerHTML = originalText;
            buttonElement.classList.remove('copied');
          }, 2000);
        }
        this.toast('Prompt copiado para a área de transferência!', 'success');
      }).catch(() => {
        this.toast('Não foi possível copiar o texto do prompt.', 'error');
      });
    },
    usePromptInAi(promptText) {
      this.switchView('assistant');
      const input = document.getElementById('aiChatInput');
      if (input) {
        input.value = promptText;
        input.style.height = 'auto';
        input.style.height = Math.min(Math.max(input.scrollHeight, 60), 200) + 'px';
        input.focus();
        setTimeout(() => {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      this.toast('Prompt carregado no Assistente IA! Complete com os fatos e envie.', 'success');
    },
    renderPrompts() {
      const defaultPrompts = window.PROMPTS_DATA || [];
      const customPrompts = Store.state.customPrompts || [];
      const allPrompts = [...customPrompts, ...defaultPrompts];
      const grid = document.getElementById('promptsGrid');
      const chipsContainer = document.getElementById('promptsCategoryChips');
      const categorySelect = document.getElementById('promptCategorySelect');
      const countDisplay = document.getElementById('promptsCountDisplay');

      // Monta as opções de categoria no select
      const categories = ['all', ...new Set(allPrompts.map(p => p.category))];
      if (categorySelect && (categorySelect.options.length <= 1 || categorySelect.options.length !== categories.length)) {
        const curVal = categorySelect.value || 'all';
        categorySelect.innerHTML = categories.map(cat => {
          const label = cat === 'all' ? `Todas as Áreas (${allPrompts.length} prompts)` : cat;
          return `<option value="${escapeHtml(cat)}">${escapeHtml(label)}</option>`;
        }).join('');
        if (categories.includes(curVal)) categorySelect.value = curVal;
      }

      // Monta os chips de categoria com as mais frequentes
      const topCategories = ['all', ...[...new Set(allPrompts.map(p => p.category))].slice(0, 12)];
      if (chipsContainer) {
        chipsContainer.innerHTML = topCategories.map(cat => {
          const isSelected = this.promptsFilter.category === cat;
          const label = cat === 'all' ? 'Todas as Áreas' : cat;
          return `<button type="button" class="prompt-chip ${isSelected ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
        }).join('');
      }

      // Filtragem dinâmica
      const searchNeedle = normalizeText(this.promptsFilter.search || '');
      const filtered = allPrompts.filter(p => {
        if (this.promptsFilter.category !== 'all' && p.category !== this.promptsFilter.category) return false;
        if (this.promptsFilter.type !== 'all' && normalizeText(p.type) !== normalizeText(this.promptsFilter.type)) return false;
        if (searchNeedle) {
          const haystack = normalizeText(`${p.title} ${p.description} ${(p.tags || []).join(' ')} ${p.prompt}`);
          if (!haystack.includes(searchNeedle)) return false;
        }
        return true;
      });

      if (countDisplay) {
        countDisplay.textContent = `Mostrando ${filtered.length} de ${allPrompts.length} prompts`;
      }

      if (!grid) return;

      if (!filtered.length) {
        grid.innerHTML = `
          <div class="prompts-empty card">
            <div class="empty-icon">⌕</div>
            <h3>Nenhum prompt encontrado</h3>
            <p>Tente ajustar os termos da pesquisa ou selecione outra área do direito.</p>
          </div>`;
        return;
      }

      grid.innerHTML = filtered.map(p => {
        const typeClass = p.type ? `type-${normalizeText(p.type).replace(/\s+/g, '-')}` : 'type-geral';
        const tagsHtml = (p.tags || []).slice(0, 5).map(t => `<span class="prompt-tag">${escapeHtml(t)}</span>`).join('');
        const customBadge = p.isCustom ? `<span class="prompt-cat-badge custom-prompt-badge">Personalizado</span>` : '';
        const customActions = p.isCustom ? `
          <button type="button" class="button ghost btn-edit-prompt" data-edit-prompt="${escapeHtml(p.id)}" title="Editar prompt">Editar</button>
          <button type="button" class="button danger-ghost btn-delete-prompt" data-delete-prompt="${escapeHtml(p.id)}" title="Excluir prompt">Excluir</button>
        ` : '';
        return `
          <article class="card prompt-card ${p.isCustom ? 'custom-card' : ''}" data-prompt-id="${escapeHtml(p.id)}">
            <div class="prompt-card-top">
              <div class="prompt-badges">
                ${customBadge}
                <span class="prompt-cat-badge">${escapeHtml(p.category)}</span>
                <span class="prompt-type-badge ${typeClass}">${escapeHtml(p.type || 'Geral')}</span>
              </div>
            </div>
            <h4 class="prompt-title">${escapeHtml(p.title)}</h4>
            <p class="prompt-desc">${escapeHtml(p.description || 'Modelo especializado para aplicação prática jurídica.')}</p>
            ${tagsHtml ? `<div class="prompt-tags-list">${tagsHtml}</div>` : ''}
            <div class="prompt-box">
              <pre class="prompt-text">${escapeHtml(p.prompt)}</pre>
            </div>
            <div class="prompt-card-actions">
              <button type="button" class="button ghost btn-copy-prompt" data-copy-prompt="${escapeHtml(p.id)}" title="Copiar texto do prompt">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>Copiar</span>
              </button>
              <button type="button" class="button gold btn-use-prompt" data-use-prompt="${escapeHtml(p.id)}" title="Carregar no chat do Assistente IA">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
                </svg>
                <span>Usar na IA</span>
              </button>
              ${customActions}
            </div>
          </article>
        `;
      }).join('');
    },
    renderLinks() {
      const customLinks = Store.state.customLinks || [];
      const section = document.getElementById('customLinksSection');
      const grid = document.getElementById('customLinksGrid');
      if (!section || !grid) return;

      if (!customLinks.length) {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
      }

      section.classList.remove('hidden');
      grid.innerHTML = customLinks.map(link => {
        let domain = '';
        try { domain = new URL(link.url).hostname.replace(/^www\./, ''); } catch { domain = link.url; }
        return `
          <div class="link-card card custom-link-card">
            <div class="link-card-header">
              <div class="link-badge">${escapeHtml(link.category || 'Link Personalizado')}</div>
              <div class="link-card-top-actions">
                <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="external-icon" title="Abrir link">↗</a>
                <button type="button" class="btn-delete-link" data-delete-link="${escapeHtml(link.id)}" title="Excluir este link">×</button>
              </div>
            </div>
            <h4>${escapeHtml(link.title)}</h4>
            <p>${escapeHtml(link.description || 'Link personalizado adicionado ao escritório.')}</p>
            <div class="link-card-meta">
              <span class="link-domain">${escapeHtml(domain)}</span>
              <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="link-tag">Acessar</a>
            </div>
          </div>
        `;
      }).join('');
    },
    openNewPromptModal(defaults = {}) {
      const categories = ['all', ...new Set((window.PROMPTS_DATA || []).map(p => p.category))].filter(c => c !== 'all');
      this.openModal('prompt', defaults.id ? 'Editar prompt personalizado' : 'Novo prompt jurídico', 'Inteligência Artificial', [
        { name: 'title', label: 'Título do prompt', required: true, full: true, placeholder: 'Ex: Recurso Especial — Violação ao CPC', value: defaults.title || '' },
        { name: 'category', label: 'Área do Direito', required: true, placeholder: 'Ex: Cível, Previdenciário, Trabalhista...', value: defaults.category || 'Cível' },
        { name: 'type', label: 'Tipo de Ação / Finalidade', type: 'select', options: [{value:'Redação',label:'Redação de Peça'},{value:'Análise',label:'Análise de Riscos / Fatos'},{value:'Pesquisa',label:'Pesquisa Jurisprudencial'},{value:'Assistente',label:'Assistente Estratégico'},{value:'Geral',label:'Geral'}], value: defaults.type || 'Redação' },
        { name: 'tags', label: 'Palavras-chave / Tags', full: true, placeholder: 'Ex: apelação, cpc, tempestividade, omissão (separados por vírgula)', value: Array.isArray(defaults.tags) ? defaults.tags.join(', ') : (defaults.tags || '') },
        { name: 'description', label: 'Resumo / Instruções de uso', full: true, placeholder: 'Ex: Estrutura especializada para demonstrar negativa de prestação jurisdicional.', value: defaults.description || '' },
        { name: 'prompt', label: 'Texto completo do Prompt (com variáveis [CLIENTE], [FATO], etc.)', type: 'textarea', full: true, required: true, value: defaults.prompt || '', note: 'Você pode usar marcações entre colchetes como [PROCESSO], [FATOS] para orientar o preenchimento.' }
      ], defaults);
    },
    openNewLinkModal(defaults = {}) {
      this.openModal('link', defaults.id ? 'Editar link útil' : 'Adicionar novo link útil', 'Acesso rápido oficial', [
        { name: 'title', label: 'Nome / Título da referência', required: true, full: true, placeholder: 'Ex: Código de Trânsito Brasileiro (CTB)', value: defaults.title || '' },
        { name: 'url', label: 'Endereço Web (URL)', required: true, full: true, placeholder: 'Ex: https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm', value: defaults.url || '' },
        { name: 'category', label: 'Categoria', type: 'select', options: [{value:'Legislação',label:'Legislação & Códigos'},{value:'Jurisprudência',label:'Jurisprudência & Tribunais'},{value:'Ferramentas IA',label:'Ferramentas com IA'},{value:'Órgãos Públicos',label:'Órgãos Públicos / Cartórios'},{value:'Outros',label:'Outros Links'}], value: defaults.category || 'Legislação' },
        { name: 'description', label: 'Descrição / O que é este link', type: 'textarea', full: true, placeholder: 'Ex: Lei Federal nº 9.503/1997 compilada com todas as normas de trânsito.', value: defaults.description || '' }
      ], defaults);
    },
    openGuideModal(type) {
      this.openModal('guide', 'Ativar certificado A1', 'Configuração protegida', [
        { name: 'instructions', label: 'Arquitetura do certificado', type: 'textarea', full: true, value: '1. Instale o certificado A1 somente no agente local.\n2. Defina A1_PFX_PATH e A1_PFX_PASSPHRASE fora do código.\n3. Cadastre a origem exata de cada portal em collector/portals.json.\n4. Execute primeiro em modo visível para concluir login, QR code ou 2FA.\n5. Agende a execução diária somente após validar cada fonte.\n\nO sistema nunca deve calcular ou confirmar prazo fatal sem revisão humana.' }
      ], {});
      document.querySelector('#modalForm footer .button.gold').textContent = 'Entendi';
    },
    handleModalSubmit(event) {
      event.preventDefault(); if (!this.modalMode) return;
      if (this.modalMode.mode === 'guide') { this.closeModal(); return; }
      if (this.modalMode.mode === 'intimationDetail') {
        const item = this.modalMode.defaults;
        const act = item._act || classifyIntimationAct(item.text, item.title, item.type);
        const suggestedDeadline = addDays(item.publishedAt || isoDate(), act.days);
        this.closeModal();
        this.openTaskModal({
          title: `Cumprir ${act.category}: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: suggestedDeadline,
          priority: act.priority || 'normal',
          status: 'triagem'
        });
        return;
      }
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (this.modalMode.mode === 'task') {
        const history = Array.isArray(this.modalMode.defaults.history) ? [...this.modalMode.defaults.history] : [];
        history.push({ at: new Date().toISOString(), action: this.modalMode.defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', actor: 'Ricardo' });
        const timeLogs = Array.isArray(this.modalMode.defaults.timeLogs) ? [...this.modalMode.defaults.timeLogs] : [];
        const addMinutes = Number(data.addMinutes);
        if (addMinutes > 0) {
          timeLogs.push({ id: uid('time'), date: isoDate(), minutes: addMinutes, description: data.timeDescription || 'Trabalho realizado', actor: 'Ricardo' });
          history.push({ at: new Date().toISOString(), action: `Apontamento de tempo: ${formatMinutes(addMinutes)}`, actor: 'Ricardo' });
        }
        delete data.addMinutes;
        delete data.timeDescription;
        const responsibleList = [data.responsible, ...String(data.responsibles || '').split(/[,;]/)].map(item => item.trim()).filter(Boolean);
        const record = { id: this.modalMode.defaults.id || uid('task'), createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), source: this.modalMode.defaults.source || 'Interna', intimationId: this.modalMode.defaults.intimationId || null, ...data, points: Number(data.points) || 0, responsibles: [...new Set(responsibleList)], history, timeLogs };
        Store.upsert('tasks', record);
        if (record.intimationId) { const intimation = Store.state.intimations.find(item => item.id === record.intimationId); if (intimation) { intimation.status = 'tarefa'; intimation.completedAt = new Date().toISOString(); intimation.taskId = record.id; } }
        Store.audit(this.modalMode.defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', `${record.title}${record.process ? ` · ${record.process}` : ''}${record.points ? ` · ${record.points} pontos` : ''}${addMinutes > 0 ? ` · ${formatMinutes(addMinutes)} apontados` : ''}`);
      } else if (this.modalMode.mode === 'intimation') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = { id: this.modalMode.defaults.id || uid('int'), status: this.modalMode.defaults.status || 'nova', unread: this.modalMode.defaults.unread ?? true, term: this.modalMode.defaults.term || 'Ricardo De Luca Rossetto · OAB/RS 135294', createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(), ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('intimations', record); Store.audit(editing ? 'Intimação atualizada' : 'Intimação registrada', `${record.title}${record.process ? ` · ${record.process}` : ''}`);
      } else if (this.modalMode.mode === 'process') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = {
          id: this.modalMode.defaults.id || uid('proc'),
          source: this.modalMode.defaults.source || 'Interna',
          lastMovement: 'Cadastro manual',
          lastMovementAt: isoDate(),
          ...this.modalMode.defaults,
          ...data,
          feePercentage: data.feePercentage ? Number(data.feePercentage) : null,
          feeAmount: data.feeAmount ? Number(data.feeAmount) : null,
          feeMonthly: data.feeMonthly ? Number(data.feeMonthly) : null,
          secrecy: data.secrecy === 'true',
          updatedAt: new Date().toISOString()
        };
        Store.upsert('processes', record);
        Store.audit(editing ? 'Processo atualizado' : 'Processo cadastrado', `${record.number || record.protocol || 'sem número'} · ${record.client}${record.feeType ? ` · ${record.feeType}` : ''}`);
      } else if (this.modalMode.mode === 'contact') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = { id: this.modalMode.defaults.id || uid('contact'), externalId: this.modalMode.defaults.externalId || null, registeredAt: this.modalMode.defaults.registeredAt || isoDate(), ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('contacts', record); Store.audit(editing ? 'Contato atualizado' : 'Contato cadastrado', record.name);
      } else if (this.modalMode.mode === 'agenda') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = { id: this.modalMode.defaults.id || uid('agenda'), externalId: this.modalMode.defaults.externalId || null, ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('agenda', record); Store.audit(editing ? 'Compromisso atualizado' : 'Compromisso cadastrado', `${record.title} · ${formatDate(record.date)}`);
      } else if (this.modalMode.mode === 'configuration') {
        const section = this.modalMode.defaults._section; const index = this.modalMode.defaults._index;
        const list = Store.state.configuration[section];
        let record = { ...this.modalMode.defaults, ...data }; delete record._section; delete record._index;
        if (section === 'inboxSections') record = data.value;
        if (section === 'notificationAssignments') record.responsibles = String(data.responsibles || '').split(/[,;]/).map(item => item.trim()).filter(Boolean);
        if (section === 'taskDefinitions') record.points = Number(data.points) || 0;
        if (section === 'goals') record.monthlyClosings = data.monthlyClosings === '' ? null : Number(data.monthlyClosings);
        if (index === null || index === undefined || index === '') list.push(record); else list[Number(index)] = record;
        Store.audit(index === null || index === undefined || index === '' ? 'Configuração adicionada' : 'Configuração atualizada', `${section} · ${typeof record === 'string' ? record : record.name || record.event || record.group || 'item'}`);
      } else if (this.modalMode.mode === 'term') {
        const editing = Boolean(this.modalMode.defaults.id);
        let registration = data.registration;
        let oabNumber = data.oabNumber ? String(data.oabNumber).replace(/\D/g, '') : '';
        let oabUf = data.oabUf ? String(data.oabUf).toUpperCase() : '';
        if (data.type === 'oab' && oabNumber) {
          registration = `OAB/${oabUf || 'RS'} ${oabNumber}`;
        } else if (!registration) {
          registration = data.document || data.name;
        }
        const record = {
          id: this.modalMode.defaults.id || uid('term'),
          active: true,
          ...this.modalMode.defaults,
          ...data,
          registration,
          oabNumber: oabNumber || undefined,
          oabUf: oabUf || undefined,
          updatedAt: new Date().toISOString()
        };
        Store.upsert('terms', record);
        if (Store.state.terms[0]?.id === record.id) {
          Store.state.settings.lawyerName = record.name;
          Store.state.settings.lawyerOab = record.registration;
        }
        Store.audit(editing ? 'Termo atualizado' : 'Termo adicionado', `${record.name} · ${record.registration}`);
      } else if (this.modalMode.mode === 'source') {
        const record = { ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() }; Store.upsert('sources', record); Store.audit('Fonte atualizada', `${record.name} · ${record.status}`);
      } else if (this.modalMode.mode === 'prompt') {
        const isEditing = Boolean(this.modalMode.defaults.id);
        const record = {
          id: this.modalMode.defaults.id || uid('prompt'),
          isCustom: true,
          title: data.title || 'Prompt sem título',
          category: data.category || 'Geral',
          type: data.type || 'Geral',
          description: data.description || '',
          tags: String(data.tags || '').split(/[,;]/).map(t => t.trim()).filter(Boolean),
          prompt: data.prompt || '',
          createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        Store.state.customPrompts = Store.state.customPrompts || [];
        const idx = Store.state.customPrompts.findIndex(p => p.id === record.id);
        if (idx >= 0) Store.state.customPrompts[idx] = record;
        else Store.state.customPrompts.unshift(record);
        Store.audit(isEditing ? 'Prompt personalizado atualizado' : 'Prompt personalizado criado', record.title);
      } else if (this.modalMode.mode === 'link') {
        const isEditing = Boolean(this.modalMode.defaults.id);
        const record = {
          id: this.modalMode.defaults.id || uid('link'),
          title: data.title || 'Link sem título',
          url: data.url || '#',
          category: data.category || 'Legislação',
          description: data.description || '',
          createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        Store.state.customLinks = Store.state.customLinks || [];
        const idx = Store.state.customLinks.findIndex(l => l.id === record.id);
        if (idx >= 0) Store.state.customLinks[idx] = record;
        else Store.state.customLinks.unshift(record);
        Store.audit(isEditing ? 'Link útil atualizado' : 'Link útil adicionado', record.title);
      }
      Store.save(); this.closeModal(); this.renderAll(); this.toast('Registro salvo com sucesso.', 'success');
    },
    openDocumentGenerator({ contactId = null, processId = null, type = 'procuracao' } = {}) {
      const contacts = Store.state.contacts || [];
      const processes = Store.state.processes || [];
      const contactSelect = document.getElementById('docGenContactSelect');
      const processSelect = document.getElementById('docGenProcessSelect');
      const typeSelect = document.getElementById('docGenTypeSelect');

      if (contactSelect) {
        contactSelect.innerHTML = `<option value="">Selecione o contato</option>${contacts.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.document || 'sem doc')})</option>`).join('')}`;
        if (contactId && contacts.some(c => c.id === contactId)) contactSelect.value = contactId;
        else if (contacts.length) contactSelect.value = contacts[0].id;
      }

      if (processSelect) {
        processSelect.innerHTML = `<option value="">Geral / Sem processo</option>${processes.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.number || p.protocol || 'Processo')} · ${escapeHtml(p.client)}</option>`).join('')}`;
        if (processId && processes.some(p => p.id === processId)) processSelect.value = processId;
      }

      if (typeSelect && type) typeSelect.value = type;

      this.updateDocPreview();
      document.getElementById('docGeneratorBackdrop').classList.remove('hidden');
    },
    closeDocumentGenerator() {
      document.getElementById('docGeneratorBackdrop').classList.add('hidden');
    },
    updateDocPreview() {
      const type = document.getElementById('docGenTypeSelect')?.value || 'procuracao';
      const contactId = document.getElementById('docGenContactSelect')?.value;
      const processId = document.getElementById('docGenProcessSelect')?.value;
      const contact = Store.state.contacts.find(c => c.id === contactId);
      const process = Store.state.processes.find(p => p.id === processId);

      let text = '';
      if (type === 'procuracao') text = generateProcuracaoText(contact, process);
      else if (type === 'procuracao_prev') text = generateProcuracaoPrevText(contact, process);
      else if (type === 'contrato_honorarios') text = generateContratoText(contact, process);
      else if (type === 'declaracao_hipo') text = generateDeclaracaoHipoText(contact);
      else if (type === 'quesitos_prev') text = generateQuesitosPrevText(contact, process);
      else if (type === 'prestacao_contas_rpv') text = generatePrestacaoContasRpvText(contact, process);
      else if (type === 'requerimento_inss') text = generateRequerimentoInssText(contact, process);
      else if (type === 'termo_renuncia') text = generateTermoRenunciaText(contact, process);
      else if (type === 'substabelecimento') text = generateSubstabelecimentoText(contact, process);

      const previewArea = document.getElementById('docGenPreviewText');
      if (previewArea) previewArea.value = text;
    },
    async copyDocToClipboard() {
      const text = document.getElementById('docGenPreviewText').value;
      try {
        await navigator.clipboard.writeText(text);
        this.toast('Minuta copiada para a área de transferência!', 'success');
      } catch {
        const area = document.getElementById('docGenPreviewText');
        area.select();
        document.execCommand('copy');
        this.toast('Minuta copiada!', 'success');
      }
    },
    downloadDoc() {
      const type = document.getElementById('docGenTypeSelect').value;
      const text = document.getElementById('docGenPreviewText').value;
      const filename = `${type}-${isoDate()}.md`;
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.toast(`Arquivo ${filename} baixado com sucesso.`, 'success');
    },
    async handleSpreadsheetUpload(file) {
      if (!file) return;
      this.toast('Analisando estrutura da planilha…');
      try {
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        let payload = {};
        if (isCsv) {
          const content = await file.text();
          payload = { filename: file.name, content };
        } else {
          const buffer = await file.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buffer);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          payload = { filename: file.name, base64 };
        }

        const response = await window.KellerAuth.secureFetch('/api/import/spreadsheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.message || 'Não foi possível ler a planilha.');
        }

        const result = await response.json();
        this.importedSpreadsheetData = result;
        this.renderSpreadsheetPreview(result);
        this.toast(`Planilha lida: ${result.totalRows} linha(s) encontrada(s).`, 'success');
      } catch (error) {
        this.toast(error.message || 'Falha ao processar arquivo.', 'error');
      }
    },
    renderSpreadsheetPreview(data) {
      const card = document.getElementById('importerPreviewCard');
      if (!card) return;
      card.classList.remove('hidden');
      document.getElementById('importerFileLabel').textContent = `Arquivo: ${data.filename || 'Planilha'}`;
      document.getElementById('importerSummaryTitle').textContent = `${data.totalRows} linha(s) identificada(s)`;

      const badges = [];
      if (data.processes?.length) badges.push(`<span class="status-chip connected">⚖️ ${data.processes.length} Processo(s)</span>`);
      if (data.contacts?.length) badges.push(`<span class="status-chip planned">👥 ${data.contacts.length} Contato(s)</span>`);
      if (data.tasks?.length) badges.push(`<span class="status-chip warning">📅 ${data.tasks.length} Tarefa(s) / Prazo(s)</span>`);
      document.getElementById('importerBadges').innerHTML = badges.join('');

      const previewRows = data.preview || [];
      if (!previewRows.length) return;
      const headers = Object.keys(previewRows[0]);
      document.getElementById('importerPreviewHead').innerHTML = `<tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
      document.getElementById('importerPreviewBody').innerHTML = previewRows.map(row => `
        <tr>${headers.map(h => `<td>${escapeHtml(String(row[h] || '—'))}</td>`).join('')}</tr>
      `).join('');

      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    cancelSpreadsheetImport() {
      this.importedSpreadsheetData = null;
      document.getElementById('importerPreviewCard')?.classList.add('hidden');
      const input = document.getElementById('importerFileInput');
      if (input) input.value = '';
      this.toast('Importação descartada.');
    },
    commitSpreadsheetImport() {
      const data = this.importedSpreadsheetData;
      if (!data) return;
      let countProc = 0;
      let countCont = 0;
      let countTasks = 0;

      (data.processes || []).forEach(proc => {
        Store.upsert('processes', proc, 'number');
        countProc++;
      });
      (data.contacts || []).forEach(cont => {
        Store.upsert('contacts', cont, 'name');
        countCont++;
      });
      (data.tasks || []).forEach(task => {
        Store.upsert('tasks', task, 'title');
        countTasks++;
      });

      Store.audit('Importação de planilha concluída', `${countProc} processos, ${countCont} contatos e ${countTasks} tarefas consolidados.`);
      Store.save();
      this.renderAll();
      this.cancelSpreadsheetImport();
      this.toast(`Importação concluída: ${countProc} processos, ${countCont} contatos e ${countTasks} tarefas importados!`, 'success');
      if (countProc > 0) this.switchView('processes');
      else if (countCont > 0) this.switchView('contacts');
    },
    async checkServerStatus() {
      try {
        const response = await window.KellerAuth.secureFetch('/api/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        Store.state.settings.calendarConfigured = Boolean(data.calendarConfigured);
        Store.state.settings.collectorConfigured = Boolean(data.collectorConfigured);
        const calendar = Store.state.sources.find(item => item.id === 'advbox-calendar');
        if (calendar) { calendar.status = data.calendarConfigured ? 'ok' : 'attention'; calendar.detail = data.calendarConfigured ? 'Webcal protegido no servidor' : calendar.detail; }
        Store.save(); this.renderSources(); this.renderMonitoring(); this.renderMetrics();
        document.getElementById('forgetTrustedDeviceButton').classList.toggle('hidden', !window.KellerAuth.trustedDevice);
        await this.refreshJudicialStatus(false);
      } catch { /* O modo estático continua disponível. */ }
    },
    async syncWhenIdle() {
      const modalOpen = !document.getElementById('modalBackdrop').classList.contains('hidden');
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (modalOpen || editing) {
        clearTimeout(this.syncRetryTimer);
        this.syncRetryTimer = window.setTimeout(() => this.syncWhenIdle(), 15 * 1000);
        return;
      }
      await this.syncAll({ silent: true });
    },
    async syncAll({ silent = false } = {}) {
      const buttons = [document.getElementById('syncButton'), document.getElementById('agendaSyncButton')];
      buttons.forEach(button => { if (button) button.disabled = true; });
      if (!silent) this.toast('Iniciando sincronização protegida…');
      try {
        await Store.flush();
        const response = await window.KellerAuth.secureFetch('/api/sync', { method: 'POST', headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Servidor de integração indisponível.');
        if (Store.state.settings.demoMode && (Number(data.imported) > 0 || (data.intimations && data.intimations.length > 0))) {
          ['agenda', 'tasks', 'intimations', 'processes'].forEach(collection => {
            Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
          });
        }
        (data.events || []).forEach(event => Store.upsert('agenda', event, 'externalId'));
        (data.tasks || []).forEach(task => Store.upsert('tasks', task, 'externalId'));
        (data.intimations || []).forEach(item => Store.upsert('intimations', item, 'externalId'));
        (data.processes || []).forEach(item => Store.upsert('processes', item, 'number'));
        (data.sources || []).forEach(source => Store.upsert('sources', source, 'id'));
        if (Number(data.imported) > 0 || (data.intimations && data.intimations.length > 0)) Store.state.settings.demoMode = false;
        Store.audit('Sincronização concluída', `${data.imported || (data.intimations?.length || 0)} registro(s) processado(s).`, 'Sistema');
        Store.save();
        this.renderAll();
        if (!silent) this.toast('Sincronização concluída com sucesso.', 'success');
      } catch (error) {
        if (!silent) this.toast(error.message || 'Não foi possível sincronizar.', 'error');
      } finally {
        buttons.forEach(button => { if (button) button.disabled = false; });
      }
    },
    async importJson(file) {
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        let imported = 0;
        const defaultTerm = Store.state.terms[0] ? `${Store.state.terms[0].name} · ${Store.state.terms[0].registration}` : 'Advogado(a) Titular';
        if (Array.isArray(payload)) {
          payload.forEach(record => {
            if (!record?.title && !record?.text) return;
            Store.upsert('intimations', { id: record.id || uid('int'), source: record.source || 'Arquivo JSON', status: record.status || 'nova', unread: true, title: record.title || 'Intimação importada', process: record.process || '', client: record.client || '', court: record.court || '', publishedAt: record.publishedAt || isoDate(), text: record.text || record.description || '', term: record.term || defaultTerm, createdAt: new Date().toISOString() });
            imported++;
          });
        } else if (payload && typeof payload === 'object') {
          const hasCollections = ['intimations', 'tasks', 'processes', 'agenda'].some(key => Array.isArray(payload[key]));
          if (hasCollections) {
            if (Store.state.settings.demoMode) {
              ['agenda', 'tasks', 'intimations', 'processes'].forEach(collection => {
                Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
              });
            }
            (payload.intimations || []).forEach(record => {
              Store.upsert('intimations', { id: record.id || uid('int'), source: record.source || 'Arquivo JSON', status: record.status || 'nova', unread: true, title: record.title || 'Intimação importada', process: record.process || '', client: record.client || '', court: record.court || '', publishedAt: record.publishedAt || isoDate(), text: record.text || record.description || '', term: record.term || defaultTerm, createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            (payload.tasks || []).forEach(record => {
              Store.upsert('tasks', { id: record.id || uid('task'), title: record.title || 'Tarefa importada', status: record.status || 'triagem', source: record.source || 'Arquivo JSON', priority: record.priority || 'normal', responsible: record.responsible || 'Advogado', createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            (payload.processes || []).forEach(record => {
              Store.upsert('processes', { id: record.id || uid('proc'), number: record.number || '', client: record.client || 'Cliente não informado', secrecy: Boolean(record.secrecy), monitoring: record.monitoring || 'active', source: record.source || 'Arquivo JSON', lastMovement: record.lastMovement || 'Importado via JSON', lastMovementAt: record.lastMovementAt || isoDate(), createdAt: new Date().toISOString(), ...record }, 'number');
              imported++;
            });
            (payload.agenda || []).forEach(record => {
              Store.upsert('agenda', { id: record.id || uid('agenda'), title: record.title || 'Compromisso importado', date: record.date || isoDate(), source: record.source || 'Arquivo JSON', createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            if (imported > 0) Store.state.settings.demoMode = false;
          } else if (payload.title || payload.text) {
            Store.upsert('intimations', { id: payload.id || uid('int'), source: payload.source || 'Arquivo JSON', status: payload.status || 'nova', unread: true, title: payload.title || 'Intimação importada', process: payload.process || '', client: payload.client || '', court: payload.court || '', publishedAt: payload.publishedAt || isoDate(), text: payload.text || payload.description || '', term: payload.term || defaultTerm, createdAt: new Date().toISOString(), ...payload });
            imported++;
          }
        }
        Store.audit('Arquivo importado', `${imported} registro(s) adicionado(s).`); this.renderAll(); this.toast(`${imported} registro(s) importado(s).`, 'success');
      } catch { this.toast('O arquivo não contém um JSON válido.', 'error'); }
      document.getElementById('jsonImportInput').value = '';
    },
    exportJson(data, filename) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    },
    toast(message, type = '') {
      const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message;
      document.getElementById('toastRegion').appendChild(toast); setTimeout(() => toast.remove(), 4300);
    }
  };

  let initialized = false;
  const boot = () => {
    if (initialized) return;
    initialized = true;
    App.init().catch(err => { console.error('App.init failed:', err); window.KellerAuth.logout(); });
  };
  window.AtriumSenda = { App, Store };
  window.JurisFlow = window.AtriumSenda;
  window.KellerCentral = window.AtriumSenda;
  window.addEventListener('keller:authenticated', boot);
  if (window.KellerAuth?.authenticated) boot();
})();

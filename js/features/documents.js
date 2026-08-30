export const DOCUMENT_TYPE_ALIASES = Object.freeze({
  contrato: 'contrato_honorarios',
  hipossuficiencia: 'declaracao_hipo',
  quesitos: 'quesitos_prev',
  prestacao_contas: 'prestacao_contas_rpv'
});

export const DOCUMENT_TYPES = Object.freeze([
  'procuracao',
  'procuracao_prev',
  'contrato_honorarios',
  'declaracao_hipo',
  'quesitos_prev',
  'prestacao_contas_rpv',
  'requerimento_inss',
  'termo_renuncia',
  'substabelecimento'
]);

export const DOCUMENT_CATALOG = Object.freeze([
  Object.freeze({
    id: 'procuracao',
    title: 'Procuração Ad Judicia et Extra',
    category: 'Contratual / Mandato',
    description: 'Poderes gerais para o foro e poderes específicos para acordos, recebimento de RPVs e levantamento de alvarás.'
  }),
  Object.freeze({
    id: 'contrato_honorarios',
    title: 'Contrato de Honorários Advocatícios (Quota Litis)',
    category: 'Financeiro / Honorários',
    description: 'Fixação de honorários sobre o proveito econômico (Art. 50 do Código de Ética e Disciplina da OAB).'
  }),
  Object.freeze({
    id: 'declaracao_hipo',
    title: 'Declaração de Hipossuficiência Econômica',
    category: 'Processual',
    description: 'Pedido de Gratuidade da Justiça conforme Art. 98 e 99 do CPC/2015.'
  }),
  Object.freeze({
    id: 'quesitos_prev',
    title: 'Quesitos Periciais Previdenciários / Médicos',
    category: 'Provas / Perícia',
    description: 'Quesitação técnica oficial para perícia médica judicial (Art. 465 do CPC).'
  }),
  Object.freeze({
    id: 'prestacao_contas_rpv',
    title: 'Termo de Prestação de Contas & Repasse de RPV',
    category: 'Prestação de Contas',
    description: 'Discriminação de valores brutos, retenções fiscais, honorários e comprovante de repasse ao cliente.'
  })
]);

export function createDocumentsFeature({
  store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  escapeHtml = value => String(value ?? ''),
  normalizeText = value => String(value ?? '').trim().toLowerCase(),
  showToast = () => {},
  getCurrentUser = () => null,
  getIsoDate = () => new Date().toISOString().slice(0, 10),
  onOpenGenerator = null,
  renderV2Catalog = null
} = {}) {
  let initialized = false;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';
  const byId = id => documentRef.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';

  function getOfficeIdentity() {
    const s = store?.state?.settings || {};
    const primaryTerm = store?.state?.terms?.[0] || {};
    const authUser = getCurrentUser?.() || {};
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
    const feeAliases = { 'quota litis': 'exito', êxito: 'exito', exito: 'exito', fixo: 'fixo', misto: 'misto' };
    const rawFeeType = String(process?.feeType || 'exito').trim().toLowerCase();
    const feeType = feeAliases[rawFeeType] || rawFeeType;
    const feePct = process?.feePercentage ?? '30';
    const hasFeeFixed = process?.feeAmount !== '' && process?.feeAmount !== null && process?.feeAmount !== undefined;
    const feeFixed = hasFeeFixed ? `R$ ${process.feeAmount}` : 'a combinar';
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

    const grossAmount = Number(process?.requisitionAmount ?? 0);
    const feePct = Number(process?.feePercentage ?? 30);
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

  const DOCUMENT_GENERATORS = Object.freeze({
    procuracao: generateProcuracaoText,
    procuracao_prev: generateProcuracaoPrevText,
    contrato_honorarios: generateContratoText,
    declaracao_hipo: generateDeclaracaoHipoText,
    quesitos_prev: generateQuesitosPrevText,
    prestacao_contas_rpv: generatePrestacaoContasRpvText,
    requerimento_inss: generateRequerimentoInssText,
    termo_renuncia: generateTermoRenunciaText,
    substabelecimento: generateSubstabelecimentoText
  });

  function resolveDocumentType(type) {
    const requested = String(type ?? '').trim();
    if (!requested) return null;
    const canonical = DOCUMENT_TYPE_ALIASES[requested] || requested;
    return Object.hasOwn(DOCUMENT_GENERATORS, canonical) ? canonical : null;
  }

  const feature = {
    get initialized() {
      return initialized;
    },

    get canonicalTypes() {
      return [...DOCUMENT_TYPES];
    },

    resolveType(type) {
      return resolveDocumentType(type);
    },

    init() {
      if (initialized) return false;
      initialized = true;
      const open = options => onOpenGenerator ? onOpenGenerator(options) : feature.openGenerator(options);
      byId('quickDocGenButton')?.addEventListener('click', () => open());
      byId('btnOpenDocGenModal')?.addEventListener('click', () => open());
      byId('btnGenDocProcess')?.addEventListener('click', () => open({ type: 'contrato_honorarios' }));
      byId('btnGenDocContact')?.addEventListener('click', () => open({ type: 'procuracao' }));
      byId('btnGenDocPrestacao')?.addEventListener('click', () => open({ type: 'prestacao_contas_rpv' }));
      byId('docGenClose')?.addEventListener('click', () => feature.closeGenerator());
      byId('docGenCancel')?.addEventListener('click', () => feature.closeGenerator());
      byId('docGeneratorBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('docGeneratorBackdrop')) feature.closeGenerator();
      });
      if (byId('docGeneratorBackdrop')) byId('docGeneratorBackdrop').onkeydown = event => feature.handleGeneratorKeydown(event);
      byId('docGenTypeSelect')?.addEventListener('change', () => feature.updatePreview());
      byId('docGenContactSelect')?.addEventListener('change', () => feature.updatePreview());
      byId('docGenProcessSelect')?.addEventListener('change', () => feature.updatePreview());
      byId('docGenCopyButton')?.addEventListener('click', () => feature.copyToClipboard());
      byId('docGenDownloadButton')?.addEventListener('click', () => feature.download());
      return true;
    },

    render() {
      const grid = byId('documentsTemplateGrid');
      if (!grid) return false;
      grid.innerHTML = isV2() && renderV2Catalog
        ? renderV2Catalog({ catalog: DOCUMENT_CATALOG, escapeHtml })
        : DOCUMENT_CATALOG.map(template => `
        <div class="prompt-card">
          <div class="prompt-card-header">
            <span class="prompt-category-badge">${escapeHtml(template.category)}</span>
            <span class="status-chip connected">Modelo Oficial</span>
          </div>
          <h4>${escapeHtml(template.title)}</h4>
          <p>${escapeHtml(template.description)}</p>
          <div class="prompt-card-actions">
            <button class="button gold btn-full" data-generate-doc-type="${escapeHtml(template.id)}">
              ⚡ Preencher e Gerar Minuta
            </button>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('[data-generate-doc-type]').forEach(button => {
        button.addEventListener('click', () => {
          if (onOpenGenerator) onOpenGenerator({ type: button.dataset.generateDocType });
          else feature.openGenerator({ type: button.dataset.generateDocType });
        });
      });
      return true;
    },

    openGenerator(options = {}) {
      const { contactId = null, processId = null } = options || {};
      const requestedType = options?.type === undefined || options?.type === null || String(options.type).trim() === ''
        ? 'procuracao'
        : options.type;
      const type = resolveDocumentType(requestedType);
      if (!type) {
        showToast('Tipo de documento não reconhecido. Selecione um modelo válido.', 'error');
        return false;
      }
      const contacts = store.state.contacts || [];
      const processes = store.state.processes || [];
      const contactSelect = byId('docGenContactSelect');
      const processSelect = byId('docGenProcessSelect');
      const typeSelect = byId('docGenTypeSelect');

      if (contactSelect) {
        contactSelect.innerHTML = `<option value="">Selecione o contato</option>${contacts.map(contact => `<option value="${escapeHtml(contact.id)}">${escapeHtml(contact.name)} (${escapeHtml(contact.document || 'sem doc')})</option>`).join('')}`;
        if (contactId && contacts.some(contact => contact.id === contactId)) contactSelect.value = contactId;
        else contactSelect.value = '';
      }

      if (processSelect) {
        processSelect.innerHTML = `<option value="">Geral / Sem processo</option>${processes.map(process => `<option value="${escapeHtml(process.id)}">${escapeHtml(process.number || process.protocol || 'Processo')} · ${escapeHtml(process.client)}</option>`).join('')}`;
        if (processId && processes.some(process => process.id === processId)) processSelect.value = processId;
      }

      if (typeSelect) {
        typeSelect.value = type;
        if (typeSelect.value !== type) {
          showToast('Tipo de documento não disponível no seletor.', 'error');
          return false;
        }
      }

      if (!feature.updatePreview()) return false;
      if (isV2()) {
        lastFocusedElement = documentRef.activeElement;
        previousBodyOverflow = documentRef.body.style.overflow;
        byId('appShell')?.setAttribute('inert', '');
      }
      byId('docGeneratorBackdrop').classList.remove('hidden');
      if (isV2()) {
        documentRef.body.style.overflow = 'hidden';
        queueMicrotask(() => byId('docGenTypeSelect')?.focus());
      }
      return true;
    },

    closeGenerator() {
      const backdrop = byId('docGeneratorBackdrop');
      const wasOpen = backdrop && !backdrop.classList.contains('hidden');
      backdrop?.classList.add('hidden');
      if (isV2()) {
        byId('appShell')?.removeAttribute('inert');
        documentRef.body.style.overflow = previousBodyOverflow;
        if (wasOpen && lastFocusedElement?.isConnected) lastFocusedElement.focus?.();
      }
    },

    handleGeneratorKeydown(event) {
      if (!isV2() || byId('docGeneratorBackdrop')?.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        feature.closeGenerator();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = byId('docGeneratorBackdrop')?.querySelector('.doc-generator-modal');
      const focusable = [...(dialog?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },

    updatePreview() {
      const type = resolveDocumentType(byId('docGenTypeSelect')?.value);
      if (!type) {
        const previewArea = byId('docGenPreviewText');
        if (previewArea) previewArea.value = '';
        showToast('Tipo de documento não reconhecido. Selecione um modelo válido.', 'error');
        return false;
      }
      const contactId = byId('docGenContactSelect')?.value;
      const processId = byId('docGenProcessSelect')?.value;
      const contact = store.state.contacts.find(item => item.id === contactId);
      const process = store.state.processes.find(item => item.id === processId);

      if (type === 'contrato_honorarios' && process?.feeType) {
        const normalizedFeeType = normalizeText(String(process.feeType)).replace(/\s+/g, ' ');
        const knownFeeTypes = new Set(['exito', 'êxito', 'quota litis', 'fixo', 'misto']);
        if (!knownFeeTypes.has(normalizedFeeType)) {
          const previewArea = byId('docGenPreviewText');
          if (previewArea) previewArea.value = '';
          showToast('O tipo de honorários do processo não é canônico. Revise os dados antes de gerar o contrato.', 'error');
          return false;
        }
      }

      const text = DOCUMENT_GENERATORS[type](contact, process);
      const previewArea = byId('docGenPreviewText');
      if (previewArea) previewArea.value = text;
      const typeContext = byId('docGenContextType');
      const contactContext = byId('docGenContextContact');
      const processContext = byId('docGenContextProcess');
      if (typeContext) typeContext.textContent = byId('docGenTypeSelect')?.selectedOptions?.[0]?.textContent || 'Documento';
      if (contactContext) contactContext.textContent = byId('docGenContactSelect')?.selectedOptions?.[0]?.textContent || 'Sem contato selecionado';
      if (processContext) processContext.textContent = byId('docGenProcessSelect')?.selectedOptions?.[0]?.textContent || 'Geral / Sem processo';
      return true;
    },

    async copyToClipboard() {
      const area = byId('docGenPreviewText');
      const text = area.value;
      try {
        await navigatorRef.clipboard.writeText(text);
        showToast('Minuta copiada para a área de transferência!', 'success');
      } catch {
        area.select();
        documentRef.execCommand('copy');
        showToast('Minuta copiada!', 'success');
      }
    },

    download() {
      const type = byId('docGenTypeSelect').value;
      const text = byId('docGenPreviewText').value;
      const filename = `${type}-${getIsoDate()}.md`;
      const blob = new windowRef.Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = windowRef.URL.createObjectURL(blob);
      const anchor = documentRef.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      windowRef.URL.revokeObjectURL(url);
      showToast(`Arquivo ${filename} baixado com sucesso.`, 'success');
    }
  };

  return feature;
}

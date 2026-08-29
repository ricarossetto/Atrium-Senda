import { Store, STORE_PERSISTENCE_CONFLICT_EVENT, isoDate, uid } from './core/store.js';
import { createGlobalSearch } from './components/global-search.js';
import { createModal } from './components/modal.js';
import { createOnboarding } from './components/onboarding.js';
import { createTheme } from './components/theme.js';
import { Toast } from './components/toast.js';
import { createAgendaFeature } from './features/agenda.js';
import { createContactsFeature } from './features/contacts.js';
import { createFinancialFeature } from './features/financial.js';
import { createLeadsFeature } from './features/leads.js';
import { classifyIntimationAct, createPublicationsFeature } from './features/publications.js';
import { createProcessesFeature } from './features/processes.js';
import { createTasksFeature } from './features/tasks.js';

(() => {
  'use strict';

  const TERMINAL_STATUSES = ['concluida', 'concluido', 'arquivada', 'arquivado', 'finalizada', 'cancelada'];

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  function normalizeExternalUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    } catch { return ''; }
  }
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
    // Code blocks
    html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`);
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => `<pre><code>${code.trim()}</code></pre>`);
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headings
    html = html.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');
    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
    // Bold & Italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Unordered lists
    html = html.replace(/^\s*[-•*]\s+(.*)$/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    // Ordered lists
    html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<ol><li>$1</li></ol>');
    html = html.replace(/<\/ol>\s*<ol>/g, '');
    // Paragraphs
    const blocks = html.split(/\n{2,}/);
    html = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[2-4]|ul|ol|pre|blockquote)/i.test(trimmed)) return trimmed;
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

  function formatCurrency(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

  const byId = id => document.getElementById(id);

  let globalSearchComponent;
  let modalComponent;
  let onboardingComponent;
  let themeComponent;
  let agendaFeature;
  let contactsFeature;
  let financialFeature;
  let leadsFeature;
  let publicationsFeature;
  let processesFeature;
  let tasksFeature;

  function getGlobalSearchComponent() {
    globalSearchComponent ||= createGlobalSearch({
      getState: () => Store.state,
      normalizeText,
      escapeHtml,
      formatDate,
      onSelect: selection => App.handleGlobalSearchSelection(selection)
    });
    return globalSearchComponent;
  }

  function getModalComponent() {
    modalComponent ||= createModal({
      escapeHtml,
      onModeChange: modalMode => { App.modalMode = modalMode; }
    });
    return modalComponent;
  }

  function getOnboardingComponent() {
    onboardingComponent ||= createOnboarding({
      getSettings: () => Store.state?.settings,
      saveState: () => Store.save(),
      showToast: (message, type) => App.toast(message, type),
      onSlideChange: slide => { App.currentTourSlide = slide; },
      onTimerChange: timer => { App.tourTimer = timer; }
    });
    return onboardingComponent;
  }

  function getThemeComponent() {
    themeComponent ||= createTheme({
      showToast: (message, type) => App.toast(message, type),
      onChange: theme => { App.currentTheme = theme; }
    });
    return themeComponent;
  }

  function getPublicationsFeature() {
    publicationsFeature ||= createPublicationsFeature({
      store: Store,
      escapeHtml,
      formatDate,
      formatDateTime,
      showToast: (message, type) => App.toast(message, type),
      onOpenTask: task => App.openTaskModal(task),
      onOpenIntimation: () => App.openIntimationModal(),
      onImportJson: file => App.importJson(file),
      onRenderGlobalMetrics: () => App.renderMetrics(),
      onSyncAppState: () => {
        window.setTimeout(() => window.location.reload(), 700);
      }
    });
    return publicationsFeature;
  }

  function linkTaskToPublication({ record, currentActor }) {
    if (!record.intimationId) return;
    const intimation = Store.state.intimations.find(item => item.id === record.intimationId);
    if (!intimation) return;
    if (!Array.isArray(intimation.linkedTaskIds)) intimation.linkedTaskIds = [];
    if (!intimation.linkedTaskIds.includes(record.id)) intimation.linkedTaskIds.push(record.id);
    intimation.taskId = record.id;
    if (!intimation.treatmentStatus || intimation.treatmentStatus === 'untreated') {
      intimation.treatmentStatus = 'in_review';
      intimation.treatmentStartedAt = intimation.treatmentStartedAt || new Date().toISOString();
      intimation.treatmentStartedBy = intimation.treatmentStartedBy || currentActor;
    }
    Store.audit('Tarefa criada a partir de publicação', `${record.title} · ${intimation.process || intimation.id}`);
  }

  function analyzeTaskWithAi(description) {
    App.switchView('assistant');
    const aiInput = document.getElementById('aiChatInput');
    if (aiInput) {
      aiInput.value = `Por favor, analise a seguinte intimação judicial, estime preliminarmente os prazos em dias úteis (CPC/2015), explicite as hipóteses usadas e sugira providências para conferência humana. Não trate a estimativa como prazo fatal confirmado.\n\n${description}`;
      aiInput.focus();
    }
  }

  function getTasksFeature() {
    tasksFeature ||= createTasksFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      navigatorRef: navigator,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      daysUntil,
      decodeHtmlEntities,
      initials: name => App.initials(name),
      isTerminalStatus: status => TERMINAL_STATUSES.includes(status),
      getCurrentUserName: () => window.KellerAuth?.currentUser?.displayName,
      openModal: (...args) => App.openModal(...args),
      closeModal: () => App.closeModal(),
      showToast: (message, type) => App.toast(message, type),
      onRenderAll: () => App.renderAll(),
      onAnalyzeWithAi: analyzeTaskWithAi,
      onTaskSaved: linkTaskToPublication
    });
    return tasksFeature;
  }

  function getProcessesFeature() {
    processesFeature ||= createProcessesFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      sortRecords,
      updateTableSortHeaders,
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      openExternalUrl: (...args) => window.open(...args),
      copyToClipboard: value => navigator.clipboard.writeText(value),
      getLinkedTasks: processNumber => Store.state.tasks.filter(task => processNumber && String(task.process || '').trim() === processNumber),
      getLinkedIntimations: processNumber => Store.state.intimations.filter(item => processNumber && String(item.process || '').trim() === processNumber),
      isTerminalStatus: status => TERMINAL_STATUSES.includes(status)
    });
    return processesFeature;
  }

  function getContactsFeature() {
    contactsFeature ||= createContactsFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatDate,
      sortRecords,
      updateTableSortHeaders,
      openModal: (...args) => App.openModal(...args)
    });
    return contactsFeature;
  }

  function getLeadsFeature() {
    leadsFeature ||= createLeadsFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatDate,
      formatCurrency,
      openModal: (...args) => App.openModal(...args),
      getCurrentUserName: () => window.KellerAuth?.currentUser?.displayName
    });
    return leadsFeature;
  }

  function getFinancialFeature() {
    financialFeature ||= createFinancialFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatCurrency,
      showToast: (message, type) => App.toast(message, type),
      renderDashboardFinancialWidgets: () => App.renderAstreaWidgets()
    });
    return financialFeature;
  }

  function getAgendaFeature() {
    agendaFeature ||= createAgendaFeature({
      store: Store,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      classifyIntimation: item => classifyIntimationAct(item.text, item.title, item.type),
      getIntimationParties: item => App.intimationParties(item),
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      onOpenTask: task => App.openTaskModal(task),
      onOpenIntimation: item => App.openIntimationDetailModal(item)
    });
    return agendaFeature;
  }

  const App = {
    currentView: 'dashboard',
    get inboxFilter() { return getPublicationsFeature().inboxFilter; },
    set inboxFilter(value) { getPublicationsFeature().inboxFilter = value; },
    get inboxSort() { return getPublicationsFeature().inboxSort; },
    set inboxSort(value) { getPublicationsFeature().inboxSort = value; },
    get inboxCutoff() { return getPublicationsFeature().inboxCutoff; },
    set inboxCutoff(value) { getPublicationsFeature().inboxCutoff = value; },
    currentTourSlide: 0,
    tempOfficeLogo: null,
    get selectedIntimation() { return getPublicationsFeature().selectedIntimation; },
    set selectedIntimation(value) { getPublicationsFeature().selectedIntimation = value; },
    configurationSection: 'taskDefinitions',
    modalMode: null,
    judicialStatus: null,
    get agendaSelectedDate() { return getAgendaFeature().selectedDate; },
    set agendaSelectedDate(value) { getAgendaFeature().selectedDate = value; },
    get agendaCalendarMonthOffset() { return getAgendaFeature().calendarMonthOffset; },
    set agendaCalendarMonthOffset(value) { getAgendaFeature().calendarMonthOffset = value; },
    get agendaTypeFilter() { return getAgendaFeature().typeFilter; },
    set agendaTypeFilter(value) { getAgendaFeature().typeFilter = value; },
    get activeTimeSheetTaskId() { return getTasksFeature().activeTimeSheetTaskId; },
    get timeSheetStartedAt() { return getTasksFeature().timeSheetStartedAt; },
    get timeSheetInterval() { return getTasksFeature().timeSheetInterval; },
    aiChatHistory: [],
    aiConfigured: false,
    isAiTyping: false,
    authUsers: [],
    currentAuthRole: 'collaborator',
    promptsFilter: { search: '', category: 'all', type: 'all' },
    async init() {
      await Store.load();
      await this.loadAuthUsers();
      this.initTheme();
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
    initials(name) {
      if (!name) return 'AD';
      const parts = String(name).trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return 'AD';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },
    initTheme() {
      getThemeComponent().init();
    },
    setTheme(theme) {
      getThemeComponent().setTheme(theme);
    },
    toggleTheme() {
      getThemeComponent().toggleTheme();
    },
    bindNavigation() {
      const sidebar = document.getElementById('sidebar');
      const isCollapsed = localStorage.getItem('atrium_sidebar_collapsed') === 'true';
      if (isCollapsed && sidebar) sidebar.classList.add('collapsed');

      document.getElementById('sidebarToggleBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar?.classList.toggle('collapsed');
        localStorage.setItem('atrium_sidebar_collapsed', sidebar?.classList.contains('collapsed') ? 'true' : 'false');
      });

      document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => this.switchView(button.dataset.view)));
      document.addEventListener('click', event => { const link = event.target.closest('[data-view-link]'); if (link) this.switchView(link.dataset.viewLink); });
      document.getElementById('menuToggle')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          this.closeModal();
          this.closeJudicialSetup();
          this.closeOfficeSetup();
          this.closeCalendarConfigModal();
          this.closeGeminiKeyModal();
          this.closeFinancialEntryModal();
          this.closePublicationEmailModal();
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
      getOnboardingComponent().init();
      byId('newConfigurationButton')?.addEventListener('click', () => this.openConfigurationModal());
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

      getModalComponent().init();
      byId('modalForm')?.addEventListener('submit', event => this.handleModalSubmit(event));
      getTasksFeature().init();
      getProcessesFeature().init();
      getContactsFeature().init();
      getLeadsFeature().init();
      getFinancialFeature().init();
      getAgendaFeature().init();
      getPublicationsFeature().init();
      byId('configurationSearch')?.addEventListener('input', () => this.renderConfiguration(byId('configurationSearch').value));
      byId('configurationTabs')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-config-section]'); if (!button) return;
        this.configurationSection = button.dataset.configSection;
        if (byId('configurationSearch')) byId('configurationSearch').value = '';
        if (this.configurationSection === 'users') this.loadAuthUsers().then(() => this.renderConfiguration());
        else this.renderConfiguration();
      });

      // Alertas & Auditoria
      byId('auditFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-audit-filter]'); if (!button) return;
        this.auditFilter = button.dataset.auditFilter;
        byId('auditFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderAudit(this.auditFilter, byId('auditSearch')?.value);
      });
      byId('auditSearch')?.addEventListener('input', () => this.renderAudit(this.auditFilter, byId('auditSearch').value));
      byId('btnExportAuditLog')?.addEventListener('click', () => this.exportJson(Store.state.audit, `atrium-auditoria-${isoDate()}.json`));
      byId('btnClearAuditLog')?.addEventListener('click', () => {
        this.auditFilter = 'all';
        if (byId('auditSearch')) byId('auditSearch').value = '';
        byId('auditFilters')?.querySelectorAll('button').forEach((item, idx) => item.classList.toggle('active', idx === 0));
        this.renderAudit('all', '');
        this.toast('Filtros de auditoria redefinidos.', 'info');
      });

      getGlobalSearchComponent().init();
      byId('exportAuditButton')?.addEventListener('click', () => this.exportJson(Store.state.audit, `atrium-auditoria-${isoDate()}.json`));

      // Área de Trabalho (Astrea)
      byId('btnDashboardNewTask')?.addEventListener('click', () => this.openTaskModal());
      byId('astreaTaskSortSelect')?.addEventListener('change', event => {
        this.astreaTaskSort = event.target.value;
        this.renderAstreaTasks();
      });
      byId('astreaTaskFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-astrea-filter]'); if (!button) return;
        this.astreaTaskFilter = button.dataset.astreaFilter;
        byId('astreaTaskFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderAstreaTasks();
      });

      // Financeiro & Requisições
      byId('btnGenDocPrestacao')?.addEventListener('click', () => this.openDocumentGenerator({ type: 'prestacao_contas' }));

      // Documentos & Minutas
      byId('btnOpenDocGenModal')?.addEventListener('click', () => this.openDocumentGenerator());

      // Agenda Externa
      byId('configureCalendarButton')?.addEventListener('click', () => this.openCalendarConfigModal());
      byId('calendarConfigClose')?.addEventListener('click', () => this.closeCalendarConfigModal());
      byId('calendarConfigCancel')?.addEventListener('click', () => this.closeCalendarConfigModal());
      byId('calendarConfigBackdrop')?.addEventListener('click', event => { if (event.target === byId('calendarConfigBackdrop')) this.closeCalendarConfigModal(); });
      byId('calendarConfigForm')?.addEventListener('submit', event => this.handleCalendarConfigSubmit(event));

      // Assistente IA (Google Gemini) & Codex Legal Skills
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

      // Codex Legal Skills Selector
      const skillSelect = byId('codexSkillSelect');
      const skillDesc = byId('codexSkillDescription');
      const updateSkillDesc = () => {
        const skills = window.CODEX_LEGAL_SKILLS || [];
        const sel = skillSelect?.value;
        const current = skills.find(s => s.id === sel);
        if (skillDesc && current) {
          skillDesc.textContent = `${current.title}: ${current.description}`;
        }
      };
      if (skillSelect) {
        skillSelect.addEventListener('change', updateSkillDesc);
        updateSkillDesc();
      }
      byId('btnApplyCodexSkill')?.addEventListener('click', () => {
        const skills = window.CODEX_LEGAL_SKILLS || [];
        const sel = skillSelect?.value;
        const current = skills.find(s => s.id === sel);
        if (current) {
          const input = byId('aiChatInput');
          if (input) {
            input.value = `[$${current.id}]\n${current.instructions.slice(0, 450)}...\n\n[INSTRUÇÃO DO USUÁRIO]: `;
            input.focus();
          }
          this.toast(`Skill "${current.name}" carregada no prompt.`, 'success');
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
            getProcessesFeature().handleSort(field);
          } else if (table === 'contact') {
            getContactsFeature().handleSort(field);
          }
        });
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
      byId('btnConfigureEmail')?.addEventListener('click', () => this.openEmailConfigModal());
      byId('emailConfigClose')?.addEventListener('click', () => this.closeEmailConfigModal());
      byId('emailConfigCancel')?.addEventListener('click', () => this.closeEmailConfigModal());
      byId('emailConfigForm')?.addEventListener('submit', (e) => this.submitEmailConfig(e));
      byId('btnTestEmail')?.addEventListener('click', () => this.openEmailTestModal());
      byId('emailTestClose')?.addEventListener('click', () => this.closeEmailTestModal());
      byId('emailTestCancel')?.addEventListener('click', () => this.closeEmailTestModal());
      byId('emailTestForm')?.addEventListener('submit', (e) => this.submitEmailTest(e));
      byId('btnAddEmailReceiver')?.addEventListener('click', () => this.openEmailReceiverModal());
      byId('emailReceiverModalClose')?.addEventListener('click', () => this.closeEmailReceiverModal());
      byId('receiverCancelBtn')?.addEventListener('click', () => this.closeEmailReceiverModal());
      byId('emailReceiverModalBackdrop')?.addEventListener('click', (e) => {
        if (e.target === byId('emailReceiverModalBackdrop')) this.closeEmailReceiverModal();
      });
      byId('receiverTypeInternal')?.addEventListener('change', () => {
        byId('receiverInternalFields')?.classList.remove('hidden');
        byId('receiverExternalFields')?.classList.add('hidden');
      });
      byId('receiverTypeExternal')?.addEventListener('change', () => {
        byId('receiverInternalFields')?.classList.add('hidden');
        byId('receiverExternalFields')?.classList.remove('hidden');
      });
      byId('emailReceiverForm')?.addEventListener('submit', (e) => this.submitEmailReceiver(e));
      byId('emailReceiversList')?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('[data-receiver-action="toggle"]');
        if (toggleBtn) {
          const id = toggleBtn.dataset.receiverId;
          const currentEnabled = toggleBtn.dataset.receiverEnabled === 'true';
          this.toggleEmailReceiver(id, currentEnabled);
          return;
        }
        const editBtn = e.target.closest('[data-receiver-action="edit"]');
        if (editBtn) {
          const id = editBtn.dataset.receiverId;
          const receiver = (this.emailReceivers || []).find(r => r.id === id);
          if (receiver) this.openEmailReceiverModal(receiver);
          return;
        }
        const delBtn = e.target.closest('[data-receiver-action="delete"]');
        if (delBtn) {
          const id = delBtn.dataset.receiverId;
          this.deleteEmailReceiver(id);
          return;
        }
      });
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
        const authStatusBtn = e.target.closest('[data-auth-user-status]');
        if (authStatusBtn) {
          e.preventDefault();
          e.stopPropagation();
          const row = authStatusBtn.closest('[data-auth-user-id]');
          if (row) this.manageAuthUser(row.dataset.authUserId, authStatusBtn.dataset.authUserStatus);
          return;
        }
        const row = e.target.closest('[data-config-index]');
        if (row) {
          const index = Number(row.dataset.configIndex);
          const raw = Array.isArray(Store.state.configuration[this.configurationSection]) ? Store.state.configuration[this.configurationSection] : [];
          const item = raw[index];
          if (item !== undefined) this.openConfigurationModal(item, index);
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
      if (view === 'dashboard') this.renderDashboard();
      if (view === 'inbox') this.renderInbox();
      if (view === 'kanban') this.renderKanban();
      if (view === 'processes') this.renderProcesses(document.getElementById('processSearch')?.value || '');
      if (view === 'contacts') this.renderContacts(document.getElementById('contactSearch')?.value || '');
      if (view === 'leads') this.renderLeads();
      if (view === 'financial') this.renderFinancial();
      if (view === 'documents') this.renderDocuments();
      if (view === 'agenda') this.renderAgenda();
      if (view === 'monitoring') this.renderMonitoring();
      if (view === 'prompts') this.renderPrompts();
      if (view === 'links') this.renderLinks();
      if (view === 'configuration') this.renderConfiguration();
      if (view === 'audit') this.renderAudit();
      if (view === 'integrations') { this.refreshJudicialStatus(); this.loadEmailStatus(); }
      document.getElementById('sidebar').classList.remove('open');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    renderAll() {
      ['renderOfficeIdentity', 'renderDashboard', 'renderInbox', 'renderKanban', 'renderProcesses', 'renderContacts', 'renderLeads', 'renderFinancial', 'renderDocuments', 'renderAgenda', 'renderMonitoring', 'renderPrompts', 'renderLinks', 'renderConfiguration', 'renderAudit'].forEach(method => {
        try { this[method]?.(); } catch (error) { console.error(`Falha em ${method}:`, error); }
      });
    },
    renderOfficeIdentity() {
      const s = Store?.state?.settings || {};
      const officeName = s.officeName || 'Meu Escritório';
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
          avatarEl.style.backgroundImage = "url('assets/icons/team.svg')";
          avatarEl.style.backgroundSize = 'cover';
          avatarEl.style.backgroundPosition = 'center';
        }
      }
    },
    openOfficeSetup() {
      const s = Store.state.settings || {};
      const primaryTerm = Store.state.terms?.[0] || {};
      document.getElementById('officeInputName').value = s.officeName || 'Meu Escritório';
      document.getElementById('officeInputSlogan').value = s.officeSlogan || 'Desde 1983';
      document.getElementById('officeInputLawyer').value = s.lawyerName || primaryTerm.name || 'Advogado(a) Titular';
      document.getElementById('officeInputOab').value = s.lawyerOab || primaryTerm.registration || 'OAB/UF 000000';
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
      getOnboardingComponent().checkFirstAccess();
    },
    openGuidedTour(force = false) {
      getOnboardingComponent().open(force);
    },
    closeGuidedTour() {
      getOnboardingComponent().close();
    },
    showTourSlide(index) {
      getOnboardingComponent().showSlide(index);
    },
    renderDashboard() {
      this.renderOfficeIdentity();
      this.renderMetrics();
      this.renderAstreaTasks();
      this.renderAstreaWidgets();
    },
    renderMetrics() {
      const untreatedIntimations = getPublicationsFeature().getUntreatedCount();
      const deadlines = Store.state.tasks.filter(task => !TERMINAL_STATUSES.includes(task.status) && daysUntil(task.deadline) >= 0 && daysUntil(task.deadline) <= 7).length;
      const activeProcesses = (Store.state.processes || []).filter(process => process.monitoring !== 'inactive').length;
      const activeSources = Store.state.sources.filter(source => source.status === 'ok').length;
      const mInbox = document.getElementById('metricInbox');
      const mDead = document.getElementById('metricDeadlines');
      const mTasks = document.getElementById('metricTasks');
      const mSources = document.getElementById('metricSources');
      const inBadge = document.getElementById('inboxBadge');
      const notifDot = document.getElementById('notificationDot');
      if (mInbox) mInbox.textContent = untreatedIntimations;
      if (mDead) mDead.textContent = deadlines;
      if (mTasks) mTasks.textContent = activeProcesses;
      if (mSources) mSources.textContent = `${activeSources}/${Store.state.sources.length}`;
      if (inBadge) {
        inBadge.textContent = untreatedIntimations;
        inBadge.style.display = untreatedIntimations > 0 ? 'inline-block' : 'none';
      }
      if (notifDot) notifDot.style.display = untreatedIntimations ? '' : 'none';
      this.renderPublicationsMetrics();
    },
    renderPublicationsMetrics() {
      return getPublicationsFeature().renderMetrics();
    },
    renderAstreaTasks() {
      const listEl = document.getElementById('astreaTaskList');
      if (!listEl) return;
      const filter = this.astreaTaskFilter || 'all';
      const sort = this.astreaTaskSort || 'date-asc';
      const tasks = Store.state.tasks || [];
      const processes = Store.state.processes || [];

      let filtered = tasks.filter(t => {
        if (TERMINAL_STATUSES.includes(t.status)) return false;
        if (filter === 'all') return true;
        const lower = String(t.title || '').toLowerCase() + ' ' + String(t.type || '').toLowerCase();
        if (filter === 'prazo') return lower.includes('prazo') || lower.includes('decisão') || lower.includes('recurso');
        if (filter === 'audiencia') return lower.includes('audiência') || lower.includes('audiencia') || lower.includes('julgamento');
        if (filter === 'tarefa') return !lower.includes('audiência') && !lower.includes('prazo');
        return true;
      });

      filtered.sort((a, b) => {
        const procA = processes.find(p => (a.process && p.number === a.process) || (a.client && p.client === a.client));
        const procB = processes.find(p => (b.process && p.number === b.process) || (b.client && p.client === b.client));
        const clientA = a.client || procA?.client || a.title || '';
        const clientB = b.client || procB?.client || b.title || '';
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;

        if (sort === 'date-asc') {
          return (daysUntil(a.deadline) - daysUntil(b.deadline)) || (a.priority === 'urgente' ? -1 : 1);
        }
        if (sort === 'date-desc') {
          return (daysUntil(b.deadline) - daysUntil(a.deadline)) || (a.priority === 'urgente' ? -1 : 1);
        }
        if (sort === 'name-asc') {
          return clientA.localeCompare(clientB, 'pt-BR');
        }
        if (sort === 'difficulty-desc') {
          return (pointsB - pointsA) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        }
        if (sort === 'difficulty-asc') {
          return (pointsA - pointsB) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        }
        if (sort === 'priority') {
          const prioScore = (item) => (item.priority === 'urgente' ? 3 : item.priority === 'importante' ? 2 : 1);
          return (prioScore(b) - prioScore(a)) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        }
        return (daysUntil(a.deadline) - daysUntil(b.deadline));
      });

      const countEl = document.getElementById('astreaTaskCount');
      if (countEl) countEl.textContent = `${filtered.length} tarefas`;

      if (!filtered.length) {
        listEl.innerHTML = '<div class="empty-column" style="padding:24px;text-align:center;"><p>✓ Nenhuma tarefa pendente neste filtro.</p></div>';
        return;
      }

      listEl.innerHTML = filtered.map(task => {
        const proc = processes.find(p => (task.process && p.number === task.process) || (task.client && p.client === task.client));
        const clientName = task.client || proc?.client || 'Atividade interna';
        const processNum = task.process || proc?.number || '';
        const courtName = proc?.court || proc?.county || task.court || '';
        const points = Number(task.points) || 0;

        const titleLower = String(task.title || '').toLowerCase();
        let typeBadge = 'tarefa';
        let typeLabel = 'Tarefa';
        if (titleLower.includes('prazo') || titleLower.includes('recurso') || titleLower.includes('decisão')) {
          typeBadge = 'prazo';
          typeLabel = 'Prazo';
        } else if (titleLower.includes('audiência') || titleLower.includes('audiencia') || titleLower.includes('julgamento')) {
          typeBadge = 'audiencia';
          typeLabel = 'Audiência';
        } else if (titleLower.includes('reunião') || titleLower.includes('reuniao') || titleLower.includes('atendimento')) {
          typeBadge = 'reuniao';
          typeLabel = 'Reunião';
        }

        const days = daysUntil(task.deadline);
        const dateFormatted = task.deadline ? formatDate(task.deadline) : 'Sem data';
        const dateClass = days < 0 ? 'style="color:var(--danger);font-weight:700;"' : days <= 2 ? 'style="color:var(--warning);font-weight:700;"' : '';

        const difficultyText = points >= 50 ? 'Alta Complexidade' : points >= 20 ? 'Média' : points > 0 ? 'Básica' : '';

        return `
          <div class="astrea-task-item" data-astrea-task-id="${escapeHtml(task.id)}">
            <input type="checkbox" class="astrea-task-check" data-complete-task-id="${escapeHtml(task.id)}" title="Concluir tarefa">
            <div class="astrea-task-body">
              <div class="astrea-task-title">${escapeHtml(task.title)}</div>
              <div class="astrea-task-process" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0 6px 0;font-size:12px;">
                <strong>👤 ${escapeHtml(clientName)}</strong>
                ${processNum ? `<span style="color:var(--muted)">· 📁 <b>${escapeHtml(processNum)}</b></span>` : ''}
                ${courtName ? `<span style="color:var(--muted)">· ⚖️ <em>${escapeHtml(courtName)}</em></span>` : ''}
              </div>
              <div class="astrea-task-tags">
                <span class="task-tag ${typeBadge}">${typeLabel}</span>
                ${task.responsible ? `<span class="task-tag user">👤 ${escapeHtml(task.responsible)}</span>` : ''}
                ${points ? `<span class="task-tag points" style="background:rgba(212,175,55,0.15);color:var(--gold);font-weight:600;">⚡ ${points} pts${difficultyText ? ` (${difficultyText})` : ''}</span>` : ''}
                ${task.priority === 'urgente' ? `<span class="task-tag" style="background:rgba(239,68,68,0.15);color:var(--danger);font-weight:700;">URGENTE</span>` : ''}
              </div>
            </div>
            <div class="astrea-task-date" ${dateClass}>${dateFormatted}</div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('[data-astrea-task-id]').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('[data-complete-task-id]')) return;
          const task = Store.state.tasks.find(t => t.id === item.dataset.astreaTaskId);
          if (task) this.openTaskModal(task);
        });
      });

      listEl.querySelectorAll('[data-complete-task-id]').forEach(chk => {
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          const task = getTasksFeature().completeTask(chk.dataset.completeTaskId);
          if (task) {
            this.renderAll();
            this.toast('Tarefa concluída com sucesso!', 'success');
          }
        });
      });
    },
    renderAstreaWidgets() {
      const tasks = Store.state.tasks || [];
      const completed = tasks.filter(t => TERMINAL_STATUSES.includes(t.status)).length;
      const late = tasks.filter(t => !TERMINAL_STATUSES.includes(t.status) && daysUntil(t.deadline) < 0).length;
      const pending = tasks.filter(t => !TERMINAL_STATUSES.includes(t.status) && daysUntil(t.deadline) >= 0).length;

      const compEl = document.getElementById('widgetCompletedTasks');
      const lateEl = document.getElementById('widgetLateTasks');
      const pendEl = document.getElementById('widgetPendingTasks');
      if (compEl) compEl.textContent = completed;
      if (lateEl) lateEl.textContent = late;
      if (pendEl) pendEl.textContent = pending;

      const processes = Store.state.processes || [];
      const procActive = processes.filter(p => !p.archived).length;
      const pActiveEl = document.getElementById('widgetProcActive');
      const pInactiveEl = document.getElementById('widgetProcInactive');
      if (pActiveEl) pActiveEl.textContent = procActive;
      if (pInactiveEl) pInactiveEl.textContent = Math.max(0, processes.length - procActive);

      const leads = Store.state.leads || [];
      const activeLeads = leads.filter(l => l.status !== 'fechado' && l.status !== 'declinado').length;
      const lEl = document.getElementById('widgetActiveLeads');
      if (lEl) lEl.textContent = activeLeads;

      let totalHonorariosAFaturar = 0;
      processes.forEach(p => {
        const isPaid = p.feeStatus === 'pago' || p.feeStatus === 'quitado' || p.requisitionStatus === 'repassado' || p.requisitionStatus === 'pago';
        if (isPaid) return;

        if (p.feeType === 'fixo' && p.feeAmount) {
          totalHonorariosAFaturar += Number(p.feeAmount);
        } else if (p.feeType === 'mensal' && p.feeMonthly) {
          totalHonorariosAFaturar += Number(p.feeMonthly);
        } else if (p.feeType === 'misto') {
          if (p.feeAmount) totalHonorariosAFaturar += Number(p.feeAmount);
          if (p.feeMonthly) totalHonorariosAFaturar += Number(p.feeMonthly);
        } else if (p.feePercentage) {
          const feePct = Number(p.feePercentage);
          const baseValue = Number(p.requisitionAmount ?? p.rpvAmount ?? p.economicValue ?? 0);
          if (baseValue > 0) {
            totalHonorariosAFaturar += (baseValue * feePct / 100);
          } else if (p.feeAmount) {
            totalHonorariosAFaturar += Number(p.feeAmount);
          }
        } else if (p.feeAmount) {
          totalHonorariosAFaturar += Number(p.feeAmount);
        }
      });
      const honEl = document.getElementById('widgetHonorariosPending');
      if (honEl) honEl.textContent = formatCurrency(totalHonorariosAFaturar);

      const thirtyDaysAgo = Date.now() - 30 * 86400000;
      let totalMinutes30d = 0;
      tasks.forEach(t => {
        if (Array.isArray(t.timeLogs)) {
          t.timeLogs.forEach(log => {
            const logTime = new Date(log.date || log.at || log.createdAt || 0).getTime();
            if (!log.date || logTime >= thirtyDaysAgo) {
              totalMinutes30d += Number(log.minutes || 0);
            }
          });
        }
      });
      const tsEl = document.getElementById('widgetTimesheetHours');
      if (tsEl) tsEl.textContent = formatMinutes(totalMinutes30d) || '0h 0m';

      const docCountEl = document.getElementById('widgetDocsCount');
      if (docCountEl) docCountEl.textContent = Store.state.customDocs?.length || 5;

      const remindersEl = document.getElementById('astreaRemindersList');
      if (remindersEl) {
        const agenda = Store.state.agenda || [];
        const upcomingAgenda = agenda.slice(0, 4);
        if (!upcomingAgenda.length) {
          remindersEl.innerHTML = '<div class="empty-column" style="padding:8px;"><small style="color:var(--muted);">Nenhum lembrete imediato.</small></div>';
        } else {
          remindersEl.innerHTML = upcomingAgenda.map(item => `
            <div class="astrea-reminder-item" data-agenda-id="${escapeHtml(item.id)}" style="cursor:pointer;">
              <span class="astrea-reminder-date">${formatDate(item.date)}</span>
              <div><strong>${escapeHtml(item.title)}</strong><small style="display:block;color:var(--muted);">${escapeHtml(item.client || item.process || 'Compromisso')}</small></div>
            </div>
          `).join('');
          remindersEl.querySelectorAll('[data-agenda-id]').forEach(el => {
            el.addEventListener('click', () => {
              const ev = Store.state.agenda.find(a => a.id === el.dataset.agendaId);
              if (ev) this.openAgendaModal(ev);
            });
          });
        }
      }
    },
    renderLeads(query = '') {
      return getLeadsFeature().render(query);
    },
    openLeadModal(defaults = {}) {
      return getLeadsFeature().openLeadModal(defaults);
    },
    renderFinancial(query = '') {
      return getFinancialFeature().render(query);
    },
    openFinancialEntryModal() {
      return getFinancialFeature().openEntryModal();
    },
    closeFinancialEntryModal() {
      return getFinancialFeature().closeEntryModal();
    },
    updateFinancialModalSummary() {
      return getFinancialFeature().updateModalSummary();
    },
    handleFinancialEntrySubmit(event) {
      return getFinancialFeature().handleEntrySubmit(event);
    },
    renderDocuments() {
      const grid = document.getElementById('documentsTemplateGrid');
      if (!grid) return;
      const templates = [
        {
          id: 'procuracao',
          title: 'Procuração Ad Judicia et Extra',
          category: 'Contratual / Mandato',
          description: 'Poderes gerais para o foro e poderes específicos para acordos, recebimento de RPVs e levantamento de alvarás.'
        },
        {
          id: 'contrato',
          title: 'Contrato de Honorários Advocatícios (Quota Litis)',
          category: 'Financeiro / Honorários',
          description: 'Fixação de honorários sobre o proveito econômico (Art. 50 do Código de Ética e Disciplina da OAB).'
        },
        {
          id: 'hipossuficiencia',
          title: 'Declaração de Hipossuficiência Econômica',
          category: 'Processual',
          description: 'Pedido de Gratuidade da Justiça conforme Art. 98 e 99 do CPC/2015.'
        },
        {
          id: 'quesitos',
          title: 'Quesitos Periciais Previdenciários / Médicos',
          category: 'Provas / Perícia',
          description: 'Quesitação técnica oficial para perícia médica judicial (Art. 465 do CPC).'
        },
        {
          id: 'prestacao_contas',
          title: 'Termo de Prestação de Contas & Repasse de RPV',
          category: 'Prestação de Contas',
          description: 'Discriminação de valores brutos, retenções fiscais, honorários e comprovante de repasse ao cliente.'
        }
      ];

      grid.innerHTML = templates.map(t => `
        <div class="prompt-card">
          <div class="prompt-card-header">
            <span class="prompt-category-badge">${escapeHtml(t.category)}</span>
            <span class="status-chip connected">Modelo Oficial</span>
          </div>
          <h4>${escapeHtml(t.title)}</h4>
          <p>${escapeHtml(t.description)}</p>
          <div class="prompt-card-actions">
            <button class="button gold btn-full" data-generate-doc-type="${escapeHtml(t.id)}">
              ⚡ Preencher e Gerar Minuta
            </button>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('[data-generate-doc-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.openDocumentGenerator({ type: btn.dataset.generateDocType });
        });
      });
    },
    filteredIntimations() {
      return getPublicationsFeature().filteredItems();
    },
    intimationParties(item) {
      return getPublicationsFeature().intimationParties(item);
    },
    treatmentStatusBadge(treatmentStatus) {
      return getPublicationsFeature().treatmentStatusBadge(treatmentStatus);
    },
    statusChip(status) {
      const labels = { nova: 'Nova', triagem: 'Em triagem', prazo: 'Prazo conferido', tarefa: 'Tarefa criada', arquivada: 'Arquivada' };
      const classes = { nova: 'warning', triagem: 'planned', prazo: 'connected', tarefa: 'connected', arquivada: 'muted' };
      return `<span class="status-chip ${classes[status] || 'muted'}">${labels[status] || escapeHtml(status)}</span>`;
    },
    renderInbox() {
      return getPublicationsFeature().renderInbox();
    },
    selectIntimation(id) {
      return getPublicationsFeature().select(id);
    },
    renderIntimationDetail() {
      return getPublicationsFeature().renderDetail();
    },
    async handleIntimationAction(item, action) {
      return getPublicationsFeature().handleAction(item, action);
    },
    async applyTreatmentAction(intimationId, action, note = null) {
      return getPublicationsFeature().applyTreatmentAction(intimationId, action, note);
    },
    openDiscardModal(item) {
      return getPublicationsFeature().openDiscardModal(item);
    },
    closeDiscardModal() {
      return getPublicationsFeature().closeDiscardModal();
    },
    openTreatModal(item) {
      return getPublicationsFeature().openTreatModal(item);
    },
    closeTreatModal() {
      return getPublicationsFeature().closeTreatModal();
    },
    renderKanban() {
      return getTasksFeature().renderKanban();
    },
    taskCard(task) {
      return getTasksFeature().renderCard(task);
    },
    startTimeSheet(taskId) {
      return getTasksFeature().startTimeSheet(taskId);
    },
    stopTimeSheet() {
      return getTasksFeature().stopTimeSheet();
    },
    formatElapsedTimer() {
      return getTasksFeature().formatElapsedTimer();
    },
    moveTask(taskId, status) {
      return getTasksFeature().moveTask(taskId, status);
    },
    renderProcesses(query = '') {
      return getProcessesFeature().render(query);
    },
    renderContacts(query = '') {
      return getContactsFeature().render(query);
    },
    async loadAuthUsers() {
      try {
        const response = await window.KellerAuth.secureFetch('/api/auth/users', { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar os usuários de acesso.');
        this.authUsers = Array.isArray(payload.users) ? payload.users : [];
        this.currentAuthRole = payload.currentRole || 'collaborator';
      } catch (error) {
        this.authUsers = [];
        console.warn('Falha ao carregar usuários de autenticação:', error.message);
      }
    },
    async manageAuthUser(userId, status) {
      try {
        const response = await window.KellerAuth.secureFetch('/api/auth/users/manage', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ userId, status })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível atualizar o usuário.');
        await this.loadAuthUsers(); this.renderConfiguration(); this.toast('Acesso do usuário atualizado.', 'success');
      } catch (error) { this.toast(error.message, 'error'); }
    },
    authUserRow(user) {
      const labels = { active: 'Ativo', inactive: 'Suspenso', pending_approval: 'Aguardando aprovação' };
      const canManage = this.currentAuthRole === 'master_admin' && user.role !== 'master_admin';
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      const actionLabel = user.status === 'pending_approval' ? 'Aprovar' : user.status === 'active' ? 'Suspender' : 'Reativar';
      return `<div class="configuration-row" data-auth-user-id="${escapeHtml(user.id)}">
        <div class="config-row-info"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)} · ${user.role === 'master_admin' ? 'Administrador' : 'Colaborador'}</span><small>${escapeHtml(labels[user.status] || user.status || 'Ativo')}</small></div>
        ${canManage ? `<button type="button" class="button ghost" data-auth-user-status="${nextStatus}">${actionLabel}</button>` : ''}
      </div>`;
    },
    renderConfiguration(query = '') {
      const config = Store.state.configuration || {};
      const sections = [
        ['taskDefinitions', 'Tarefas'],
        ['users', 'Usuários'],
        ['actionGroups', 'Grupos'],
        ['actionTypes', 'Tipos de ação'],
        ['stages', 'Etapas'],
        ['origins', 'Origens'],
        ['goals', 'Metas'],
        ['inboxSections', 'Caixa de entrada'],
        ['notificationAssignments', 'Notificações'],
        ['integrations', 'Integrações'],
        ['diagnostic', 'Diagnóstico & Saúde'],
        ['backups', 'Backups & Restauração']
      ];
      document.getElementById('configurationTabs').innerHTML = sections.map(([key, label]) => `<button class="${this.configurationSection === key ? 'active' : ''}" data-config-section="${key}">${label}</button>`).join('');
      document.getElementById('configurationMetrics').innerHTML = [
        ['Definições de tarefa', config.taskDefinitions?.length || 0], ['Tipos de ação', config.actionTypes?.length || 0], ['Etapas', config.stages?.length || 0], ['Usuários de acesso', this.authUsers.length], ['Contatos importados', Store.state.contacts.length]
      ].map(([label, count]) => `<div class="configuration-metric"><strong>${count}</strong><span>${label}</span></div>`).join('');
      const label = sections.find(([key]) => key === this.configurationSection)?.[1] || 'Configuração';
      const isAuthUsers = this.configurationSection === 'users';
      const isSpecialSection = this.configurationSection === 'diagnostic' || this.configurationSection === 'backups';
      document.getElementById('newConfigurationButton')?.classList.toggle('hidden', isAuthUsers || isSpecialSection);
      document.getElementById('configurationSearch')?.closest('.table-search')?.classList.toggle('hidden', isSpecialSection);

      if (this.configurationSection === 'diagnostic') {
        document.getElementById('configurationHeading').textContent = 'Diagnóstico & Saúde do Sistema';
        document.getElementById('configurationCount').textContent = 'Atrium v2.0';
        this.renderDiagnostic();
        return;
      }

      if (this.configurationSection === 'backups') {
        document.getElementById('configurationHeading').textContent = 'Cópias de Segurança & Restauração';
        document.getElementById('configurationCount').textContent = 'Zero Trust';
        this.renderBackups();
        return;
      }

      const raw = isAuthUsers ? this.authUsers : (Array.isArray(config[this.configurationSection]) ? config[this.configurationSection] : []);
      const needle = normalizeText(query); const records = raw.map((item, index) => ({ item, index })).filter(({ item }) => !needle || normalizeText(typeof item === 'string' ? item : Object.values(item || {}).flat().join(' ')).includes(needle));
      document.getElementById('configurationHeading').textContent = label;
      document.getElementById('configurationCount').textContent = `${records.length} itens`;
      document.getElementById('configurationList').innerHTML = records.length ? records.map(({ item, index }) => isAuthUsers ? this.authUserRow(item) : this.configurationRow(item, index)).join('') : '<div class="empty-detail"><span>✓</span><h3>Nenhum item</h3><p>Não há registros nesta seção ou neste filtro.</p></div>';
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
    async renderDiagnostic() {
      const container = document.getElementById('configurationList');
      container.innerHTML = '<div class="empty-detail"><span class="auth-spinner" style="margin:0 auto 16px;"></span><h3>Consultando diagnóstico…</h3><p>Verificando a integridade dos subsistemas.</p></div>';
      try {
        const resp = await fetch('/api/system/diagnostic', { credentials: 'same-origin' });
        const data = await resp.json();
        if (!data.ok || !data.diagnostic) throw new Error(data.message || 'Falha ao obter diagnóstico.');
        const d = data.diagnostic;

        container.innerHTML = `
          <div class="diagnostic-panel" style="padding: 16px; display: flex; flex-direction: column; gap: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line);">
              <div>
                <h4 style="margin: 0; font-size: 1.1rem; color: var(--ivory);">${escapeHtml(d.app.name)} v${escapeHtml(d.app.version)}</h4>
                <p style="margin: 4px 0 0; font-size: 12px; color: var(--muted);">Uptime: ${Math.floor(d.app.uptimeSeconds / 60)} min · Node ${escapeHtml(d.app.nodeVersion)} · ${escapeHtml(d.app.platform)} (${escapeHtml(d.app.arch)})</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="button ghost" id="btnExportDiagnosticJson">📥 Exportar Relatório Anonimizado (.json)</button>
                <button type="button" class="button gold" id="btnOpenFeedbackModal">💬 Enviar Feedback Beta</button>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
              <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 13px; color: var(--ivory);">Banco de Dados & Estado</strong>
                  <span class="status-chip connected" style="font-size: 10px;">Ativo</span>
                </div>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 8px;">${escapeHtml(d.storage.type)}</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--muted); line-height: 1.6;">
                  <li>Contatos: <strong>${d.storage.records.contacts}</strong></li>
                  <li>Processos: <strong>${d.storage.records.processes}</strong></li>
                  <li>Tarefas: <strong>${d.storage.records.tasks}</strong></li>
                  <li>Intimações: <strong>${d.storage.records.intimations}</strong></li>
                  <li>Tamanho do arquivo: <strong>${(d.storage.sizeBytes / 1024).toFixed(1)} KB</strong></li>
                </ul>
              </div>

              <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 13px; color: var(--ivory);">Criptografia & Sessão</strong>
                  <span class="status-chip connected" style="font-size: 10px;">Protegido</span>
                </div>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 8px;">${escapeHtml(d.security.encryption)}</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--muted); line-height: 1.6;">
                  <li>Segundo Fator: <strong>${escapeHtml(d.security.twoFactor)}</strong></li>
                  <li>Sessão HttpOnly / Zero Trust: <strong>Ativa</strong></li>
                  <li>Usuários Registrados: <strong>${d.security.totalUsers}</strong></li>
                  <li>Modo: <strong>${d.app.cloudMode ? 'Nuvem / Cloud' : 'Local Seguro'}</strong></li>
                </ul>
              </div>

              <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 13px; color: var(--ivory);">Tribunais & Coleta</strong>
                  <span class="status-chip ${d.integrations.djen.status === 'conectado' ? 'connected' : 'warning'}" style="font-size: 10px;">${d.integrations.djen.status}</span>
                </div>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 8px;">${escapeHtml(d.integrations.djen.description)}</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--muted); line-height: 1.6;">
                  <li>DataJud CNJ: <strong>${d.integrations.datajud.status === 'configurado' ? 'Chave Ativa' : 'Consulta Pública'}</strong></li>
                  <li>IA Gemini: <strong>${d.integrations.gemini.status === 'configurado' ? 'Online' : 'Modelos Locais'}</strong></li>
                  <li>Última Coleta: <strong>${d.integrations.collector.lastRun ? new Date(d.integrations.collector.lastRun).toLocaleString('pt-BR') : 'Nenhuma'}</strong></li>
                </ul>
              </div>
            </div>

            <div style="border-top: 1px solid var(--line); padding-top: 20px; margin-top: 8px;">
              <h4 style="margin: 0 0 12px; font-size: 1rem; color: var(--ivory);">🧹 Higiene de Dados</h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 16px;">
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">App Version</p>
                  <p style="margin: 0; font-size: 14px; color: var(--ivory); font-weight: 600;">${escapeHtml(Store.serverMeta?.appVersion || d.app.version || '—')}</p>
                </div>
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">Build ID</p>
                  <p style="margin: 0; font-size: 14px; color: var(--ivory); font-family: monospace;">${escapeHtml(Store.serverMeta?.buildId || '—')}</p>
                </div>
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">Schema Version</p>
                  <p style="margin: 0; font-size: 14px; color: var(--ivory); font-weight: 600;">v${escapeHtml(String(Store.serverMeta?.schemaVersion || '?'))}</p>
                </div>
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">Estado</p>
                  <p style="margin: 0; font-size: 14px; color: ${Store.stateStatus === 'READY' ? 'var(--emerald)' : 'var(--danger)'}; font-weight: 600;">${escapeHtml(Store.stateStatus || 'READY')}</p>
                </div>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <button type="button" class="button ghost" id="btnClearUiCache" title="Remove apenas caches transitórios do navegador. Seus processos, tarefas e dados jurídicos permanecem intactos.">🧹 Limpar cache da interface</button>
                <button type="button" class="button ghost" id="btnResetVisualPrefs" title="Reseta tema e layout para o padrão. Nenhum dado jurídico é afetado.">🎨 Resetar preferências visuais</button>
                <button type="button" class="button ghost" id="btnRebuildRuntime" title="Reconstrói dados derivados e runtime no servidor sem afetar processos ou tarefas.">🔄 Recriar dados derivados</button>
                <button type="button" class="button ghost" id="btnManagePortalSessions" title="Gerencie sessões de login dos portais judiciais. A1, TOTP e processos são preservados.">🏛️ Gerenciar sessões do tribunal</button>
              </div>
            </div>
          </div>
        `;

        document.getElementById('btnExportDiagnosticJson')?.addEventListener('click', () => {
          window.location.href = '/api/system/diagnostic/export';
        });
        document.getElementById('btnOpenFeedbackModal')?.addEventListener('click', () => {
          this.openFeedbackModal();
        });
        document.getElementById('btnClearUiCache')?.addEventListener('click', () => {
          const uiKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('atrium:cache:')) uiKeys.push(key);
          }
          uiKeys.forEach(k => localStorage.removeItem(k));
          this.toast('Cache da interface limpo com sucesso. Dados jurídicos preservados.', 'success');
        });
        document.getElementById('btnResetVisualPrefs')?.addEventListener('click', () => {
          localStorage.removeItem('atrium_theme');
          localStorage.removeItem('jurisflow_theme');
          localStorage.removeItem('atrium_sidebar_collapsed');
          localStorage.removeItem('atrium_tour_seen');
          localStorage.removeItem('jurisflow_tour_seen');
          this.setTheme('dark');
          this.toast('Preferências visuais resetadas para o padrão. Dados jurídicos preservados.', 'success');
        });
        document.getElementById('btnRebuildRuntime')?.addEventListener('click', async () => {
          try {
            const resp = await window.KellerAuth.secureFetch('/api/system/rebuild-runtime', { method: 'POST' });
            const data = await resp.json();
            this.toast(data.message || 'Runtime reconstruído com sucesso.', 'success');
          } catch { this.toast('Falha ao reconstruir dados derivados.', 'error'); }
        });
        document.getElementById('btnManagePortalSessions')?.addEventListener('click', () => {
          this.switchView('integrations');
          this.toast('Abra um portal judicial e use "Limpar sessão local" para resetar a conexão desse tribunal.', 'info');
        });
      } catch (err) {
        container.innerHTML = `<div class="empty-detail"><span style="color:var(--danger)">⚠️</span><h3>Erro ao gerar diagnóstico</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    },
    async renderBackups() {
      const container = document.getElementById('configurationList');
      container.innerHTML = `
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line);">
            <div>
              <h4 style="margin: 0; font-size: 1.1rem; color: var(--ivory);">Cópia de Segurança & Restauração (Zero Trust)</h4>
              <p style="margin: 4px 0 0; font-size: 12px; color: var(--muted);">Gere snapshots cifrados dos dados processuais, tarefas e contatos ou restaure de um arquivo.</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="button gold" id="btnCreateBackupNow">🔒 Gerar Backup Criptografado (.atrium-backup)</button>
              <label class="button ghost" style="cursor: pointer; margin: 0; display: inline-flex; align-items: center;">
                📥 Restaurar do Arquivo
                <input type="file" id="inputRestoreBackup" accept=".atrium-backup,.json" style="display: none;">
              </label>
            </div>
          </div>

          <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
            <h5 style="margin: 0 0 8px; font-size: 13px; color: var(--ivory);">Regras de Proteção de Dados:</h5>
            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); line-height: 1.6;">
              <li>Cada backup é assinado com <strong>HMAC-SHA256</strong> e protegido com <strong>criptografia AES-256-GCM</strong>.</li>
              <li>Antes de qualquer restauração, o sistema cria automaticamente um snapshot de emergência pré-restauração.</li>
              <li>A restauração preserva a integridade de todas as chaves e usuários cadastrados.</li>
            </ul>
          </div>
        </div>
      `;

      document.getElementById('btnCreateBackupNow')?.addEventListener('click', async () => {
        try {
          this.toast('Gerando cópia de segurança cifrada…', 'info');
          const resp = await window.KellerAuth.secureFetch('/api/system/backup/create', { method: 'POST', headers: { Accept: 'application/json' } });
          const data = await resp.json();
          if (!data.ok || !data.backupData) throw new Error(data.message || 'Falha ao criar backup.');
          const blob = new Blob([JSON.stringify(data.backupData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.fileName || `atrium-backup-${new Date().toISOString().slice(0, 10)}.atrium-backup`;
          a.click();
          URL.revokeObjectURL(url);
          this.toast('Backup criptografado gerado e baixado com sucesso!', 'success');
        } catch (err) {
          this.toast(`Erro no backup: ${err.message}`, 'error');
        }
      });

      document.getElementById('inputRestoreBackup')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!confirm(`Confirma a restauração do backup "${file.name}"? O sistema criará uma cópia de segurança antes de aplicar os dados.`)) {
          e.target.value = '';
          return;
        }
        try {
          const text = await file.text();
          const backupData = JSON.parse(text);
          this.toast('Validando integridade e restaurando dados…', 'info');
          const resp = await window.KellerAuth.secureFetch('/api/system/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ backupData })
          });
          const data = await resp.json();
          if (!data.ok) throw new Error(data.message || 'Falha ao restaurar dados.');
          this.toast('Backup restaurado com sucesso! Atualizando o sistema…', 'success');
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          this.toast(`Erro na restauração: ${err.message}`, 'error');
        }
      });
    },
    openFeedbackModal() {
      this.openModal('feedback', 'Enviar Feedback do Beta', 'Canal de Comunicação Direto', [
        { name: 'type', label: 'Tipo de Feedback', type: 'select', options: [
          { value: 'sugestao', label: '💡 Sugestão de Melhoria' },
          { value: 'bug', label: '🐛 Relato de Problema / Bug' },
          { value: 'dificuldade', label: '❓ Dificuldade de Uso' },
          { value: 'performance', label: '⚡ Desempenho / Lentidão' }
        ], required: true },
        { name: 'component', label: 'Módulo / Tela Afetada', type: 'select', options: [
          { value: 'Geral', label: 'Geral / Outros' },
          { value: 'Área de Trabalho', label: 'Área de Trabalho' },
          { value: 'Kanban', label: 'Kanban & Tarefas' },
          { value: 'Intimações', label: 'Caixa de Intimações' },
          { value: 'Processos', label: 'Processos' },
          { value: 'Financeiro', label: 'Financeiro & RPVs' },
          { value: 'Documentos', label: 'Minutas & Modelos' },
          { value: 'Configurações', label: 'Configurações' }
        ], required: true },
        { name: 'message', label: 'Descrição Detalhada', type: 'textarea', full: true, required: true, placeholder: 'Descreva detalhadamente o que ocorreu ou sua sugestão (dados pessoais e processos não são enviados).' }
      ], {});
    },
    openIntimationDetailModal(item) {
      if (!item) return;
      const act = classifyIntimationAct(item.text, item.title, item.type);
      const parties = this.intimationParties(item) || 'Partes ainda não identificadas';
      this.openModal('intimationDetail', 'Detalhes da intimação', 'Análise processual DJEN / Diário', [
        { name: 'title', label: 'Título do ato publicado', value: item.title, full: true },
        { name: 'process', label: 'Número do processo CNJ', value: item.process || 'Não identificado' },
        { name: 'parties', label: 'Partes vinculadas', value: parties },
        { name: 'court', label: 'Tribunal / Unidade judiciária', value: item.court || 'Não informado' },
        { name: 'publishedAt', label: 'Data da publicação', value: formatDate(item.publishedAt) },
        { name: 'actInfo', label: 'Classificação do ato', value: act.category ? act.category.toUpperCase() : 'PUBLICAÇÃO', full: true },
        { name: 'text', label: 'Teor integral da publicação', type: 'textarea', full: true, value: item.text || 'Sem texto original.' }
      ], { ...item, deadline: '', _act: act });
      const submitButton = document.querySelector('#modalForm footer .button.gold');
      if (submitButton) submitButton.textContent = 'Criar tarefa no Kanban';
    },
    renderAgenda() {
      return getAgendaFeature().render();
    },
    renderMiniCalendar() {
      return getAgendaFeature().renderMiniCalendar();
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
      const activeCutoffIntimations = this.filteredIntimations ? this.filteredIntimations() : (Store.state.intimations || []);
      const newCount = activeCutoffIntimations.filter(item => item.status === 'nova').length;
      document.getElementById('termSourceCount').textContent = Store.state.sources.length;
      document.getElementById('termIssueCount').textContent = issues;
      document.getElementById('termNewCount').textContent = newCount;
      document.getElementById('monitorSourceList').innerHTML = Store.state.sources.map(source => `
        <div class="source-row" data-source-id="${escapeHtml(source.id)}" tabindex="0"><div class="source-name"><span class="source-mark">${escapeHtml(source.short)}</span><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div></div><span class="source-method">${escapeHtml(source.method)}</span><span class="source-check">${source.lastCheck ? formatDateTime(source.lastCheck) : 'Ainda não verificada'}</span><span>${source.status === 'ok' ? '<span class="status-chip connected">Ativo</span>' : source.status === 'attention' ? '<span class="status-chip warning">Atenção</span>' : source.status === 'error' ? '<span class="status-chip danger">Falha</span>' : source.status === 'planned' ? '<span class="status-chip planned">Preparado</span>' : '<span class="status-chip muted">Desativado</span>'}</span><span class="row-menu" aria-hidden="true">⚙</span></div>`).join('');
      document.querySelectorAll('#monitorSourceList [data-source-id]').forEach(row => row.addEventListener('click', () => {
        const sourceId = row.dataset.sourceId;
        if (sourceId === 'a1' || sourceId === 'pje') {
          this.openJudicialSetup();
        } else if (sourceId === 'external-calendar' || sourceId === 'advbox-calendar') {
          this.openCalendarConfigModal();
        } else if (sourceId === 'djen-cnj' || sourceId === 'djen') {
          const term = Store.state.terms[0] || {};
          this.openTermModal(term);
        } else if (sourceId === 'datajud-cnj' || sourceId === 'datajud') {
          this.openDataJudConfigModal();
        } else {
          const source = Store.state.sources.find(item => item.id === sourceId);
          if (source) this.openSourceModal(source);
        }
      }));
    },
    openDataJudConfigModal() {
      const currentKey = Store.state.settings?.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
      this.openModal('datajud', 'Configuração DataJud / CNJ', 'Integração Oficial de Andamentos', [
        { name: 'apiKey', label: 'Chave Pública da API DataJud (CNJ)', full: true, value: currentKey, note: 'Chave pública oficial mantida pelo CNJ (datajud-wiki.cnj.jus.br).' },
        { name: 'autoSync', label: 'Enriquecimento Automático', type: 'select', options: [{ value: 'active', label: 'Ativo (buscar andamentos ao cadastrar processo)' }, { value: 'manual', label: 'Apenas manual (sob demanda)' }] },
        { name: 'tribunals', label: 'Abrangência de Tribunais', full: true, value: 'TJRS, TRF4, STJ, TST, TJSC, TJPR, TJSP' }
      ], {
        apiKey: currentKey,
        autoSync: 'active',
        tribunals: 'TJRS, TRF4, STJ, TST, TJSC, TJPR, TJSP'
      });
    },
    openPublicationsEmailModal() {
      return getPublicationsFeature().openPublicationsEmailModal();
    },
    closePublicationsEmailModal() {
      return getPublicationsFeature().closePublicationsEmailModal();
    },
    renderAudit(filter = 'all', query = '') {
      const list = document.getElementById('auditList');
      const badge = document.getElementById('auditCountBadge');
      if (!list) return;

      this.auditFilter = filter || this.auditFilter || 'all';
      this.auditQuery = query !== undefined ? query : (this.auditQuery || '');

      let events = Store.state.audit || [];
      const q = String(this.auditQuery || '').toLowerCase().trim();
      if (q) {
        events = events.filter(e => String(e.action || '').toLowerCase().includes(q) || String(e.detail || '').toLowerCase().includes(q) || String(e.actor || '').toLowerCase().includes(q));
      }
      if (this.auditFilter && this.auditFilter !== 'all') {
        events = events.filter(e => {
          const a = String(e.action || '').toLowerCase();
          const d = String(e.detail || '').toLowerCase();
          if (this.auditFilter === 'security') return a.includes('auth') || a.includes('login') || a.includes('senha') || a.includes('2fa') || a.includes('totp') || a.includes('chave') || a.includes('sessão');
          if (this.auditFilter === 'sync') return a.includes('sincroniz') || a.includes('colet') || a.includes('djen') || a.includes('datajud') || a.includes('import');
          if (this.auditFilter === 'task') return a.includes('tarefa') || a.includes('prazo') || a.includes('kanban');
          if (this.auditFilter === 'process') return a.includes('processo') || a.includes('caso') || a.includes('cliente');
          return true;
        });
      }

      if (badge) badge.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;

      if (!events.length) {
        list.innerHTML = `<div class="empty-detail" style="padding:32px 16px;text-align:center;"><span>✦</span><h3>Nenhum evento registrado</h3><p>Não há eventos de auditoria para os filtros selecionados.</p></div>`;
        return;
      }

      list.innerHTML = `
        <div class="responsive-table">
          <table class="sortable-table">
            <thead>
              <tr>
                <th style="width:170px;">Data e Hora</th>
                <th style="width:140px;">Usuário / Agente</th>
                <th>Ação Executada</th>
                <th>Detalhes do Evento</th>
                <th style="width:100px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${events.map(item => `
                <tr>
                  <td><time style="font-size:12px;color:var(--muted);">${formatDateTime(item.at)}</time></td>
                  <td><strong style="font-size:12.5px;">${escapeHtml(item.actor || 'Sistema')}</strong></td>
                  <td><span class="gold-pill" style="font-size:11px;">${escapeHtml(item.action)}</span></td>
                  <td><span style="font-size:12.5px;color:var(--text);">${escapeHtml(item.detail || '')}</span></td>
                  <td><span class="status-chip connected" style="font-size:10.5px;">Registrado</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    },
    closeGlobalSearchPalette() {
      getGlobalSearchComponent().close();
    },
    performGlobalSearch(query) {
      getGlobalSearchComponent().perform(query);
    },
    handleGlobalSearchSelection({ target, id }) {
      if (target === 'process') {
        this.switchView('processes');
        const process = Store.state.processes.find(item => item.id === id);
        if (process) {
          const input = document.getElementById('processSearch');
          if (input) input.value = process.number || process.client || '';
          this.renderProcesses(process.number || process.client || '');
        }
      } else if (target === 'contact') {
        this.switchView('contacts');
        const contact = Store.state.contacts.find(item => item.id === id);
        if (contact) {
          const input = document.getElementById('contactSearch');
          if (input) input.value = contact.name || '';
          this.renderContacts(contact.name || '');
        }
      } else if (target === 'task') {
        this.switchView('kanban');
        const task = Store.state.tasks.find(item => item.id === id);
        if (task) this.openTaskModal(task);
      } else if (target === 'intimation') {
        this.switchView('inbox');
        this.selectIntimation(id);
      }
    },
    openModal(mode, title, eyebrow, fields, defaults = {}, topHtml = '') {
      getModalComponent().open(mode, title, eyebrow, fields, defaults, topHtml);
    },
    closeModal() {
      getModalComponent().close();
    },
    openTaskModal(defaults = {}) {
      return getTasksFeature().openTaskModal(defaults);
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
      return getProcessesFeature().openProcessModal(defaults);
    },
    openContactModal(defaults = {}) {
      return getContactsFeature().openContactModal(defaults);
    },
    openAgendaModal(defaults = {}) {
      return getAgendaFeature().openModal(defaults);
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
        { name: 'oabNumber', label: 'Número da OAB (somente números)', placeholder: 'Ex: 123456', note: 'Digite somente os números da sua OAB, preservando o zero à esquerda quando existir.' },
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
      const setStatusIcon = (id, ok) => {
        const element = document.getElementById(id);
        if (element) {
          element.className = `setup-status-icon ${ok ? 'ok' : 'off'}`;
          element.textContent = ok ? '✓' : '·';
        }
      };
      setStatusIcon('setupCertificateIcon', certificate.valid);
      setStatusIcon('setupPjeOfficeIcon', status.pjeOffice?.available);
      setStatusIcon('setupTotpIcon', totpCount > 0);

      const sc = document.getElementById('setupCertificateStatus');
      if (sc) sc.textContent = certificate.valid ? 'A1 validado no Sandbox' : certificate.accessible ? 'Senha ou contêiner inválido' : 'Selecione o PFX';

      const sp = document.getElementById('setupPjeOfficeStatus');
      if (sp) sp.textContent = status.pjeOffice?.available ? 'Aplicativo oficial disponível' : 'Abra o PJeOffice Pro';

      const st = document.getElementById('setupTotpStatus');
      if (st) st.textContent = totpCount ? `${totpCount} portal(is) vinculado(s)` : 'Nenhum QR vinculado';

      const fileBadge = document.getElementById('certificateFileBadge');
      if (fileBadge) {
        fileBadge.textContent = certificate.valid ? (certificate.status === 'operational' ? 'A1 OPERATIONAL' : 'Certificado Ativo') : 'Não configurado';
        fileBadge.className = `status-chip ${certificate.valid ? 'connected' : 'muted'}`;
      }

      const a1Card = document.getElementById('a1ActiveCard');
      const certForm = document.getElementById('certificateSetupForm');
      const btnTestA1 = document.getElementById('btnRunA1Sandbox');
      const btnReplace = document.getElementById('btnReplaceCertToggle');
      const holderNameEl = document.getElementById('a1HolderName');
      const docAndIssuerEl = document.getElementById('a1DocAndIssuer');

      if (btnTestA1) {
        btnTestA1.onclick = () => this.testA1Sandbox();
      }
      if (btnReplace && certForm && a1Card) {
        btnReplace.onclick = () => {
          certForm.classList.toggle('hidden');
          btnReplace.textContent = certForm.classList.contains('hidden') ? 'Substituir' : 'Cancelar';
        };
      }

      if (certificate.valid || certificate.accessible) {
        if (a1Card) a1Card.classList.remove('hidden');
        if (certForm) certForm.classList.add('hidden');
        if (holderNameEl) holderNameEl.textContent = certificate.summary?.holder || certificate.fileName || 'Certificado A1 Ativo';
        if (docAndIssuerEl) {
          docAndIssuerEl.textContent = `${certificate.summary?.documentMasked ? 'CPF ' + certificate.summary.documentMasked + ' · ' : ''}${certificate.summary?.issuer ? certificate.summary.issuer.split(',')[0] : 'ICP-Brasil'}${certificate.summary?.notAfter ? ' · Vigente até ' + new Date(certificate.summary.notAfter).toLocaleDateString('pt-BR') : ''}`;
        }
      } else {
        if (a1Card) a1Card.classList.add('hidden');
        if (certForm) certForm.classList.remove('hidden');
      }

      const cardChip = document.getElementById('certificateIntegrationStatus');
      if (cardChip) {
        cardChip.textContent = certificate.valid ? `A1 Operacional · ${totpCount} 2FA` : 'Configuração necessária';
        cardChip.className = `status-chip ${certificate.valid ? 'connected' : 'warning'}`;
      }

      const cardDetail = document.getElementById('certificateIntegrationDetail');
      if (cardDetail) {
        cardDetail.textContent = certificate.valid
          ? `${certificate.summary?.holder || certificate.fileName || 'Certificado'} validado com mTLS Sandbox. ${portals.filter(portal => portal.enabled).length} portal(is) habilitado(s) e ${totpCount} segundo(s) fator(es) protegido(s).`
          : 'Ative o A1, selecione os tribunais e vincule um QR novo de cada portal em um único assistente protegido.';
      }

      const coverageList = document.getElementById('portalCoverageList');
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

      const totpSelect = document.getElementById('totpPortalSelect');
      if (totpSelect) {
        const selectedPortal = totpSelect.value;
        totpSelect.innerHTML = `<option value="">Selecione o tribunal</option>${portals.filter(portal => portal.supportsTotp).map(portal => `<option value="${escapeHtml(portal.id)}">${escapeHtml(portal.name)}${portal.totpConfigured ? ' · vinculado' : ''}</option>`).join('')}`;
        if (portals.some(portal => portal.id === selectedPortal && portal.supportsTotp)) totpSelect.value = selectedPortal;
      }

      const launchBtn = document.getElementById('launchPortalLoginButton');
      if (launchBtn) {
        launchBtn.disabled = Boolean(status.interactiveCollectorRunning);
        launchBtn.textContent = status.interactiveCollectorRunning ? 'Primeira conexão em andamento…' : 'Abrir primeira conexão';
      }
    },
    async loadEmailStatus() {
      const chip = document.getElementById('emailIntegrationStatus');
      const detail = document.getElementById('emailIntegrationDetail');
      const btnConfig = document.getElementById('btnConfigureEmail');
      const btnTest = document.getElementById('btnTestEmail');

      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/email/status');
        const data = await response.json().catch(() => ({}));
        const status = data?.status || {};

        if (status.configured) {
          if (chip) {
            chip.textContent = 'SMTP conectado';
            chip.className = 'status-chip connected';
          }
          if (detail) {
            const lastTestInfo = status.lastTestAt
              ? ` · Último teste: ${new Date(status.lastTestAt).toLocaleDateString('pt-BR')} (${status.lastTestStatus === 'success' ? 'Sucesso' : 'Falhou'})`
              : '';
            detail.textContent = `Host: ${status.host}:${status.port} · Remetente: ${status.fromAddress}${lastTestInfo}`;
          }
          if (btnConfig) btnConfig.textContent = 'Reconfigurar SMTP';
          if (btnTest) btnTest.classList.remove('hidden');
        } else {
          if (chip) {
            chip.textContent = 'Não configurado';
            chip.className = 'status-chip muted';
          }
          if (detail) {
            detail.textContent = 'Configure o transporte SMTP seguro para envio de comunicações e boletins do escritório.';
          }
          if (btnConfig) btnConfig.textContent = 'Configurar SMTP';
          if (btnTest) btnTest.classList.add('hidden');
        }
        await this.loadEmailReceivers();
        return status;
      } catch (err) {
        if (chip) {
          chip.textContent = 'Erro ao verificar';
          chip.className = 'status-chip danger';
        }
      }
    },
    async openEmailConfigModal() {
      const backdrop = document.getElementById('emailConfigBackdrop');
      if (!backdrop) return;
      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/email/status');
        const data = await response.json().catch(() => ({}));
        const status = data?.status || {};

        const hostInput = document.getElementById('emailHostInput');
        const portInput = document.getElementById('emailPortInput');
        const secureInput = document.getElementById('emailSecureInput');
        const userInput = document.getElementById('emailUserInput');
        const passwordInput = document.getElementById('emailPasswordInput');
        const fromNameInput = document.getElementById('emailFromNameInput');
        const fromAddressInput = document.getElementById('emailFromAddressInput');

        if (hostInput) hostInput.value = status.host || '';
        if (portInput) portInput.value = status.port || 465;
        if (secureInput) secureInput.checked = status.secure !== false;
        if (userInput) userInput.value = status.userMasked || '';
        if (passwordInput) {
          passwordInput.value = '';
          passwordInput.placeholder = status.configured ? 'Deixe em branco para manter a senha atual' : 'Digite a senha SMTP ou senha de app';
          passwordInput.required = !status.configured;
        }
        if (fromNameInput) fromNameInput.value = status.fromName || Store.state.settings?.officeName || '';
        if (fromAddressInput) fromAddressInput.value = status.fromAddress || '';

        backdrop.classList.remove('hidden');
      } catch (err) {
        this.toast('Não foi possível carregar a configuração SMTP.', 'error');
      }
    },
    closeEmailConfigModal() {
      document.getElementById('emailConfigBackdrop')?.classList.add('hidden');
    },
    async submitEmailConfig(event) {
      if (event) event.preventDefault();
      const submitBtn = document.getElementById('emailConfigSubmitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Validando conexão SMTP...';
      }

      const host = document.getElementById('emailHostInput')?.value?.trim();
      const port = Number(document.getElementById('emailPortInput')?.value);
      const secure = document.getElementById('emailSecureInput')?.checked;
      const user = document.getElementById('emailUserInput')?.value?.trim();
      const password = document.getElementById('emailPasswordInput')?.value;
      const fromName = document.getElementById('emailFromNameInput')?.value?.trim();
      const fromAddress = document.getElementById('emailFromAddressInput')?.value?.trim();

      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/email/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ host, port, secure, user, password, fromName, fromAddress })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Falha ao salvar configuração SMTP.');

        this.closeEmailConfigModal();
        this.toast('Configuração SMTP validada e salva com sucesso!', 'success');
        await this.loadEmailStatus();
      } catch (err) {
        this.toast(err.message || 'Erro ao conectar ao servidor SMTP.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar e Validar Conexão';
        }
      }
    },
    openEmailTestModal() {
      const backdrop = document.getElementById('emailTestBackdrop');
      if (!backdrop) return;
      const recipientInput = document.getElementById('emailTestRecipientInput');
      if (recipientInput && !recipientInput.value) {
        recipientInput.value = window.KellerAuth?.currentUser?.email || document.getElementById('emailFromAddressInput')?.value || '';
      }
      backdrop.classList.remove('hidden');
    },
    closeEmailTestModal() {
      document.getElementById('emailTestBackdrop')?.classList.add('hidden');
    },
    async submitEmailTest(event) {
      if (event) event.preventDefault();
      const submitBtn = document.getElementById('emailTestSubmitBtn');
      const recipient = document.getElementById('emailTestRecipientInput')?.value?.trim();

      if (!recipient) {
        this.toast('Informe o e-mail de destino do teste.', 'warning');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Enviando e-mail de teste...';
      }

      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/email/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ recipient })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Falha no envio de teste.');

        this.closeEmailTestModal();
        this.toast(payload.message || `E-mail de teste enviado para ${recipient}!`, 'success');
        await this.loadEmailStatus();
      } catch (err) {
        this.toast(err.message || 'Erro ao enviar e-mail de teste.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '🚀 Enviar Teste Agora';
        }
      }
    },
    openPublicationEmailModal(item) {
      return getPublicationsFeature().openPublicationEmailModal(item);
    },
    closePublicationEmailModal() {
      return getPublicationsFeature().closePublicationEmailModal();
    },
    async submitPublicationEmail(event) {
      return getPublicationsFeature().submitPublicationEmail(event);
    },
    async loadEmailReceivers() {
      const currentUser = window.KellerAuth?.currentUser;
      const isAdmin = currentUser?.role === 'master_admin' || currentUser?.role === 'admin';
      const section = document.getElementById('emailReceiversSection');
      const addBtn = document.getElementById('btnAddEmailReceiver');

      if (!isAdmin) {
        if (section) section.classList.add('hidden');
        if (addBtn) addBtn.classList.add('hidden');
        return;
      }
      if (section) section.classList.remove('hidden');
      if (addBtn) addBtn.classList.remove('hidden');

      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/email/receivers', {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        this.emailReceivers = Array.isArray(data.receivers) ? data.receivers : [];
        this.renderEmailReceivers(this.emailReceivers);
      } catch (err) {
        console.error('Erro ao carregar destinatários de e-mail:', err);
      }
    },
    renderEmailReceivers(receivers = []) {
      const countEl = document.getElementById('emailReceiversCount');
      const listEl = document.getElementById('emailReceiversList');
      if (countEl) {
        countEl.textContent = `${receivers.length} cadastrado${receivers.length === 1 ? '' : 's'}`;
      }
      if (!listEl) return;

      if (!receivers.length) {
        listEl.innerHTML = `
          <div style="padding:14px; background:var(--panel-soft); border-radius:8px; border:1px solid var(--line); text-align:center;">
            <p style="margin:0; font-size:12.5px; color:var(--muted); font-style:italic;">Nenhum destinatário cadastrado para receber publicações.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = receivers.map(r => {
        const isInternal = r.type === 'internal';
        const isUserInactive = isInternal && r.userStatus && r.userStatus !== 'active';
        let statusBadge = '';

        if (isUserInactive) {
          statusBadge = `<span class="badge-chip" style="font-size:11px; padding:2px 8px; border-radius:10px; background:rgba(204,51,51,0.15); color:var(--danger); border:1px solid var(--danger); font-weight:600;">Usuário Inativo</span>`;
        } else if (r.enabled) {
          statusBadge = `<span class="badge-chip" style="font-size:11px; padding:2px 8px; border-radius:10px; background:rgba(56,161,105,0.15); color:var(--success); border:1px solid var(--success); font-weight:600;">Ativo</span>`;
        } else {
          statusBadge = `<span class="badge-chip" style="font-size:11px; padding:2px 8px; border-radius:10px; background:var(--panel); color:var(--muted); border:1px solid var(--line); font-weight:600;">Inativo</span>`;
        }

        const typeBadge = isInternal
          ? `<span class="badge-chip" style="font-size:11px; padding:2px 6px; border-radius:4px; background:var(--panel); border:1px solid var(--line); color:var(--muted);">Usuário interno</span>`
          : `<span class="badge-chip" style="font-size:11px; padding:2px 6px; border-radius:4px; background:var(--panel); border:1px solid var(--line); color:var(--muted);">Externo</span>`;

        return `
          <div class="email-receiver-item" data-receiver-id="${escapeHtml(r.id)}" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:10px 14px; background:var(--panel-soft); border-radius:8px; border:1px solid var(--line);">
            <div style="display:flex; flex-direction:column; gap:2px; min-width:200px;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <strong style="font-size:13.5px; color:var(--ivory);">${escapeHtml(r.name || 'Sem nome')}</strong>
                ${typeBadge}
                ${statusBadge}
              </div>
              <span style="font-size:12.5px; color:var(--muted); font-family:monospace;">${escapeHtml(r.email || 'Sem e-mail')}</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="button ghost" data-receiver-action="toggle" data-receiver-id="${escapeHtml(r.id)}" data-receiver-enabled="${r.enabled ? 'true' : 'false'}" style="padding:4px 10px; font-size:12px;" title="${r.enabled ? 'Desativar recebimento' : 'Ativar recebimento'}">
                ${r.enabled ? 'Desativar' : 'Ativar'}
              </button>
              <button class="button ghost" data-receiver-action="edit" data-receiver-id="${escapeHtml(r.id)}" style="padding:4px 10px; font-size:12px;" title="Editar destinatário">
                Editar
              </button>
              <button class="button ghost" data-receiver-action="delete" data-receiver-id="${escapeHtml(r.id)}" style="padding:4px 8px; font-size:12px; color:var(--danger);" title="Remover destinatário">
                ✕
              </button>
            </div>
          </div>
        `;
      }).join('');
    },
    async openEmailReceiverModal(receiverToEdit = null) {
      const backdrop = document.getElementById('emailReceiverModalBackdrop');
      if (!backdrop) return;

      const titleEl = document.getElementById('emailReceiverModalTitle');
      const idInput = document.getElementById('receiverIdInput');
      const editTypeInput = document.getElementById('receiverEditTypeInput');
      const typeContainer = document.getElementById('receiverTypeSelectorContainer');
      const typeInternalRadio = document.getElementById('receiverTypeInternal');
      const typeExternalRadio = document.getElementById('receiverTypeExternal');
      const internalFields = document.getElementById('receiverInternalFields');
      const externalFields = document.getElementById('receiverExternalFields');
      const userSelect = document.getElementById('receiverUserSelect');
      const nameInput = document.getElementById('receiverNameInput');
      const emailInput = document.getElementById('receiverEmailInput');
      const enabledInput = document.getElementById('receiverEnabledInput');

      // Buscar lista de usuários internos do sistema
      let activeUsers = [];
      try {
        const usersResp = await window.KellerAuth.secureFetch('/api/auth/users', { headers: { Accept: 'application/json' } });
        if (usersResp.ok) {
          const usersData = await usersResp.json().catch(() => ({}));
          activeUsers = (usersData.users || []).filter(u => u.status === 'active' && u.email && u.email.trim());
        }
      } catch (err) {
        console.error('Falha ao obter lista de usuários:', err);
      }

      if (userSelect) {
        if (activeUsers.length) {
          userSelect.innerHTML = activeUsers.map(u => `
            <option value="${escapeHtml(u.id)}">${escapeHtml(u.displayName || u.username)} (${escapeHtml(u.email)})</option>
          `).join('');
        } else {
          userSelect.innerHTML = `<option value="">Nenhum usuário ativo com e-mail cadastrado</option>`;
        }
      }

      if (receiverToEdit) {
        if (titleEl) titleEl.textContent = 'Editar destinatário de publicações';
        if (idInput) idInput.value = receiverToEdit.id;
        if (editTypeInput) editTypeInput.value = receiverToEdit.type;
        if (typeContainer) typeContainer.classList.add('hidden');

        if (receiverToEdit.type === 'internal') {
          if (internalFields) internalFields.classList.remove('hidden');
          if (externalFields) externalFields.classList.add('hidden');
          if (userSelect) {
            userSelect.value = receiverToEdit.userId;
            userSelect.disabled = true;
          }
        } else {
          if (internalFields) internalFields.classList.add('hidden');
          if (externalFields) externalFields.classList.remove('hidden');
          if (nameInput) nameInput.value = receiverToEdit.name || '';
          if (emailInput) emailInput.value = receiverToEdit.email || '';
        }
        if (enabledInput) enabledInput.checked = Boolean(receiverToEdit.enabled);
      } else {
        if (titleEl) titleEl.textContent = 'Adicionar destinatário de publicações';
        if (idInput) idInput.value = '';
        if (editTypeInput) editTypeInput.value = '';
        if (typeContainer) typeContainer.classList.remove('hidden');
        if (typeInternalRadio) typeInternalRadio.checked = true;
        if (typeExternalRadio) typeExternalRadio.checked = false;
        if (internalFields) internalFields.classList.remove('hidden');
        if (externalFields) externalFields.classList.add('hidden');
        if (userSelect) {
          userSelect.disabled = false;
          if (activeUsers.length) userSelect.selectedIndex = 0;
        }
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        if (enabledInput) enabledInput.checked = true;
      }

      backdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    },
    closeEmailReceiverModal() {
      const backdrop = document.getElementById('emailReceiverModalBackdrop');
      if (backdrop) backdrop.classList.add('hidden');
      if (document.getElementById('modalBackdrop')?.classList.contains('hidden')) {
        document.body.style.overflow = '';
      }
    },
    async submitEmailReceiver(event) {
      if (event) event.preventDefault();
      const submitBtn = document.getElementById('receiverSubmitBtn');
      const id = document.getElementById('receiverIdInput')?.value;
      const editType = document.getElementById('receiverEditTypeInput')?.value;
      const isEditing = Boolean(id);
      const isInternal = isEditing ? (editType === 'internal') : document.getElementById('receiverTypeInternal')?.checked;
      const enabled = Boolean(document.getElementById('receiverEnabledInput')?.checked);

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Salvando...';
      }

      try {
        if (isEditing) {
          const payload = { enabled };
          if (!isInternal) {
            payload.name = document.getElementById('receiverNameInput')?.value?.trim();
            payload.email = document.getElementById('receiverEmailInput')?.value?.trim();
          }
          const response = await window.KellerAuth.secureFetch(`/api/integrations/email/receivers/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
          });
          const resData = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(resData.message || 'Falha ao atualizar destinatário.');

          this.toast('Destinatário atualizado com sucesso!', 'success');
        } else {
          let payload = { type: isInternal ? 'internal' : 'external', enabled };
          if (isInternal) {
            payload.userId = document.getElementById('receiverUserSelect')?.value;
            if (!payload.userId) throw new Error('Selecione um usuário ativo.');
          } else {
            payload.name = document.getElementById('receiverNameInput')?.value?.trim();
            payload.email = document.getElementById('receiverEmailInput')?.value?.trim();
            if (!payload.name) throw new Error('Informe o nome do destinatário.');
            if (!payload.email) throw new Error('Informe o e-mail do destinatário.');
          }

          const response = await window.KellerAuth.secureFetch('/api/integrations/email/receivers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
          });
          const resData = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(resData.message || 'Falha ao cadastrar destinatário.');

          this.toast('Destinatário cadastrado com sucesso!', 'success');
        }

        this.closeEmailReceiverModal();
        await this.loadEmailReceivers();
      } catch (err) {
        this.toast(err.message || 'Erro ao processar destinatário.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar Destinatário';
        }
      }
    },
    async toggleEmailReceiver(id, currentEnabled) {
      if (!id) return;
      try {
        const response = await window.KellerAuth.secureFetch(`/api/integrations/email/receivers/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ enabled: !currentEnabled })
        });
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(resData.message || 'Falha ao alterar status.');
        this.toast(`Destinatário ${!currentEnabled ? 'ativado' : 'desativado'}.`, 'success');
        await this.loadEmailReceivers();
      } catch (err) {
        this.toast(err.message || 'Erro ao alterar status.', 'error');
      }
    },
    async deleteEmailReceiver(id) {
      if (!id) return;
      if (!confirm('Remover este destinatário das notificações de publicações?')) return;
      try {
        const response = await window.KellerAuth.secureFetch(`/api/integrations/email/receivers/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        });
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(resData.message || 'Falha ao remover destinatário.');
        this.toast('Destinatário removido.', 'success');
        await this.loadEmailReceivers();
      } catch (err) {
        this.toast(err.message || 'Erro ao remover destinatário.', 'error');
      }
    },
    async testA1Sandbox() {
      const btn = document.getElementById('btnRunA1Sandbox');
      if (btn) { btn.disabled = true; btn.textContent = '🧪 Executando Sandbox...'; }
      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/judicial/a1/sandbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao executar sandbox do certificado.');
        
        const sandbox = data.sandbox || {};
        if (sandbox.steps) {
          for (const step of sandbox.steps) {
            const el = document.getElementById(`chkStep-${step.id}`);
            if (el) {
              const ok = step.status === 'OK';
              el.innerHTML = `<span>${escapeHtml(step.name)}:</span> <strong style="color:${ok ? '#4ade80' : '#f87171'}">${ok ? '✓ OK' : '✗ Falha'}</strong>`;
            }
          }
        }
        if (sandbox.operational) {
          this.toast('Certificado A1 validado 100% no Sandbox (mTLS + Playwright + Assinatura)!', 'success');
          const chip = document.getElementById('certificateFileBadge');
          if (chip) { chip.textContent = 'A1 OPERATIONAL'; chip.className = 'status-chip connected'; }
        } else {
          this.toast(`A1 Sandbox: ${sandbox.errorMessage || 'Falha na validação'}`, 'error');
        }
      } catch (err) {
        this.toast(`Erro no Sandbox: ${err.message}`, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🧪 Testar Certificado no Sandbox'; }
      }
    },
    async saveCertificate(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const file = document.getElementById('certificateFileInput')?.files[0];
      const passphrase = document.getElementById('certificatePassphrase')?.value;
      if (!file || !passphrase) return this.toast('Selecione o PFX e informe a senha atual.', 'error');
      this.setFormBusy(form, true);
      try {
        if (file.size > 5_000_000) throw new Error('O certificado deve ter no máximo 5 MB.');
        const pfxBase64 = await this.fileToBase64(file);
        await this.judicialRequest('/api/integrations/judicial/certificate', { fileName: file.name, pfxBase64, passphrase });
        form.reset();
        const fn = document.getElementById('certificateFileName');
        if (fn) fn.textContent = 'Selecionar certificado';
        Store.audit('Certificado A1 configurado', 'Contêiner validado pelo Windows e armazenado cifrado no agente local.');
        this.toast('Certificado validado com sucesso! Sincronizando dados judiciais...', 'success');
        await this.refreshJudicialStatus();
        await this.syncAll();
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
      const button = document.getElementById('resetJudicialConnectionsButton');
      if (button) button.disabled = true;
      try {
        const result = await this.judicialRequest('/api/integrations/judicial/reset', { confirm: 'ZERAR_ACESSOS_JUDICIAIS' });
        document.getElementById('portalTotpSecret').value = ''; document.getElementById('portalTotpCode').value = ''; document.getElementById('portalQrInput').value = '';
        Store.audit('Acessos judiciais zerados', `QR/2FA, cobertura e sessões locais removidos. Certificado A1 ${result.certificatePreserved ? 'preservado' : 'não estava configurado'}.`);
        this.toast(result.certificatePreserved ? 'Acessos zerados. O certificado A1 foi preservado.' : 'Acessos zerados; nenhum certificado estava configurado.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
      finally { if (button) button.disabled = false; }
    },
    async syncJudicialNow() {
      const button = document.getElementById('syncJudicialNowButton');
      if (button) {
        button.disabled = true;
        button.textContent = 'Sincronizando acervo e intimações…';
      }
      try {
        await this.syncAll();
        this.toast('Sincronização com DJEN e tribunais concluída com sucesso!', 'success');
        Store.audit('Sincronização judicial autônoma', 'Coleta de intimações DJEN, DataJud e tribunais.');
      } catch (error) {
        this.toast(error.message || 'Falha ao sincronizar.', 'error');
      } finally {
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

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sincronizando…';
      }
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
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar e Sincronizar Agora';
        }
      }
    },
    async checkAiStatus() {
      const chip = document.getElementById('aiKeyStatusChip');
      const banner = document.getElementById('aiOnboardingBanner');
      try {
        const response = await window.KellerAuth.secureFetch('/api/ai/status', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        this.aiConfigured = Boolean(data.configured);
        if (chip) {
          chip.textContent = this.aiConfigured ? 'Chave Ativa' : 'Chave não configurada';
          chip.className = this.aiConfigured ? 'status-chip connected' : 'status-chip warning';
        }
        if (banner) {
          banner.style.display = this.aiConfigured ? 'none' : 'block';
        }
      } catch {
        this.aiConfigured = false;
        if (chip) {
          chip.textContent = this.aiConfigured ? 'Chave Ativa' : 'Chave não configurada';
          chip.className = this.aiConfigured ? 'status-chip connected' : 'status-chip warning';
        }
      }
    },
    openGeminiKeyModal() {
      const input = document.getElementById('geminiApiKeyInput');
      if (input) input.value = '';
      const feedback = document.getElementById('geminiKeyFeedback');
      if (feedback) { feedback.className = 'gemini-key-feedback hidden'; feedback.textContent = ''; }
      document.getElementById('geminiKeyBackdrop')?.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      setTimeout(() => input?.focus(), 50);
    },
    closeGeminiKeyModal() {
      const backdrop = document.getElementById('geminiKeyBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      if (document.getElementById('modalBackdrop')?.classList.contains('hidden')) document.body.style.overflow = '';
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

      Store.audit('Chave Gemini configurada', `Assistente IA ativado com modelo ${data.model || 'gemini-3.5-flash-lite'}.`);
      await this.checkAiStatus();
      return data;
    },
    async handleGeminiKeySubmit(event) {
      event.preventDefault();
      const key = document.getElementById('geminiApiKeyInput')?.value?.trim() || '';
      const feedback = document.getElementById('geminiKeyFeedback');
      const submitBtn = document.getElementById('geminiKeySubmit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Validando chave com Google…';
      }
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
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Validar e Salvar Chave';
        }
      }
    },
    async handleQuickAiKeySubmit() {
      const input = document.getElementById('aiQuickKeyInput');
      const btn = document.getElementById('btnSaveQuickAiKey');
      const key = input?.value?.trim() || '';
      if (!key) return this.toast('Cole sua Gemini API Key antes de continuar.', 'error');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Validando…';
      }
      try {
        await this.saveGeminiKey(key);
        if (input) input.value = '';
        this.toast('Assistente Google Gemini ativado!', 'success');
      } catch (error) {
        this.toast(error.message, 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Ativar Assistente Gratuito';
        }
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

      if (!this.aiConfigured) {
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
        const safeUrl = normalizeExternalUrl(link.url);
        let domain = '';
        try { domain = new URL(safeUrl).hostname.replace(/^www\./, ''); } catch { domain = 'Endereço inválido'; }
        return `
          <div class="link-card card custom-link-card">
            <div class="link-card-header">
              <div class="link-badge">${escapeHtml(link.category || 'Link Personalizado')}</div>
              <div class="link-card-top-actions">
                <a href="${escapeHtml(safeUrl || '#')}" target="_blank" rel="noopener noreferrer" class="external-icon" title="Abrir link">↗</a>
                <button type="button" class="btn-delete-link" data-delete-link="${escapeHtml(link.id)}" title="Excluir este link">×</button>
              </div>
            </div>
            <h4>${escapeHtml(link.title)}</h4>
            <p>${escapeHtml(link.description || 'Link personalizado adicionado ao escritório.')}</p>
            <div class="link-card-meta">
              <span class="link-domain">${escapeHtml(domain)}</span>
              <a href="${escapeHtml(safeUrl || '#')}" target="_blank" rel="noopener noreferrer" class="link-tag">Acessar</a>
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
        const isUrgent = Boolean(item.urgent || item.priority === 'urgente');
        this.closeModal();
        this.openTaskModal({
          title: `Analisar publicação: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: '',
          priority: isUrgent ? 'urgente' : 'normal',
          status: 'triagem'
        });
        return;
      }
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (this.modalMode.mode === 'task') {
        getTasksFeature().saveTask(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'intimation') {
        const editing = Boolean(this.modalMode.defaults.id);
        const primaryTerm = Store.state.terms.find(term => term.primary) || Store.state.terms[0];
        const record = { id: this.modalMode.defaults.id || uid('int'), status: this.modalMode.defaults.status || 'nova', unread: this.modalMode.defaults.unread ?? true, term: this.modalMode.defaults.term || `${primaryTerm?.name || 'Advogado(a) Monitorado(a)'} · ${primaryTerm?.registration || 'OAB/UF 000000'}`, createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(), ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('intimations', record); Store.audit(editing ? 'Intimação atualizada' : 'Intimação registrada', `${record.title}${record.process ? ` · ${record.process}` : ''}`);
      } else if (this.modalMode.mode === 'process') {
        getProcessesFeature().saveProcess(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'contact') {
        getContactsFeature().saveContact(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'agenda') {
        getAgendaFeature().saveRecord(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'configuration') {
        const section = this.modalMode.defaults._section; const index = this.modalMode.defaults._index;
        const list = Store.state.configuration[section];
        let record = { ...this.modalMode.defaults, ...data }; delete record._section; delete record._index;
        if (section === 'inboxSections') record = data.value;
        if (section === 'notificationAssignments') record.responsibles = String(data.responsibles || '').split(/[,;]/).map(item => item.trim()).filter(Boolean);
        if (section === 'taskDefinitions') record.points = Number(data.points) || 0;
        if (section === 'goals') record.monthlyClosings = data.monthlyClosings === '' ? null : Number(data.monthlyClosings);
        if (index === null || index === undefined || index === '') list.push(record); else list[Number(index)] = record;
        Store.save();
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
      } else if (this.modalMode.mode === 'lead') {
        getLeadsFeature().saveLead(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'source') {
        const record = { ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() }; Store.upsert('sources', record); Store.audit('Fonte atualizada', `${record.name} · ${record.status}`);
      } else if (this.modalMode.mode === 'datajud') {
        if (!Store.state.settings) Store.state.settings = {};
        Store.state.settings.datajudApiKey = data.apiKey || '';
        Store.audit('Configuração DataJud atualizada', `Chave configurada (${(data.apiKey || '').slice(0, 10)}…)`);
        Store.save();
        this.renderMonitoring();
        this.toast('Configurações do DataJud salvas com sucesso!', 'success');
        this.closeModal();
        return;
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
        const normalizedUrl = normalizeExternalUrl(data.url);
        if (!normalizedUrl) { this.toast('Informe um endereço HTTP ou HTTPS válido.', 'error'); return; }
        const record = {
          id: this.modalMode.defaults.id || uid('link'),
          title: data.title || 'Link sem título',
          url: normalizedUrl,
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
      } else if (this.modalMode.mode === 'feedback') {
        fetch('/api/system/feedback', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        }).then(r => r.json()).then(res => {
          if (!res.ok) throw new Error(res.message || 'Falha ao enviar feedback.');
          this.toast('Feedback do Beta enviado com sucesso. Muito obrigado!', 'success');
        }).catch(err => {
          this.toast(`Erro ao enviar feedback: ${err.message}`, 'error');
        });
        this.closeModal();
        return;
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
        getTasksFeature().upsertExternalTask(task, 'title');
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
        await this.loadEmailStatus();
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
          ['agenda', 'intimations', 'processes'].forEach(collection => {
            Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
          });
          getTasksFeature().removeTasksWhere(item => String(item.id || '').includes('demo'));
        }
        (data.events || []).forEach(event => Store.upsert('agenda', event, 'externalId'));
        (data.tasks || []).forEach(task => getTasksFeature().upsertExternalTask(task, 'externalId'));
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
              ['agenda', 'intimations', 'processes'].forEach(collection => {
                Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
              });
              getTasksFeature().removeTasksWhere(item => String(item.id || '').includes('demo'));
            }
            (payload.intimations || []).forEach(record => {
              Store.upsert('intimations', { id: record.id || uid('int'), source: record.source || 'Arquivo JSON', status: record.status || 'nova', unread: true, title: record.title || 'Intimação importada', process: record.process || '', client: record.client || '', court: record.court || '', publishedAt: record.publishedAt || isoDate(), text: record.text || record.description || '', term: record.term || defaultTerm, createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            (payload.tasks || []).forEach(record => {
              getTasksFeature().upsertExternalTask({ id: record.id || uid('task'), title: record.title || 'Tarefa importada', status: record.status || 'triagem', source: record.source || 'Arquivo JSON', priority: record.priority || 'normal', responsible: record.responsible || 'Advogado', createdAt: new Date().toISOString(), ...record });
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
      return Toast.show(message, type);
    }
  };

  let initialized = false;
  window.addEventListener(STORE_PERSISTENCE_CONFLICT_EVENT, event => {
    App.toast(event.detail?.message || 'Os dados foram atualizados em outra aba. Recarregando a versão mais recente…', 'error');
  });
  const boot = () => {
    if (initialized) return;
    initialized = true;
    App.init().catch(err => { console.error('App.init failed:', err); window.KellerAuth.logout(); });
  };
  window.Atrium = { App, Store };
  window.AtriumSenda = window.Atrium;
  window.JurisFlow = window.Atrium;
  window.KellerCentral = window.Atrium;
  window.portalApp = App;
  window.addEventListener('keller:authenticated', boot);
  if (window.KellerAuth?.authenticated) boot();
})();

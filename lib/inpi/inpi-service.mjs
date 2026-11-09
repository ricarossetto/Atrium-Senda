import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCANNER_SCRIPT_PATH = path.join(__dirname, 'scanner.py');
const MAX_SCAN_LIMIT = 24;

export class InpiService {
  constructor({
    dataDir = path.resolve('data'),
    resolveDataDir = null,
    pythonBin = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3'),
    timeZone = 'America/Sao_Paulo',
    logger = console,
    getWorkspaceId = () => 'default',
    isWorkspaceFenced = () => false
  } = {}) {
    this.dataDir = dataDir;
    this.resolveDataDir = resolveDataDir || (() => this.dataDir);
    this.pythonBin = pythonBin;
    this.timeZone = timeZone;
    this.logger = logger;
    this.scanStates = new Map();
    this.schedulerTimer = null;
    // workspaceId -> processo do scanner em execução (para cancelamento no reset)
    this.activeScans = new Map();
    this.getWorkspaceId = typeof getWorkspaceId === 'function' ? getWorkspaceId : () => 'default';
    this.isWorkspaceFenced = typeof isWorkspaceFenced === 'function' ? isWorkspaceFenced : () => false;
  }

  getScanState(key = this.resolveInpiDir()) {
    if (!this.scanStates.has(key)) {
      this.scanStates.set(key, {
        isScanning: false,
        scanPromise: null,
        lastScan: { status: 'NEVER', error: null, completedAt: null }
      });
    }
    return this.scanStates.get(key);
  }

  resolveInpiDir() {
    const base = typeof this.resolveDataDir === 'function' ? this.resolveDataDir() : this.dataDir;
    return path.join(base, 'inpi');
  }

  get inpiDir() {
    return this.resolveInpiDir();
  }

  get dataPath() {
    return path.join(this.resolveInpiDir(), 'inpi-dashboard.json');
  }

  get configPath() {
    return path.join(this.resolveInpiDir(), 'config.json');
  }

  get customMonitorsPath() {
    return path.join(this.resolveInpiDir(), 'custom-monitors.json');
  }

  /**
   * Obtém a lista de termos personalizados adicionados pelo usuário.
   */
  async getCustomMonitors() {
    const filePath = this.customMonitorsPath;
    if (!existsSync(filePath)) return [];
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Salva um novo termo de monitoramento personalizado (marca, processo, advogado, geral).
   */
  async saveCustomMonitor({ term, type = 'marca', label = '' } = {}) {
    const cleanTerm = String(term || '').trim();
    if (!cleanTerm || cleanTerm.length < 2) {
      throw new Error('O termo de monitoramento deve ter pelo menos 2 caracteres.');
    }
    const cleanType = ['marca', 'advogado', 'processo', 'geral'].includes(type) ? type : 'marca';
    const cleanLabel = String(label || cleanTerm).trim();
    const monitors = await this.getCustomMonitors();

    const existing = monitors.find(m => m.term.toLowerCase() === cleanTerm.toLowerCase() && m.type === cleanType);
    if (existing) {
      return existing;
    }

    const newMonitor = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      term: cleanTerm,
      type: cleanType,
      label: cleanLabel,
      createdAt: new Date().toISOString()
    };

    monitors.push(newMonitor);
    const dir = this.resolveInpiDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.customMonitorsPath, JSON.stringify(monitors, null, 2), 'utf8');
    return newMonitor;
  }

  /**
   * Remove um termo de monitoramento personalizado pelo ID.
   */
  async deleteCustomMonitor(id) {
    const monitors = await this.getCustomMonitors();
    const filtered = monitors.filter(m => m.id !== id);
    const dir = this.resolveInpiDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.customMonitorsPath, JSON.stringify(filtered, null, 2), 'utf8');
    return filtered;
  }

  /**
   * Retorna todos os monitores (automáticos do ATRIUM + personalizados).
   */
  async getAllMonitors(state = {}) {
    const automatic = this.extractLawyerMonitors(state);
    const custom = await this.getCustomMonitors();

    const preparedCustom = custom.map(cm => {
      const cleanTerm = String(cm.term || '').trim();
      const terms = [cleanTerm];
      if (cm.type === 'processo') {
        const digits = cleanTerm.replace(/\D/g, '');
        if (digits && digits !== cleanTerm) terms.push(digits);
      } else {
        const unaccented = cleanTerm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (unaccented !== cleanTerm) terms.push(unaccented);
      }
      return {
        id: cm.id,
        type: cm.type || 'marca',
        label: cm.label || cleanTerm,
        origin: 'custom',
        terms: Array.from(new Set(terms.filter(Boolean)))
      };
    });

    return {
      automatic,
      custom,
      all: [...automatic, ...preparedCustom]
    };
  }

  /**
   * Extrai dinamicamente a lista de advogados monitorados do estado do ATRIUM.
   * Não utiliza nomes fixos: consulta settings, termos ativos e equipe de advogados.
   */
  extractLawyerMonitors(state = {}) {
    const monitors = [];
    const seenNames = new Set();

    const addMonitor = (name, oab = '', origin = 'config') => {
      const cleanName = String(name || '').trim();
      if (!cleanName || cleanName.length < 3) return;
      const lower = cleanName.toLowerCase();
      if (lower.includes('advogado(a) titular') || lower.includes('advogado(a) monitorado(a)')) {
        // Placeholder genérico de demonstração sem nome real
        if (!oab) return;
      }
      if (seenNames.has(lower)) return;
      seenNames.add(lower);

      const cleanOab = String(oab || '').trim();
      const terms = [cleanName];

      // Se houver OAB informada, adiciona variações
      if (cleanOab) {
        terms.push(cleanOab);
        const digits = cleanOab.replace(/\D/g, '');
        if (digits && digits.length >= 4) {
          const ufMatch = cleanOab.match(/\b([A-Z]{2})\b/i);
          if (ufMatch) {
            const uf = ufMatch[1].toUpperCase();
            terms.push(`OAB/${uf} ${digits}`);
            terms.push(`OAB ${uf} ${digits}`);
          }
        }
      }

      // Variações sem acento
      const unaccented = cleanName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (unaccented !== cleanName) {
        terms.push(unaccented);
      }

      const slug = cleanName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      monitors.push({
        id: `adv-${slug || Math.random().toString(36).slice(2, 8)}`,
        type: 'advogado',
        label: cleanName,
        oab: cleanOab,
        origin,
        terms: Array.from(new Set(terms.filter(Boolean)))
      });
    };

    // 1. Identidade do Escritório (Advogado Responsável)
    const settings = state.settings || {};
    if (settings.lawyerName) {
      addMonitor(settings.lawyerName, settings.lawyerOab, 'settings');
    }

    // 2. Termos monitorados ativos no ATRIUM
    const terms = Array.isArray(state.terms) ? state.terms : [];
    for (const term of terms) {
      if (term.active !== false && term.name && String(term.type || '').toLowerCase() !== 'process') {
        const oabStr = term.registration || (term.oabNumber ? `OAB/${term.oabUf || 'RS'} ${term.oabNumber}` : '');
        addMonitor(term.name, oabStr, 'term');
      }
    }

    // 3. Membros da equipe cadastrados como advogados em Configurações
    const users = Array.isArray(state.configuration?.users) ? state.configuration.users : [];
    for (const user of users) {
      const role = String(user.role || '').toLowerCase();
      const isLawyer = role.includes('advog') || role.includes('sóci') || Boolean(user.oab);
      if (isLawyer && user.name && user.status !== 'inativo') {
        addMonitor(user.name, user.oab, 'team');
      }
    }

    return monitors;
  }

  async getDashboardData() {
    if (!existsSync(this.dataPath)) {
      return {
        generatedAt: null,
        source: {
          rpiUrl: 'https://revistas.inpi.gov.br/rpi/',
          section: 'Secao V - Marcas'
        },
        statistics: {
          totalMatches: 0,
          totalRevistas: 0,
          totalProcesses: 0,
          latestRevista: null
        },
        revistas: [],
        matches: [],
        lastRun: null
      };
    }
    try {
      const raw = await readFile(this.dataPath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      this.logger.warn?.('[INPI Service] Falha ao ler inpi-dashboard.json:', error);
      return {
        generatedAt: null,
        statistics: { totalMatches: 0, totalRevistas: 0, totalProcesses: 0, latestRevista: null },
        revistas: [],
        matches: [],
        lastRun: null
      };
    }
  }

  /**
   * O INPI participa da sincronização somente quando a fonte está habilitada
   * no estado oficial do workspace. Estados antigos sem o campo `active`
   * permanecem compatíveis e são considerados ativos.
   */
  isSourceActive(state = {}) {
    const source = Array.isArray(state?.sources)
      ? state.sources.find(item => item?.id === 'inpi-rpi')
      : null;
    return source?.active !== false;
  }

  sanitizeScanError(error) {
    const message = typeof error === 'string' ? error : error?.message;
    if (!message) return null;
    return String(message).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 500);
  }

  getScanSnapshot(data = {}) {
    const persisted = data.lastRun || {};
    const persistedStatus = ['RUNNING', 'SUCCESS', 'ERROR'].includes(persisted.status)
      ? persisted.status
      : (persisted.startedAt ? (Array.isArray(persisted.errors) && persisted.errors.length ? 'ERROR' : 'SUCCESS') : 'NEVER');
    const scopedState = this.getScanState();
    const current = scopedState.lastScan?.status && scopedState.lastScan.status !== 'NEVER' ? scopedState.lastScan : null;
    return {
      status: current?.status || persistedStatus,
      error: current?.error || this.sanitizeScanError(persisted.error) || null,
      completedAt: current?.completedAt || persisted.completedAt || null
    };
  }

  cancelWorkspaceScan(workspaceId = this.getWorkspaceId()) {
    const proc = this.activeScans.get(workspaceId);
    if (proc) {
      try { proc.kill('SIGKILL'); } catch {}
      this.activeScans.delete(workspaceId);
      this.logger.warn?.(`[INPI Service] Scanner da RPI cancelado para o workspace ${workspaceId} (redefinição em andamento).`);
    }
  }

  async persistScanMetadata({ status, error = null, completedAt = new Date().toISOString() } = {}) {
    // Escritório em redefinição: não recriar data/inpi após a quarentena.
    if (this.isWorkspaceFenced(this.getWorkspaceId())) return null;
    await mkdir(this.inpiDir, { recursive: true });
    const data = await this.getDashboardData();
    const previous = data.lastRun || {};
    const next = {
      ...data,
      lastRun: {
        ...previous,
        status,
        error: this.sanitizeScanError(error),
        completedAt
      }
    };
    await writeFile(this.dataPath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  convertMatchToIntimation(match) {
    if (!match || typeof match !== 'object') return null;
    const revistaNum = match.revista?.numero || '';
    const revistaDate = match.revista?.data || new Date().toISOString().slice(0, 10);
    const processoNum = String(match.processo || '').trim();
    const marcaNome = String(match.marca?.nome || '').trim();
    const primeiroDespacho = Array.isArray(match.despachos) && match.despachos[0] ? match.despachos[0] : {};
    const despachoNome = String(primeiroDespacho.nome || 'Publicação de Marca').trim();
    const titular = String(match.requerentes?.[0]?.nome || '').trim();
    const procurador = Array.isArray(match.procuradores) ? match.procuradores.join(', ').trim() : '';
    const termoEncontrado = String(match.monitores?.[0]?.label || match.monitores?.[0]?.matchedTerms?.[0] || procurador || titular || 'Termo monitorado').trim();
    const pagina = match.pagina || match.page || '';

    const rawId = match.id || `${processoNum || 'proc'}-${revistaNum || 'rpi'}`;
    const id = String(rawId).startsWith('inpi-') ? String(rawId) : `inpi-${rawId}`;

    const linhas = [];
    if (processoNum) linhas.push(`${processoNum} ${despachoNome}`);
    if (titular) {
      const uf = match.requerentes?.[0]?.uf ? ` [${match.requerentes[0]?.pais || 'BR'}/${match.requerentes[0]?.uf}]` : '';
      linhas.push(`Titular: ${titular}${uf}`);
    }
    if (procurador) linhas.push(`Procurador: ${procurador}`);
    if (Array.isArray(match.classes) && match.classes.length) {
      const cls = match.classes.map(c => `NCL(${c.edicao || '12'}): ${c.codigo} Especificação: ${c.especificacao || ''}`).join('; ');
      linhas.push(cls);
    }
    if (primeiroDespacho.texto) linhas.push(`Complemento: ${primeiroDespacho.texto}`);

    const fullText = match.publicacaoTexto || (linhas.length > 0 ? linhas.join(' ') : `Publicação de marca na RPI ${revistaNum}.`);
    const title = match.titulo || (pagina ? `Pg. ${pagina}. Marcas. Revista da Propriedade Industrial RPI de ${revistaDate}` : `INPI · RPI ${revistaNum} · ${despachoNome}${marcaNome ? ` — ${marcaNome}` : ''}`);

    return {
      id,
      externalId: id,
      process: processoNum ? `INPI ${processoNum}` : `RPI ${revistaNum}`,
      processNumber: processoNum,
      title,
      type: despachoNome,
      source: 'INPI',
      court: 'INPI · Marcas',
      county: revistaNum ? `RPI ${revistaNum}` : 'INPI',
      publishedAt: revistaDate,
      disponibilizadoEm: revistaDate,
      date: revistaDate,
      text: fullText,
      client: titular || marcaNome || 'Titular da Marca',
      opposingParty: marcaNome ? `Marca: ${marcaNome}` : '',
      term: termoEncontrado,
      lawyers: procurador || termoEncontrado,
      unread: true,
      treatmentStatus: 'untreated',
      urgent: false,
      important: true,
      origin: 'inpi_rpi',
      link: match.links?.pdf || match.links?.xml || 'https://revistas.inpi.gov.br/rpi/'
    };
  }

  async syncMatchesToState(state = {}) {
    if (!state || typeof state !== 'object') return { added: 0, total: 0, newIntimations: [] };
    state.intimations = Array.isArray(state.intimations) ? state.intimations : [];
    if (!this.isSourceActive(state)) {
      return { added: 0, total: state.intimations.length, newIntimations: [], skipped: true, reason: 'source-disabled' };
    }
    const dashboardData = await this.getDashboardData();
    const matches = Array.isArray(dashboardData.matches) ? dashboardData.matches : [];
    if (!matches.length) return { added: 0, total: state.intimations.length, newIntimations: [] };

    let added = 0;
    const newIntimations = [];

    for (const match of matches) {
      const intimation = this.convertMatchToIntimation(match);
      if (!intimation) continue;

      const existingIndex = state.intimations.findIndex(i =>
        Boolean(i && (
          i.id === intimation.id ||
          i.externalId === intimation.externalId ||
          (intimation.processNumber && i.processNumber === intimation.processNumber && (i.court === 'INPI · Marcas' || i.source === 'INPI') && i.publishedAt === intimation.publishedAt)
        ))
      );

      if (existingIndex >= 0) {
        const existing = state.intimations[existingIndex];
        state.intimations[existingIndex] = {
          ...intimation,
          ...existing,
          text: existing.text || intimation.text,
          link: existing.link || intimation.link,
          term: existing.term || intimation.term
        };
      } else {
        state.intimations.unshift(intimation);
        added++;
        newIntimations.push(intimation);
      }
    }

    return { added, total: state.intimations.length, newIntimations };
  }

  /**
   * Reconcilia o dashboard persistido do workspace atual com o Store oficial.
   * O alias dá ao scheduler global um contrato estável sem duplicar a lógica
   * de identidade/idempotência de `syncMatchesToState`.
   */
  async reconcileDashboardToState(state = {}) {
    return this.syncMatchesToState(state);
  }

  getCurrentBrazilDate() {
    const now = new Date();
    // Obtém partes da data no fuso de Brasília
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const map = {};
    for (const p of parts) map[p.type] = p.value;

    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      dayOfWeek: weekdayMap[map.weekday] ?? now.getDay(),
      hour: parseInt(map.hour, 10),
      minute: parseInt(map.minute, 10),
      dateStr: `${map.year}-${map.month}-${map.day}`
    };
  }

  async getStatus(state = {}) {
    const data = await this.getDashboardData();
    const scan = this.getScanSnapshot(data);
    const monitors = this.extractLawyerMonitors(state);
    const brDate = this.getCurrentBrazilDate();
    const isTuesday = brDate.dayOfWeek === 2;
    const isLateAfternoon = brDate.hour >= 17;

    return {
      ok: true,
      sidesystem: 'INPI_RPI_MONITOR',
      configured: true,
      active: this.isSourceActive(state),
      enabled: this.isSourceActive(state),
      isScanning: this.getScanState().isScanning,
      healthy: scan.status !== 'ERROR',
      scanStatus: this.getScanState().isScanning ? 'RUNNING' : scan.status,
      lastScanStatus: this.getScanState().isScanning ? 'RUNNING' : scan.status,
      lastScanError: scan.error,
      lastScanCompletedAt: scan.completedAt,
      monitorsCount: monitors.length,
      monitors,
      statistics: data.statistics,
      lastRun: data.lastRun,
      generatedAt: data.generatedAt,
      schedule: {
        description: 'Varredura semanal automatizada da RPI (Seção V - Marcas) às terças-feiras no final da tarde (a partir das 17h BRT).',
        frequency: 'semanal',
        publishedDay: 'Terça-feira',
        isTuesday,
        isLateAfternoon,
        todayBrazil: brDate.dateStr
      }
    };
  }

  /**
   * Dispara a execução do scanner Python.
   */
  async runScan({ state = {}, limit = 1, force = false } = {}) {
    // Fronteira defensiva: o scanner Python recebe --limit e valores negativos ou
    // enormes selecionariam quase todas as revistas (download ilimitado). A rota HTTP
    // já rejeita limites inválidos com 400; aqui garantimos o mesmo contrato para
    // qualquer outro chamador (agendador, sync): inteiro em 1..MAX_SCAN_LIMIT, default 1.
    const parsedLimit = typeof limit === 'string' ? Number(limit.trim()) : Number(limit);
    const safeLimit = Number.isInteger(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, MAX_SCAN_LIMIT)
      : 1;
    if (!this.isSourceActive(state)) {
      return {
        ok: false,
        skipped: true,
        message: 'A fonte INPI / RPI está desativada neste workspace.'
      };
    }
    const scanKey = this.resolveInpiDir();
    const scanState = this.getScanState(scanKey);
    if (scanState.isScanning) {
      return {
        ok: false,
        busy: true,
        message: 'Varredura da RPI já está em andamento. Aguarde a conclusão.'
      };
    }
    if (this.isWorkspaceFenced(this.getWorkspaceId())) {
      return {
        ok: false,
        skipped: true,
        message: 'Escritório em redefinição. A varredura INPI / RPI está suspensa.'
      };
    }

    // Guarda in-flight é marcada de forma síncrona, antes de qualquer await,
    // para que dois chamadores concorrentes não iniciem scanners duplicados.
    const previousLastScan = scanState.lastScan;
    scanState.isScanning = true;
    scanState.lastScan = { status: 'RUNNING', error: null, completedAt: null };

    let monitorGroups;
    try {
      monitorGroups = await this.getAllMonitors(state);
    } catch (error) {
      scanState.isScanning = false;
      scanState.lastScan = previousLastScan;
      throw error;
    }
    const monitors = monitorGroups.all;
    if (!monitors.length) {
      scanState.isScanning = false;
      scanState.lastScan = previousLastScan;
      return {
        ok: false,
        message: 'Nenhum termo ou advogado cadastrado para monitorar na RPI. Cadastre um termo no painel ou preencha o nome do advogado em Configurações > Identidade do Escritório.'
      };
    }

    scanState.scanPromise = (async () => {
      try {
        await mkdir(this.inpiDir, { recursive: true });
        // Salva a configuração atual de monitores
        const configPayload = { monitors };
        await writeFile(this.configPath, JSON.stringify(configPayload, null, 2), 'utf8');

        // Argumentos para o scanner
        const args = [
          SCANNER_SCRIPT_PATH,
          '--limit', String(safeLimit),
          '--config', this.configPath,
          '--data', this.dataPath
        ];

        this.logger.info?.(`[INPI Service] Iniciando scanner Python (${this.pythonBin}) com ${monitors.length} advogado(s)...`);

        const exitCode = await new Promise((resolve, reject) => {
          const proc = spawn(this.pythonBin, args, {
            stdio: ['ignore', 'pipe', 'pipe']
          });
          const workspaceId = this.getWorkspaceId();
          this.activeScans.set(workspaceId, proc);

          let stderrOutput = '';
          proc.stderr.on('data', chunk => {
            stderrOutput += chunk.toString();
          });

          proc.on('close', code => {
            if (this.activeScans.get(workspaceId) === proc) this.activeScans.delete(workspaceId);
            if (code === 0) {
              resolve(code);
            } else {
              this.logger.warn?.(`[INPI Service] Scanner finalizou com código ${code}: ${stderrOutput}`);
              resolve(code);
            }
          });

          proc.on('error', err => {
            if (this.activeScans.get(workspaceId) === proc) this.activeScans.delete(workspaceId);
            reject(err);
          });
        });

        if (this.isWorkspaceFenced(this.getWorkspaceId())) {
          const completedAt = new Date().toISOString();
          scanState.lastScan = { status: 'CANCELLED', error: null, completedAt };
          return { ok: false, skipped: true, message: 'Varredura da RPI cancelada: escritório em redefinição.' };
        }
        const updatedData = await this.getDashboardData();
        const syncResult = await this.syncMatchesToState(state);
        const scanError = Array.isArray(updatedData.lastRun?.errors) && updatedData.lastRun.errors.length
          ? updatedData.lastRun.errors.join('; ')
          : (exitCode === 0 ? null : 'Não foi possível consultar o INPI agora. Uma nova tentativa acontece no próximo ciclo.');
        const scanStatus = exitCode === 0 && !scanError ? 'SUCCESS' : 'ERROR';
        const completedAt = new Date().toISOString();
        scanState.lastScan = { status: scanStatus, error: this.sanitizeScanError(scanError), completedAt };
        await this.persistScanMetadata({ status: scanStatus, error: scanError, completedAt });
        return {
          ok: scanStatus === 'SUCCESS',
          exitCode,
          statistics: updatedData.statistics,
          newMatches: updatedData.lastRun?.newMatchesThisRun || 0,
          totalMatches: updatedData.statistics?.totalMatches || 0,
          syncedToIntimations: syncResult.added,
          newIntimations: syncResult.newIntimations,
          message: scanStatus === 'SUCCESS'
            ? `Varredura concluída. ${updatedData.statistics?.totalMatches || 0} ocorrência(s) registrada(s)${syncResult.added ? ` e ${syncResult.added} adicionada(s) às Publicações.` : '.'}`
            : `Varredura do INPI falhou${scanError ? `: ${this.sanitizeScanError(scanError)}` : '.'}`
        };
      } catch (err) {
        this.logger.error?.('[INPI Service] Erro ao executar scanner Python:', err);
        const completedAt = new Date().toISOString();
        const safeError = this.sanitizeScanError(err);
        scanState.lastScan = { status: 'ERROR', error: safeError, completedAt };
        try {
          await this.persistScanMetadata({ status: 'ERROR', error: safeError, completedAt });
        } catch (persistError) {
          this.logger.error?.('[INPI Service] Falha ao persistir estado da varredura:', persistError);
        }
        return {
          ok: false,
          error: safeError,
          message: `Falha ao executar scanner da RPI: ${safeError}`
        };
      } finally {
        scanState.isScanning = false;
        scanState.scanPromise = null;
      }
    })();

    return scanState.scanPromise;
  }

  /**
   * Avalia as regras de agendamento:
   * 1. Se nunca rodou (sem dados locais), faz a 1ª verificação na inicialização.
   * 2. Nas terças-feiras no final da tarde (>= 17h BRT), faz a varredura se ainda não executou hoje.
   */
  async checkScheduledRun({ getState = () => ({}), audit = () => {}, listWorkspaceIds = null, withWorkspace = null } = {}) {
    const workspaceIds = typeof listWorkspaceIds === 'function' ? await listWorkspaceIds() : listWorkspaceIds;
    if (Array.isArray(workspaceIds) && typeof withWorkspace === 'function' && workspaceIds.length) {
      for (const workspaceId of workspaceIds) {
        try {
          await withWorkspace(workspaceId, () => this.checkScheduledRunForWorkspace({ getState, audit }));
        } catch (error) {
          this.logger.warn?.(`[INPI Service] Erro na checagem agendada do workspace ${workspaceId}:`, error);
        }
      }
      return;
    }
    return this.checkScheduledRunForWorkspace({ getState, audit });
  }

  async checkScheduledRunForWorkspace({ getState = () => ({}), audit = () => {} } = {}) {
    if (this.getScanState().isScanning) return;
    if (this.isWorkspaceFenced(this.getWorkspaceId())) return;

    const data = await this.getDashboardData();
    const hasExistingData = existsSync(this.dataPath) && Array.isArray(data.revistas) && data.revistas.length > 0;
    const brDate = this.getCurrentBrazilDate();

    // 1ª Verificação: base vazia/inicial
    if (!hasExistingData) {
      this.logger.info?.('[INPI Service] Primeira verificação detectada (base sem carga). Executando varredura inicial...');
      const state = typeof getState === 'function' ? await getState() : {};
      const res = await this.runScan({ state, limit: 1 });
      if (typeof audit === 'function') audit('INPI / RPI Primeira Varredura', res.message || 'Carga inicial de RPIs do INPI executada.');
      return;
    }

    // Regra semanal: Terça-feira no final da tarde
    const isTuesday = brDate.dayOfWeek === 2;
    const isLateAfternoon = brDate.hour >= 17;

    if (!isTuesday || !isLateAfternoon) {
      // Não é o momento da publicação semanal
      return;
    }

    // Verifica se já realizou varredura com sucesso hoje
    const lastRunTime = data.lastRun?.startedAt ? new Date(data.lastRun.startedAt) : null;
    if (lastRunTime) {
      const lastRunBr = new Intl.DateTimeFormat('en-US', {
        timeZone: this.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(lastRunTime);
      const todayBr = new Intl.DateTimeFormat('en-US', {
        timeZone: this.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      if (lastRunBr === todayBr) {
        // Já rodou nesta terça-feira!
        return;
      }
    }

    this.logger.info?.('[INPI Service] Terça-feira final da tarde: disparando varredura semanal da nova RPI do INPI...');
    const state = typeof getState === 'function' ? await getState() : {};
    const res = await this.runScan({ state, limit: 1 });
    if (typeof audit === 'function') audit('INPI / RPI Varredura Semanal', `Publicação da RPI de terça-feira processada. ${res.newMatches || 0} nova(s) ocorrência(s).`);
  }

  startScheduler({ getState = () => ({}), audit = () => {}, intervalMs = 30 * 60 * 1000, listWorkspaceIds = null, withWorkspace = null } = {}) {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);

    // Avaliação inicial após 10 segundos da inicialização do servidor
    setTimeout(() => {
      this.checkScheduledRun({ getState, audit, listWorkspaceIds, withWorkspace }).catch(err => {
        this.logger.warn?.('[INPI Service] Erro na checagem inicial do agendador:', err);
      });
    }, 10_000);

    // Checagem periódica a cada 30 minutos (sem laços contínuos pesados)
    this.schedulerTimer = setInterval(() => {
      this.checkScheduledRun({ getState, audit, listWorkspaceIds, withWorkspace }).catch(err => {
        this.logger.warn?.('[INPI Service] Erro na checagem agendada da RPI:', err);
      });
    }, intervalMs);

    this.schedulerTimer.unref?.();
  }

  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}

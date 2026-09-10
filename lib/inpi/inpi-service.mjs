import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCANNER_SCRIPT_PATH = path.join(__dirname, 'scanner.py');

export class InpiService {
  constructor({
    dataDir = path.resolve('data'),
    resolveDataDir = null,
    pythonBin = process.env.PYTHON_PATH || 'python',
    timeZone = 'America/Sao_Paulo',
    logger = console
  } = {}) {
    this.dataDir = dataDir;
    this.resolveDataDir = resolveDataDir || (() => this.dataDir);
    this.pythonBin = pythonBin;
    this.timeZone = timeZone;
    this.logger = logger;
    this.isScanning = false;
    this.scanPromise = null;
    this.schedulerTimer = null;
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
          terms.push(digits);
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
      if (term.active !== false && term.name) {
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
    const monitors = this.extractLawyerMonitors(state);
    const brDate = this.getCurrentBrazilDate();
    const isTuesday = brDate.dayOfWeek === 2;
    const isLateAfternoon = brDate.hour >= 17;

    return {
      ok: true,
      sidesystem: 'INPI_RPI_MONITOR',
      configured: true,
      isScanning: this.isScanning,
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
    if (this.isScanning) {
      return {
        ok: false,
        busy: true,
        message: 'Varredura da RPI já está em andamento. Aguarde a conclusão.'
      };
    }

    const monitorGroups = await this.getAllMonitors(state);
    const monitors = monitorGroups.all;
    if (!monitors.length) {
      return {
        ok: false,
        message: 'Nenhum termo ou advogado cadastrado para monitorar na RPI. Cadastre um termo no painel ou preencha o nome do advogado em Configurações > Identidade do Escritório.'
      };
    }

    this.isScanning = true;
    this.scanPromise = (async () => {
      try {
        await mkdir(this.inpiDir, { recursive: true });
        // Salva a configuração atual de monitores
        const configPayload = { monitors };
        await writeFile(this.configPath, JSON.stringify(configPayload, null, 2), 'utf8');

        // Argumentos para o scanner
        const args = [
          SCANNER_SCRIPT_PATH,
          '--limit', String(limit || 1),
          '--config', this.configPath,
          '--data', this.dataPath
        ];

        this.logger.info?.(`[INPI Service] Iniciando scanner Python (${this.pythonBin}) com ${monitors.length} advogado(s)...`);

        const exitCode = await new Promise((resolve, reject) => {
          const proc = spawn(this.pythonBin, args, {
            stdio: ['ignore', 'pipe', 'pipe']
          });

          let stderrOutput = '';
          proc.stderr.on('data', chunk => {
            stderrOutput += chunk.toString();
          });

          proc.on('close', code => {
            if (code === 0) {
              resolve(code);
            } else {
              this.logger.warn?.(`[INPI Service] Scanner finalizou com código ${code}: ${stderrOutput}`);
              resolve(code);
            }
          });

          proc.on('error', err => {
            reject(err);
          });
        });

        const updatedData = await this.getDashboardData();
        return {
          ok: exitCode === 0,
          exitCode,
          statistics: updatedData.statistics,
          newMatches: updatedData.lastRun?.newMatchesThisRun || 0,
          totalMatches: updatedData.statistics?.totalMatches || 0,
          message: exitCode === 0
            ? `Varredura concluída. ${updatedData.statistics?.totalMatches || 0} ocorrência(s) registrada(s).`
            : 'Varredura finalizada com avisos do INPI.'
        };
      } catch (err) {
        this.logger.error?.('[INPI Service] Erro ao executar scanner Python:', err);
        return {
          ok: false,
          error: err.message,
          message: `Falha ao executar scanner da RPI: ${err.message}`
        };
      } finally {
        this.isScanning = false;
        this.scanPromise = null;
      }
    })();

    return this.scanPromise;
  }

  /**
   * Avalia as regras de agendamento:
   * 1. Se nunca rodou (sem dados locais), faz a 1ª verificação na inicialização.
   * 2. Nas terças-feiras no final da tarde (>= 17h BRT), faz a varredura se ainda não executou hoje.
   */
  async checkScheduledRun({ getState = () => ({}), audit = () => {} } = {}) {
    if (this.isScanning) return;

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

  startScheduler({ getState = () => ({}), audit = () => {}, intervalMs = 30 * 60 * 1000 } = {}) {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);

    // Avaliação inicial após 10 segundos da inicialização do servidor
    setTimeout(() => {
      this.checkScheduledRun({ getState, audit }).catch(err => {
        this.logger.warn?.('[INPI Service] Erro na checagem inicial do agendador:', err);
      });
    }, 10_000);

    // Checagem periódica a cada 30 minutos (sem laços contínuos pesados)
    this.schedulerTimer = setInterval(() => {
      this.checkScheduledRun({ getState, audit }).catch(err => {
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

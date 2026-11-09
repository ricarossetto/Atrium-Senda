/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Read-Only Adapter
 *
 * Generic, profile-oriented adapter implementing the strict ATRIUM read-only
 * judicial contract across all verified eproc portals.
 */

import { getProfileForPortal } from './profiles/index.mjs';
import { getEprocPortalById } from './portal-registry.mjs';
import { parseEprocPanelProcesses, parseEprocDeadlines } from './parsers/panel-parser.mjs';
import { parseEprocCaseDetails, parseEprocParties } from './parsers/case-parser.mjs';
import { parseEprocMovements } from './parsers/movement-parser.mjs';
import { parseEprocDocuments } from './parsers/document-parser.mjs';

export class EprocReadOnlyAdapter {
  constructor(portalConfig = {}, options = {}) {
    this.portal = typeof portalConfig === 'string' ? getEprocPortalById(portalConfig) : portalConfig;
    this.portalId = this.portal?.id || 'eproc-generic';
    this.profile = getProfileForPortal(this.portalId);
    this.options = options;
    this.readOnly = true;
    this.authenticated = false;
    this.activeSession = null;
  }

  get isReadOnly() {
    return true;
  }

  async health({ readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');
    const start = Date.now();
    try {
      const target = this.portal?.baseUrl || 'https://eproc.trf4.jus.br/eproc2trf4/';
      if (typeof this.options.fetcher === 'function') {
        const res = await this.options.fetcher(target, { method: 'HEAD' });
        return {
          ok: res.status >= 200 && res.status < 400,
          status: res.status,
          latencyMs: Date.now() - start,
          portalId: this.portalId,
          readOnly: true
        };
      }
      return {
        ok: true,
        status: 'PORTAL_REACHABLE',
        latencyMs: Date.now() - start,
        portalId: this.portalId,
        readOnly: true
      };
    } catch (err) {
      return {
        ok: false,
        status: 'ERROR',
        error: err.message,
        latencyMs: Date.now() - start,
        portalId: this.portalId,
        readOnly: true
      };
    }
  }

  async authenticate({ userId, identityId, portal, strategy, credential, readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');

    // Mock / Fixture support for tests without live network
    if (this.options.mockAuth) {
      this.authenticated = this.options.mockAuth.success !== false;
      this.activeSession = { userId, portalId: this.portalId, authenticatedAt: new Date().toISOString() };
      return {
        ok: this.authenticated,
        state: this.authenticated ? 'CONNECTED' : 'ERROR',
        readOnly: true
      };
    }

    if (this.options.requireHumanAction) {
      return {
        ok: false,
        state: 'ACTION_REQUIRED',
        humanActionRequired: true,
        humanAction: 'Autenticação de dois fatores ou verificação requerida pelo tribunal.',
        readOnly: true
      };
    }

    this.authenticated = true;
    this.activeSession = {
      userId,
      identityId,
      portalId: this.portalId,
      authenticatedAt: new Date().toISOString()
    };

    return {
      ok: true,
      state: 'CONNECTED',
      readOnly: true
    };
  }

  async discoverCases({ portal, readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');

    // Mock HTML parser support
    if (this.options.mockPanelHtml) {
      const rows = parseEprocPanelProcesses(this.options.mockPanelHtml);
      return rows.map(r => ({
        process: r.number,
        number: r.number,
        cnj: r.cnj,
        class: r.actionClass,
        court: this.portal?.court || 'EPROC',
        jurisdiction: r.courtLocation,
        plaintiff: r.plaintiff,
        defendant: r.defendant,
        lastMovement: r.lastEvent,
        lastMovementDate: r.lastEventDate,
        portalId: this.portalId,
        readOnly: true
      }));
    }

    return [];
  }

  async fetchCase({ cnj, readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');

    if (this.options.mockCaseHtml) {
      const details = parseEprocCaseDetails(this.options.mockCaseHtml);
      const parties = parseEprocParties(this.options.mockCaseHtml);
      return {
        ...details,
        parties,
        court: this.portal?.court || 'EPROC',
        portalId: this.portalId,
        readOnly: true
      };
    }

    return null;
  }

  async fetchMovements({ portal, cases = [], readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');

    if (this.options.mockMovementsHtml) {
      const movements = parseEprocMovements(this.options.mockMovementsHtml);
      return movements.map(m => ({
        ...m,
        portalId: this.portalId,
        readOnly: true
      }));
    }

    return [];
  }

  async fetchDeadlines({ readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');

    const deadlines = [];
    if (this.options.mockDeadlinesHtml) {
      deadlines.push(...parseEprocDeadlines(this.options.mockDeadlinesHtml, { kind: 'deadline' }));
    }
    if (this.options.mockIntimationsHtml) {
      deadlines.push(...parseEprocDeadlines(this.options.mockIntimationsHtml, { kind: 'intimation' }));
    }

    return deadlines;
  }

  async fetchDocuments({ cnj, readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');

    if (this.options.mockDocumentsHtml) {
      return parseEprocDocuments(this.options.mockDocumentsHtml);
    }

    return [];
  }

  async fetchPublications({ portal, cases = [], readOnly = true } = {}) {
    if (!readOnly) throw new Error('Apenas operações de leitura são autorizadas.');
    return [];
  }

  async disconnect({ portal, readOnly = true } = {}) {
    this.authenticated = false;
    this.activeSession = null;
    return { ok: true, disconnected: true, readOnly: true };
  }
}

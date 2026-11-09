import { memberKeys, normalizeMemberKey } from './task-assignees.js?v=3.0.1';

function text(value) {
  return String(value || '').trim();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function grantExpiryMs(value) {
  if (!value) return Infinity;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(value).trim();
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59-03:00` : text);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function findProcessForRecord(record, processes) {
  const list = Array.isArray(processes) ? processes : [];
  if (!record || !list.length) return null;
  const processId = text(record.processId);
  if (processId) {
    const byId = list.find(process => String(process?.id || '') === processId);
    if (byId) return byId;
  }
  const clean = digits(record.process || record.processNumber);
  if (!clean) return null;
  return list.find(process => digits(process?.number || process?.protocol) === clean) || null;
}

export function userInvolvedInProcess(process, me, teams = []) {
  if (!process || !me) return false;
  const keys = memberKeys(me);
  const responsibleIds = Array.isArray(process.responsibleUserIds)
    ? process.responsibleUserIds.map(String)
    : [];
  if (responsibleIds.some(id => keys.has(id))) return true;
  const responsibleNames = Array.isArray(process.responsibles) ? process.responsibles : [process.responsible];
  if (responsibleNames.map(normalizeMemberKey).filter(Boolean).some(name => keys.has(name))) return true;
  const assigned = new Set((Array.isArray(process.assignedTeamIds) ? process.assignedTeamIds : []).map(String));
  if (assigned.size) {
    for (const team of Array.isArray(teams) ? teams : []) {
      if (!assigned.has(String(team?.id || ''))) continue;
      if ((Array.isArray(team.memberIds) ? team.memberIds : []).some(id => keys.has(String(id)))) return true;
    }
  }
  const grants = Array.isArray(process.accessGrants) ? process.accessGrants : [];
  return grants.some(grant => keys.has(String(grant?.userId || ''))
    && grantExpiryMs(grant?.expiresAt) > Date.now());
}

export function publicationLawyerMatches(record, me) {
  if (!record || !me) return false;
  const oab = digits(me.oab);
  const uf = text(me.oabUf).toUpperCase();
  if (!oab || !uf) return false;
  const lawyers = [
    ...(Array.isArray(record.publicationLawyers) ? record.publicationLawyers : []),
    ...(Array.isArray(record.lawyers) ? record.lawyers : [])
  ];
  return lawyers.some(lawyer => {
    const number = digits(lawyer?.oab || lawyer?.registration || lawyer?.oabNumber);
    const state = text(lawyer?.uf || lawyer?.oabUf || lawyer?.state).toUpperCase();
    return number === oab && (!state || state === uf);
  });
}

export function recordInvolvesMember(record, processes, me, teams = []) {
  if (!record || !me) return false;
  const process = findProcessForRecord(record, processes);
  if (process && userInvolvedInProcess(process, me, teams)) return true;
  return publicationLawyerMatches(record, me);
}

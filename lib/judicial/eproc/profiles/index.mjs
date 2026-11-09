/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Profiles Index
 */

import { trf4Profile } from './trf4.mjs';
import { trf2Profile } from './trf2.mjs';
import { trf6Profile } from './trf6.mjs';
import { tjrsProfile } from './tjrs.mjs';
import { tjscProfile } from './tjsc.mjs';
import { tjtoProfile } from './tjto.mjs';
import { tjspProfile } from './tjsp.mjs';
import { tjrjProfile } from './tjrj.mjs';
import { tjmgProfile } from './tjmg.mjs';
import { tjbaProfile } from './tjba.mjs';
import { tjmrsProfile } from './tjmrs.mjs';

export const ALL_PROFILES = Object.freeze([
  trf4Profile,
  trf2Profile,
  trf6Profile,
  tjrsProfile,
  tjscProfile,
  tjtoProfile,
  tjspProfile,
  tjrjProfile,
  tjmgProfile,
  tjbaProfile,
  tjmrsProfile
]);

export function getProfileForPortal(portalId) {
  if (!portalId) return trf4Profile;
  return ALL_PROFILES.find(p => p.subPortals.includes(portalId)) || trf4Profile;
}

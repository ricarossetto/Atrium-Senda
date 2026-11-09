/**
 * ATRIUM — Advogados citados na publicação (fonte oficial)
 *
 * Funções puras para ler a lista estruturada persistida (`publicationLawyers`),
 * formatá-la para exibição/e-mail e vincular, por inscrição OAB, ao advogado do
 * escritório. O vínculo é derivado e apenas informativo: nunca substitui o campo
 * manual `responsible` nem atribui responsabilidade automaticamente.
 */

const MAX_LAWYERS = 12;

export function publicationLawyersList(item) {
  const raw = Array.isArray(item?.publicationLawyers) ? item.publicationLawyers : [];
  const lawyers = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String(entry.name || '').trim().slice(0, 160);
    const oab = String(entry.oab || '').replace(/\D/g, '').slice(0, 12);
    const uf = String(entry.uf || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    if (!name && !oab) continue;
    const key = oab ? `oab:${uf}:${oab}` : `name:${name.toLocaleLowerCase('pt-BR')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lawyers.push({ name, oab, uf });
    if (lawyers.length >= MAX_LAWYERS) break;
  }
  return lawyers;
}

export function formatPublicationLawyers(lawyers) {
  return (Array.isArray(lawyers) ? lawyers : [])
    .map(lawyer => {
      const name = String(lawyer?.name || '').trim();
      const uf = String(lawyer?.uf || '').trim().toUpperCase();
      const oab = String(lawyer?.oab || '').replace(/\D/g, '');
      if (!oab) return name;
      return `${name ? `${name} ` : ''}(OAB/${uf || 'UF'} ${oab})`.trim();
    })
    .filter(Boolean)
    .join(' · ')
    .slice(0, 400);
}

/**
 * Primeiro advogado do escritório (usuário com `oab`/`oabUf`) citado na
 * publicação. Correspondência somente por inscrição OAB — nome não é identidade
 * suficiente. Devolve null quando não há correspondência comprovada.
 */
export function officeLawyerMatch(lawyers, users) {
  const list = (Array.isArray(lawyers) ? lawyers : []).filter(lawyer => lawyer?.oab);
  if (!list.length) return null;
  for (const user of Array.isArray(users) ? users : []) {
    const userOab = String(user?.oab || '').replace(/\D/g, '');
    if (!userOab) continue;
    const userUf = String(user?.oabUf || '').trim().toUpperCase();
    const hit = list.find(lawyer => lawyer.oab === userOab && (!userUf || !lawyer.uf || userUf === lawyer.uf));
    if (!hit) continue;
    return {
      id: String(user.id || ''),
      displayName: String(user.displayName || user.name || user.username || 'Advogado(a)').trim(),
      oab: userOab,
      uf: userUf || hit.uf || ''
    };
  }
  return null;
}

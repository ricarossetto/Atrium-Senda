const AVATAR_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

export function isAvatarDataUrl(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 700000 && AVATAR_PATTERN.test(value);
}

export function memberInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return `${first}${last}`.toUpperCase();
}

export function memberAvatarHtml(member, escapeHtml = String) {
  const name = member?.displayName || member?.username || member?.responsible || '';
  if (isAvatarDataUrl(member?.avatar)) {
    return `<span class="member-avatar" aria-hidden="true"><img class="member-avatar-image" src="${escapeHtml(member.avatar)}" alt=""></span>`;
  }
  return `<span class="member-avatar" aria-hidden="true">${escapeHtml(memberInitials(name))}</span>`;
}

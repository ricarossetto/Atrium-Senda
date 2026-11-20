import { isIP } from 'node:net';

function parseIpv6Words(normalized) {
  const withoutZone = normalized.split('%')[0];
  let parts = withoutZone.split('::');
  if (parts.length > 2) return null;
  const parseSide = (side, isRight) => {
    if (!side) return [];
    const tokens = side.split(':');
    const words = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.includes('.')) {
        if (i !== tokens.length - 1 || (!isRight && parts.length === 2)) return null;
        if (isIP(token) !== 4) return null;
        const octets = token.split('.').map(Number);
        words.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        const parsed = Number.parseInt(token, 16);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) return null;
        words.push(parsed);
      }
    }
    return words;
  };
  const left = parseSide(parts[0], false);
  const right = parts.length === 2 ? parseSide(parts[1], true) : [];
  if (!left || !right) return null;
  if (parts.length === 1) return left.length === 8 ? left : null;
  const fill = 8 - (left.length + right.length);
  if (fill < 1) return null;
  return [...left, ...new Array(fill).fill(0), ...right];
}

function wordsToIpv4(highWord, lowWord) {
  return `${(highWord >> 8) & 0xff}.${highWord & 0xff}.${(lowWord >> 8) & 0xff}.${lowWord & 0xff}`;
}

export function isPrivateNetworkAddress(address = '') {
  const normalized = String(address).trim().toLowerCase().split('%')[0].replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 4) {
    const [a, b, c] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  if (isIP(normalized) === 6) {
    const w = parseIpv6Words(normalized);
    if (!w) return true;
    const prefixZero96 = w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0;
    const ipv4Mapped = w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0xffff;
    const siit = w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0xffff && w[5] === 0;
    if (prefixZero96) {
      if (w[6] === 0 && (w[7] === 0 || w[7] === 1)) return true; // :: and ::1
      return isPrivateNetworkAddress(wordsToIpv4(w[6], w[7])); // IPv4-compatible ::/96
    }
    if (ipv4Mapped || siit) return isPrivateNetworkAddress(wordsToIpv4(w[6], w[7]));
    if (w[0] === 0x0064 && w[1] === 0xff9b && ((w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0) || w[2] === 0x0001)) return true; // NAT64
    if (w[0] === 0x2002) return isPrivateNetworkAddress(wordsToIpv4(w[1], w[2])); // 6to4
    if (w[0] === 0x2001 && (w[1] === 0x0000 || w[1] === 0x0db8)) return true; // Teredo / Docs
    if (w[0] === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return true; // Discard 100::/64
    if ((w[0] & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
    if ((w[0] & 0xffc0) === 0xfe80 || (w[0] & 0xffc0) === 0xfec0) return true; // Link-local / Site-local
    if ((w[0] & 0xff00) === 0xff00) return true; // Multicast
    return false;
  }
  return true;
}

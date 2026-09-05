const AVATAR_COLORS = [
  "bg-primary-400",
  "bg-sky-400",
  "bg-mint-500",
  "bg-coral-400",
  "bg-primary-600",
  "bg-sky-600",
  "bg-mint-600",
  "bg-coral-600",
];

export function initials(name = "") {
  const safe = typeof name === 'string' ? name.trim() : ''
  if (!safe) return '--'
  return safe
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function avatarColor(name = "") {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

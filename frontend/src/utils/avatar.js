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

// Like avatarColor, but guarantees `name` and `otherName` never come out the
// same color - two arbitrary real names hashing into the same bucket is a
// real (1-in-8) possibility, and when both are shown side by side (e.g.
// interviewer vs candidate in a transcript) a collision makes them
// impossible to tell apart. Falls back to the next palette color on a clash.
export function speakerColor(name, otherName) {
  const color = avatarColor(name);
  if (!otherName || name === otherName || color !== avatarColor(otherName)) return color;
  const idx = AVATAR_COLORS.indexOf(color);
  return AVATAR_COLORS[(idx + 1) % AVATAR_COLORS.length];
}

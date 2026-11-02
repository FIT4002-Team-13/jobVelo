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

// Transcript speaker palette, ordered for contrast between neighbours: the
// first few picks are different hues (blue, green, red, amber...) rather than
// two blues, and shade variants only come in once every hue is used.
const SPEAKER_COLORS = [
  "bg-primary-500",
  "bg-mint-600",
  "bg-coral-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-primary-700",
  "bg-mint-800",
  "bg-coral-700",
  "bg-amber-700",
];

// Maps every speaker in a transcript to its own color. `pinned` names (the
// interviewer, then the candidate) always take the first slots so they get
// the same colors whether or not they've spoken yet; everyone else is assigned
// in order of first appearance. Colors only repeat once the palette runs out.
// The live and saved transcript views both call this, so a speaker keeps the
// same color from recording through to the debrief.
export function buildSpeakerColors(transcript = [], pinned = []) {
  const colors = new Map();
  const add = (name) => {
    if (!name || colors.has(name)) return;
    colors.set(name, SPEAKER_COLORS[colors.size % SPEAKER_COLORS.length]);
  };
  pinned.forEach(add);
  transcript.forEach((entry) => add(entry.speaker));
  return colors;
}

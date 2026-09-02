export function formatTimer(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function parseTimestamp(ts = "") {
  const [m, s] = ts.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

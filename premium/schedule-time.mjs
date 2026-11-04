// Catalogue date-only entries must never acquire an invented clock time.
export function episodeTiming(episode) {
  const instant = Date.parse(episode?.airs_at);
  if (!Number.isInteger(episode?.number) || !Number.isFinite(instant)) return null;
  const date = /^(\d{4}-\d{2}-\d{2})T/.exec(episode.airs_at)?.[1];
  if (!date || new Date(date).toISOString().slice(0, 10) !== date) return null;
  return episode.time_unverified === true
    ? { date, instant: null, timeConfirmed: false }
    : { date, instant: new Date(instant).toISOString(), timeConfirmed: true };
}

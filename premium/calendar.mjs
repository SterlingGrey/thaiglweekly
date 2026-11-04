import { episodeTiming } from "./schedule-time.mjs";

const escape = value => String(value).replaceAll("\\", "\\\\").replaceAll("\r", "")
  .replaceAll("\n", "\\n").replaceAll(";", "\\;").replaceAll(",", "\\,");
const stamp = value => new Date(value).toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

// Fold by UTF-8 octets, not characters. Outlook/Apple/Google accept UTC instants
// and render them in the reader's own zone, including DST transitions.
export function foldLine(line) {
  const encoder = new TextEncoder();
  let current = "", size = 0;
  const lines = [];
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 75) { lines.push(current); current = " "; size = 1; }
    current += character; size += bytes;
  }
  lines.push(current);
  return lines.join("\r\n");
}

export function renderCalendar(catalog, followed, { now = new Date(), seriesId } = {}) {
  const selected = new Set(followed);
  if (seriesId && !selected.has(seriesId)) throw new Error("Follow this show before subscribing to its calendar");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Thai GL Weekly//Viewing calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Thai GL Weekly"];
  for (const show of catalog.series || []) {
    if (!selected.has(show.id) || (seriesId && show.id !== seriesId)) continue;
    for (const episode of show.episodes || []) {
      const timing = episodeTiming(episode);
      if (!timing) continue;
      lines.push("BEGIN:VEVENT", `UID:${show.id}-ep-${episode.number}@thaiglweekly.com`, `DTSTAMP:${stamp(catalog.generated_at || now)}`,
        timing.timeConfirmed ? `DTSTART:${stamp(timing.instant)}` : `DTSTART;VALUE=DATE:${timing.date.replaceAll("-", "")}`, `SUMMARY:${escape(show.title)}: episode ${episode.number}`,
        `DESCRIPTION:${escape((timing.timeConfirmed ? "Schedule listing; " : "Announced date only; airtime not confirmed. All-day marker, not an all-day programme. ") + "Regional playback and subtitles may differ. Check the free Tracker for source notes.")}`,
        `URL:https://thaiglweekly.com/tracker.html#card-${encodeURIComponent(show.id)}`, "END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

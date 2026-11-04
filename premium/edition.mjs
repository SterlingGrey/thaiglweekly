import { episodeTiming } from "./schedule-time.mjs";

export function validateEdition(edition, { review = false } = {}) {
  if (!edition || typeof edition.title !== "string" || !edition.title.trim() || !Array.isArray(edition.sections) || !edition.sections.length) throw new Error("Edition requires a title and sections");
  if (!review && (edition.status !== "approved" || typeof edition.approvalReceipt !== "string" || !edition.approvalReceipt.trim())) throw new Error("An approved edition and owner receipt are required");
  for (const section of edition.sections) {
    if (typeof section.heading !== "string" || !section.heading.trim() || typeof section.body !== "string" || !section.body.trim()) throw new Error("Edition text missing");
    if (!review && !["fact", "opinion"].includes(section.kind)) throw new Error("Classify each section as a sourced fact or approved opinion");
    if (!review && (section.pending || (section.kind === "opinion" && section.approved !== true))) throw new Error("Editorial review remains open");
    if (section.kind === "fact" && !section.sources?.length) throw new Error("Factual entries require sources");
    for (const source of section.sources || []) {
      const url = new URL(source.url);
      if (url.protocol !== "https:" || url.username || url.password || !source.label?.trim() || !validSourceDate(source.checked)) throw new Error("Source needs an HTTPS link, label and check date");
    }
  }
  return edition;
}

function validSourceDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function buildSundaySchedule(catalog, { timezone, now = new Date() }) {
  const format = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "full", timeStyle: "short" });
  const sourceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
  const start = +now, end = start + 7 * 86400000;
  if (!Number.isFinite(start)) throw new Error("Invalid schedule start");
  const dateKey = value => {
    const p = Object.fromEntries(sourceDate.formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const rows = (catalog.series || []).flatMap(show => (show.episodes || []).flatMap(ep => {
    const timing = episodeTiming(ep);
    if (!timing) return [];
    // A date-only announcement belongs to its announced calendar day. It cannot
    // be shifted to another day using the placeholder time stored in airs_at.
    if (timing.timeConfirmed ? Date.parse(timing.instant) < start || Date.parse(timing.instant) >= end
      : timing.date < dateKey(start) || timing.date >= dateKey(end)) return [];
    return [{ showId: show.id, title: show.title, episode: ep.number, ...timing,
      local: timing.timeConfirmed ? format.format(new Date(timing.instant)) : `${timing.date} (announced date; time not confirmed)`,
      timezone: timing.timeConfirmed ? timezone : null,
      sourceReviewDate: catalog.verified_at || null,
      availability: "Check your region. Playback, subtitles and payment requirements are not established by this schedule.",
      url: "https://thaiglweekly.com/tracker.html#card-" + encodeURIComponent(show.id),
    }];
  })).sort((a, b) => a.date.localeCompare(b.date) || String(a.instant || "").localeCompare(String(b.instant || "")));
  return { status: "draft", generatedAt: now.toISOString(), timezone, window: "Next seven days from generation; unconfirmed times retain their announced dates", rows };
}

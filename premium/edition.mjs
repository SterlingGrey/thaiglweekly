export function validateEdition(edition, { review = false } = {}) {
  if (!edition || typeof edition.title !== "string" || !Array.isArray(edition.sections) || !edition.sections.length) throw new Error("Edition requires a title and sections");
  if (!review && (edition.status !== "approved" || !edition.approvalReceipt)) throw new Error("An approved edition and owner receipt are required");
  for (const section of edition.sections) {
    if (typeof section.heading !== "string" || typeof section.body !== "string") throw new Error("Edition text missing");
    if (!review && (section.pending || (section.kind === "opinion" && section.approved !== true))) throw new Error("Editorial review remains open");
    if (section.kind === "fact" && !section.sources?.length) throw new Error("Factual entries require sources");
    for (const source of section.sources || []) {
      const url = new URL(source.url);
      if (url.protocol !== "https:" || url.username || url.password || !source.label || !/^\d{4}-\d{2}-\d{2}$/.test(source.checked || "")) throw new Error("Source needs an HTTPS link, label and check date");
    }
  }
  return edition;
}

export function buildSundaySchedule(catalog, { timezone, now = new Date() }) {
  const format = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "full", timeStyle: "short" });
  const start = +now, end = start + 7 * 86400000;
  const rows = (catalog.series || []).flatMap(show => (show.episodes || [])
    .filter(ep => Date.parse(ep.airs_at) >= start && Date.parse(ep.airs_at) < end)
    .map(ep => ({ showId: show.id, title: show.title, episode: ep.number, instant: ep.airs_at,
      local: format.format(new Date(ep.airs_at)), timezone,
      sourceReviewDate: catalog.verified_at || null,
      availability: "Check your region. Playback, subtitles and payment requirements are not established by this schedule.",
      url: "https://thaiglweekly.com/tracker.html#card-" + encodeURIComponent(show.id),
    }))).sort((a, b) => Date.parse(a.instant) - Date.parse(b.instant));
  return { status: "draft", generatedAt: now.toISOString(), timezone, window: "Next seven days from generation", rows };
}

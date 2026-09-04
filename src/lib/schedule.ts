import type {
  Catalog,
  ComputedEpisode,
  ComputedSeries,
  Episode,
  EpisodeState,
  Series,
} from "./types";

export const ICT = "Asia/Bangkok";
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function parseIso(iso: string): number {
  return Date.parse(iso);
}

/** Calendar Y-M-D in a named zone for an instant. */
export function ymdInZone(ms: number, timeZone = ICT): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function weekdayInZone(ms: number, timeZone = ICT): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(ms));
}

export function formatIct(iso: string): { day: string; date: string; time: string } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: ICT,
    weekday: "short",
  }).format(d);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: ICT,
    day: "numeric",
    month: "short",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: ICT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return { day, date, time };
}

export function formatLocal(iso: string): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  const zone =
    new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "local";
  return `${time} ${zone}`;
}

export function formatStamp(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: ICT,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  }
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

function episodeState(series: Series, ep: Episode, now: number): EpisodeState {
  const t = parseIso(ep.airs_at);
  const isPast = t <= now;
  const isFinale =
    series.total_episodes != null && ep.number === series.total_episodes;
  const isPenultimate =
    series.total_episodes != null && ep.number === series.total_episodes - 1;
  if (isFinale) return "finale";
  if (isPenultimate) return "penultimate";
  return isPast ? "aired" : "upcoming";
}

export function computeEpisode(
  series: Series,
  ep: Episode,
  now: number,
): ComputedEpisode {
  const t = parseIso(ep.airs_at);
  const isPast = t <= now;
  const tonight = ymdInZone(now) === ymdInZone(t);
  const today = ymdInZone(now);
  const endDay = ymdInZone(now + WEEK_MS);
  const startRecent = ymdInZone(now - WEEK_MS);
  const day = ymdInZone(t);
  const inWindow = day >= today && day <= endDay;
  const recent = isPast && day >= startRecent && day <= today;
  return {
    ...ep,
    series,
    state: episodeState(series, ep, now),
    isPast,
    isTonight: tonight,
    isThisWeek: inWindow,
    isRecent: recent,
  };
}

export function computeSeries(series: Series, now: number): ComputedSeries {
  const computed = series.episodes
    .map((ep) => computeEpisode(series, ep, now))
    .sort((a, b) => a.number - b.number);
  const aired = computed.filter((e) => e.isPast);
  const upcoming = computed.filter((e) => !e.isPast);
  const nextEpisode = upcoming[0] ?? null;
  const latestAired = aired[aired.length - 1] ?? null;
  const finale = computed.find(
    (e) => series.total_episodes != null && e.number === series.total_episodes,
  );
  const finaleAired = Boolean(finale?.isPast);

  let derivedStatus: ComputedSeries["derivedStatus"] = series.status;
  if (series.episodes.length > 0) {
    if (finaleAired) derivedStatus = "wrapped";
    else if (aired.length > 0 && upcoming.length > 0) derivedStatus = "airing";
    else if (aired.length === 0 && upcoming.length > 0) derivedStatus = "upcoming";
    else if (aired.length > 0 && upcoming.length === 0) derivedStatus = "wrapped";
  }

  return {
    ...series,
    airedCount: aired.length,
    nextEpisode,
    latestAired,
    finaleAired,
    derivedStatus,
  };
}

export function computeCatalog(catalog: Catalog, now = Date.now()) {
  const series = catalog.series.map((s) => computeSeries(s, now));
  const allEpisodes: ComputedEpisode[] = [];
  for (const s of catalog.series) {
    for (const ep of s.episodes) allEpisodes.push(computeEpisode(s, ep, now));
  }

  const tonight = allEpisodes
    .filter((e) => e.isTonight)
    .sort((a, b) => parseIso(a.airs_at) - parseIso(b.airs_at));

  const upcomingWeek = allEpisodes
    .filter((e) => !e.isPast && e.isThisWeek)
    .sort((a, b) => parseIso(a.airs_at) - parseIso(b.airs_at));

  const airedThisWeek = allEpisodes
    .filter((e) => e.isPast && e.isRecent && !e.isTonight)
    .sort((a, b) => parseIso(b.airs_at) - parseIso(a.airs_at));

  const airing = series
    .filter((s) => s.derivedStatus === "airing")
    .sort((a, b) => {
      const at = a.nextEpisode ? parseIso(a.nextEpisode.airs_at) : Infinity;
      const bt = b.nextEpisode ? parseIso(b.nextEpisode.airs_at) : Infinity;
      return at - bt;
    });

  const upcoming = series
    .filter((s) => s.derivedStatus === "upcoming")
    .sort((a, b) => {
      const at = a.nextEpisode ? parseIso(a.nextEpisode.airs_at) : Infinity;
      const bt = b.nextEpisode ? parseIso(b.nextEpisode.airs_at) : Infinity;
      return at - bt;
    });

  const wrapped = series.filter((s) => s.derivedStatus === "wrapped");
  const library = series.filter((s) => s.derivedStatus === "library");

  const weekStart = ymdInZone(now);
  const weekEnd = ymdInZone(now + WEEK_MS);

  return {
    now,
    generatedAt: catalog.generated_at,
    verifiedAt: catalog.verified_at,
    weekStart,
    weekEnd,
    tonight,
    upcomingWeek,
    airedThisWeek,
    airing,
    upcoming,
    wrapped,
    library,
    series,
    hotTakes: catalog.hot_takes.filter((h) => {
      const t = Date.parse(`${h.date}T00:00:00+07:00`);
      return now - t <= WEEK_MS && now - t >= -24 * 60 * 60 * 1000;
    }),
  };
}

export function groupByDay(episodes: ComputedEpisode[]) {
  const map = new Map<string, ComputedEpisode[]>();
  for (const ep of episodes) {
    const key = ymdInZone(parseIso(ep.airs_at));
    const list = map.get(key) ?? [];
    list.push(ep);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

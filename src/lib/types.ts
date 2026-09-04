export const CONFIDENCE = [
  "aired",
  "confirmed",
  "announced",
  "fan_sourced",
  "unverified",
] as const;

export type Confidence = (typeof CONFIDENCE)[number];

export type Heat = "bold" | "mainstream" | "unset";

export type Platform = {
  name: string;
  uncut?: boolean;
  url?: string;
  note?: string;
};

export type Source = {
  label: string;
  url?: string;
  checked: string;
};

export type ConflictClaim = {
  claim: string;
  source: string;
  url?: string;
};

export type Conflict = {
  id: string;
  topic: string;
  claims: ConflictClaim[];
  weight: string;
  resolved: boolean;
};

export type Episode = {
  number: number;
  airs_at: string;
  time_unverified?: boolean;
};

/** Card art. Poster is 2:3. Thumbnail is 16:9. none leaves both slots empty. */
export type ImageKind = "poster" | "thumbnail" | "none";

export type SeriesImage = {
  url: string | null;
  kind: ImageKind;
  source: string | null;
  permission: string | null;
};

export type Series = {
  id: string;
  title: string;
  title_th: string;
  studio: string;
  pairing: string;
  pairing_actors?: string;
  logline?: string;
  novel?: string;
  director?: string;
  total_episodes: number | null;
  status: "airing" | "upcoming" | "wrapped" | "library";
  year: number;
  day_of_week: string | null;
  air_time_ict: string | null;
  platforms: Platform[];
  trailer_youtube_id: string | null;
  trailer_kind?: "trailer" | "pilot" | "teaser";
  pilot_youtube_id: string | null;
  image: SeriesImage;
  episodes: Episode[];
  confidence: Confidence;
  sources: Source[];
  conflicts: Conflict[];
  heat: Heat;
  tags: string[];
  availability_note?: string;
  wrap_note?: string;
};

export type HotTake = {
  id: string;
  couple: string;
  actors: string;
  date: string;
  text: string;
  kind: string;
  source_label?: string;
  source_url?: string;
};

export type Catalog = {
  /** Build time. Rewritten by the daily job. Never shown as a verification claim. */
  generated_at: string;
  /** Set by hand at the end of a research pass. The only date the stamp shows. */
  verified_at: string;
  timezone: "Asia/Bangkok";
  notes?: string[];
  series: Series[];
  hot_takes: HotTake[];
};

export type EpisodeState = "aired" | "upcoming" | "penultimate" | "finale";

export type ComputedEpisode = Episode & {
  series: Series;
  state: EpisodeState;
  isPast: boolean;
  isTonight: boolean;
  isThisWeek: boolean;
  isRecent: boolean;
};

export type ComputedSeries = Series & {
  airedCount: number;
  nextEpisode: ComputedEpisode | null;
  latestAired: ComputedEpisode | null;
  finaleAired: boolean;
  derivedStatus: "airing" | "upcoming" | "wrapped" | "library";
};

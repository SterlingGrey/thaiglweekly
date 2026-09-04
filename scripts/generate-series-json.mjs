/**
 * Builds data/series.json from structured records + weekly episode arithmetic.
 * Dates are Asia/Bangkok (+07:00). Never hand-type "aired" vs "upcoming".
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function ict(ymd, hm = "20:30") {
  return `${ymd}T${hm}:00+07:00`;
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function weekly(startYmd, count, hm = "20:30") {
  const eps = [];
  for (let i = 0; i < count; i++) {
    eps.push({ number: i + 1, airs_at: ict(addDays(startYmd, i * 7), hm) });
  }
  return eps;
}

function src(label, url, checked = "2026-08-26") {
  return { label, url: url || "", checked };
}

const series = [];

function youtubeImage(id) {
  if (!id) {
    return { url: null, kind: "none", source: null, permission: null };
  }
  return {
    url: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
    kind: "thumbnail",
    source: id,
    permission:
      "Official-channel YouTube thumbnail, hotlinked from img.youtube.com, for a video already embedded on this page. Not a studio poster.",
  };
}

function add(rec) {
  const merged = {
    title_th: "",
    pairing_actors: "",
    logline: "",
    novel: "",
    director: "",
    day_of_week: null,
    air_time_ict: null,
    trailer_youtube_id: null,
    trailer_kind: "trailer",
    pilot_youtube_id: null,
    episodes: [],
    sources: [],
    conflicts: [],
    heat: "unset",
    tags: [],
    ...rec,
  };
  if (!merged.image) {
    merged.image = youtubeImage(merged.trailer_youtube_id);
  }
  series.push(merged);
}

// ── Currently dated 2026 runs ──────────────────────────────────────────────

add({
  id: "moonshadow",
  title: "Moonshadow",
  title_th: "เงาใต้พระจันทร์",
  studio: "GMMTV",
  pairing: "EmiBonnie",
  pairing_actors: "Emi Thasorn & Bonnie Pattraphus, with Film Rachanun",
  logline: "Kept-girl arrangement romance; an ex returns.",
  director: "Fon Kanittha Kwunyoo",
  total_episodes: 10,
  status: "airing",
  year: 2026,
  day_of_week: "Wed",
  air_time_ict: "20:30",
  platforms: [
    { name: "GMM25" },
    { name: "oneD" },
    { name: "iQIYI", note: "subtitled" },
  ],
  episodes: weekly("2026-08-12", 10, "20:30"),
  confidence: "confirmed",
  sources: [
    src("GMMTV / GMM25 slot", "", "2026-08-26"),
    src("Existing tracker card, last human pass", "", "2026-08-26"),
  ],
  heat: "bold",
  tags: ["Love triangle", "Ex comes back", "10 eps"],
});

add({
  id: "in-love-forever",
  title: "In Love Forever",
  studio: "Channel 3",
  pairing: "LingOrm",
  pairing_actors: "Lingling Kwong & Orm Kornnaphat",
  logline: "Post-wedding drama. LingOrm's third GL.",
  novel: "reallyb",
  total_episodes: 12,
  status: "airing",
  year: 2026,
  day_of_week: "Fri",
  air_time_ict: "20:30",
  platforms: [{ name: "Ch3Plus" }, { name: "Netflix" }],
  episodes: weekly("2026-06-19", 12, "20:30"),
  confidence: "confirmed",
  sources: [
    src("Channel 3 / Ch3Plus slot", "", "2026-08-26"),
    src("Existing tracker card, last human pass", "", "2026-08-26"),
  ],
  heat: "mainstream",
  tags: ["Marriage", "Second chance", "Romance"],
  availability_note: "Netflix availability follows Netflix regional catalogues. Not a worldwide guarantee.",
});

add({
  id: "my-ladys-bodyguard",
  title: "My Lady's Bodyguard",
  studio: "Kongthup",
  pairing: "OrmFolk",
  pairing_actors: "Ormsin Supitcha & Folk Sutima",
  logline: "Bodyguard romance.",
  total_episodes: 11,
  status: "airing",
  year: 2026,
  day_of_week: "Thu",
  air_time_ict: "20:00",
  platforms: [{ name: "YouTube" }],
  episodes: weekly("2026-06-25", 11, "20:00"),
  confidence: "confirmed",
  sources: [
    src("Kongthup YouTube slot", "", "2026-08-26"),
    src("GL Spotlight airing index (count claim)", "https://glspotlight.com/airing", "2026-08-24"),
    src("Sapphic Signal calendar (count claim)", "https://sapphicsignal.com/calendar", "2026-08-24"),
    src("MyDramaList run dates (count claim)", "https://mydramalist.com/809782-my-lady-s-bodyguard", "2026-08-24"),
  ],
  conflicts: [
    {
      id: "bodyguard-ep-count",
      topic: "Episode count and finale night",
      claims: [
        {
          claim: "Weekly from Jun 25 yields 11 Thursdays ending Sep 3 (EP 10 on Aug 27, finale Sep 3).",
          source: "GL Spotlight and Sapphic Signal, as logged Aug 24",
        },
        {
          claim: "MyDramaList lists 11 episodes across Jun 25 – Aug 27, which only works if the premiere carried a double drop, making Aug 27 the finale.",
          source: "MyDramaList",
          url: "https://mydramalist.com/809782-my-lady-s-bodyguard",
        },
      ],
      weight: "Both counts now put the show in the past as of 5 Sep 2026 ICT. The finale night (Aug 27 vs Sep 3) is still not settled by a studio statement. This file keeps 11 weekly episodes from Jun 25 so neither claim is deleted. Do not treat the total as studio-confirmed.",
      resolved: false,
    },
  ],
  heat: "bold",
  tags: ["Bodyguard", "Hidden identity", "Romance"],
});

add({
  id: "4-elements-the-fire",
  title: "4 Elements: The Fire",
  studio: "NorthStar",
  pairing: "NamneungNoey",
  pairing_actors: "Namneung Milin & Noey Kanteera",
  logline: "Book 4 of 4. Last episode of the Wathinwanit saga.",
  total_episodes: 8,
  status: "airing",
  year: 2026,
  day_of_week: "Sat",
  air_time_ict: "20:30",
  platforms: [{ name: "Ch7HD" }, { name: "iQIYI", uncut: true }],
  episodes: weekly("2026-07-11", 8, "20:30"),
  confidence: "confirmed",
  sources: [src("NorthStar / Ch7HD slot", "", "2026-08-26")],
  heat: "bold",
  tags: ["Childhood rivals", "Enemies to lovers", "Saga finale"],
});

add({
  id: "juliet-and-juliet",
  title: "Juliet & Juliet",
  studio: "one31",
  pairing: "MingmingNepjune",
  pairing_actors: "Mingming Kanyakorn & Nepjune Nutkitta",
  logline: "Rival heirs, forbidden romance, from the team behind Girl From Nowhere. Leads Tokyo and Blue meet at an all-girls school.",
  total_episodes: 10,
  status: "upcoming",
  year: 2026,
  day_of_week: "Sat",
  air_time_ict: "20:30",
  platforms: [
    { name: "one31" },
    { name: "oneD", uncut: true, note: "uncut 21:30 ICT; territory limits apply" },
  ],
  trailer_youtube_id: "Pbb7VU0VfYA",
  trailer_kind: "trailer",
  episodes: weekly("2026-09-05", 10, "20:30"),
  confidence: "confirmed",
  sources: [
    src(
      "Official trailer and premiere lock, reported by Girls Love Info",
      "https://girlsloveinfo.com/juliet-and-juliet-trailer-september-premiere/",
      "2026-08-21",
    ),
  ],
  conflicts: [
    {
      id: "juliet-ep-count",
      topic: "Episode count",
      claims: [
        { claim: "10 episodes.", source: "MyDramaList (not a studio statement)" },
        { claim: "Premiere date and air times confirmed with the official trailer.", source: "one31 / Girls Love Info, Aug 19" },
      ],
      weight: "Date and slot are confirmed. Episode count is still MDL's number, not the studio's.",
      resolved: false,
    },
  ],
  heat: "unset",
  tags: ["Rival families", "School", "Romance"],
  availability_note: "oneD uncut is geo-limited. Broadcast on one31 is Thailand.",
});

add({
  id: "fairway-of-love",
  title: "Fairway of Love",
  title_th: "รักออกรอบ",
  studio: "Mojo Muse Management",
  pairing: "IngCartoon + MinagiBam",
  pairing_actors: "Ing Thanatcha & Cartoon Kittaya; Minagi Ramaneeya & Bam Rinrada",
  logline: "Thailand's first golf-themed GL. Two-couple story. 8 episodes plus 2 specials.",
  total_episodes: 8,
  status: "upcoming",
  year: 2026,
  day_of_week: "Sun",
  air_time_ict: "22:30",
  platforms: [
    { name: "one31" },
    { name: "WeTV", uncut: true, note: "uncut 23:30 ICT" },
  ],
  pilot_youtube_id: "_3O-uyVVFvs",
  trailer_kind: "pilot",
  episodes: weekly("2026-09-06", 8, "22:30"),
  confidence: "confirmed",
  sources: [
    src("Mojo Muse on-air schedule (Sun 22:30 one31, 23:30 WeTV uncut)", "", "2026-09-04"),
    src("Existing tracker card", "", "2026-08-26"),
  ],
  heat: "unset",
  tags: ["Golf", "Two couples", "8 eps + 2 specials"],
});

add({
  id: "khom-khlang",
  title: "Khom Khlang",
  title_th: "ข่มขลัง",
  studio: "Star Hunter Entertainment",
  pairing: "BintPuinoon",
  pairing_actors: "Bint Sireethorn Leearamwat & Puinoon Warangsiri Tanajarusworaphat",
  logline: "Occult mystery. Bulan, a woman with a mysterious aura, and Peem, a police officer on a case the law cannot answer.",
  novel: "Formidable Eyes by Luxurious.W",
  director: "Mi Puwadon Naosopa",
  total_episodes: 10,
  status: "upcoming",
  year: 2026,
  day_of_week: "Mon",
  air_time_ict: null,
  platforms: [{ name: "WeTV" }],
  episodes: weekly("2026-09-07", 10, "20:00").map((e) => ({ ...e, time_unverified: true })),
  confidence: "confirmed",
  sources: [
    src("MyDramaList (date, count, platform)", "https://mydramalist.com/776639-khom-khlang", "2026-08-17"),
    src("Girls Love Info, first teaser Aug 20", "https://girlsloveinfo.com/khom-khlang-the-series-first-teaser-wetv/", "2026-08-21"),
    src("Girls Love Info, official trailer Aug 24", "https://girlsloveinfo.com/khom-khlang-the-series-official-trailer-wetv-premiere/", "2026-08-24"),
  ],
  conflicts: [
    {
      id: "khom-studio",
      topic: "Production house",
      claims: [
        { claim: "Star Hunter Entertainment.", source: "GL Spotlight upcoming index" },
        { claim: "No company named.", source: "MyDramaList" },
      ],
      weight: "Treat the studio credit as the softer fact. Premiere Monday 7 Sep on WeTV is the firmer one. Air clock time is not in the migrated notes, so episode timestamps are date-only with time_unverified.",
      resolved: false,
    },
  ],
  heat: "unset",
  tags: ["Occult", "Mystery", "Police"],
});

add({
  id: "pls-love",
  title: "PLS Love",
  studio: "Channel 3",
  pairing: "LenaMiu",
  pairing_actors: "Lena Lorena Schuett & Miu Natsha Taechamongkalapiwat",
  logline: "Lounge-club owner and the businesswoman who looks down on her. LenaMiu's second project after My Safe Zone.",
  novel: "Pls Love by Reverse",
  total_episodes: 8,
  status: "upcoming",
  year: 2026,
  day_of_week: "Fri",
  air_time_ict: "20:30",
  platforms: [{ name: "Channel 3" }, { name: "Ch3Plus" }],
  trailer_youtube_id: "ChOeHSKjYTE",
  trailer_kind: "teaser",
  episodes: weekly("2026-09-11", 8, "20:30"),
  confidence: "confirmed",
  sources: [
    src("MyDramaList run dates", "https://mydramalist.com/806010-pls-love", "2026-08-21"),
    src(
      "Girls Love Info, second teaser locking Fri 11 Sep 20:30 Channel 3 / 3Plus",
      "https://girlsloveinfo.com/pls-love-new-teaser-september-premiere/",
      "2026-08-24",
    ),
  ],
  conflicts: [
    {
      id: "pls-ep-count",
      topic: "Episode count",
      claims: [
        { claim: "8 episodes, 45 min, Sep 11 – Oct 30.", source: "MyDramaList" },
        { claim: "Friday 11 Sep, 20:30 ICT, Channel 3 and 3Plus.", source: "Official teaser / Girls Love Info, Aug 23" },
      ],
      weight: "Air time is a stated fact. The 8-episode count is still MDL's number.",
      resolved: false,
    },
  ],
  heat: "mainstream",
  tags: ["Class", "Club", "Romance"],
});

add({
  id: "third-person",
  title: "Third Person",
  title_th: "ถ้อยรักคำลวง",
  studio: "NorthStar Entertainment",
  pairing: "Garn & Mimie",
  pairing_actors: "Garn Nuttacha Ratchayangkanont & Mimie Bhapat Ahchariyasripong, with Piglet Charada Imraporn",
  logline: "Four years after an accident, Chris has rebuilt a life with Nadia until a woman named Sun starts pulling at what she was told.",
  novel: "Third Person by SIIX",
  director: "Film Pawis Sowsrion & Arisa Wawwanjit",
  total_episodes: 10,
  status: "upcoming",
  year: 2026,
  day_of_week: "Sat",
  air_time_ict: null,
  platforms: [{ name: "TBA", note: "Broadcast platform not named by sourced statements" }],
  episodes: weekly("2026-09-12", 10, "20:30").map((e) => ({ ...e, time_unverified: true })),
  confidence: "confirmed",
  sources: [
    src("MyDramaList", "https://mydramalist.com/809264-third-person", "2026-08-21"),
  ],
  conflicts: [
    {
      id: "third-person-platform",
      topic: "Broadcast platform and air clock",
      claims: [
        { claim: "Premiere 12 Sep, Saturdays, 10 eps.", source: "MyDramaList, corroborated by GL Spotlight upcoming index" },
        { claim: "Channel 7 plus an uncut streaming partner is NorthStar's usual pattern.", source: "Inference, not a fact" },
      ],
      weight: "Date is the firmer fact. Platform is not named. Usual-pattern inference is labelled as such and is not used as a claim.",
      resolved: false,
    },
  ],
  heat: "bold",
  tags: ["Amnesia", "Drama"],
});

add({
  id: "under-her-rules",
  title: "Under Her Rules",
  title_th: "ใต้เงาจันทรา",
  studio: "MGI Beyond / MFlow Entertainment",
  pairing: "Aoom & Meena",
  pairing_actors: "Aoom Thaweeporn Phingchamrat & Meena Rina Chatamonchai",
  logline: "Boss-and-assistant workplace romance.",
  total_episodes: 8,
  status: "upcoming",
  year: 2026,
  day_of_week: "Sat",
  air_time_ict: null,
  platforms: [{ name: "iQIYI" }],
  episodes: weekly("2026-10-17", 8, "20:30").map((e) => ({ ...e, time_unverified: true })),
  confidence: "confirmed",
  sources: [
    src("MyDramaList run dates", "https://mydramalist.com/802500-under-her-rules", "2026-08-17"),
  ],
  heat: "unset",
  tags: ["Workplace", "Boss/assistant"],
});

add({
  id: "buy-my-boss",
  title: "Buy My Boss",
  studio: "FRT Entertainment",
  pairing: "YingAom",
  pairing_actors: "Ying Anada & Aom, with PlaWhawha as supporting couple",
  logline: "Escort turns out to be the boss. Workplace romance.",
  novel: "FoxyFox",
  total_episodes: 8,
  status: "upcoming",
  year: 2026,
  day_of_week: "Wed",
  air_time_ict: null,
  platforms: [{ name: "YouTube" }],
  episodes: weekly("2026-10-28", 8, "20:30").map((e) => ({ ...e, time_unverified: true })),
  confidence: "confirmed",
  sources: [
    src(
      "FRT Entertainment premiere date, Aug 5, reported by Girls Love Info",
      "https://girlsloveinfo.com/buy-my-boss-premiere-date-poster-october-2026/",
      "2026-08-17",
    ),
  ],
  heat: "bold",
  tags: ["Workplace", "8 eps"],
});

add({
  id: "love-bound",
  title: "Love Bound",
  title_th: "รักนี้ตีตรา",
  studio: "Kongthup",
  pairing: "OrmFolk",
  pairing_actors: "Ormsin Supitcha & Folk Sutima, plus three supporting couples",
  logline: "Three interlocking love stories. OrmFolk's follow-up to My Lady's Bodyguard. Pilot already released.",
  total_episodes: null,
  status: "upcoming",
  year: 2026,
  day_of_week: null,
  air_time_ict: null,
  platforms: [{ name: "TBA" }],
  episodes: [],
  confidence: "confirmed",
  sources: [
    src(
      "Kongthup November 2026 window and supporting recast, Aug 24, Girls Love Info",
      "https://girlsloveinfo.com/love-bound-announces-three-cast-changes/",
      "2026-08-25",
    ),
  ],
  heat: "bold",
  tags: ["Nov 2026 window", "Follow-up"],
  wrap_note: "November 2026 window confirmed. Exact date, episode count and platform not stated.",
});

add({
  id: "bake-love-feeling",
  title: "Bake Love Feeling",
  studio: "GMMTV",
  pairing: "ViewMim",
  pairing_actors: "View Benyapa & Mim Rattanawadee",
  logline: "Bakery/food. Whale Store XOXO universe.",
  total_episodes: null,
  status: "upcoming",
  year: 2026,
  day_of_week: "Thu",
  air_time_ict: null,
  platforms: [{ name: "GMM25" }],
  trailer_youtube_id: "NFFWV0X4i_c",
  trailer_kind: "pilot",
  episodes: [{ number: 1, airs_at: ict("2026-12-31", "20:30"), time_unverified: true }],
  confidence: "confirmed",
  sources: [src("GMMTV premiere date Dec 31, 2026", "", "2026-08-26")],
  heat: "bold",
  tags: ["Bakery", "Whale Store universe"],
});

// ── Announced / undated ────────────────────────────────────────────────────

const announced = [
  {
    id: "ditto",
    title: "Ditto",
    studio: "GMMTV",
    pairing: "MilkLove",
    pairing_actors: "Milk Pansa & Love Pattranite",
    logline: "Workplace/career.",
    novel: "Zezeho",
    platforms: [{ name: "GMM25" }],
    trailer_youtube_id: "30LfbsWHCW4",
    trailer_kind: "pilot",
    confidence: "announced",
    heat: "bold",
    tags: ["Workplace", "TBA 2026"],
    wrap_note: "TBA 2026. Official pilot released.",
  },
  {
    id: "her",
    title: "Her",
    title_th: "รักของเธอ",
    studio: "GMMTV",
    pairing: "NamtanFilm",
    pairing_actors: "Namtan Tipnaree & Film Rachanun",
    platforms: [{ name: "GMM25" }],
    trailer_youtube_id: "OXfExloO350",
    trailer_kind: "pilot",
    confidence: "announced",
    heat: "bold",
    tags: ["Year disputed"],
    sources: [src("Existing tracker card", "", "2026-08-21")],
    conflicts: [
      {
        id: "her-year-premise",
        topic: "Year, premise and pairing",
        claims: [
          { claim: "NamtanFilm drama, 2026 or 2027.", source: "How this title has been described on this tracker" },
          { claim: "Filed under 2027 as a revenge plot in which a man returns as a woman.", source: "GL Spotlight, flagged Aug 21" },
        ],
        weight: "Either GL Spotlight has the wrong show attached or the project changed shape. Do not treat the year, the premise or the pairing as settled until GMMTV says something.",
        resolved: false,
      },
    ],
  },
  {
    id: "oxytoxin",
    title: "Oxytoxin",
    studio: "GMMTV",
    pairing: "Waifha, Tonkhaw, Benz, Yogurt, Pang",
    logline: "New-gen school ensemble. Clique drama.",
    platforms: [{ name: "GMM25" }],
    trailer_youtube_id: "QNvnpjbNrRg",
    trailer_kind: "pilot",
    confidence: "announced",
    heat: "bold",
    tags: ["School", "Ensemble", "TBA 2026"],
  },
  {
    id: "loves-echoes",
    title: "Love's Echoes",
    studio: "GMMTV",
    pairing: "Jaoying & Mewnich",
    pairing_actors: "Jaoying Krongkwan & Mewnich Nannaphas (recast)",
    logline: "Cultural/dance. Hearing-disability representation. June Wanwimol pairing ended Jul 13; Jaoying announced Jul 20.",
    platforms: [{ name: "GMM25" }],
    confidence: "announced",
    heat: "bold",
    tags: ["Recast", "TBA 2026"],
    wrap_note: "Original June/Mewnich pilot pulled from YouTube. No pilot yet for the Jaoying/Mewnich version.",
  },
  {
    id: "shades-special-s2",
    title: "Shades — Special Episodes + Season 2",
    studio: "FRT Entertainment",
    pairing: "Elite girls' school ensemble",
    pairing_actors: "Mook, Niky, England, Ploy, Puyfai, Mint, Opal, Shuu",
    logline: "6 special episodes confirmed Jul 12 to expand S1, then Season 2 early 2027. S1 (6 eps) completed Jul 11. No special-episode air date.",
    platforms: [{ name: "YouTube" }],
    confidence: "announced",
    heat: "bold",
    tags: ["Undated", "S2 early 2027"],
  },
  {
    id: "dangerous-queen-special",
    title: "Dangerous Queen — Special Edition",
    studio: "",
    pairing: "Tangkwa & Nur",
    pairing_actors: "Tangkwa Phinyanech & Nur Desoraya",
    logline: "Filming underway as of Jul 18 (second teaser). No premiere window.",
    platforms: [{ name: "YouTube" }],
    trailer_youtube_id: "eztbhZDstn0",
    trailer_kind: "teaser",
    confidence: "fan_sourced",
    heat: "unset",
    tags: ["Undated", "Teaser only"],
  },
  {
    id: "wish-upon-a-star",
    title: "Wish Upon a Star",
    studio: "GMMTV",
    pairing: "PahnFond",
    pairing_actors: "Pahn Pathitta & Fond Natticha",
    logline: "High-school time travel. Fantasy.",
    platforms: [{ name: "GMM25" }],
    trailer_youtube_id: "gniuiRNJh10",
    trailer_kind: "pilot",
    confidence: "announced",
    heat: "bold",
    tags: ["Time travel", "TBA 2026"],
  },
  {
    id: "firstlove",
    title: "FirstLove",
    studio: "22Style Entertainment",
    pairing: "Pim & Idea",
    pairing_actors: "Pim Chanitapa Pornkamonlaphop & Idea Nattichacha Butsrichaichat",
    logline: "High-school first-love drama. Original story by Yothin Bututham, dir. Gift Suphanan. No episode count, platform or window.",
    platforms: [{ name: "TBA" }],
    confidence: "announced",
    sources: [
      src(
        "Studio announcement, reported by Girls Love Info Aug 12",
        "https://girlsloveinfo.com/firstlove-thai-gl-series-22styleentertainment/",
        "2026-08-17",
      ),
    ],
    tags: ["Undated", "May not clear 8-ep bar"],
  },
  {
    id: "love-above-the-clouds",
    title: "Love Above the Clouds",
    title_th: "ลวงรักเกมเหนือเมฆ",
    studio: "CUU Thailand (Century UU)",
    pairing: "AnnaThisa",
    pairing_actors: "Anna Sueangam-iam & Thisa Varitthisa",
    logline: "Their first GL. Spy/espionage romance.",
    novel: "vanillasign",
    platforms: [{ name: "TBA" }],
    trailer_youtube_id: "bw9TWxqpDqk",
    trailer_kind: "pilot",
    confidence: "announced",
    tags: ["Spy", "2026–27 undated"],
  },
  {
    id: "love-in-bloom",
    title: "Love in Bloom",
    title_th: "รักอุ่นกรุ่นกลิ่นฝน",
    studio: "Monomax",
    pairing: "TungpangJessie",
    pairing_actors: "Tungpang Pattaravadee & Jessie Natsiya",
    logline: "Romantic drama. Reunites Heart Code leads.",
    platforms: [{ name: "Monomax" }],
    confidence: "fan_sourced",
    conflicts: [
      {
        id: "bloom-year",
        topic: "Release year",
        claims: [
          { claim: "Early 2027 (tracker estimate).", source: "This tracker, prior pass" },
          { claim: "2026 release.", source: "GL Spotlight upcoming index, flagged Aug 21" },
        ],
        weight: "Neither is a Monomax statement. No month or day exists on either side.",
        resolved: false,
      },
    ],
    tags: ["Year disputed"],
  },
  {
    id: "final-round",
    title: "Final Round: The Last Round…For Her",
    studio: "IDX Entertainment",
    pairing: "Leads not named in the announcement",
    logline: "Boxing-academy romance. Channel 9 MCOT HD plus online. March 2027. Funded in part by the Ministry of Culture 2026 support program.",
    platforms: [{ name: "MCOT HD" }],
    confidence: "announced",
    sources: [
      src(
        "IDX lineup at Thai Content Experience 2026, Girls Love Info Aug 18",
        "https://girlsloveinfo.com/final-round-idx-entertainment-new-gl-series/",
        "2026-08-21",
      ),
    ],
    conflicts: [
      {
        id: "final-round-girls-fight",
        topic: "Possible rename overlap",
        claims: [
          { claim: "Final Round, boxing-academy romance, March 2027.", source: "IDX / Girls Love Info" },
          { claim: "IDX title 'Girls Fight' with a boxing-camp premise.", source: "GL Spotlight, separately listed" },
        ],
        weight: "These may be two projects or one renamed. Unresolved.",
        resolved: false,
      },
    ],
    tags: ["Boxing", "March 2027"],
  },
  {
    id: "resonance",
    title: "Resonance: Our Song of Love",
    studio: "VelCurve Studio",
    pairing: "FriendPalm",
    pairing_actors: "Friend Torfan Taweema & Palm Paramee Luengnaruemitchai",
    logline: "Shot in Himeji, Japan. Dir. Justina Suwanvihok. First lead roles after supporting turns in Love Design.",
    director: "Justina Suwanvihok",
    platforms: [{ name: "TBA" }],
    confidence: "announced",
    sources: [
      src(
        "VelCurve at Thai Content Experience 2026, Girls Love Info Aug 22",
        "https://girlsloveinfo.com/resonance-friend-palm-first-gl-series/",
        "2026-08-24",
      ),
    ],
    tags: ["Undated", "Japan shoot"],
  },
  {
    id: "when-osmanthus-blooms",
    title: "When Osmanthus Blooms",
    studio: "Yubaba Studios",
    pairing: "Not yet named",
    logline: "Introduced Aug 18. No platform, episode count or window.",
    platforms: [{ name: "TBA" }],
    confidence: "announced",
    sources: [
      src(
        "Girls Love Info Aug 18",
        "https://girlsloveinfo.com/yubaba-studios-when-osmanthus-blooms-gl-series/",
        "2026-08-21",
      ),
    ],
    tags: ["Undated", "May not clear 8-ep bar"],
  },
  {
    id: "the-dragon-house",
    title: "The Dragon House",
    title_th: "เพลิงมังกร",
    studio: "Uprising Entertainment",
    pairing: "Wonderframe, Prom, Irin & Phoenix",
    logline: "Action GL. Adapted from Salmon's 'The Dragon, The Tiger and The Swan' trilogy. Self-financed at about 25M baht after 20+ investor rejections. Episode 1 confirmed ready to enter filming Aug 25.",
    platforms: [{ name: "TBA" }],
    confidence: "announced",
    sources: [
      src(
        "Girls Love Info, filming start",
        "https://girlsloveinfo.com/the-dragon-house-finally-begins-filming/",
        "2026-08-25",
      ),
    ],
    tags: ["Action", "Undated", "Self-financed"],
  },
  {
    id: "lunar-secret",
    title: "Lunar Secret",
    title_th: "พระจันทร์ซ่อนเงา",
    studio: "NorthStar Entertainment",
    pairing: "JaynaGinny",
    pairing_actors: "Jayna Angelina Stevens & Ginny Natnicha Prateepnatsri",
    logline: "Entertainment-industry rivalry. Pavida of the runway against Alin of the screen. Pilot released on NorthStar's channel.",
    novel: "พระจันทร์สีม่วง (Purple Moon)",
    platforms: [{ name: "TBA" }],
    confidence: "announced",
    sources: [src("Existing tracker radar card", "", "2026-08-24")],
    conflicts: [
      {
        id: "lunar-date",
        topic: "Premiere window",
        claims: [
          { claim: "Bare 2026, no month or day.", source: "GL Spotlight upcoming index" },
          { claim: "'Later this year' from a Feb 14 announcement.", source: "Prior tracker note" },
          { claim: "Sep–Dec shoot, early-2027 premiere.", source: "Circulating fan reports" },
        ],
        weight: "Nothing resolved as of Aug 24. MyDramaList still has no year, no episode count and no air date.",
        resolved: false,
      },
    ],
    tags: ["Undated", "Pilot released"],
  },
  {
    id: "cranium",
    title: "Cranium",
    studio: "TBC",
    pairing: "FreenBecky",
    pairing_actors: "Freen Sarocha & Becky Armstrong",
    logline: "Forensic mystery / psychological thriller. Freen as Dr. Phinya 'Phin' Thananon, Becky as Dr. Bussaya 'Bua' Methin. Presented at Cannes 2025.",
    total_episodes: 12,
    platforms: [{ name: "TBA" }],
    trailer_youtube_id: "lgbQKzoliY4",
    trailer_kind: "pilot",
    confidence: "unverified",
    sources: [
      src("craniumglseries.com status line", "https://craniumglseries.com/", "2026-08-21"),
      src("thaiglhub.com cancelled flag", "", "2026-08-21"),
    ],
    conflicts: [
      {
        id: "cranium-status",
        topic: "Is the series cancelled, in production, or in development?",
        claims: [
          { claim: "CANCELLED; rights availability unconfirmed.", source: "thaiglhub.com, updated Jul 29 2026" },
          { claim: "In production; principal photography logged as beginning July 2026. Supporting cast Namtarn Pichukkana and Frung Prompatcha added.", source: "craniumglseries.com, re-checked Aug 21" },
          { claim: "In Development.", source: "TVMaze" },
          { claim: "Never cancelled, indefinitely postponed.", source: "A widely circulated fan account" },
        ],
        weight: "Three sources against thaiglhub's lone CANCELLED flag; none of the four is a studio statement, so the badge stays Unverified. Weight leans away from a clean cancellation, not toward a locked production. Producer still TBC (North Star or Velcurve rumored, not Idol Factory).",
        resolved: false,
      },
    ],
    tags: ["Status disputed", "Forensic"],
  },
];

for (const a of announced) {
  add({
    status: "upcoming",
    year: 2026,
    total_episodes: a.total_episodes ?? null,
    episodes: [],
    sources: a.sources || [src("Existing tracker card", "", "2026-08-26")],
    conflicts: a.conflicts || [],
    heat: a.heat || "unset",
    ...a,
  });
}

// ── Wrapped 2026 ───────────────────────────────────────────────────────────

const wrapped2026 = [
  ["ai-girl", "AI Girl", "จะ Gen จนกว่าจะเจอ", "MeMindY", "MeMindY new-gen pairing", 7, "YouTube+iQIYI", "Sci-fi rom-com", "2026-07-01", "2026-08-12"],
  ["chasing-love", "Chasing Love", "เสน่หา", "Change 2561", "NileNamwan (Nile Chanidapa & Namwan Natchaya)", 8, "oneD+Netflix", "Workplace", "2026-05-29", "2026-07-17"],
  ["heart-code", "Heart Code", "", "Monomax", "TungpangJessie", 7, "Monomax", "Action/police", "2026-02-13", "2026-03-13"],
  ["enemies-with-benefits", "Enemies with Benefits", "", "GMMTV", "JanJingJing (Jan Ployshompoo & JingJing Yu)", 10, "GMM25+oneD", "Whale Store universe", "2026-05-03", "2026-07-06"],
  ["4-elements-the-air", "4 Elements: The Air", "", "NorthStar", "FreenBecky", 8, "Ch7HD+iQIYI", "Book 3", "2026-05-16", "2026-07-04"],
  ["love-beyond-dreams", "Love Beyond Dreams", "", "MeMindY", "MieAya (Mie Phattaranan & Aya Orapan)", 7, "YouTube+iQIYI", "More Than Her slate", "2026-05-06", "2026-06-17"],
  ["fulfill", "Fulfill", "", "Channel 3", "OomBam (Oom Eisaya & Bam Saralee)", 8, "Channel 3", "Life after marriage", "2026-04-24", "2026-06-12"],
  ["girl-rules", "Girl Rules", "", "GMMTV", "MilkLove · NamtanFilm · ViewMim", 12, "GMM25+iQIYI", "Fashion ensemble", "2026-03-09", "2026-06-01"],
  ["hometown-romance", "Hometown Romance", "", "Change 2561", "LMSY (Lookmhee & Sonya)", 8, "oneD+YouTube", "", "2026-04-03", "2026-05-22"],
  ["broken-of-love", "Broken of Love", "", "Fabel Entertainment", "FayeAtom (Faye Peraya & Atom Pariya)", 8, "YouTube", "", "2026-03-28", "2026-05-16"],
  ["4-elements-the-water", "4 Elements: The Water", "", "NorthStar", "EngLot (Engfa Waraha & Charlotte Austin)", 8, "Ch7HD+iQIYI", "Book 2", "2026-03-21", "2026-05-09"],
  ["shadow-of-love", "Shadow of Love", "", "Kongthup", "FahBell + GunDonut", 24, "YouTube", "Two couples", "2026-03-24", "2026-05-12"],
  ["my-only-sunshine", "My Only Sunshine", "", "Star Hunter", "Atom & Mersedes", null, "GMM5+iQIYI", "", "2026-02-25", ""],
  ["play-park", "Play Park", "", "Channel 3", "TanYada (Tan Duangkaew & Yada Narilya)", null, "Channel 3", "Amusement park", "2026-02-20", ""],
  ["frozen-valentine", "Frozen Valentine", "", "Copy A Bangkok", "NattyYeepun (Natty Nathamon & Yeepun Purichaya)", null, "WeTV", "", "2026-02-12", ""],
  ["i-wanna-be-suptar", "I Wanna Be Sup'tar", "", "Change 2561", "LillyBelle + FayGene", null, "oneD", "GL remake", "2026-02-06", ""],
  ["be-my-angel", "Be My Angel", "", "Pennyy Studio", "BamBamBaipor (BamBam Niwirin & Baipor Thitiya)", 8, "iQIYI", "", "2026-01-30", "2026-03-20"],
  ["4-elements-the-earth", "4 Elements: The Earth", "", "NorthStar", "AppleMim (Apple Lapisara & Mim Panthita)", 8, "Ch7HD+iQIYI", "Book 1", "2026-01-24", "2026-03-14"],
  ["denied-love-special", "Denied Love Special: Endless", "", "Kongthup", "JuneEnjoy (June Nannirin & Enjoy Thidarat)", 2, "WeTV", "Continuation", "2026-01-29", "2026-01-29"],
  ["rental-love-lab", "Rental Love Lab", "", "K11D House", "Kitty, Punch & BMine", null, "YouTube", "Ensemble", "2026-05-29", "2026-06-05"],
  ["shades-s1", "Shades (EP 1–6)", "", "FRT Entertainment", "Elite girls' school ensemble", 6, "YouTube", "S2 arc announced separately", "2026-04-18", "2026-07-11"],
];

const heatStudios = new Set(["GMMTV", "NorthStar", "Kongthup", "Fabel Entertainment", "Change 2561", "FRT Entertainment", "IdolFactory", "MeMindY"]);
const tameStudios = new Set(["Channel 3"]);

for (const [id, title, title_th, studio, pairing, eps, plats, logline, start, end] of wrapped2026) {
  const platforms = plats.split("+").map((name) => ({ name }));
  add({
    id,
    title,
    title_th,
    studio,
    pairing,
    logline,
    total_episodes: eps,
    status: "wrapped",
    year: 2026,
    platforms,
    episodes: [],
    confidence: "aired",
    heat: heatStudios.has(studio) ? "bold" : tameStudios.has(studio) ? "mainstream" : "unset",
    tags: [end ? `${start} – ${end}` : `Premiered ${start}`],
    wrap_note: end ? `Aired ${start} to ${end}` : `Premiered ${start}`,
    sources: [src("Existing tracker wrapped shelf", "", "2026-08-26")],
  });
}

// ── Library 2025 ───────────────────────────────────────────────────────────

const lib2025 = [
  ["us", "Us", "เรา", "GMMTV", "MilkLove (Milk Pansa & Love Pattranite)", 12, "GMM25+YouTube", "#1 fan-rated GL of 2025", "bold"],
  ["clairebell", "ClaireBell", "", "", "Mable Siriwalee & Pangjie Paphavarin", 8, "YouTube", "Co-created by Davika", "unset"],
  ["love-design", "Love Design", "", "Velcurve", "KaoJane (Kao Supassara & Jane Methika)", 8, "WeTV+Netflix", "Rival architects, ex-lovers", "unset"],
  ["harmony-secret", "Harmony Secret", "", "Channel 3", "LingOrm", 8, "Netflix+Ch3Plus", "Affair universe", "mainstream"],
  ["poisonous-love", "Poisonous Love", "พิษรัก", "NorthStar", "JaynaGinny", 11, "one31+YouTube", "NorthStar's first GL", "bold"],
  ["queendom", "Queendom", "", "", "Ensemble", 12, "YouTube", "", "unset"],
  ["roller-coaster", "Roller Coaster", "", "Channel 3", "ShellyPundao (Shelly Phetsai & Aom Pundao)", 8, "Channel 3", "", "mainstream"],
  ["somewhere-somehow", "Somewhere Somehow", "รักปากแข็ง", "IdolFactory", "FayMay (Fay Kanyaphat & May Yada)", 13, "YouTube", "Aug 8 – Oct 31 2025. Corrected Aug 25: previously miscredited to FreenBecky.", "bold"],
  ["whale-store-xoxo", "Whale Store XOXO", "", "GMMTV", "MilkLove", 10, "Netflix+YouTube", "Spawned EWB and Girl Rules universe", "bold"],
  ["my-safe-zone", "My Safe Zone", "", "Channel 3", "LenaMiu", 8, "Channel 3", "Oct 24 – Dec 12 2025", "mainstream"],
  ["reverse-with-me", "Reverse with Me", "", "Channel 3", "Channel 3 ensemble", 8, "Ch3+iQIYI", "Zezeho time-travel universe", "mainstream"],
  ["denied-love", "Denied Love", "", "Kongthup", "JuneEnjoy", 10, "WeTV", "Arranged marriage", "bold"],
  ["player", "Player", "ไม่อาจห้ามรัก", "", "Memi Muanfun & Ploy", 12, "YouTube", "Novel by SIIX", "unset"],
  ["runaway", "Runaway", "", "", "Ensemble", 8, "YouTube", "", "unset"],
  ["dangerous-queen", "Dangerous Queen", "คนโปรดของควีน", "", "Tangkwa Phinyanech & Nur Desoraya", 8, "YouTube", "Novel by Khun Phuying", "unset"],
  ["like-a-palette", "Like a Palette", "", "WonderLife Entertainment", "Alicha Sripratak & Sureeyares Yakares", 8, "YouTube", "", "unset"],
  ["only-you", "Only You", "", "Channel 3", "LingOrm", 14, "Netflix+Channel 3", "Pop star + bodyguard", "mainstream"],
];

for (const [id, title, title_th, studio, pairing, eps, plats, logline, heat] of lib2025) {
  add({
    id,
    title,
    title_th,
    studio,
    pairing,
    logline,
    total_episodes: eps,
    status: "library",
    year: 2025,
    platforms: plats.split("+").map((name) => ({ name })),
    episodes: [],
    confidence: "aired",
    heat,
    tags: ["2025"],
    sources: [src("Existing tracker 2025 shelf", "", "2026-08-26")],
  });
}

const lib2024 = [
  ["gap", "GAP: The Series", "ทฤษฎีสีชมพู", "IdolFactory", "FreenBecky", 12, "YouTube+Channel 3", "Foundation card. First GL on Thai national TV. Nov 19 2022 – Feb 11 2023.", 2022, "bold"],
  ["the-secret-of-us", "The Secret of Us", "ใจซ่อนรัก", "IdolFactory", "FreenBecky", 8, "YouTube", "", 2024, "bold"],
  ["twenty-three-five", "23.5", "องศาที่โลกเอียง", "GMMTV", "", 12, "YouTube+GMM25+iQIYI", "", 2024, "bold"],
  ["affair", "Affair", "รักเล่นกล", "Change 2561", "", 8, "YouTube+one31+iQIYI", "Full series free on CHANGE2561 YouTube", 2024, "bold"],
  ["pluto", "Pluto", "นิทาน ดวงดาว ความรัก", "GMMTV", "", 12, "YouTube+GMM25", "", 2024, "bold"],
  ["apple-my-love", "Apple My Love", "", "", "", 6, "YouTube+WeTV", "Uncut on WeTV", 2024, "unset"],
  ["the-loyal-pin", "The Loyal Pin", "ปิ่นภักดิ์", "IdolFactory", "", 16, "YouTube+Workpoint", "", 2024, "bold"],
  ["my-marvellous-dream-is-you", "My Marvellous Dream Is You", "ฝันนี้มีแค่ฉัน", "", "", 7, "YouTube", "", 2024, "unset"],
  ["mate", "Mate", "เมท เดอะ ซีรีส์", "", "", 12, "YouTube", "", 2024, "unset"],
  ["reverse-4-you", "Reverse 4 You", "ผันวันให้ดี", "", "", 8, "YouTube", "", 2024, "unset"],
  ["petrichor", "Petrichor", "", "", "EngLot (Engfa Waraha & Charlotte Austin)", 10, "YouTube", "Acclaimed crime drama", 2024, "unset"],
];

for (const [id, title, title_th, studio, pairing, eps, plats, logline, year, heat] of lib2024) {
  add({
    id,
    title,
    title_th,
    studio,
    pairing,
    logline,
    total_episodes: eps,
    status: "library",
    year,
    platforms: plats.split("+").map((name) => ({ name })),
    episodes: [],
    confidence: "aired",
    heat,
    tags: [String(year)],
    sources: [src("Existing tracker 2024 shelf", "", "2026-08-26")],
  });
}

const hot_takes = [
  { id: "dragon-filming", couple: "The Dragon House · Uprising", actors: "Wonderframe, Prom, Irin & Phoenix", date: "2026-08-25", kind: "Filming", text: "Episode 1 confirmed ready to enter filming after years of funding fights.", source_label: "Girls Love Info, Aug 25" },
  { id: "lovebound-cast", couple: "OrmFolk", actors: "Ormsin Supitcha & Folk Sutima", date: "2026-08-24", kind: "Casting", text: "Kongthup announced three supporting-cast changes for Love Bound and confirmed the November 2026 premiere window.", source_label: "Girls Love Info, Aug 24" },
  { id: "ling-award", couple: "LingOrm", actors: "Lingling Kwong & Orm Kornnaphat", date: "2026-08-19", kind: "Award", text: "Lingling named Most Beautiful Woman Alive 2026 in the annual fan vote. A fan-vote poll, not an industry jury.", source_url: "https://girlsloveinfo.com/lingling-kwong-most-beautiful-woman-alive-2026/" },
  { id: "milklove-icons", couple: "MilkLove", actors: "Milk Pansa & Love Pattranite", date: "2026-08-20", kind: "Award", text: "Both named Entertainment Leaders at Lifestyle Asia 50 Icons 2026.", source_url: "https://girlsloveinfo.com/thai-gl-stars-lifestyle-asia-50-icons-2026/" },
  { id: "juliet-trailer", couple: "MingmingNepjune", actors: "Mingming Kanyakorn & Nepjune Nutkitta", date: "2026-08-19", kind: "Trailer", text: "Official Juliet & Juliet trailer released, locking the Sep 5 premiere on one31 with uncut on oneD." },
  { id: "khom-teaser", couple: "BintPuinoon", actors: "Bint Sireethorn & Puinoon Warangsiri", date: "2026-08-20", kind: "Trailer", text: "First Khom Khlang teaser released ahead of the Sep 7 WeTV premiere." },
  { id: "khom-trailer", couple: "BintPuinoon", actors: "Bint Sireethorn & Puinoon Warangsiri", date: "2026-08-24", kind: "Trailer", text: "Full official trailer followed the teaser.", source_url: "https://girlsloveinfo.com/khom-khlang-the-series-official-trailer-wetv-premiere/" },
  { id: "pls-teaser", couple: "LenaMiu", actors: "Lena Lalina & Miu Natsha", date: "2026-08-23", kind: "Trailer", text: "Second PLS Love teaser pinned Friday Sep 11, 8:30 PM GMT+7, Channel 3 and 3Plus." },
  { id: "resonance-cast", couple: "FriendPalm", actors: "Friend Torfan Taweema & Palm Paramee Luengnaruemitchai", date: "2026-08-22", kind: "Casting", text: "Cast as leads of Resonance: Our Song of Love for VelCurve Studio at Thai Content Experience 2026." },
];

const catalog = {
  generated_at: "2026-09-04T13:24:00-04:00",
  verified_at: "2026-09-04",
  timezone: "Asia/Bangkok",
  notes: [
    "Migrated from tracker.html (last human pass Aug 26 2026). Episode air dates for dated 2026 runs are generated from the last known episode plus the weekly slot, not retyped as prose.",
    "Status (airing / upcoming / wrapped) is computed at read time against now in Asia/Bangkok. Do not hand-edit status to 'fix' a stale page.",
    "Hot takes older than seven days are hidden by the renderer. That is the intended behaviour.",
  ],
  series,
  hot_takes,
};

const json = JSON.stringify(catalog, null, 2) + "\n";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["data/series.json", "src/data/series.json", "public/data/series.json"];
for (const rel of targets) {
  const dest = join(root, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (rel !== "data/series.json" && !existsSync(dirname(dest))) continue;
  writeFileSync(dest, json);
  console.log("wrote", rel);
}
console.log(`Wrote ${series.length} series, ${hot_takes.length} hot takes, ${json.length} bytes`);

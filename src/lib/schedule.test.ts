import assert from "node:assert/strict";
import { test } from "node:test";
import catalog from "../../data/series.json" with { type: "json" };
import { computeCatalog, computeSeries } from "./schedule.ts";
import type { Catalog } from "./types.ts";

const data = catalog as Catalog;

/** The incident: as of 4 Sep 2026 afternoon EDT, The Fire finale (29 Aug) must not be upcoming. */
test("The Fire finale is wrapped after 29 Aug 2026 20:30 ICT", () => {
  const now = Date.parse("2026-09-04T13:24:00-04:00");
  const fire = data.series.find((s) => s.id === "4-elements-the-fire");
  assert.ok(fire);
  const computed = computeSeries(fire, now);
  assert.equal(computed.derivedStatus, "wrapped");
  assert.equal(computed.finaleAired, true);
  assert.equal(computed.nextEpisode, null);
});

test("In Love Forever finale on 4 Sep 20:30 ICT is wrapped by 5 Sep 00:24 ICT", () => {
  const now = Date.parse("2026-09-05T00:24:00+07:00");
  const show = data.series.find((s) => s.id === "in-love-forever");
  assert.ok(show);
  const computed = computeSeries(show, now);
  assert.equal(computed.derivedStatus, "wrapped");
  assert.equal(computed.airedCount, 12);
});

test("Juliet & Juliet premiere is tonight, never listed as aired before 20:30 ICT 5 Sep", () => {
  const now = Date.parse("2026-09-05T00:24:00+07:00");
  const show = data.series.find((s) => s.id === "juliet-and-juliet");
  assert.ok(show);
  const computed = computeSeries(show, now);
  assert.equal(computed.derivedStatus, "upcoming");
  assert.ok(computed.nextEpisode);
  assert.equal(computed.nextEpisode.number, 1);
  assert.equal(computed.nextEpisode.isTonight, true);
  assert.equal(computed.nextEpisode.isPast, false);
});

test("upcoming week never contains a past episode", () => {
  const now = Date.parse("2026-09-05T00:24:00+07:00");
  const view = computeCatalog(data, now);
  for (const ep of view.upcomingWeek) {
    assert.equal(ep.isPast, false, `${ep.series.title} EP ${ep.number} leaked into upcoming`);
  }
  const fire = view.upcomingWeek.find((e) => e.series.id === "4-elements-the-fire");
  assert.equal(fire, undefined);
});

test("hot takes older than seven days roll off", () => {
  const now = Date.parse("2026-09-05T00:24:00+07:00");
  const view = computeCatalog(data, now);
  assert.equal(view.hotTakes.length, 0);
});

test("Moonshadow next is EP 5 on 9 Sep after EP 4 aired 2 Sep", () => {
  const now = Date.parse("2026-09-05T00:24:00+07:00");
  const show = data.series.find((s) => s.id === "moonshadow");
  assert.ok(show);
  const computed = computeSeries(show, now);
  assert.equal(computed.derivedStatus, "airing");
  assert.equal(computed.airedCount, 4);
  assert.equal(computed.nextEpisode?.number, 5);
});

test("every series has image.kind poster, thumbnail, or none", () => {
  const allowed = new Set(["poster", "thumbnail", "none"]);
  for (const s of data.series) {
    assert.ok(s.image, `${s.id} missing image`);
    assert.ok(allowed.has(s.image.kind), `${s.id} bad image.kind ${s.image.kind}`);
    if (s.image.kind === "none") {
      assert.equal(s.image.url, null);
    } else {
      assert.ok(s.image.url, `${s.id} kind ${s.image.kind} has no url`);
      assert.ok(s.image.source, `${s.id} missing image.source`);
      assert.ok(s.image.permission, `${s.id} missing image.permission`);
    }
  }
});

test("trailers use YouTube thumbnails; official posters stay local and sourced", () => {
  const withTrailer = data.series.filter((s) => s.trailer_youtube_id);
  assert.ok(withTrailer.length >= 60, `expected at least 60 series with a trailer id, got ${withTrailer.length}`);
  for (const s of withTrailer) {
    assert.equal(s.image.kind, "thumbnail", s.id);
    assert.equal(
      s.image.url,
      `https://img.youtube.com/vi/${s.trailer_youtube_id}/hqdefault.jpg`,
      s.id,
    );
    assert.equal(s.image.source, s.trailer_youtube_id);
  }
  const posters = data.series.filter((s) => s.image.kind === "poster");
  for (const s of posters) {
    assert.match(s.image.url || "", /^assets\/series\//, `${s.id} poster must be a local asset`);
    assert.ok((s.image.url || "").includes(s.id), `${s.id} poster filename must identify the series`);
    assert.match(s.image.source || "", /^https:\/\//, `${s.id} poster needs an official source URL`);
    assert.match(s.image.permission || "", /Official/i, `${s.id} poster needs an official-source note`);
    assert.match(s.image.permission || "", /Rights remain/i, `${s.id} poster needs a rights note`);
  }
  const tvdb = data.series.filter((s) => String(s.image.url || "").includes("thetvdb") || String(s.image.source || "").includes("tvdb"));
  assert.equal(tvdb.length, 0, "TVDB is out");
});

test("verified_at is set by hand and is never later than the build stamp", () => {
  assert.match(data.verified_at, /^\d{4}-\d{2}-\d{2}/, "verified_at must be an ISO date");
  const verified = Date.parse(data.verified_at.length === 10 ? data.verified_at + "T23:59:59+07:00" : data.verified_at);
  assert.ok(verified <= Date.parse(data.generated_at) + 24 * 60 * 60 * 1000, "verified_at cannot be after the build");
  const view = computeCatalog(data, Date.parse(data.generated_at));
  assert.equal(view.verifiedAt, data.verified_at);
});

test("Uranus 2324 does not present an Apple catalog page as a watch destination", () => {
  const uranus = data.series.find((s) => s.id === "uranus-2324");
  assert.ok(uranus);
  assert.equal(uranus.platforms.some((platform) => platform.name === "Apple TV"), false);
  assert.match(uranus.runtime || "", /Original 130 min/);
  assert.match(uranus.runtime || "", /Special Version 150 min/);
  assert.match(uranus.availability_note || "", /not confirmed global playback/i);
  assert.match(uranus.availability_note || "", /streaming unconfirmed/i);
});

test("the complete 2023 archive keeps the three series and adds the verified film", () => {
  const series2023 = data.series.filter((s) => s.year === 2023 && s.format !== "film");
  const films2023 = data.series.filter((s) => s.year === 2023 && s.format === "film");
  assert.deepEqual(
    series2023.map((s) => s.id).sort(),
    ["love-senior", "lucky-my-love", "show-me-love"],
  );
  assert.equal(films2023.some((s) => s.id === "solids-by-the-seashore"), true);
});

test("the 2024 archive includes both verified follow-up series and omits micro-shorts", () => {
  const series2024 = data.series.filter((s) => s.year === 2024 && s.format !== "film");
  assert.equal(series2024.length, 17);
  assert.equal(series2024.some((s) => s.id === "love-senior-special"), true);
  assert.equal(series2024.some((s) => s.id === "deep-night-the-two-of-us"), true);
  assert.equal(data.series.some((s) => s.id === "delete-your-past"), false);
});

test("2024 audit corrections preserve official titles, platforms, and unresolved counts", () => {
  assert.equal(data.series.find((s) => s.id === "my-marvellous-dream-is-you")?.title_th, "ฝันรักห้วงนิทรา");
  assert.equal(data.series.find((s) => s.id === "reverse-4-you")?.title_th, "ดาวบริวาร");
  assert.deepEqual(
    data.series.find((s) => s.id === "mate")?.platforms.map((platform) => platform.name),
    ["Amarin TV", "WeTV"],
  );
  const devil = data.series.find((s) => s.id === "i-am-devil");
  assert.equal(devil?.total_episodes, null);
  assert.match(devil?.wrap_note || "", /2025/);
});

test("Khom Khlang uses WeTV's verified Monday 20:00 ICT release time", () => {
  const khom = data.series.find((s) => s.id === "khom-khlang");
  assert.ok(khom);
  assert.equal(khom.air_time_ict, "20:00");
  assert.equal(khom.episodes.length, 10);
  assert.equal(khom.episodes.some((episode) => episode.time_unverified), false);
});

test("Built in Love is scheduled for 21 Oct on GMM25 with uncut WeTV availability", () => {
  const built = data.series.find((s) => s.id === "built-in-love");
  assert.ok(built);
  assert.equal(built.episodes[0]?.airs_at, "2026-10-21T20:30:00+07:00");
  assert.deepEqual(
    built.platforms.map((platform) => platform.name),
    ["GMM25", "WeTV"],
  );
  assert.equal(built.platforms.find((platform) => platform.name === "WeTV")?.uncut, true);
  assert.equal(built.trailer_youtube_id, "3fOkgCnjv5M");
});

test("Under Her Rules reflects MGI Beyond's 7 Nov delay and 20:00 slot", () => {
  const rules = data.series.find((s) => s.id === "under-her-rules");
  assert.ok(rules);
  assert.equal(rules.air_time_ict, "20:00");
  assert.equal(rules.episodes[0]?.airs_at, "2026-11-07T20:00:00+07:00");
  assert.equal(rules.episodes.some((episode) => episode.time_unverified), false);
  assert.match(rules.wrap_note || "", /moved the premiere/i);
});

test("2022 audit keeps GAP as the sole standalone series and the film separate", () => {
  const series2022 = data.series.filter((s) => s.year === 2022 && s.format !== "film");
  const films2022 = data.series.filter((s) => s.year === 2022 && s.format === "film");
  assert.deepEqual(series2022.map((s) => s.id), ["gap"]);
  assert.equal(series2022[0]?.total_episodes, 12);
  assert.equal(films2022.some((s) => s.id === "the-cheese-sisters"), true);
});

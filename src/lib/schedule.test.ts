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

test("trailer_youtube_id fills a 16:9 YouTube thumbnail, never a scraped poster", () => {
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
  assert.equal(posters.length, 0, "no open-web posters in this pass");
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

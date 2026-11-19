/* "On tonight" strip for the free Tracker.
 *
 * Shows only episodes whose air date the catalogue establishes independently
 * (a premiere, an episode with its own dated source, or a reviewed official
 * schedule). It never infers an episode from a weekly slot, and the catalogue's
 * time_unverified flag never counts as evidence of a date. A confirmed date
 * with no known clock shows "Time pending", never a clock time.
 *
 * Data: on-tonight.json is read next to the classic Tracker page the card
 * workspace also reads, both uncached. The strip trusts the rows only when the
 * build id inside the file matches the build id stamped into that page, so it
 * cannot disagree with its own cards. "Today" comes from Intl with an explicit
 * Asia/Bangkok zone, is recomputed as the clock passes Bangkok midnight, and is
 * rechecked when the tab becomes visible again.
 *
 * Three states stay distinct: episodes confirmed for tonight, no episodes
 * confirmed for tonight, and data unavailable.
 */
(function (root) {
  "use strict";
  var ZONE = "Asia/Bangkok";
  var EMPTY = "No episodes confirmed for tonight.";
  var UNAVAILABLE = "Tonight’s schedule could not be checked just now.";
  var UNAVAILABLE_HELP = "Series cards list their own dates.";
  var PENDING = "Time pending";
  var DATA_URL = "on-tonight.json";
  var CLASSIC_URL = "tracker-classic.html";
  var BASES = ["premiere", "episode-source", "schedule-source"];
  var MAX_AGE_MS = 72 * 3600 * 1000;   // a data build older than this is not trusted
  var REFRESH_MS = 5 * 60 * 1000;      // resume re-reads data older than this
  var RETRY_MS = 60 * 1000;            // an unavailable strip retries this often
  var TICK_MS = 30 * 1000;             // rollover check

  var dayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  });
  var clockFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, hour: "numeric", minute: "2-digit", hour12: true
  });

  // YYYY-MM-DD for the given moment, as the calendar reads in Bangkok.
  function bangkokDate(moment) {
    var parts = {};
    dayParts.formatToParts(moment).forEach(function (part) { parts[part.type] = part.value; });
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  // "8:30 PM". Newer ICU puts a narrow no-break space before the meridiem.
  function bangkokClock(moment) {
    return clockFormat.format(moment).replace(/[  ]/g, " ");
  }

  // Row shape (built from the catalogue at build time):
  //   { id, title, number, total, date, instant, platform, dateBasis }
  //   dateBasis: why the catalogue trusts the date (see BASES); rows without
  //     one are never shown
  //   instant: ISO string when the catalogue confirms a time, else null
  //   date: the catalogue's own calendar date, used only when instant is null
  //   platform: { name, url } or null
  function dayOf(row) {
    if (row.instant) {
      var moment = new Date(row.instant);
      return isNaN(moment.getTime()) ? null : bangkokDate(moment);
    }
    return typeof row.date === "string" ? row.date : null;
  }

  function selectTonight(rows, now) {
    var today = bangkokDate(now);
    return (Array.isArray(rows) ? rows : [])
      .filter(function (row) {
        return row && Number.isInteger(row.number) && BASES.indexOf(row.dateBasis) !== -1 && dayOf(row) === today;
      })
      .map(function (row) {
        var moment = row.instant ? new Date(row.instant) : null;
        return {
          id: row.id, title: row.title, number: row.number,
          total: Number.isInteger(row.total) && row.total >= row.number ? row.total : null,
          time: moment ? bangkokClock(moment) : PENDING,
          sortKey: moment ? moment.getTime() : Infinity,
          platform: row.platform || null
        };
      })
      .sort(function (a, b) {
        if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
        if (a.title !== b.title) return a.title < b.title ? -1 : 1;
        return a.number - b.number;
      });
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function platformMarkup(platform) {
    if (!platform || !platform.name) return "";
    var safe = typeof platform.url === "string" && /^https:\/\//i.test(platform.url);
    return '<span class="on-tonight-platform">' + (safe
      ? '<a href="' + escape(platform.url) + '" target="_blank" rel="noopener noreferrer">' + escape(platform.name) + "</a>"
      : escape(platform.name)) + "</span>";
  }

  // The title link goes to the card in the classic Tracker, so it works with no
  // script help. When the workspace has the card loaded, followCard shows it in place.
  function rowMarkup(row) {
    var episode = "Episode " + row.number + (row.total ? " of " + row.total : "");
    var pending = row.time === PENDING;
    return '<li class="on-tonight-row">' +
      '<a class="on-tonight-title notranslate" translate="no" href="' + CLASSIC_URL + '#card-' + escape(row.id) + '" data-card-id="' + escape(row.id) + '">' + escape(row.title) + "</a>" +
      '<span class="on-tonight-episode">' + escape(episode) + "</span>" +
      '<span class="on-tonight-time' + (pending ? " is-pending" : "") + '">' + escape(row.time) + "</span>" +
      platformMarkup(row.platform) + "</li>";
  }

  function listMarkup(rows) {
    return rows.length
      ? '<ul class="on-tonight-list">' + rows.map(rowMarkup).join("") + "</ul>"
      : '<p class="on-tonight-empty">' + EMPTY + "</p>";
  }

  function unavailableMarkup() {
    return '<div class="on-tonight-unavailable"><p>' + UNAVAILABLE + " " + UNAVAILABLE_HELP + "</p>" +
      '<p class="on-tonight-actions"><button type="button" class="on-tonight-retry" data-on-tonight-retry>Check again</button>' +
      '<a href="' + CLASSIC_URL + '">Open the classic Tracker</a></p></div>';
  }

  // A source result is {ok:true, rows, builtAt} or {ok:false, reason}.
  function isFresh(result, now) {
    var built = result && result.ok ? new Date(result.builtAt).getTime() : NaN;
    return isFinite(built) && now.getTime() - built <= MAX_AGE_MS;
  }

  // -> { state: "list" | "empty" | "unavailable", html }
  function stateMarkup(result, now) {
    if (!result || !result.ok || (result.builtAt && !isFresh(result, now))) {
      return { state: "unavailable", html: unavailableMarkup() };
    }
    var rows = selectTonight(result.rows, now);
    return { state: rows.length ? "list" : "empty", html: listMarkup(rows) };
  }

  // Read the data file and the classic Tracker page, both uncached, and accept
  // the rows only if they were built together.
  function loadSource(fetchFn, now) {
    var failed = { ok: false, reason: "failed" };
    if (typeof fetchFn !== "function") return Promise.resolve(failed);
    function get(url) {
      return Promise.resolve().then(function () { return fetchFn(url, { cache: "no-cache" }); })
        .then(function (response) {
          if (!response || !response.ok) throw new Error("HTTP");
          return response;
        });
    }
    return Promise.all([
      get(DATA_URL).then(function (response) { return response.json(); }),
      get(CLASSIC_URL).then(function (response) { return response.text(); })
    ]).then(function (pair) {
      var data = pair[0], page = String(pair[1]);
      var built = data && typeof data === "object" ? new Date(data.builtAt).getTime() : NaN;
      if (!data || typeof data.build !== "string" || !data.build || !Array.isArray(data.rows) || !isFinite(built)) return failed;
      var stamp = /<meta\s+name="tracker-build"\s+content="([^"]*)"/i.exec(page);
      if (!stamp || stamp[1] !== data.build) return { ok: false, reason: "stale" };
      var result = { ok: true, rows: data.rows, build: data.build, builtAt: data.builtAt };
      return isFresh(result, now) ? result : { ok: false, reason: "stale" };
    }).catch(function () { return failed; });
  }

  function mount(doc, rows, now) {
    var body = doc.getElementById("on-tonight-body");
    if (!body) return false;
    body.innerHTML = listMarkup(selectTonight(rows, now));
    return true;
  }

  // Follow a title link to its card in the workspace, as a saved-list link does.
  // Cancel the link only when the card was actually shown; while the card
  // catalogue is loading or unavailable the link navigates to the classic card.
  function followCard(event) {
    var link = event.target && event.target.closest && event.target.closest("a[data-card-id]");
    if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof root.showTrackerCard !== "function") return;
    var shown = false;
    try { shown = root.showTrackerCard(link.getAttribute("data-card-id")) === true; } catch (error) { shown = false; }
    if (shown) event.preventDefault();
  }

  // The live strip. Everything environmental is injected so tests can drive it.
  function createStrip(env) {
    var doc = env.doc, clock = env.clock || function () { return new Date(); };
    var result = null, loading = false, loadedAt = 0, attemptedAt = 0, renderedDate = null;

    function render() {
      var body = doc.getElementById("on-tonight-body");
      if (!body) return;
      var now = clock();
      renderedDate = bangkokDate(now);
      if (!result) return;   // first read pending: keep the "Checking" line
      var view = stateMarkup(result, now);
      body.innerHTML = view.html;
      body.setAttribute("data-state", view.state);
      if (root.tgwTranslation && typeof root.tgwTranslation.protectNames === "function") root.tgwTranslation.protectNames();
    }

    function refresh() {
      if (loading) return;
      loading = true;
      attemptedAt = clock().getTime();
      loadSource(env.fetch, clock()).then(function (next) {
        loading = false;
        result = next;
        loadedAt = clock().getTime();
        render();
      });
    }

    function dateMoved() { return renderedDate !== bangkokDate(clock()); }

    // Called on a timer and on resume. Yesterday's rows go at once, then the data is re-read.
    function check(resuming) {
      var moved = dateMoved();
      if (moved) render();
      var now = clock().getTime();
      var due = moved ||
        (result && !result.ok && now - attemptedAt >= RETRY_MS) ||
        (resuming && now - loadedAt >= REFRESH_MS);
      if (result && result.ok && !isFresh(result, clock())) render();
      if (due) refresh();
    }

    function onVisibility() {
      if (doc.visibilityState === "hidden") return;
      check(true);
    }

    function start() {
      render();
      refresh();
      if (env.setInterval) env.setInterval(function () { check(false); }, TICK_MS);
      if (doc.addEventListener) doc.addEventListener("visibilitychange", onVisibility);
    }

    return { start: start, render: render, refresh: refresh, retry: refresh, check: check, onVisibility: onVisibility };
  }

  root.tgwOnTonight = {
    ZONE: ZONE, EMPTY: EMPTY, UNAVAILABLE: UNAVAILABLE, PENDING: PENDING, MAX_AGE_MS: MAX_AGE_MS,
    bangkokDate: bangkokDate, selectTonight: selectTonight,
    listMarkup: listMarkup, stateMarkup: stateMarkup, mount: mount,
    loadSource: loadSource, createStrip: createStrip, followCard: followCard
  };

  if (root.document && root.document.getElementById("on-tonight-body")) {
    var section = root.document.getElementById("on-tonight");
    var strip = createStrip({
      doc: root.document,
      fetch: typeof root.fetch === "function" ? root.fetch.bind(root) : null,
      setInterval: root.setInterval.bind(root)
    });
    strip.start();
    if (section) {
      section.addEventListener("click", function (event) {
        var retry = event.target && event.target.closest && event.target.closest("button[data-on-tonight-retry]");
        if (retry) {
          var body = root.document.getElementById("on-tonight-body");
          if (body) body.innerHTML = '<p class="on-tonight-empty">Checking tonight’s schedule…</p>';
          strip.retry();
          return;
        }
        followCard(event);
      });
    }
  }
})(typeof window !== "undefined" ? window : globalThis);

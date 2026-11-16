/* "On tonight" strip for the free Tracker.
 *
 * Shows only episodes the catalogue already records for today's date in
 * Asia/Bangkok. It never infers an episode from a weekly slot. A date-only
 * record (time_unverified in the catalogue) shows "Time pending", never a
 * clock time. "Today" comes from Intl with an explicit time zone, so it does
 * not depend on the reader's own zone. It is computed once, on page load.
 */
(function (root) {
  "use strict";
  var ZONE = "Asia/Bangkok";
  var EMPTY = "Nothing confirmed for tonight yet.";
  var PENDING = "Time pending";

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
  //   { id, title, number, total, date, instant, platform }
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
      .filter(function (row) { return row && Number.isInteger(row.number) && dayOf(row) === today; })
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

  function rowMarkup(row) {
    var episode = "Episode " + row.number + (row.total ? " of " + row.total : "");
    var pending = row.time === PENDING;
    return '<li class="on-tonight-row">' +
      '<a class="on-tonight-title" href="#card-' + escape(row.id) + '" data-card-id="' + escape(row.id) + '">' + escape(row.title) + "</a>" +
      '<span class="on-tonight-episode">' + escape(episode) + "</span>" +
      '<span class="on-tonight-time' + (pending ? " is-pending" : "") + '">' + escape(row.time) + "</span>" +
      platformMarkup(row.platform) + "</li>";
  }

  function listMarkup(rows) {
    return rows.length
      ? '<ul class="on-tonight-list">' + rows.map(rowMarkup).join("") + "</ul>"
      : '<p class="on-tonight-empty">' + EMPTY + "</p>";
  }

  function mount(doc, rows, now) {
    var body = doc.getElementById("on-tonight-body");
    if (!body) return false;
    body.innerHTML = listMarkup(selectTonight(rows, now));
    return true;
  }

  // Follow a title link to its card in the workspace, as a saved-list link does.
  function followCard(event) {
    var link = event.target.closest && event.target.closest("a[data-card-id]");
    if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof root.showTrackerCard !== "function") return;
    event.preventDefault();
    root.showTrackerCard(link.getAttribute("data-card-id"));
  }

  root.tgwOnTonight = {
    ZONE: ZONE, EMPTY: EMPTY, PENDING: PENDING,
    bangkokDate: bangkokDate, selectTonight: selectTonight,
    listMarkup: listMarkup, mount: mount
  };

  if (root.document && Array.isArray(root.tgwOnTonightData)) {
    var section = root.document.getElementById("on-tonight");
    if (section) {
      mount(root.document, root.tgwOnTonightData, new Date());
      section.addEventListener("click", followCard);
    }
  } else if (root.document && root.document.getElementById("on-tonight-body")) {
    root.document.getElementById("on-tonight-body").innerHTML =
      '<p class="on-tonight-empty">Tonight’s schedule could not be loaded.</p>';
  }
})(typeof window !== "undefined" ? window : globalThis);

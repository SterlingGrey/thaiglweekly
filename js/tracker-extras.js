/* Rewatch progress has its own storage. Original watched episodes stay intact. */
window.tgwProgressKey = function (id) {
  try {
    var saved = JSON.parse(localStorage.getItem("tgw-my-tracker") || "{}");
    return (saved[id] === "Rewatching" ? "glw_rewatch_" : "glw_") + id;
  } catch {
    return "glw_" + id;
  }
};

(function () {
  "use strict";
  var earlyAccess = Array.isArray(window.tgwEarlyAccess) ? window.tgwEarlyAccess : [];
  var escape = function (value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char];
    });
  };

  function accessNote(item) {
    var note = earlyAccess.find(function (entry) { return entry.id === item.id; });
    if (!note || note.verified !== true || note.access !== 'paid' ||
        !Number.isInteger(note.episode) || note.episode < 1 ||
        !Number.isFinite(Date.parse(note.checked)) ||
        !Number.isFinite(Date.parse(note.standardAt)) ||
        Date.now() >= Date.parse(note.standardAt)) return "";
    try { if (new URL(note.url).protocol !== 'https:') return ""; } catch { return ""; }
    var standard = new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short',
      hour:'numeric', minute:'2-digit', hour12:true, timeZone:'Asia/Bangkok'}).format(new Date(note.standardAt));
    return '<p class="tgw-early-access" data-expires="' + escape(note.standardAt) + '" style="padding:10px;border:1px solid #a87b39;border-radius:8px;color:#dbb56b;font-size:14px">' +
      'Paid early access · EP ' + note.episode + ' listed as ' + escape(note.label) +
      '. Standard release: ' + escape(standard) + ' ICT. Check country availability and payment requirements with the provider. ' +
      '<a href="' + escape(note.url) + '" target="_blank" rel="noopener">Official listing ↗</a>' +
      ' · Checked ' + escape(note.checked) + '</p>';
  }

  // Remove an expired badge even when a reader leaves the same page open.
  earlyAccess.forEach(function (note) {
    var delay = Date.parse(note.standardAt) - Date.now();
    if (delay > 0 && delay < 2147483647) setTimeout(function () {
      document.querySelectorAll('.tgw-early-access[data-expires]').forEach(function (badge) {
        if (Date.parse(badge.dataset.expires) <= Date.now()) badge.remove();
      });
    }, delay + 1);
  });

  // The responsive workspace defines these functions before this script loads.
  if (typeof myTrackerStatuses !== "undefined") {
    myTrackerStatuses.push("Rewatching");
    watchedEpisodes = function (id) {
      try {
        var value = JSON.parse(localStorage.getItem(window.tgwProgressKey(id)) || "[]");
        return Array.isArray(value) ? value.filter(function (n) { return Number.isInteger(n) && n > 0; }) : [];
      } catch { return []; }
    };
    adjustWatched = function (id, delta) {
      var item = CATALOG_SERIES.find(function (show) { return show.id === id; });
      var episodes = watchedEpisodes(id);
      if (delta > 0) {
        var next = (item?.allowedEpisodes || []).find(function (n) { return !episodes.includes(n); });
        if (next) episodes.push(next);
      } else if (episodes.length) {
        episodes.splice(episodes.indexOf(Math.max.apply(null, episodes)), 1);
      }
      try { localStorage.setItem(window.tgwProgressKey(id), JSON.stringify(episodes)); }
      catch { showToast("This browser could not save your episode progress."); }
      loadWatchedProgress();
      renderCatalogShelves();
    };
    var changeStatus = changeMyTrackerStatus;
    changeMyTrackerStatus = function (id, value) {
      changeStatus(id, value);
      loadWatchedProgress();
      renderCatalogShelves();
    };
    var buildCard = buildSeriesCardHTML;
    buildSeriesCardHTML = function (item) {
      var html = buildCard(item);
      if (savedTrackerShows()[item.id] === "Rewatching") {
        html = html.replace("Watched:", "Rewatched:");
      }
      return html.replace("</article>", accessNote(item) + "</article>");
    };
    var renderList = renderMyTracker;
    renderMyTracker = function () {
      renderList();
      var panel = document.getElementById("my-tracker-panel");
      var intro = panel?.querySelector("p");
      if (intro) intro.textContent += " Rewatching uses a separate episode count and keeps your original progress.";
    };
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-series-id]").forEach(function (card) {
        var html = accessNote({id: card.dataset.seriesId});
        if (html) card.insertAdjacentHTML("beforeend", html);
      });
    });
  }
})();

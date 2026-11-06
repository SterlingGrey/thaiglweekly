/* Vanilla behaviour for the static tracker.
   Date-dependent state is already baked into the HTML at build time.
   This file only handles visitor-local concerns: watched pills, accordion,
   search, the YouTube modal, and local-clock conversion. */

(function () {
  "use strict";

  function progressKey(id) {
    try {
      var saved = JSON.parse(localStorage.getItem("tgw-my-tracker") || "{}");
      return (saved[id] === "Rewatching" ? "glw_rewatch_" : "glw_") + id;
    } catch { return "glw_" + id; }
  }

  /* ── watched pills (same localStorage keys as the Aug 2026 tracker) ── */
  function getWatched(id) {
    try {
      var value = JSON.parse(localStorage.getItem(progressKey(id)) || "[]");
      return Array.isArray(value) ? value.filter(n => Number.isInteger(n) && n > 0) : [];
    } catch {
      return [];
    }
  }
  function saveWatched(id, arr) {
    try {
      localStorage.setItem(progressKey(id), JSON.stringify(arr));
    } catch {
      /* quota */
    }
  }

  function applyWatched() {
    document.querySelectorAll(".ep-track[data-show]").forEach(function (track) {
      var id = track.getAttribute("data-show");
      var watched = getWatched(id);
      track.querySelectorAll(".ep-pill[data-ep]").forEach(function (pill) {
        var n = Number(pill.getAttribute("data-ep"));
        if (watched.indexOf(n) !== -1) pill.classList.add("ep-watched");
        else pill.classList.remove("ep-watched");
      });
    });
  }

  document.addEventListener("click", function (e) {
    var pill = e.target.closest(".ep-pill[data-ep]");
    if (!pill || pill.classList.contains("ep-future")) return;
    var track = pill.closest(".ep-track");
    if (!track) return;
    var id = track.getAttribute("data-show");
    var n = Number(pill.getAttribute("data-ep"));
    var watched = getWatched(id);
    var idx = watched.indexOf(n);
    if (idx === -1) watched.push(n);
    else watched.splice(idx, 1);
    saveWatched(id, watched);
    applyWatched();
  });

  var exportBtn = document.getElementById("export-progress");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      var data = {};
      document.querySelectorAll(".ep-track[data-show]").forEach(function (track) {
        var id = track.getAttribute("data-show");
        var w = [];
        try { w = JSON.parse(localStorage.getItem("glw_" + id) || "[]"); } catch {}
        if (w.length) data[id] = w;
      });
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gl-tracker-progress-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
  var importBtn = document.getElementById("import-progress");
  var importFile = document.getElementById("import-file");
  if (importBtn && importFile) {
    importBtn.addEventListener("click", function () {
      importFile.click();
    });
    importFile.addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          var n = 0;
          Object.keys(data).forEach(function (id) {
            if (Array.isArray(data[id])) {
              saveWatched(id, data[id]);
              n += data[id].length;
            }
          });
          applyWatched();
          alert("Imported " + n + " watched episode(s).");
        } catch {
          alert("Could not read that file. Expected a JSON export from this tracker.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }
  applyWatched();

  var trackerSearch = document.querySelector(".search-panel");
  if (trackerSearch) {
    var trackerKey = "tgw-my-tracker";
    var statuses = ["Want to watch", "Watching", "Finished", "Rewatching"];
    var savedShows = {};
    try {
      savedShows = JSON.parse(localStorage.getItem(trackerKey) || "{}") || {};
    } catch {}

    var panel = document.createElement("details");
    panel.className = "search-panel my-tracker";
    var summary = document.createElement("summary");
    var list = document.createElement("ul");
    var message = document.createElement("p");
    message.setAttribute("role", "status");
    var nameKey = "tgw-my-tracker-name";
    var trackerName = "";
    try {
      trackerName = localStorage.getItem(nameKey) || "";
    } catch {}

    var rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "Rename";
    rename.setAttribute("aria-label", "Rename My Tracker");
    var nameForm = document.createElement("form");
    nameForm.hidden = true;
    var nameLabel = document.createElement("label");
    nameLabel.textContent = "Tracker name ";
    var nameInput = document.createElement("input");
    nameInput.maxLength = 40;
    nameInput.placeholder = "My Tracker";
    nameLabel.append(nameInput);
    var saveName = document.createElement("button");
    saveName.type = "submit";
    saveName.textContent = "Save name";
    var cancelRename = document.createElement("button");
    cancelRename.type = "button";
    cancelRename.textContent = "Cancel";
    nameForm.append(nameLabel, saveName, cancelRename);

    function closeRename() {
      nameForm.hidden = true;
      rename.hidden = false;
      rename.focus();
    }

    rename.onclick = function () {
      nameInput.value = trackerName;
      rename.hidden = true;
      nameForm.hidden = false;
      nameInput.focus();
    };
    cancelRename.onclick = closeRename;
    nameForm.onsubmit = function (event) {
      event.preventDefault();
      trackerName = nameInput.value.trim();
      try {
        if (trackerName) localStorage.setItem(nameKey, trackerName);
        else localStorage.removeItem(nameKey);
      } catch {
        message.textContent = "This browser could not save your tracker name for your next visit.";
      }
      updateTracker();
      closeRename();
    };

    panel.append(summary, message, list, rename, nameForm);
    trackerSearch.before(panel);
    var cards = new Map();

    var returnTrip = null;

    function clearReturnTrip() {
      if (!returnTrip) return;
      returnTrip.footer.remove();
      returnTrip.top.textContent = "Saved · View My Tracker";
      returnTrip = null;
    }

    function returnToSavedShow() {
      var entry = returnTrip.entry;
      clearReturnTrip();
      panel.open = true;
      var target = entry.savedLink && entry.savedLink.isConnected ? entry.savedLink : summary;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center" });
    }

    function updateTracker() {
      list.replaceChildren();
      cards.forEach(function (entry, id) {
        var isSaved = statuses.includes(savedShows[id]);
        entry.buttons.forEach(function (button) {
          button.textContent = returnTrip && returnTrip.top === button
            ? "Back to My Tracker"
            : isSaved ? "Saved · View My Tracker" : "Save to My Tracker";
        });
        entry.savedLink = null;
        if (!isSaved) return;
        var row = document.createElement("li");
        var title = document.createElement("span");
        var link = document.createElement("a");
        link.href = "#" + entry.card.id;
        link.textContent = entry.title;
        entry.savedLink = link;
        link.onclick = function (event) {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          clearReturnTrip();
          var top = entry.card.querySelector(".my-tracker-save");
          var footer = document.createElement("button");
          footer.type = "button";
          footer.className = "my-tracker-save";
          footer.textContent = "← Back to My Tracker";
          footer.onclick = returnToSavedShow;
          entry.card.append(footer);
          top.textContent = "Back to My Tracker";
          returnTrip = { entry: entry, top: top, footer: footer };
          if (entry.card.classList.contains("is-hidden")) {
            q.value = "";
            conf.value = "all";
            filter();
          }
          var section = entry.card.closest(".section[data-title]");
          if (section) setSectionOpen(section, true);
          entry.card.tabIndex = -1;
          entry.card.focus({ preventScroll: true });
          entry.card.scrollIntoView({ block: "start" });
        };
        title.append(link);
        var next = entry.card.querySelector(".sch-next");
        var clock = next && next.querySelector("[data-air-at]");
        var nextAt = next && (next.dateTime || (clock && clock.dataset.airAt));
        if (Date.parse(nextAt) > Date.now()) {
          var schedule = next.cloneNode(true);
          schedule.className = "my-tracker-next";
          schedule.textContent = "Next: " + next.textContent.replace(/^▶\s*/, "");
          title.append(schedule);
        }
        var status = document.createElement("select");
        status.setAttribute("aria-label", "Viewing status for " + entry.title);
        statuses.forEach(function (label) {
          status.add(new Option(label, label));
        });
        status.value = savedShows[id];
        status.onchange = function () {
          savedShows[id] = status.value;
          persistTracker();
          applyWatched();
        };
        var remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove " + entry.title + " from My Tracker");
        remove.onclick = function () {
          if (returnTrip && returnTrip.entry === entry) clearReturnTrip();
          delete savedShows[id];
          persistTracker();
          updateTracker();
          summary.focus();
        };
        row.append(title, status, remove);
        list.append(row);
      });
      summary.textContent = (trackerName || "My Tracker") + " (" + list.children.length + ")";
    }

    function persistTracker() {
      try {
        localStorage.setItem(trackerKey, JSON.stringify(savedShows));
        message.textContent = "Your list is saved in this browser.";
      } catch {
        message.textContent = "This browser could not save your list for your next visit.";
      }
    }

    document.querySelectorAll(".show-card[data-series-id], .compact-card[data-series-id]").forEach(function (card) {
      var id = card.dataset.seriesId;
      var titleNode = card.querySelector(".show-title, .cc-title");
      if (!titleNode) return;
      var title = titleNode.cloneNode(true);
      title.querySelectorAll(".th, .conf").forEach(function (label) { label.remove(); });
      var button = document.createElement("button");
      button.type = "button";
      button.className = "my-tracker-save";
      button.onclick = function () {
        if (returnTrip && returnTrip.top === button) {
          returnToSavedShow();
          return;
        }
        if (!statuses.includes(savedShows[id])) {
          savedShows[id] = statuses[0];
          persistTracker();
          updateTracker();
        }
        panel.open = true;
        summary.focus();
      };
      titleNode.after(button);
      if (!cards.has(id)) cards.set(id, { title: title.textContent.trim(), buttons: [], card: card });
      cards.get(id).buttons.push(button);
      if (card.querySelector(".sch-next")) cards.get(id).card = card;
    });
    message.textContent = "Save shows from the Tracker to build a list in this browser. Rewatching uses separate episode progress and keeps your original watched episodes.";
    panel.addEventListener("toggle", function () { if (panel.open) updateTracker(); });
    updateTracker();
  }

  /* ── accordion ── */
  var KEY = "tgw-open-sections";
  var sections = Array.prototype.slice.call(document.querySelectorAll(".section[data-title]"));
  if (sections.length) {
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (e) {}
    if (saved && saved.length !== undefined) {
      sections.forEach(function (sec) {
        /* Tonight is built open and stays open on load. */
        if (sec.hasAttribute("data-always-open")) return;
        sec.setAttribute("data-open", saved.indexOf(sec.dataset.title) > -1 ? "1" : "0");
      });
    }
    function persist() {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify(
            sections
              .filter(function (x) {
                return x.getAttribute("data-open") === "1";
              })
              .map(function (x) {
                return x.dataset.title;
              }),
          ),
        );
      } catch (e) {}
    }
    function set(sec, open) {
      sec.setAttribute("data-open", open ? "1" : "0");
      var h = sec.querySelector(".section-header");
      if (h) h.setAttribute("aria-expanded", open ? "true" : "false");
    }
    sections.forEach(function (sec) {
      var head = sec.querySelector(".section-header");
      if (!head) return;
      head.addEventListener("click", function (e) {
        if (e.target.closest("a,button,input,.ep-pill")) return;
        set(sec, sec.getAttribute("data-open") !== "1");
        persist();
      });
      head.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          set(sec, sec.getAttribute("data-open") !== "1");
          persist();
        }
      });
    });
    var all = document.getElementById("tgw-all");
    var none = document.getElementById("tgw-none");
    if (all)
      all.addEventListener("click", function () {
        sections.forEach(function (s) {
          set(s, true);
        });
        persist();
      });
    if (none)
      none.addEventListener("click", function () {
        sections.forEach(function (s) {
          set(s, false);
        });
        persist();
      });
  }

  /* ── filter ── */
  var q = document.getElementById("filter-q");
  var conf = document.getElementById("filter-conf");
  var clear = document.getElementById("filter-clear");
  var results = document.getElementById("filter-results");
  var empty = document.getElementById("filter-empty");
  var filterWasActive = false;

  function setSectionOpen(sec, open) {
    sec.setAttribute("data-open", open ? "1" : "0");
    var head = sec.querySelector(".section-header");
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function filter() {
    var needle = (q && q.value ? q.value : "").toLowerCase().trim();
    var want = conf && conf.value ? conf.value : "all";
    var active = Boolean(needle) || want !== "all";
    var matchedIds = {};
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));

    if (active && !filterWasActive) {
      document.querySelectorAll(".section[data-title]").forEach(function (sec) {
        sec.setAttribute("data-filter-was-open", sec.getAttribute("data-open") || "0");
      });
    }

    cards.forEach(function (el) {
      var blob = (el.getAttribute("data-filter") || "").toLowerCase();
      var confidence = el.getAttribute("data-confidence") || "";
      var okText = !needle || blob.indexOf(needle) !== -1;
      var okConf = want === "all" || confidence === want;
      var match = okText && okConf && !(active && el.hasAttribute("data-search-secondary"));
      el.classList.toggle("is-hidden", !match);
      if (match) matchedIds[el.getAttribute("data-series-id") || blob] = true;
    });

    document.querySelectorAll(".section[data-title]").forEach(function (sec) {
      var filterable = sec.querySelectorAll("[data-filter]");
      if (!active) {
        sec.classList.remove("is-filter-empty");
        if (filterWasActive && sec.hasAttribute("data-filter-was-open")) {
          setSectionOpen(sec, sec.getAttribute("data-filter-was-open") === "1");
          sec.removeAttribute("data-filter-was-open");
        }
        return;
      }
      var visible = sec.querySelectorAll("[data-filter]:not(.is-hidden)").length;
      sec.classList.toggle("is-filter-empty", filterable.length === 0 || visible === 0);
      if (visible > 0) setSectionOpen(sec, true);
    });

    var count = Object.keys(matchedIds).length;
    if (results) {
      results.classList.add("notranslate");
      results.textContent = window.tgwTranslation ? window.tgwTranslation.search(count,active) : active
        ? count + (count === 1 ? " matching series." : " matching series.")
        : "Showing all tracker entries.";
    }
    if (empty) empty.hidden = !active || count !== 0;
    if (clear) {
      clear.hidden = !active;
      if(window.tgwTranslation) clear.textContent=window.tgwTranslation.clear();
    }
    filterWasActive = active;
  }
  if (q) q.addEventListener("input", filter);
  if (conf) conf.addEventListener("change", filter);
  if (clear) {
    clear.addEventListener("click", function () {
      if (q) q.value = "";
      if (conf) conf.value = "all";
      filter();
      if (q) q.focus();
    });
  }

  /* ── YouTube modal ── */
  var modal = document.getElementById("yt-modal");
  var frame = modal ? modal.querySelector("iframe") : null;
  var fallback = modal ? modal.querySelector(".modal-fallback a") : null;
  var titleEl = modal ? modal.querySelector("[data-yt-title]") : null;
  var failTimer = null;
  var frameLoaded = false;
  var FAIL_AFTER_MS = 6000;

  /* The iframe fires load when YouTube's document arrives, including
     YouTube's own "playback disabled" page, which we cannot see into from
     here. What we can detect is the player never arriving at all: a
     blocked domain, a content blocker, or a dead network. In that case
     the frame is swapped for the plain link. The foot link stays visible
     either way for the case YouTube renders its own error. */
  if (frame) {
    frame.addEventListener("load", function () {
      if (!frame.src) return;
      frameLoaded = true;
      if (failTimer) clearTimeout(failTimer);
    });
    frame.addEventListener("error", function () {
      if (modal) modal.classList.add("is-failed");
    });
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open", "is-failed");
    modal.removeAttribute("open");
    if (frame) frame.src = "";
    document.body.style.overflow = "";
    if (failTimer) clearTimeout(failTimer);
  }
  function openModal(id, title, kind) {
    if (!modal || !id) return;
    var watch = "https://www.youtube.com/watch?v=" + id;
    var embed = "https://www.youtube.com/embed/" + id + "?autoplay=1&rel=0";
    if (titleEl) {
      titleEl.textContent = title || "Video";
      var k = titleEl.nextElementSibling;
      if (k) k.textContent = (kind || "video") + " · official YouTube player";
    }
    if (fallback) fallback.href = watch;
    modal.querySelectorAll("[data-yt-watch]").forEach(function (a) {
      a.href = watch;
    });
    modal.classList.remove("is-failed");
    modal.classList.add("is-open");
    modal.setAttribute("open", "");
    document.body.style.overflow = "hidden";
    frameLoaded = false;
    if (frame) frame.src = embed;
    if (failTimer) clearTimeout(failTimer);
    failTimer = setTimeout(function () {
      if (!frameLoaded && modal.classList.contains("is-open")) modal.classList.add("is-failed");
    }, FAIL_AFTER_MS);
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-yt]");
    if (btn) {
      e.preventDefault();
      openModal(btn.getAttribute("data-yt"), btn.getAttribute("data-yt-name"), btn.getAttribute("data-yt-kind"));
      return;
    }
    if (e.target.closest("[data-yt-close]") || e.target === modal) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  /* ── local time conversion (from the live tracker) ── */
  var ICT_MIN = 7 * 60;
  var now = new Date();
  var localMin = -now.getTimezoneOffset();
  var delta = localMin - ICT_MIN;
  var zone = "local time";
  try {
    zone = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(now)
      .find(function (p) {
        return p.type === "timeZoneName";
      }).value;
  } catch (e) {}

  function convert(iso) {
    var date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return null;
    // Offset and abbreviation belong to the episode date, including DST changes.
    var label = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short"
    }).format(date);
    var localDay = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);
    var thaiDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);
    if (localDay > thaiDay) label += " next day";
    else if (localDay < thaiDay) label += " prev day";
    return label;
  }

  var RE = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:GMT\+7|ICT)/gi;
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) {
      if (!n.nodeValue || !RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      RE.lastIndex = 0;
      var p = n.parentNode;
      while (p && p !== document.body) {
        if (p.classList && p.classList.contains("tz-local")) return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  var hits = [],
    n;
  while ((n = walker.nextNode())) hits.push(n);
  hits.forEach(function (node) {
    var frag = document.createDocumentFragment();
    var text = node.nodeValue,
      last = 0,
      m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index + m[0].length)));
      var dated = node.parentElement.closest("[data-air-at]");
      var localLabel = dated ? convert(dated.getAttribute("data-air-at")) : null;
      if (localLabel) {
        var span = document.createElement("span");
        span.className = "tz-local";
        span.textContent = " → " + localLabel;
        frag.appendChild(span);
      }
      last = m.index + m[0].length;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });

  if (delta !== 0 && !["subscribe", "corrections"].includes(document.body.dataset.page)) {
    var host = document.querySelector(".page") || document.body;
    var bar = document.createElement("div");
    bar.className = "tz-bar";
    var offH = Math.abs(delta) / 60;
    var dir = delta < 0 ? "behind" : "ahead of";
    bar.innerHTML =
      "Air times are Thailand time (GMT+7). You are <b>" +
      (offH % 1 ? offH.toFixed(1) : offH) +
      "h " +
      dir +
      "</b> Bangkok today. Dated episodes use the local offset on their release date, shown in <b style=\"color:var(--gold)\">gold</b>.";
    var btn = document.createElement("button");
    btn.className = "tz-toggle";
    btn.textContent = "Show Thai time only";
    btn.addEventListener("click", function () {
      var off = document.body.classList.toggle("tz-off");
      btn.textContent = off ? "Show my local time" : "Show Thai time only";
      try {
        localStorage.setItem("tz-off", off ? "1" : "");
      } catch (e) {}
    });
    bar.appendChild(btn);
    host.insertBefore(bar, host.firstChild);
    try {
      if (localStorage.getItem("tz-off")) {
        document.body.classList.add("tz-off");
        btn.textContent = "Show my local time";
      }
    } catch (e) {}
  }
})();

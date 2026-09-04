/* Vanilla behaviour for the static tracker.
   Date-dependent state is already baked into the HTML at build time.
   This file only handles visitor-local concerns: watched pills, accordion,
   search, the YouTube modal, and local-clock conversion. */

(function () {
  "use strict";

  /* ── watched pills (same localStorage keys as the Aug 2026 tracker) ── */
  function getWatched(id) {
    try {
      return JSON.parse(localStorage.getItem("glw_" + id)) || [];
    } catch {
      return [];
    }
  }
  function saveWatched(id, arr) {
    try {
      localStorage.setItem("glw_" + id, JSON.stringify(arr));
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
        var w = getWatched(id);
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
  function filter() {
    var needle = (q && q.value ? q.value : "").toLowerCase().trim();
    var want = conf && conf.value ? conf.value : "all";
    document.querySelectorAll("[data-filter]").forEach(function (el) {
      var blob = (el.getAttribute("data-filter") || "").toLowerCase();
      var okText = !needle || blob.indexOf(needle) !== -1;
      var okConf = want === "all" || blob.indexOf("conf:" + want) !== -1;
      el.classList.toggle("is-hidden", !(okText && okConf));
    });
  }
  if (q) q.addEventListener("input", filter);
  if (conf) conf.addEventListener("change", filter);

  /* ── YouTube modal ── */
  var modal = document.getElementById("yt-modal");
  var frame = modal ? modal.querySelector("iframe") : null;
  var fallback = modal ? modal.querySelector(".modal-fallback a") : null;
  var titleEl = modal ? modal.querySelector("[data-yt-title]") : null;
  var failTimer = null;

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
    if (frame) frame.src = embed;
    failTimer = setTimeout(function () {
      /* Uploaders can disable embedding. The iframe does not always fire
         onerror; if YouTube shows its own error UI we still offer a link. */
    }, 4000);
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

  function convert(h12, min, ampm) {
    var h = h12 % 12;
    if (/pm/i.test(ampm)) h += 12;
    var t = h * 60 + min + delta;
    var shift = Math.floor(t / 1440);
    t = ((t % 1440) + 1440) % 1440;
    var H = Math.floor(t / 60),
      M = t % 60;
    var suffix = H < 12 ? "AM" : "PM";
    var hh = H % 12 || 12;
    var label = hh + ":" + String(M).padStart(2, "0") + " " + suffix + " " + zone;
    if (shift > 0) label += " next day";
    else if (shift < 0) label += " prev day";
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
      var span = document.createElement("span");
      span.className = "tz-local";
      span.textContent = " → " + convert(+m[1], +m[2], m[3]);
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });

  if (delta !== 0) {
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
      "</b> Bangkok. Your local equivalent is shown in <b style=\"color:var(--accent)\">purple</b>.";
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

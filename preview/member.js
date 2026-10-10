/* Preview member tools. This browser only. No accounts. */
(function () {
  var FOLLOW = "previewFollows";
  var WATCHED = "previewWatched";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function read(key) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (e) {
      return {};
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }

  function fingerprint(item) {
    var first = (item.episodes && item.episodes[0] && item.episodes[0].at) || item.premiere || "";
    var total = item.total_episodes == null ? "" : String(item.total_episodes);
    return [first, total, item.air_time_ict || ""].join("|");
  }

  function shortDate(iso) {
    if (!iso) return "";
    var parts = String(iso).slice(0, 10).split("-");
    if (parts.length < 3) return iso;
    var label = MONTHS[Number(parts[1]) - 1] + " " + Number(parts[2]);
    if (parts[0] !== "2026") label += " " + parts[0];
    return label;
  }

  function catalog() {
    return window.TGW_CATALOG || [];
  }

  function byId(id) {
    return catalog().filter(function (item) { return item.id === id; })[0] || null;
  }

  function isFollowed(id) {
    return !!read(FOLLOW)[id];
  }

  function toggleFollow(item) {
    var all = read(FOLLOW);
    if (all[item.id]) {
      delete all[item.id];
    } else {
      all[item.id] = {
        id: item.id,
        title: item.title,
        seen: fingerprint(item),
        followedAt: new Date().toISOString()
      };
    }
    write(FOLLOW, all);
    return !!all[item.id];
  }

  function noteFor(item) {
    var row = read(FOLLOW)[item.id];
    if (!row) return null;
    if (row.seen === fingerprint(item)) return null;
    return item.change_note || "A stored date no longer matches this card. Read the card before treating the old line as current.";
  }

  function acknowledge(item) {
    var all = read(FOLLOW);
    if (!all[item.id]) return;
    all[item.id].seen = fingerprint(item);
    write(FOLLOW, all);
  }

  function showSampleNote() {
    var item = byId("buy-my-boss");
    if (!item) return;
    var all = read(FOLLOW);
    all[item.id] = {
      id: item.id,
      title: item.title,
      seen: "2026-10-28|8|",
      followedAt: "2026-10-07T12:00:00.000Z"
    };
    write(FOLLOW, all);
  }

  function watchedList(id) {
    var list = read(WATCHED)[id];
    return Array.isArray(list) ? list.slice() : [];
  }

  function toggleWatched(id, number) {
    var all = read(WATCHED);
    var list = Array.isArray(all[id]) ? all[id].slice() : [];
    var index = list.indexOf(number);
    if (index >= 0) list.splice(index, 1);
    else list.push(number);
    list.sort(function (a, b) { return a - b; });
    all[id] = list;
    write(WATCHED, all);
    return list;
  }

  function phase(item, now) {
    var episodes = item.episodes || [];
    if (!episodes.length) {
      if (item.confidence === "unverified") return "Unverified";
      if (item.clock_unannounced) return "Clock unannounced";
      return "No dated episodes";
    }
    var first = Date.parse(episodes[0].at);
    var last = Date.parse(episodes[episodes.length - 1].at);
    if (first > now) return "Upcoming";
    if (last <= now) return "Wrapped";
    return "Airing";
  }

  function nextEpisode(item, now) {
    var episodes = item.episodes || [];
    for (var i = 0; i < episodes.length; i++) {
      if (Date.parse(episodes[i].at) > now) return episodes[i];
    }
    return null;
  }

  function chip(item, now) {
    var label = phase(item, now);
    var upcoming = nextEpisode(item, now);
    if (upcoming) {
      var last = item.episodes[item.episodes.length - 1];
      var word = upcoming.n === last.n && item.episodes.length > 1 ? "finale" : "next";
      label += " · " + word + " EP " + upcoming.n + " · " + shortDate(upcoming.at);
    } else if (item.premiere) {
      label += " · premiere " + shortDate(item.premiere);
    } else if (item.episodes && item.episodes.length) {
      var end = item.episodes[item.episodes.length - 1];
      label += " · last EP " + end.n + " · " + shortDate(end.at);
    }
    return label;
  }

  function pinState(ep, item, now) {
    if (Date.parse(ep.at) > now) {
      var upcoming = nextEpisode(item, now);
      return upcoming && upcoming.n === ep.n ? "next" : "future";
    }
    return "aired";
  }

  function conflictsHtml(item) {
    if (!item.conflicts || !item.conflicts.length) {
      return "<p class=\"quiet\">No open conflict on this card.</p>";
    }
    return item.conflicts.map(function (conflict) {
      var claims = conflict.claims.map(function (claim) {
        var source = claim.source ? "<span class=\"src\">" + esc(claim.source) + "</span>" : "";
        var link = claim.url ? " <a href=\"" + esc(claim.url) + "\">source</a>" : "";
        return "<li>" + esc(claim.claim) + " " + source + link + "</li>";
      }).join("");
      return "<details class=\"conflict\"" + (conflict.resolved ? "" : " open") + ">"
        + "<summary>" + (conflict.resolved ? "Resolved" : "Open") + " · " + esc(conflict.topic) + "</summary>"
        + "<p class=\"weight\">" + esc(conflict.weight) + "</p>"
        + "<p class=\"src-label\">Sources kept</p><ul>" + claims + "</ul>"
        + "</details>";
    }).join("");
  }

  function pinsHtml(item, now) {
    if (!item.episodes || !item.episodes.length) return "";
    var watched = watchedList(item.id);
    var buttons = item.episodes.map(function (ep) {
      var state = pinState(ep, item, now);
      var on = watched.indexOf(ep.n) >= 0;
      var name = on ? "watched" : state;
      return "<button type=\"button\" class=\"ep\" data-ep=\"" + ep.n + "\" data-state=\"" + state + "\" aria-pressed=\"" + (on ? "true" : "false") + "\" aria-label=\"Episode " + ep.n + ", " + name + ", " + esc(shortDate(ep.at)) + "\">" + ep.n + "</button>";
    }).join("");
    return "<div class=\"pins\" role=\"group\" aria-label=\"Watched marks\">" + buttons + "</div>"
      + "<p class=\"pin-key\"><span class=\"swatch aired\"></span> aired <span class=\"swatch next\"></span> next <span class=\"swatch future\"></span> later <span class=\"swatch watched\"></span> watched</p>";
  }

  function noteHtml(item) {
    var text = noteFor(item);
    if (!text) return "";
    return "<div class=\"date-note\"><strong>Date moved since you followed.</strong> " + esc(text)
      + " <button type=\"button\" class=\"ack\" data-ack=\"" + esc(item.id) + "\">Noted</button></div>";
  }

  function cardHtml(item, now) {
    var following = isFollowed(item.id);
    var studio = item.studio ? "<span class=\"sub\">" + esc(item.studio) + "</span>" : "";
    return "<article class=\"card\" id=\"" + esc(item.id) + "\">"
      + "<div class=\"card-top\"><h2>" + esc(item.title) + "</h2>" + studio
      + "<button type=\"button\" class=\"follow\" data-follow=\"" + esc(item.id) + "\" aria-pressed=\"" + (following ? "true" : "false") + "\">" + (following ? "Following" : "Follow") + "</button></div>"
      + "<p class=\"chip\">" + esc(chip(item, now)) + "</p>"
      + noteHtml(item)
      + "<p><span class=\"gold\">Where you live:</span> " + esc(item.where) + "</p>"
      + "<p><span class=\"gold\">Subtitles:</span> " + esc(item.subs) + "</p>"
      + pinsHtml(item, now)
      + conflictsHtml(item)
      + "</article>";
  }

  function renderCards(root) {
    var now = Date.now();
    root.innerHTML = catalog().map(function (item) { return cardHtml(item, now); }).join("");
  }

  function renderDesk(root) {
    var now = Date.now();
    var follows = read(FOLLOW);
    var watched = read(WATCHED);
    var notes = [];
    var rows = [];
    catalog().forEach(function (item) {
      if (!follows[item.id]) return;
      var note = noteFor(item);
      if (note) {
        notes.push("<li><a href=\"sample-cards.html#" + esc(item.id) + "\">" + esc(item.title) + "</a> — Date moved since you followed. " + esc(note) + " <button type=\"button\" class=\"ack\" data-ack=\"" + esc(item.id) + "\">Noted</button></li>");
      }
      rows.push("<li><a href=\"sample-cards.html#" + esc(item.id) + "\">" + esc(item.title) + "</a> <span class=\"sub\">" + esc(chip(item, now)) + "</span> <button type=\"button\" class=\"follow\" data-follow=\"" + esc(item.id) + "\">Unfollow</button></li>");
    });
    var watchRows = [];
    catalog().forEach(function (item) {
      var list = Array.isArray(watched[item.id]) ? watched[item.id] : [];
      if (!list.length) return;
      var aired = (item.episodes || []).filter(function (ep) { return Date.parse(ep.at) <= now; }).length;
      watchRows.push("<li><a href=\"sample-cards.html#" + esc(item.id) + "\">" + esc(item.title) + "</a> <span class=\"sub\">" + list.length + " marked" + (aired ? " · " + aired + " aired" : "") + "</span></li>");
    });
    root.innerHTML = ""
      + "<section class=\"tool\"><h2>Date notes</h2>"
      + (notes.length ? "<ul>" + notes.join("") + "</ul>" : "<p>Quiet. Nothing you follow has moved since you followed it.</p>")
      + "</section>"
      + "<section class=\"tool\"><h2>Following</h2>"
      + (rows.length ? "<ul>" + rows.join("") + "</ul>" : "<p>You are not following a series. Follow one on the sample cards. A follow stays quiet until a date moves.</p>")
      + "</section>"
      + "<section class=\"tool\"><h2>Watched</h2>"
      + (watchRows.length ? "<ul>" + watchRows.join("") + "</ul>" : "<p>No episodes marked on this browser.</p>")
      + "</section>";
  }

  function onClick(event) {
    var follow = event.target.closest("[data-follow]");
    var ep = event.target.closest("[data-ep]");
    var ack = event.target.closest("[data-ack]");
    var item = null;
    if (follow) item = byId(follow.getAttribute("data-follow"));
    if (ack) item = byId(ack.getAttribute("data-ack"));
    if (ep) item = byId(ep.closest(".card").id);
    if (follow && item) {
      if (follow.textContent === "Unfollow") {
        var all = read(FOLLOW);
        delete all[item.id];
        write(FOLLOW, all);
      } else {
        toggleFollow(item);
      }
    } else if (ep && item) {
      toggleWatched(item.id, Number(ep.getAttribute("data-ep")));
    } else if (ack && item) {
      acknowledge(item);
    } else {
      return;
    }
    document.dispatchEvent(new CustomEvent("tgw-member-change"));
  }

  document.addEventListener("click", onClick);

  window.TGWMember = {
    renderCards: renderCards,
    renderDesk: renderDesk,
    showSampleNote: showSampleNote,
    fingerprint: fingerprint
  };
})();

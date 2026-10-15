/* Country filtering for preview member tools. This browser only. */
(function () {
  "use strict";

  var KEY = "previewCountry";
  var COUNTRIES = ["US","UK","PH","TH","ID","VN","BR"];
  var DATA = null;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }

  function readCountry() {
    try {
      var v = localStorage.getItem(KEY);
      return COUNTRIES.indexOf(v) >= 0 ? v : "US";
    } catch (e) {
      return "US";
    }
  }

  function writeCountry(code) {
    try { localStorage.setItem(KEY, code); } catch (e) {}
  }

  function statusFor(item, country) {
    var best = null;
    (item.platforms || []).forEach(function (p) {
      (p.availability || []).forEach(function (a) {
        if (a.country === country) {
          if (!best || a.status === "available") best = a.status;
        }
      });
    });
    return best; /* null means no row -> treat as not verified */
  }

  function mountFilter(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    var labels = {
      US: "United States", UK: "United Kingdom", PH: "Philippines", TH: "Thailand",
      ID: "Indonesia", VN: "Vietnam", BR: "Brazil"
    };
    COUNTRIES.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = labels[c] || c;
      sel.appendChild(o);
    });
    sel.value = readCountry();
    sel.addEventListener("change", function () {
      writeCountry(sel.value);
      document.dispatchEvent(new CustomEvent("tgw-country-change"));
    });
  }

  function init() {
    try {
      DATA = JSON.parse(document.getElementById("country-data").textContent);
    } catch (e) {
      DATA = { countries: COUNTRIES, series: [] };
    }
    mountFilter("country-filter");
    mountFilter("country-filter-cards");
  }

  window.TGWCountry = {
    read: readCountry,
    write: writeCountry,
    statusFor: statusFor,
    data: function () { return DATA; },
    mountFilter: mountFilter
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* Country badge on member cards. Loads after member.js. */
(function () {
  "use strict";
  function install() {
    if (!window.TGWMember || !window.TGWMember.cardHtml) return;
    var orig = window.TGWMember.cardHtml;
    window.TGWMember.cardHtml = function (item, now) {
      var html = orig(item, now);
      var country = window.TGWCountry ? window.TGWCountry.read() : "US";
      var st = window.TGWCountry ? window.TGWCountry.statusFor(item, country) : null;
      var label = st === "available" ? "Available in " + country
                : st === "not available" ? "Not available in " + country
                : "Not verified in " + country;
      var cls = st === "available" ? "country-ok" : st === "not available" ? "country-bad" : "country-nv";
      var badge = '<p class="country-badge ' + cls + '">' + label + '</p>';
      return html.replace('</article>', badge + '</article>');
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
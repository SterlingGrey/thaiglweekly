(function () {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }

  function norm(value) {
    return String(value == null ? "" : value).toLowerCase().trim();
  }

  function haystack(item) {
    var parts = [item.id, item.title, item.studio || ""];
    if (item.where) parts.push(item.where);
    if (item.subs) parts.push(item.subs);
    if (item.conflicts) {
      item.conflicts.forEach(function (conflict) {
        parts.push(conflict.topic || "");
        (conflict.claims || []).forEach(function (claim) {
          parts.push(claim.claim || "");
          parts.push(claim.source || "");
        });
      });
    }
    return norm(parts.join(" "));
  }

  function mount(inputId, rootId, render, emptyMessage) {
    var input = document.getElementById(inputId);
    var root = document.getElementById(rootId);
    var countEl = document.getElementById(inputId + "-count");
    var clearBtn = document.getElementById(inputId + "-clear");
    if (!input || !root || typeof render !== "function") return;

    var catalog = window.TGW_CATALOG || [];
    var lastNeedle = null;

    function apply() {
      var needle = norm(input.value);
      if (needle === lastNeedle) return;
      lastNeedle = needle;

      var matched = [];
      catalog.forEach(function (item) {
        if (!needle || haystack(item).indexOf(needle) !== -1) matched.push(item);
      });

      if (matched.length) {
        render(root, matched);
        root.removeAttribute("data-search-empty");
      } else {
        root.innerHTML = "<p class=\"search-empty\">" + esc(emptyMessage || "No matches.") + "</p>";
        root.setAttribute("data-search-empty", "1");
      }

      if (countEl) {
        countEl.textContent = needle
          ? matched.length + (matched.length === 1 ? " match" : " matches")
          : catalog.length + " series";
      }
      if (clearBtn) clearBtn.hidden = !needle;
    }

    input.addEventListener("input", apply);
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        input.value = "";
        apply();
        input.focus();
      });
    }
    apply();
  }

  function init() {
    if (window.TGWMember && window.TGWMember.renderCards) {
      var origCards = window.TGWMember.renderCards;
      window.TGWMember.renderCards = function (root) {
        var needle = "";
        var input = document.getElementById("member-search");
        if (input) needle = norm(input.value);
        if (!needle) {
          origCards(root);
          return;
        }
        var matched = (window.TGW_CATALOG || []).filter(function (item) {
          return haystack(item).indexOf(needle) !== -1;
        });
        root.innerHTML = matched.map(function (item) {
          return window.TGWMember.cardHtml
            ? window.TGWMember.cardHtml(item, Date.now())
            : "";
        }).join("");
      };
    }

    mount(
      "member-search",
      "cards",
      function (root, matched) {
        if (window.TGWMember && window.TGWMember.cardHtml) {
          root.innerHTML = matched.map(function (item) {
            return window.TGWMember.cardHtml(item, Date.now());
          }).join("");
        } else if (window.TGWMember && window.TGWMember.renderCards) {
          window.TGWMember.renderCards(root);
        }
      },
      "No series match that search."
    );

    mount(
      "desk-search",
      "desk",
      function (root, matched) {
        if (window.TGWMember && window.TGWMember.renderDesk) {
          var follows = {};
          try {
            follows = JSON.parse(localStorage.getItem("previewFollows") || "{");
          } catch (e) {
            follows = {};
          }
          var filtered = matched.filter(function (item) {
            return !!follows[item.id];
          });
          if (!filtered.length && Object.keys(follows).length) {
            root.innerHTML = "<p class=\"search-empty\">None of your follows match.</p>";
            root.setAttribute("data-search-empty", "1");
            return;
          }
          window.TGWMember.renderDesk(root);
        }
      },
      "No follows match that search."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
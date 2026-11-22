// Thai GL Weekly shop: turns a card's inactive button into a live "Buy" link.
//
// A card is opened by adding one attribute to its <article>:
//   data-checkout-url="https://..."
// Cards without the attribute keep the disabled "Opening soon" button.
// Only https addresses are accepted. Nothing is stored and nothing is sent.
(function () {
  "use strict";

  var cards = document.querySelectorAll(".card[data-checkout-url]");

  Array.prototype.forEach.call(cards, function (card) {
    var raw = (card.getAttribute("data-checkout-url") || "").trim();
    var url;
    try {
      url = new URL(raw);
    } catch (error) {
      return;
    }
    if (url.protocol !== "https:") return;

    var button = card.querySelector("[data-buy]");
    if (!button) return;

    var name = card.querySelector(".card-name");
    var link = document.createElement("a");
    link.className = "btn btn-gold";
    link.href = url.href;
    link.rel = "noopener";
    link.textContent = "Buy";
    if (name) link.setAttribute("aria-label", "Buy " + name.textContent.trim());

    button.parentNode.replaceChild(link, button);
    card.classList.add("is-open");
  });
})();

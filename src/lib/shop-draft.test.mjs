// The merchandise shop at /shop/ is a hidden draft. These checks keep it that way
// until someone opens it on purpose: change them in the same commit that opens the shop.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const page = readFileSync(join(root, "shop/index.html"), "utf8");

test("shop draft is marked, unindexed and kept out of the published site", () => {
  assert.match(page, /<!-- DRAFT, not public\. Built on branch jarvis\/merch-shop-20261122 for review\. No checkout connected\. -->/);
  assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(!readFileSync(join(root, "sitemap.xml"), "utf8").includes("/shop"), "sitemap must not list the shop");
  assert.match(readFileSync(join(root, "_config.yml"), "utf8"), /^\s*- shop\s*$/m, "Jekyll must exclude shop/ from the Pages build");
  assert.ok(!/\/shop\/?['"`]/.test(readFileSync(join(root, "scripts/build-series-pages.mjs"), "utf8")), "sitemap routes must not include the shop");
});

test("no other page links to the shop", () => {
  const skip = new Set([".git", "node_modules", "site", "_site", "shop", "review-output", "subscriber-output"]);
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (skip.has(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.html?$/i.test(entry.name) ? [path] : [];
  });
  for (const path of walk(root)) {
    const text = readFileSync(path, "utf8");
    assert.ok(!/href\s*=\s*["'][^"']*(?:^|[\/"'])shop(?:\/|\.html|["'#?])/i.test(text) && !/href\s*=\s*["'](?:\.\.\/|\/)?shop["'\/]/i.test(text),
      `${relative(root, path)} links to the draft shop`);
  }
});

test("shop has no live checkout, the agreed prices and no outside scripts or styles", () => {
  const buttons = page.match(/<button\b[^>]*data-buy[^>]*>[^<]*<\/button>/g) || [];
  assert.equal(buttons.length, 4);
  for (const button of buttons) {
    assert.match(button, /\sdisabled[\s>]/);
    assert.match(button, />Opening soon</);
  }
  const markup = page.replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/data-checkout-url/.test(markup), "no card may carry a checkout address yet");
  // Prices as set on the hidden Fourthwall products, 22 Nov 2026: tees 28, mugs 18 and 20.
  const prices = [...markup.matchAll(/<p class="price">([^<]*)<\/p>/g)].map(match => match[1]);
  assert.deepEqual(prices, ["$28", "$18 · $20", "$28", "$18 · $20"]);
  assert.equal((markup.match(/[$€£฿]\s?\d/g) || []).length, 6, "no price outside the four cards");
  for (const [, address] of markup.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(?:[a-z]+:)?\/\//i.test(address), `outside resource: ${address}`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyEchoesPolicies } from "../../scripts/echoes-policy-guard.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
  const out = mkdtempSync(join(tmpdir(), "echoes-policy-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  for (const file of ["privacy.html", "terms.html", "tide-and-shadow-echoes.html"]) copyFileSync(join(root, file), join(out, file));
  return out;
}
function replace(out, file, from, to) {
  const path = join(out, file);
  const before = readFileSync(path, "utf8");
  assert.ok(before.includes(from), `Missing mutation target: ${from}`);
  writeFileSync(path, before.replace(from, to));
}
test("tracked policies preserve the live Echoes submission disclosure", t => {
  verifyEchoesPolicies(fixture(t));
});
test("a rebuild that loses the processor disclosure fails", t => {
  const out = fixture(t);
  replace(out, "privacy.html", "Formspree processes the note and any public name", "We process a note");
  assert.throws(() => verifyEchoesPolicies(out), /processor/);
});
test("the old email-only identifying-information claim fails", t => {
  const out = fixture(t);
  replace(out, "privacy.html", "</article>", "<p>We collect your email address and nothing else.</p></article>");
  assert.throws(() => verifyEchoesPolicies(out), /cannot deny/);
});
test("the old categorical user-content denial fails", t => {
  const out = fixture(t);
  replace(out, "terms.html", "</article>", "<p>There is no public paid tier or user-generated content.</p></article>");
  assert.throws(() => verifyEchoesPolicies(out), /cannot deny/);
});
test("missing submission review language fails", t => {
  const out = fixture(t);
  replace(out, "terms.html", "review submissions before public display", "publish submissions immediately");
  assert.throws(() => verifyEchoesPolicies(out), /moderated publication/);
});
test("a broken Echoes privacy route fails", t => {
  const out = fixture(t);
  replace(out, "tide-and-shadow-echoes.html", 'href="privacy.html#reader-echoes"', 'href="missing.html"');
  assert.throws(() => verifyEchoesPolicies(out), /privacy route/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function verifyEchoesPolicies(out, { sourceRoot = out } = {}) {
  const privacy = readFileSync(join(out, "privacy.html"), "utf8");
  const terms = readFileSync(join(out, "terms.html"), "utf8");
  const echoes = readFileSync(join(sourceRoot, "tide-and-shadow-echoes.html"), "utf8");
  assert.match(privacy, /id="reader-echoes"/, "Privacy must retain the Echoes disclosure");
  assert.match(privacy, /Formspree processes the note and any public name/, "Privacy must name the Echoes processor and optional attribution");
  assert.match(privacy, /form does not ask for your email address/, "Echoes must not imply an email is requested");
  assert.match(privacy, /for moderation/, "Privacy must explain moderation");
  assert.match(privacy, /attribute it to “Reader” if you left the name blank/, "Privacy must retain anonymous attribution");
  assert.match(privacy, /href="https:\/\/formspree\.io\/legal\/privacy-policy\/"/, "Formspree privacy link must survive the build");
  assert.doesNotMatch(privacy, /nothing else that identifies you|collect your email address and nothing else/i, "Privacy cannot deny optional names or submitted notes");
  assert.doesNotMatch(terms, /no (?:public paid tier or )?user-generated content/i, "Terms cannot deny moderated reader submissions");
  assert.match(terms, /href="tide-and-shadow-echoes\.html"/, "Terms must link to Echoes");
  assert.match(terms, /review submissions before public display/, "Terms must retain moderated publication");
  assert.match(echoes, /href="privacy\.html(?:#reader-echoes)?"/, "Echoes must retain its working local privacy route");
}

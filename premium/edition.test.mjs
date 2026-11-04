import test from "node:test";
import assert from "node:assert/strict";
import { validateEdition, buildSundaySchedule } from "./edition.mjs";
import { renderPortal } from "./portal.mjs";

test("release content requires owner approval, factual sources and resolved opinions", () => {
  const edition = { status: "approved", approvalReceipt: "owner-review-receipt", title: "Synthetic test", sections: [{ kind: "fact", heading: "Sample", body: "Test only", sources: [{ label: "Fixture", url: "https://example.com/source", checked: "2026-11-04" }] }] };
  assert.equal(validateEdition(edition), edition);
  assert.throws(() => validateEdition({ ...edition, approvalReceipt: "" }));
  assert.throws(() => validateEdition({ ...edition, status: "draft" }));
  assert.throws(() => validateEdition({ ...edition, sections: [{ ...edition.sections[0], sources: [] }] }));
  assert.throws(() => validateEdition({ ...edition, sections: [{ heading: "Opinion", body: "Test", kind: "opinion", pending: "Owner review" }] }));
});

test("weekly schedule preserves source-review age and avoids inventing regional access or verdicts", () => {
  const catalog = { verified_at: "2026-10-22", series: [{ id: "sample", title: "Sample only", episodes: [{ number: 1, airs_at: "2026-11-07T20:30:00+07:00" }, { number: 2, airs_at: "2026-11-14T20:30:00+07:00" }] }] };
  const result = buildSundaySchedule(catalog, { timezone: "America/New_York", now: new Date("2026-11-04T15:00:00Z") });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceReviewDate, "2026-10-22");
  assert.match(result.rows[0].availability, /Check your region/);
  assert.equal(result.status, "draft");
  assert.equal(result.rows[0].verdict, undefined);
});

test("portal rejects unsafe service/key configuration and labels synthetic review honestly", () => {
  assert.throws(() => renderPortal({ api: "http://production.example" }));
  assert.throws(() => renderPortal({ api: "https://user:password@example.com" }));
  assert.throws(() => renderPortal({ api: "https://example.com", clerkKey: "<script>" }));
  const html = renderPortal({ api: "http://127.0.0.1:8789/review", demo: true });
  assert.match(html, /Synthetic sample only/);
  assert.match(html, /remain available in the free Tracker/);
  assert.doesNotMatch(html, /buy\.stripe|checkout\.stripe|Notify me when/);
});

test('unclassified prose and impossible source dates cannot bypass editorial release checks',()=>{
  const base={status:'approved',approvalReceipt:'fixture-owner',title:'Synthetic',sections:[{heading:'Text',body:'Needs classification'}]};
  assert.throws(()=>validateEdition(base));
  assert.throws(()=>validateEdition({...base,sections:[{...base.sections[0],kind:'other'}]}));
  assert.throws(()=>validateEdition({...base,sections:[{...base.sections[0],kind:'fact',sources:[{url:'https://example.com',label:'Fixture',checked:'2026-02-30'}]}]}));
  assert.doesNotThrow(()=>validateEdition(base,{review:true}));
});

test('unknown airtimes keep announced dates without a placeholder local clock',()=>{
  const catalog={verified_at:'2026-10-22',series:[{id:'fixture',title:'Fixture',episodes:[{number:1,airs_at:'2026-11-08T20:30:00+07:00',time_unverified:true}]}]};
  const result=buildSundaySchedule(catalog,{timezone:'Pacific/Kiritimati',now:new Date('2026-11-04T18:00:00Z')});
  assert.equal(result.rows[0].instant,null);assert.equal(result.rows[0].timezone,null);assert.equal(result.rows[0].date,'2026-11-08');assert.match(result.rows[0].local,/time not confirmed/);assert.equal(result.rows[0].sourceReviewDate,'2026-10-22');
});

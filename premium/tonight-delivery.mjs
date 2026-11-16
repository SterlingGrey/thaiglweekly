// Tonight in Bangkok: publisher. Provider-neutral, and still preparation.
// This module holds no credential and makes no network call of its own. It
// drives a `provider` object handed to it. Until a real provider client is
// separately reviewed and approved, the only provider that exists is the fake
// in tonight-delivery.test.mjs.
//
// provider port:
//   findJob(deliveryKey)   -> job or null. Looked up before anything is created.
//   scheduleJob(request)   -> job. request: { key, sendAt, subscriberIds, subject,
//                             preheader, html, text, payloadVersion, bangkokDate,
//                             timezone }.
//                             A thrown error with `definite === true` means the
//                             provider refused and created nothing. Any other
//                             failure is ambiguous: the job may exist.
//   getJob(jobId)          -> job with state 'scheduled' | 'sent' | 'cancelled'
//                             and, once sent, bouncedSubscriberIds and, only if the
//                             provider vouches per recipient, deliveredSubscriberIds.
//   cancelJob(jobId)       -> { cancelled, hold, reason }. `cancelled` is true only
//                             when the job was read back as a draft with no
//                             schedule. Needed by withdrawTonight only.
//   removeDraft(jobId)     -> { removed: true } once the removal is read back.
//   A job is { id, key, sendAt, subscriberIds, payloadVersion, state }.
//
// ledger port (append-only; the last entry for a member and delivery key wins):
//   list(editionKey)            -> entries.
//   put(entry)                  -> void.
//   claim(deliveryKey, entries) -> true if, and only if, no entry existed for
//                                  that delivery key and these were written.
//                                  The check and the write MUST be one atomic
//                                  step: it is the only thing that stops two
//                                  overlapping workers scheduling the same
//                                  cohort. In a Durable Object that is one
//                                  storage transaction (delivery-ledger.mjs).
//                                  A refusal that is not a lost race (a member
//                                  reserved under another cohort, a body not on
//                                  record) is thrown with a `code`.
//   reclaim(deliveryKey, entries) -> true if, and only if, every member's latest
//                                  entry under the key was `cancelled` with the
//                                  draft's removal verified, and the new intent
//                                  for these members (a subset) was written.
//   putPayload({ editionKey, version, ref, payload }) and getPayload(version):
//                                  the frozen body, stored once under its hash.

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** The stage that frees a cancelled cohort's key: the draft was removed and the removal read back. */
export const REMOVED_VERIFIED = 'draft_removed_verified';

/** In-memory ledger for tests and dry runs. Production needs durable storage: delivery-ledger.mjs. */
export function memoryLedger(initial = []) {
  const entries = initial.map(e => ({ ...e })), payloads = new Map();
  const latest = key => [...new Map(entries.filter(e => e.deliveryKey === key).map(e => [e.memberId, e])).values()];
  return {
    async list(editionKey) { return entries.filter(e => e.editionKey === editionKey).map(e => ({ ...e })); },
    async put(entry) { entries.push({ ...entry }); },
    // No await between the check and the write: atomic on one event loop.
    async claim(deliveryKey, claimed) {
      if (entries.some(e => e.deliveryKey === deliveryKey)) return false;
      const taken = claimed.filter(c => entries.some(e => e.editionKey === c.editionKey && (e.memberId === c.memberId || e.subscriberId === c.subscriberId)));
      if (taken.length) throw Object.assign(new Error('The ledger refused the claim: member_reserved'), { code: 'member_reserved', members: taken.map(e => e.memberId) });
      for (const e of claimed) entries.push({ ...e });
      return true;
    },
    async reclaim(deliveryKey, claimed) {
      const current = latest(deliveryKey);
      if (!current.length || current.some(e => e.state !== 'cancelled' || e.providerStage !== REMOVED_VERIFIED)) return false;
      const strangers = claimed.filter(c => !current.some(e => e.memberId === c.memberId && e.subscriberId === c.subscriberId && !e.withdrawnReason));
      if (strangers.length) throw Object.assign(new Error('The ledger refused the claim: not_from_this_cohort'), { code: 'not_from_this_cohort', members: strangers.map(e => e.memberId) });
      for (const e of claimed) entries.push({ ...e });
      return true;
    },
    async putPayload({ version, ref, payload }) {
      const body = JSON.stringify({ subject: payload.subject, preheader: payload.preheader ?? '', html: payload.html, text: payload.text }), existing = payloads.get(version);
      if (existing && (existing.body !== body || existing.ref !== ref)) throw Object.assign(new Error('A different payload is already on record under this version'), { code: 'payload_conflict' });
      payloads.set(version, { ref, body });
    },
    async getPayload(version) { const found = payloads.get(version); return found ? JSON.parse(found.body) : null; },
    all: () => entries.map(e => ({ ...e })),
  };
}

/** Latest entry per member and delivery key. */
export function currentLedger(entries) {
  return [...new Map(entries.map(e => [`${e.deliveryKey}|${e.memberId}`, e])).values()];
}

/** Why a member may no longer receive this cohort's email, or null. */
function ineligible(fresh, timezone, subscriberId) {
  return !fresh ? 'No current record'
    : fresh.stripeAccess !== true || fresh.mailerliteStatus !== 'active' || fresh.inPaidGroup !== true ? 'Paid access or active paid-group membership no longer holds'
    : fresh.dailyEmailConsent !== true ? 'Opted out of the daily email'
    : fresh.timezoneConfirmed !== true || fresh.timezone !== timezone ? 'Delivery time zone changed or is unconfirmed'
    : fresh.subscriberId !== subscriberId ? 'Subscriber mapping changed' : null;
}

/**
 * Submit one claimed cohort and record what happened. The caller holds the
 * claim. Returns { outcome, created, alert?, extra }.
 */
async function submitCohort({ provider, ledger, cohort, payload, kept, stamp }) {
  const entryFor = (m, state, extra = {}) => ({ editionKey: cohort.editionKey, deliveryKey: cohort.deliveryKey, bangkokDate: cohort.bangkokDate, timezone: cohort.timezone, memberId: m.memberId, subscriberId: m.subscriberId, sendAt: cohort.sendAt, payloadVersion: cohort.payloadVersion, state, at: stamp, ...extra });
  const request = { key: cohort.deliveryKey, sendAt: cohort.sendAt, subscriberIds: kept.map(m => m.subscriberId), subject: payload.subject, preheader: payload.preheader, html: payload.html, text: payload.text, payloadVersion: cohort.payloadVersion, bangkokDate: cohort.bangkokDate, timezone: cohort.timezone };
  let job;
  try { job = await provider.scheduleJob(request); }
  catch (error) {
    // Whatever the provider is known to hold (a group, a draft) is recorded with
    // the outcome, so reconciliation never has to guess what was left behind.
    const staged = error?.staged && typeof error.staged === 'object' ? error.staged : {};
    const trace = { ...(staged.campaignId ? { providerJobId: staged.campaignId } : {}), ...(staged.groupId ? { providerGroupId: staged.groupId } : {}), ...(staged.stage ? { providerStage: staged.stage } : {}) };
    if (error?.definite === true) {
      for (const m of kept) await ledger.put(entryFor(m, 'failed', { ...trace, note: 'Provider refused; nothing that can send was left' }));
      return { outcome: 'rejected', created: false, alert: ['rejected', 'The provider refused the job'], extra: trace };
    }
    // The intent stays 'unknown': the provider may have accepted it.
    if (Object.keys(trace).length) for (const m of kept) await ledger.put(entryFor(m, 'unknown', { ...trace, note: 'Submission unresolved; provider objects recorded' }));
    return { outcome: 'ambiguous', created: false, alert: ['ambiguous_submission', 'The provider did not answer; the job may or may not exist'], extra: trace };
  }
  const exact = job && job.key === cohort.deliveryKey && job.sendAt === cohort.sendAt && sameSet(job.subscriberIds || [], request.subscriberIds) && job.payloadVersion === cohort.payloadVersion;
  if (!exact) {
    // The entries stay 'unknown' until an operator reads the job.
    if (job?.id) for (const m of kept) await ledger.put(entryFor(m, 'unknown', { providerJobId: job.id, ...(job.groupId ? { providerGroupId: job.groupId } : {}), note: 'Readback did not match the submission' }));
    return { outcome: 'held_mismatch', created: true, alert: ['readback_mismatch', 'The provider’s job does not match the audience, time or body that was submitted'], extra: { providerJobId: job?.id ?? null } };
  }
  for (const m of kept) await ledger.put(entryFor(m, 'queued', { providerJobId: job.id, ...(job.groupId ? { providerGroupId: job.groupId } : {}) }));
  return { outcome: 'queued', created: true, extra: { providerJobId: job.id, subscribers: kept.length } };
}

/** A claim or reclaim: 'won', 'lost' to another worker, or 'held' with the ledger's reason. */
async function take(ledger, method, deliveryKey, entries, alert) {
  try { return await ledger[method](deliveryKey, entries) === true ? 'won' : 'lost'; }
  catch (error) {
    if (!error?.code) throw error;
    alert(error.code, error.code === 'member_reserved' ? 'A member of this cohort is already reserved under another cohort of this edition; held so nobody is sent two' : `The ledger refused the claim (${error.code}); held for investigation`);
    return 'held';
  }
}

/**
 * Publish one prepared plan. For each batch, in order:
 *   1. If the provider already holds a job for the key, compare it with the
 *      intent on the ledger (or, if the ledger has none, with the batch). An
 *      exact match is adopted; anything else is held for investigation.
 *   2. If the ledger already holds the key and the provider shows no job, do
 *      nothing: another worker is submitting, or an earlier attempt is unresolved.
 *   3. Recheck every member now. Entitlement, opt-in and zone must still hold;
 *      an opt-out made after preparation takes effect here.
 *   4. Claim the delivery key atomically, writing the intent. Only the worker
 *      whose claim succeeds may call the provider.
 *   5. Schedule, then read the job back. Only an exact match is recorded as queued.
 * Nothing is retried automatically. A send time already passed is never made up.
 */
export async function publishTonight({ plan, provider, ledger, recheck, now = new Date(), claimFreshMinutes = 5 }) {
  if (plan?.product !== 'tonight-in-bangkok' || plan.status !== 'prepared_not_scheduled' || !Array.isArray(plan.batches)) throw new Error('A prepared Tonight in Bangkok plan is required');
  if (typeof provider?.findJob !== 'function' || typeof provider.scheduleJob !== 'function' || typeof ledger?.list !== 'function' || typeof ledger.put !== 'function' || typeof ledger.claim !== 'function' || typeof recheck !== 'function') throw new Error('A provider, a ledger with an atomic claim and an eligibility recheck are required');
  const nowMs = +new Date(now);
  if (!Number.isFinite(nowMs)) throw new Error('Invalid time');
  const stamp = new Date(nowMs).toISOString();
  const outcomes = [], alerts = [];
  let jobsCreated = 0;
  for (const batch of plan.batches) {
    const done = (outcome, extra = {}) => outcomes.push({ deliveryKey: batch.deliveryKey, timezone: batch.timezone, sendAt: batch.sendAt, outcome, ...extra });
    const alert = (kind, reason) => alerts.push({ deliveryKey: batch.deliveryKey, timezone: batch.timezone, kind, reason });
    const entryFor = (memberId, subscriberId, state, extra = {}) => ({ editionKey: plan.editionKey, deliveryKey: batch.deliveryKey, bangkokDate: plan.bangkokDate, timezone: batch.timezone, memberId, subscriberId, sendAt: batch.sendAt, payloadVersion: batch.payloadVersion, state, at: stamp, ...extra });

    const payload = plan.payloads?.[batch.payloadRef];
    if (!payload?.html || !payload.text || !payload.subject) { alert('payload_missing', 'The frozen payload for this batch is not in the plan'); done('held'); continue; }
    // The body goes on record, under its hash, before any claim can refer to it.
    if (typeof ledger.putPayload === 'function') await ledger.putPayload({ editionKey: plan.editionKey, version: batch.payloadVersion, ref: batch.payloadRef, payload });

    const onRecord = currentLedger((await ledger.list(plan.editionKey)).filter(e => e.deliveryKey === batch.deliveryKey));
    // A withdrawn member's 'cancelled' entry is history, not part of what the provider should hold now.
    const intent = onRecord.filter(e => e.state !== 'failed' && e.state !== 'cancelled');
    const existing = await provider.findJob(batch.deliveryKey);
    if (existing) {
      const audience = existing.subscriberIds || [];
      if (intent.length) {
        // The job must be the one this ledger meant to submit: same people, instant and body.
        const match = existing.key === batch.deliveryKey && existing.sendAt === intent[0].sendAt && existing.payloadVersion === intent[0].payloadVersion
          && intent.every(e => e.sendAt === intent[0].sendAt && e.payloadVersion === intent[0].payloadVersion) && sameSet(audience, intent.map(e => e.subscriberId));
        if (!match) { alert('adopted_job_mismatch', 'The provider’s job does not match the intent on record; held for investigation'); done('held_mismatch', { providerJobId: existing.id ?? null }); continue; }
        for (const e of intent) if (e.state === 'unknown') { const { at, note, seq, recordedAt, ...rest } = e; await ledger.put({ ...rest, state: 'queued', providerJobId: existing.id, at: stamp, note: 'Provider job matches the recorded intent' }); }
        if (existing.payloadVersion !== batch.payloadVersion) alert('revision_not_applied', 'The provider holds an earlier body for this cohort; replacing it is an operator decision');
      } else {
        // No intent survives (a lost ledger). The job may only cover people in this batch, at its instant, with its body.
        const match = existing.key === batch.deliveryKey && existing.sendAt === batch.sendAt && existing.payloadVersion === batch.payloadVersion
          && audience.length > 0 && audience.every(id => batch.subscriberIds.includes(id));
        if (!match) { alert('adopted_job_mismatch', 'A provider job exists for this cohort but does not match this plan, and no intent is on record; held for investigation'); done('held_mismatch', { providerJobId: existing.id ?? null }); continue; }
        const adopted = audience.map(id => entryFor(batch.memberIds[batch.subscriberIds.indexOf(id)], id, 'queued', { providerJobId: existing.id, note: 'Adopted an existing provider job; no earlier intent on record' }));
        const adoption = await take(ledger, 'claim', batch.deliveryKey, adopted, alert);
        if (adoption !== 'won') { done(adoption === 'held' ? 'held' : 'claimed_elsewhere'); continue; }
      }
      done('adopted_existing_job', { providerJobId: existing.id });
      continue;
    }
    if (onRecord.length) {
      const newest = Math.max(...onRecord.map(e => Date.parse(e.at) || 0));
      if (onRecord.some(e => e.state === 'unknown') && nowMs - newest > claimFreshMinutes * 60000) {
        alert('ambiguous_submission', 'An earlier attempt has no known outcome and the provider shows no job; an operator decides whether to submit again');
        done('skipped_on_record');
      } else done(onRecord.some(e => e.state === 'unknown') ? 'claimed_elsewhere' : 'skipped_on_record');
      continue;
    }
    if (nowMs >= Date.parse(batch.sendAt)) { alert('missed_window', 'The send time has passed; no immediate or next-day send is made'); done('missed_window'); continue; }

    const fresh = await recheck(batch.memberIds);
    const kept = [], dropped = [];
    batch.memberIds.forEach((memberId, i) => {
      const reason = ineligible(fresh?.[memberId], batch.timezone, batch.subscriberIds[i]);
      if (reason) dropped.push({ memberId, reason }); else kept.push({ memberId, subscriberId: batch.subscriberIds[i] });
    });
    if (!kept.length) { done('no_audience', { dropped }); continue; }

    // The claim reserves the key and records the intent in one step. A worker
    // that loses it stops here and never reaches the provider.
    const claim = await take(ledger, 'claim', batch.deliveryKey, kept.map(m => entryFor(m.memberId, m.subscriberId, 'unknown', { note: 'Intent recorded before submission' })), alert);
    if (claim !== 'won') { done(claim === 'held' ? 'held' : 'claimed_elsewhere', { dropped }); continue; }

    const result = await submitCohort({ provider, ledger, cohort: { editionKey: plan.editionKey, deliveryKey: batch.deliveryKey, bangkokDate: plan.bangkokDate, timezone: batch.timezone, sendAt: batch.sendAt, payloadVersion: batch.payloadVersion }, payload, kept, stamp });
    if (result.created) jobsCreated += 1;
    if (result.alert) alert(...result.alert);
    done(result.outcome, { ...result.extra, dropped });
  }
  return { product: plan.product, bangkokDate: plan.bangkokDate, editionKey: plan.editionKey, at: stamp, outcomes, alerts, jobsCreated };
}

/**
 * After a cohort is queued, a member may opt out, lose access or change zone.
 * Run this before each send. For every queued cohort of the edition:
 *   1. Recheck its members now. If all still qualify, nothing is touched.
 *   2. Otherwise cancel the job. It counts only if the provider reads back a
 *      draft with no schedule; too late, refused or unclear is a hold with an
 *      alert, and nothing else is done to that cohort.
 *   3. Record every member as cancelled, the withdrawn ones with the reason.
 *   4. Remove the draft and read the removal back. Until that is verified
 *      nothing is rebuilt.
 *   5. Reclaim the key for the members who still qualify (never anyone new)
 *      and schedule a replacement with the same frozen body, read back exactly.
 * It works from the ledger alone, so it can resume after an interruption at
 * any step: a cohort left cancelled and not yet rebuilt is picked up again.
 * A group is never edited to change a queued campaign.
 */
export async function withdrawTonight({ editionKey, provider, ledger, recheck, now = new Date() }) {
  if (typeof provider?.findJob !== 'function' || typeof provider.scheduleJob !== 'function' || typeof provider.cancelJob !== 'function' || typeof provider.removeDraft !== 'function'
    || typeof ledger?.list !== 'function' || typeof ledger.put !== 'function' || typeof ledger.reclaim !== 'function' || typeof ledger.getPayload !== 'function' || typeof recheck !== 'function') throw new Error('A provider that can cancel, a ledger that can reclaim and an eligibility recheck are required');
  const nowMs = +new Date(now);
  if (!Number.isFinite(nowMs)) throw new Error('Invalid time');
  const stamp = new Date(nowMs).toISOString();
  const all = await ledger.list(editionKey);
  const outcomes = [], alerts = [];
  let jobsCreated = 0;
  const cohortKeys = [...new Set(all.map(e => e.deliveryKey))];
  const handle = async key => {
    const current = currentLedger(all.filter(e => e.deliveryKey === key));
    const { timezone, sendAt, bangkokDate, payloadVersion } = current[0];
    const cohort = { editionKey, deliveryKey: key, bangkokDate, timezone, sendAt, payloadVersion };
    const done = (outcome, extra = {}) => outcomes.push({ deliveryKey: key, timezone, sendAt, outcome, ...extra });
    const alert = (kind, reason) => alerts.push({ deliveryKey: key, timezone, kind, reason });
    const queued = current.filter(e => e.state === 'queued');
    // Cancelled without a reason: these members still qualify and are owed the rebuilt job.
    const awaiting = current.filter(e => e.state === 'cancelled' && !e.withdrawnReason);
    // Cancelled, but the draft's removal is not yet on record: unfinished whoever is left.
    const unremoved = current.filter(e => e.state === 'cancelled' && e.providerStage !== REMOVED_VERIFIED);
    // An intent of unknown outcome may be a live job nobody can name. Said every run, never skipped.
    if (current.some(e => e.state === 'unknown')) { alert('ambiguous_submission', 'A submission for this cohort has no known outcome; nothing is cancelled or rebuilt until it is reconciled'); done('held_unresolved'); return; }
    if (!queued.length && !awaiting.length && !unremoved.length) return;
    if (queued.length && awaiting.length) { alert('ledger_inconsistent', 'This cohort has members both queued and cancelled awaiting a rebuild; held for investigation'); done('held'); return; }
    if (nowMs >= Date.parse(sendAt)) {
      if (awaiting.length) alert('cancelled_not_rebuilt', 'The send time passed with this cohort cancelled and not rebuilt; no late send is made');
      done('past_send_time');
      return;
    }
    const members = queued.length ? queued : awaiting;
    const jobIds = [...new Set((members.length ? members : unremoved).map(e => e.providerJobId).filter(Boolean))];
    if (jobIds.length !== 1) { alert('ledger_inconsistent', 'The provider job for this cohort is not on record as one job; held for investigation'); done('held'); return; }
    const jobId = jobIds[0];
    const fresh = await recheck(members.map(e => e.memberId));
    const kept = [], dropped = [];
    for (const e of members) { const reason = ineligible(fresh?.[e.memberId], timezone, e.subscriberId); if (reason) dropped.push({ memberId: e.memberId, reason }); else kept.push(e); }
    const reasonFor = memberId => dropped.find(d => d.memberId === memberId)?.reason;
    const cancelled = (e, providerStage) => { const { at, note, seq, recordedAt, ...rest } = e; const reason = reasonFor(e.memberId); return { ...rest, state: 'cancelled', providerStage, at: stamp, ...(reason ? { withdrawnReason: reason } : {}) }; };

    let stage;
    if (queued.length) {
      if (!dropped.length) { done('unchanged'); return; }
      let cancel;
      try { cancel = await provider.cancelJob(jobId); } catch (error) { cancel = { cancelled: false, reason: `The cancellation failed: ${error.message}` }; }
      if (cancel?.cancelled !== true) {
        alert('withdrawal_held', `The queued job could not be confirmed cancelled (${cancel?.reason || 'no reason given'}). ${dropped.length} member(s) who no longer qualify may still receive it.`);
        done('held_cancel_unconfirmed', { dropped, providerJobId: jobId });
        return;
      }
      // Read back as a draft: on record before anything else is attempted.
      stage = 'cancelled_draft';
      for (const e of members) await ledger.put(cancelled(e, stage));
    } else {
      // Resuming. Anyone who stopped qualifying since the cancellation is withdrawn now.
      stage = unremoved.length ? 'cancelled_draft' : REMOVED_VERIFIED;
      for (const e of members) if (reasonFor(e.memberId)) await ledger.put(cancelled(e, e.providerStage));
    }
    if (stage !== REMOVED_VERIFIED) {
      let removed = false;
      try { removed = (await provider.removeDraft(jobId))?.removed === true; }
      // A definite "not found" for the draft is itself the readback that it is gone.
      catch (error) { removed = error?.definite === true && error.status === 404; }
      if (!removed) {
        alert('draft_lingering', 'The job was cancelled and read back as a draft, but the draft could not be confirmed removed. Nothing is rebuilt until it is.');
        done('cancelled_draft_lingering', { dropped, providerJobId: jobId });
        return;
      }
      // Every member of the cohort, the withdrawn included, moves to the stage that frees the key.
      for (const e of currentLedger((await ledger.list(editionKey)).filter(x => x.deliveryKey === key))) if (e.state === 'cancelled' && e.providerStage !== REMOVED_VERIFIED) { const { at, note, seq, recordedAt, ...rest } = e; await ledger.put({ ...rest, providerStage: REMOVED_VERIFIED, at: stamp }); }
    }
    if (!kept.length) { done('withdrawn_all', { dropped }); return; }

    // Rebuild from the audience verified a moment ago. Nothing may sit under the key first.
    if (await provider.findJob(key)) { alert('adopted_job_mismatch', 'A provider job still exists under this cohort’s key after the draft was removed; held for investigation'); done('held_mismatch', { dropped }); return; }
    const payload = await ledger.getPayload(payloadVersion);
    if (!payload?.html || !payload.text || !payload.subject) { alert('payload_missing', 'The frozen body for this cohort is not on record; the cohort stays cancelled'); done('cancelled_not_rebuilt', { dropped }); return; }
    const reclaim = await take(ledger, 'reclaim', key, kept.map(e => ({ editionKey, deliveryKey: key, bangkokDate, timezone, memberId: e.memberId, subscriberId: e.subscriberId, sendAt, payloadVersion, state: 'unknown', at: stamp, note: 'Replacement intent recorded before submission' })), alert);
    if (reclaim !== 'won') { done(reclaim === 'held' ? 'held' : 'claimed_elsewhere', { dropped }); return; }
    const result = await submitCohort({ provider, ledger, cohort, payload, kept, stamp });
    if (result.created) jobsCreated += 1;
    if (result.alert) alert(...result.alert);
    done(result.outcome === 'queued' ? 'rebuilt' : `rebuild_${result.outcome}`, { ...result.extra, dropped, replacedJobId: jobId });
  };
  for (const key of cohortKeys) {
    try { await handle(key); }
    catch (error) {
      // One cohort's fault never stops the others being checked: this run exists to stop wrongful sends.
      // A refusal from the ledger (a stale write, a mismatch) and any other failure both hold the cohort, aloud.
      const sample = all.find(e => e.deliveryKey === key);
      alerts.push({ deliveryKey: key, timezone: sample.timezone, kind: error?.code ? 'ledger_refused' : 'withdrawal_error',
        reason: error?.code ? `The ledger refused a write for this cohort (${error.code}); held for investigation` : `The withdrawal check for this cohort stopped part-way (${error?.message || 'no message'}); it resumes on the next run` });
      outcomes.push({ deliveryKey: key, timezone: sample.timezone, sendAt: sample.sendAt, outcome: error?.code ? 'held' : 'held_error' });
    }
  }
  return { product: 'tonight-in-bangkok', editionKey, at: stamp, outcomes, alerts, jobsCreated };
}

/** Read each queued job back after its send time and record dispatch and delivery. */
export async function collectTonightReceipts({ editionKey, provider, ledger, now = new Date() }) {
  if (typeof provider?.getJob !== 'function') throw new Error('A provider is required');
  const nowMs = +new Date(now), stamp = new Date(nowMs).toISOString();
  const queued = currentLedger(await ledger.list(editionKey)).filter(e => (e.state === 'queued' || e.state === 'dispatched') && e.providerJobId);
  const jobs = new Map();
  let recorded = 0;
  for (const entry of queued) {
    if (!jobs.has(entry.providerJobId)) jobs.set(entry.providerJobId, await provider.getJob(entry.providerJobId));
    const job = jobs.get(entry.providerJobId);
    if (!job || job.state !== 'sent') continue;
    // 'delivered' needs the provider's own word for that recipient. A provider that
    // reports only sends and bounces yields 'dispatched' or 'bounced', never 'delivered'.
    const state = (job.bouncedSubscriberIds || []).includes(entry.subscriberId) ? 'bounced' : (job.deliveredSubscriberIds || []).includes(entry.subscriberId) ? 'delivered' : 'dispatched';
    if (state === entry.state) continue;
    const { at, note, seq, recordedAt, ...rest } = entry;
    await ledger.put({ ...rest, state, at: stamp });
    recorded += 1;
  }
  return { editionKey, at: stamp, jobsRead: jobs.size, recorded };
}

/**
 * The alarm. Silence is never taken as success: a batch that is not on record
 * as queued shortly before its send time, a job with no dispatch receipt after
 * it, an attempt of unknown outcome, and a day whose evidence is incomplete
 * each raise an alert. Returns { ok, alerts }.
 */
export function tonightAlarm({ plan, entries, now = new Date(), queueLeadMinutes = 120, receiptGraceMinutes = 30 }) {
  const nowMs = +new Date(now);
  const current = currentLedger(entries.filter(e => e.editionKey === plan.editionKey));
  const alerts = [];
  if (plan.dayStatus === 'evidence_gap') alerts.push({ kind: 'evidence_gap', reason: 'Nothing is confirmed for this date, but a show is expected. Check the sources before the day is called quiet.' });
  for (const a of plan.operatorAlerts || []) if (a.kind !== 'unsourced_usual_slot' || plan.dayStatus !== 'evidence_gap') alerts.push({ kind: a.kind, showId: a.showId, reason: a.reason });
  for (const batch of [...plan.batches, ...(plan.reconcile || [])]) {
    const mine = current.filter(e => e.deliveryKey === batch.deliveryKey);
    const sendMs = Date.parse(batch.sendAt);
    if (mine.some(e => e.state === 'unknown')) alerts.push({ kind: 'ambiguous_submission', timezone: batch.timezone, reason: 'A submission has no known outcome' });
    const live = mine.filter(e => e.state === 'queued' || e.state === 'dispatched' || e.state === 'delivered' || e.state === 'bounced');
    // Everyone withdrawn for a reason, the draft's removal verified: that cohort is settled, not silent.
    if (mine.length && mine.every(e => e.state === 'cancelled' && e.withdrawnReason && e.providerStage === REMOVED_VERIFIED)) continue;
    if (!live.length && mine.some(e => e.state === 'cancelled')) { alerts.push({ kind: 'cancelled_not_rebuilt', timezone: batch.timezone, reason: 'This cohort was cancelled and has not been rebuilt' }); continue; }
    if (!live.length && batch.status !== 'held_reconcile_first' && nowMs >= sendMs - queueLeadMinutes * 60000) alerts.push({ kind: 'not_queued', timezone: batch.timezone, reason: `Due ${batch.sendAt} and not on record as queued` });
    if (batch.status === 'held_reconcile_first' && nowMs >= sendMs - queueLeadMinutes * 60000 && !live.length) alerts.push({ kind: 'held_unreconciled', timezone: batch.timezone, reason: batch.reason });
    if (live.length && live.every(e => e.state === 'queued') && nowMs >= sendMs + receiptGraceMinutes * 60000) alerts.push({ kind: 'no_dispatch_receipt', timezone: batch.timezone, reason: `Sent time ${batch.sendAt} has passed with no dispatch receipt` });
  }
  return { ok: alerts.length === 0, checkedAt: new Date(nowMs).toISOString(), alerts };
}

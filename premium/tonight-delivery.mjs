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
//                                  storage transaction.

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** In-memory ledger for tests and dry runs. Production needs durable storage. */
export function memoryLedger(initial = []) {
  const entries = initial.map(e => ({ ...e }));
  return {
    async list(editionKey) { return entries.filter(e => e.editionKey === editionKey).map(e => ({ ...e })); },
    async put(entry) { entries.push({ ...entry }); },
    // No await between the check and the write: atomic on one event loop.
    async claim(deliveryKey, claimed) { if (entries.some(e => e.deliveryKey === deliveryKey)) return false; for (const e of claimed) entries.push({ ...e }); return true; },
    all: () => entries.map(e => ({ ...e })),
  };
}

/** Latest entry per member and delivery key. */
export function currentLedger(entries) {
  return [...new Map(entries.map(e => [`${e.deliveryKey}|${e.memberId}`, e])).values()];
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

    const onRecord = currentLedger((await ledger.list(plan.editionKey)).filter(e => e.deliveryKey === batch.deliveryKey));
    const intent = onRecord.filter(e => e.state !== 'failed');
    const existing = await provider.findJob(batch.deliveryKey);
    if (existing) {
      const audience = existing.subscriberIds || [];
      if (intent.length) {
        // The job must be the one this ledger meant to submit: same people, instant and body.
        const match = existing.key === batch.deliveryKey && existing.sendAt === intent[0].sendAt && existing.payloadVersion === intent[0].payloadVersion
          && intent.every(e => e.sendAt === intent[0].sendAt && e.payloadVersion === intent[0].payloadVersion) && sameSet(audience, intent.map(e => e.subscriberId));
        if (!match) { alert('adopted_job_mismatch', 'The provider’s job does not match the intent on record; held for investigation'); done('held_mismatch', { providerJobId: existing.id ?? null }); continue; }
        for (const e of intent) if (e.state === 'unknown') { const { at, note, ...rest } = e; await ledger.put({ ...rest, state: 'queued', providerJobId: existing.id, at: stamp, note: 'Provider job matches the recorded intent' }); }
        if (existing.payloadVersion !== batch.payloadVersion) alert('revision_not_applied', 'The provider holds an earlier body for this cohort; replacing it is an operator decision');
      } else {
        // No intent survives (a lost ledger). The job may only cover people in this batch, at its instant, with its body.
        const match = existing.key === batch.deliveryKey && existing.sendAt === batch.sendAt && existing.payloadVersion === batch.payloadVersion
          && audience.length > 0 && audience.every(id => batch.subscriberIds.includes(id));
        if (!match) { alert('adopted_job_mismatch', 'A provider job exists for this cohort but does not match this plan, and no intent is on record; held for investigation'); done('held_mismatch', { providerJobId: existing.id ?? null }); continue; }
        const adopted = audience.map(id => entryFor(batch.memberIds[batch.subscriberIds.indexOf(id)], id, 'queued', { providerJobId: existing.id, note: 'Adopted an existing provider job; no earlier intent on record' }));
        if (!await ledger.claim(batch.deliveryKey, adopted)) { done('claimed_elsewhere'); continue; }
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
      const f = fresh?.[memberId];
      const reason = !f ? 'No current record'
        : f.stripeAccess !== true || f.mailerliteStatus !== 'active' || f.inPaidGroup !== true ? 'Paid access or active paid-group membership no longer holds'
        : f.dailyEmailConsent !== true ? 'Opted out of the daily email'
        : f.timezoneConfirmed !== true || f.timezone !== batch.timezone ? 'Delivery time zone changed or is unconfirmed'
        : f.subscriberId !== batch.subscriberIds[i] ? 'Subscriber mapping changed' : null;
      if (reason) dropped.push({ memberId, reason }); else kept.push({ memberId, subscriberId: batch.subscriberIds[i] });
    });
    if (!kept.length) { done('no_audience', { dropped }); continue; }

    // The claim reserves the key and records the intent in one step. A worker
    // that loses it stops here and never reaches the provider.
    const claimed = await ledger.claim(batch.deliveryKey, kept.map(m => entryFor(m.memberId, m.subscriberId, 'unknown', { note: 'Intent recorded before submission' })));
    if (!claimed) { done('claimed_elsewhere', { dropped }); continue; }

    const request = { key: batch.deliveryKey, sendAt: batch.sendAt, subscriberIds: kept.map(m => m.subscriberId), subject: payload.subject, preheader: payload.preheader, html: payload.html, text: payload.text, payloadVersion: batch.payloadVersion, bangkokDate: plan.bangkokDate, timezone: batch.timezone };
    let job;
    try { job = await provider.scheduleJob(request); }
    catch (error) {
      // Whatever the provider is known to hold (a group, a draft) is recorded with
      // the outcome, so reconciliation never has to guess what was left behind.
      const staged = error?.staged && typeof error.staged === 'object' ? error.staged : {};
      const trace = { ...(staged.campaignId ? { providerJobId: staged.campaignId } : {}), ...(staged.groupId ? { providerGroupId: staged.groupId } : {}), ...(staged.stage ? { providerStage: staged.stage } : {}) };
      if (error?.definite === true) {
        for (const m of kept) await ledger.put(entryFor(m.memberId, m.subscriberId, 'failed', { ...trace, note: 'Provider refused; nothing that can send was left' }));
        alert('rejected', 'The provider refused the job');
        done('rejected', { dropped, ...trace });
      } else {
        // The intent stays 'unknown': the provider may have accepted it.
        if (Object.keys(trace).length) for (const m of kept) await ledger.put(entryFor(m.memberId, m.subscriberId, 'unknown', { ...trace, note: 'Submission unresolved; provider objects recorded' }));
        alert('ambiguous_submission', 'The provider did not answer; the job may or may not exist');
        done('ambiguous', { dropped, ...trace });
      }
      continue;
    }
    jobsCreated += 1;
    const exact = job && job.key === batch.deliveryKey && job.sendAt === batch.sendAt && sameSet(job.subscriberIds || [], request.subscriberIds) && job.payloadVersion === batch.payloadVersion;
    if (!exact) {
      alert('readback_mismatch', 'The provider’s job does not match the audience, time or body that was submitted');
      if (job?.id) for (const m of kept) await ledger.put(entryFor(m.memberId, m.subscriberId, 'unknown', { providerJobId: job.id, ...(job.groupId ? { providerGroupId: job.groupId } : {}), note: 'Readback did not match the submission' }));
      done('held_mismatch', { providerJobId: job?.id ?? null, dropped });
      continue; // The entries stay 'unknown' until an operator reads the job.
    }
    for (const m of kept) await ledger.put(entryFor(m.memberId, m.subscriberId, 'queued', { providerJobId: job.id, ...(job.groupId ? { providerGroupId: job.groupId } : {}) }));
    done('queued', { providerJobId: job.id, subscribers: kept.length, dropped });
  }
  return { product: plan.product, bangkokDate: plan.bangkokDate, editionKey: plan.editionKey, at: stamp, outcomes, alerts, jobsCreated };
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
    const { at, note, ...rest } = entry;
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
    if (!live.length && batch.status !== 'held_reconcile_first' && nowMs >= sendMs - queueLeadMinutes * 60000) alerts.push({ kind: 'not_queued', timezone: batch.timezone, reason: `Due ${batch.sendAt} and not on record as queued` });
    if (batch.status === 'held_reconcile_first' && nowMs >= sendMs - queueLeadMinutes * 60000 && !live.length) alerts.push({ kind: 'held_unreconciled', timezone: batch.timezone, reason: batch.reason });
    if (live.length && live.every(e => e.state === 'queued') && nowMs >= sendMs + receiptGraceMinutes * 60000) alerts.push({ kind: 'no_dispatch_receipt', timezone: batch.timezone, reason: `Sent time ${batch.sendAt} has passed with no dispatch receipt` });
  }
  return { ok: alerts.length === 0, checkedAt: new Date(nowMs).toISOString(), alerts };
}

// Tonight in Bangkok: durable publisher ledger. NOT BOUND, NOT MIGRATED.
//
// A SQLite-backed Durable Object class, one object per edition (one Bangkok
// date) in a "review" or "live" namespace. It is not exported from worker.mjs
// and has no binding or migration in wrangler.jsonc: nothing deployed can
// reach it. The steps to bind it are in premium/README.md and are Scout's.
//
// What it keeps, and why:
//   claims        One row per delivery key and generation: the cohort's zone,
//                 send instant, body version and intended audience. Writing it
//                 is the atomic claim that lets one worker, and only one, go
//                 to the provider.
//   reservations  One row per member, and per subscriber, for the edition. A
//                 member reserved under one cohort cannot be claimed under
//                 another, whatever zone they have since chosen.
//   entries       The append-only record: intent, queue, dispatch, bounce,
//                 failure, cancellation, with the provider's job id, group id
//                 and stage. Nothing here is ever changed or removed, so an
//                 intent of unknown outcome stays for reconciliation.
//   payloads      The frozen email body under its content hash. Stored once;
//                 a different body under the same version is refused.
//
// Every operation is one synchronous storage transaction. A Durable Object
// runs one at a time, so two overlapping claims cannot both succeed, and a
// failure inside an operation leaves nothing half-written.
//
// There is no delete, no update and no reset. That is deliberate.

const HEX = /^[0-9a-f]{64}$/, MEMBER = /^user_[\w-]+$/, SUBSCRIBER = /^\d+$/, DATE = /^\d{4}-\d{2}-\d{2}$/, PROVIDER_ID = /^[\w-]{1,64}$/;
export const LEDGER_STATES = Object.freeze(['queued', 'dispatched', 'delivered', 'bounced', 'failed', 'unknown', 'cancelled']);
const STATES = new Set(LEDGER_STATES);
const AFTER_DISPATCH = new Set(['dispatched', 'delivered', 'bounced']);
const ENTRY_FIELDS = new Set(['editionKey', 'deliveryKey', 'bangkokDate', 'timezone', 'memberId', 'subscriberId', 'sendAt', 'payloadVersion', 'state', 'at',
  'providerJobId', 'providerGroupId', 'providerStage', 'note', 'withdrawnReason', 'generation', 'seq', 'recordedAt']);
/** The one stage that frees a cancelled cohort's key: the draft was removed and the removal read back. */
export const REMOVED_VERIFIED = 'draft_removed_verified';

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const isIso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function checkEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw fail(400, 'Invalid ledger entry', 'invalid_entry');
  for (const key of Object.keys(entry)) if (!ENTRY_FIELDS.has(key)) throw fail(400, `Unknown ledger entry field: ${key}`, 'invalid_entry');
  if (!HEX.test(entry.editionKey || '') || !HEX.test(entry.deliveryKey || '') || !HEX.test(entry.payloadVersion || '') || !DATE.test(entry.bangkokDate || '')
    || !MEMBER.test(entry.memberId || '') || !SUBSCRIBER.test(entry.subscriberId || '') || !STATES.has(entry.state) || !isIso(entry.sendAt) || !isIso(entry.at)
    || typeof entry.timezone !== 'string' || !entry.timezone || entry.timezone.length > 80) throw fail(400, 'Invalid ledger entry', 'invalid_entry');
  for (const key of ['providerJobId', 'providerGroupId']) if (entry[key] != null && !PROVIDER_ID.test(entry[key])) throw fail(400, 'Invalid provider id', 'invalid_entry');
  if (entry.generation != null && (!Number.isInteger(entry.generation) || entry.generation < 1)) throw fail(400, 'Invalid generation', 'invalid_entry');
  for (const key of ['providerStage', 'note', 'withdrawnReason']) if (entry[key] != null && (typeof entry[key] !== 'string' || entry[key].length > 300)) throw fail(400, 'Invalid ledger note', 'invalid_entry');
}

const fromRow = row => {
  const entry = { seq: row.seq, editionKey: row.edition_key, deliveryKey: row.delivery_key, bangkokDate: row.bangkok_date, timezone: row.timezone, memberId: row.member_id,
    subscriberId: row.subscriber_id, sendAt: row.send_at, payloadVersion: row.payload_version, state: row.state, at: row.at, generation: row.generation, recordedAt: row.recorded_at };
  for (const [field, column] of [['providerJobId', 'provider_job_id'], ['providerGroupId', 'provider_group_id'], ['providerStage', 'provider_stage'], ['note', 'note'], ['withdrawnReason', 'withdrawn_reason']]) if (row[column] != null) entry[field] = row[column];
  return entry;
};

async function contentHash(html, text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html + '\n' + text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export class DeliveryLedger {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.sql = ctx.storage.sql;
    // One statement per call. CREATE ... IF NOT EXISTS makes a restart harmless.
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS claims (delivery_key TEXT NOT NULL, generation INTEGER NOT NULL, timezone TEXT NOT NULL, send_at TEXT NOT NULL, payload_version TEXT NOT NULL, audience TEXT NOT NULL, claimed_at TEXT NOT NULL, PRIMARY KEY (delivery_key, generation))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS reservations (member_id TEXT PRIMARY KEY, subscriber_id TEXT NOT NULL UNIQUE, delivery_key TEXT NOT NULL, reserved_at TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, edition_key TEXT NOT NULL, delivery_key TEXT NOT NULL, bangkok_date TEXT NOT NULL, timezone TEXT NOT NULL, member_id TEXT NOT NULL, subscriber_id TEXT NOT NULL, send_at TEXT NOT NULL, payload_version TEXT NOT NULL, state TEXT NOT NULL, at TEXT NOT NULL, generation INTEGER NOT NULL, provider_job_id TEXT, provider_group_id TEXT, provider_stage TEXT, note TEXT, withdrawn_reason TEXT, recorded_at TEXT NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS entries_by_key ON entries (delivery_key, member_id, seq)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS payloads (version TEXT PRIMARY KEY, ref TEXT NOT NULL, body TEXT NOT NULL, stored_at TEXT NOT NULL)');
  }

  async fetch(request) {
    const json = (value, status = 200) => Response.json(value, { status });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let input;
    try { input = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    const operation = { '/list': this.#list, '/put': this.#put, '/put-all': this.#putAll, '/claim': this.#claim, '/reclaim': this.#reclaim, '/payload/put': this.#payloadPut, '/payload/get': this.#payloadGet, '/reconciliation': this.#reconciliation }[new URL(request.url).pathname];
    if (!operation) return json({ error: 'Not found' }, 404);
    try {
      if (!input || typeof input !== 'object' || !HEX.test(input.editionKey || '')) throw fail(400, 'An edition key is required', 'invalid_edition');
      // The only asynchronous work, done before the transaction opens: the body must hash to its version.
      if (operation === this.#payloadPut) {
        const p = input.payload;
        if (!HEX.test(input.version || '') || typeof input.ref !== 'string' || !input.ref || input.ref.length > 300 || !p || typeof p.subject !== 'string' || !p.subject || typeof p.html !== 'string' || !p.html || typeof p.text !== 'string' || !p.text || (p.preheader != null && typeof p.preheader !== 'string')) throw fail(400, 'Invalid payload', 'invalid_payload');
        if (p.html.length + p.text.length > 500000) throw fail(413, 'Payload too large', 'invalid_payload');
        if (await contentHash(p.html, p.text) !== input.version) throw fail(409, 'The body does not hash to its version', 'payload_hash_mismatch');
      }
      return json(this.storage.transactionSync(() => operation.call(this, input)));
    } catch (error) {
      if (error?.status) return json({ error: error.message, code: error.code ?? null }, error.status);
      throw error;
    }
  }

  #rows(query, ...bindings) { return this.sql.exec(query, ...bindings).toArray(); }

  /** One object, one edition. The first write fixes it; anything else is refused. */
  #bind(name, value, write) {
    const row = this.#rows('SELECT v FROM meta WHERE k = ?', name)[0];
    if (row && row.v !== value) throw fail(409, `This ledger belongs to another ${name === 'edition' ? 'edition' : 'Bangkok date'}`, 'wrong_edition');
    if (!row && write) this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?)', name, value);
    return Boolean(row);
  }

  /** The latest entry for each member under a delivery key. */
  #current(deliveryKey) {
    return this.#rows('SELECT e.* FROM entries e JOIN (SELECT member_id, MAX(seq) AS seq FROM entries WHERE delivery_key = ? GROUP BY member_id) latest ON e.seq = latest.seq ORDER BY e.seq', deliveryKey);
  }

  #latestClaim(deliveryKey) { return this.#rows('SELECT * FROM claims WHERE delivery_key = ? ORDER BY generation DESC LIMIT 1', deliveryKey)[0] ?? null; }

  #append(entry, generation, recordedAt) {
    this.sql.exec('INSERT INTO entries (edition_key, delivery_key, bangkok_date, timezone, member_id, subscriber_id, send_at, payload_version, state, at, generation, provider_job_id, provider_group_id, provider_stage, note, withdrawn_reason, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      entry.editionKey, entry.deliveryKey, entry.bangkokDate, entry.timezone, entry.memberId, entry.subscriberId, entry.sendAt, entry.payloadVersion, entry.state, entry.at, generation,
      entry.providerJobId ?? null, entry.providerGroupId ?? null, entry.providerStage ?? null, entry.note ?? null, entry.withdrawnReason ?? null, recordedAt);
  }

  #list(input) {
    this.#bind('edition', input.editionKey, false);
    return { entries: this.#rows('SELECT * FROM entries ORDER BY seq').map(fromRow) };
  }

  /**
   * Record a later state for a member a claim already covers. An entry for a
   * member or cohort that was never claimed is refused: `put` cannot be used
   * to get round the claim.
   */
  #put(input) {
    this.#putOne(input.editionKey, input.entry);
    return { recorded: true };
  }

  /**
   * Record a later state for several members at once, as one step. Either every
   * entry is written or none is: the transaction around the operation rolls the
   * whole lot back on the first refusal. A cohort's cancellation goes through
   * here, so an interruption can never leave some members cancelled and the
   * rest still queued, which no later run could tell from a real disagreement.
   */
  #putAll(input) {
    const entries = input.entries;
    if (!Array.isArray(entries) || !entries.length || entries.length > 5000) throw fail(400, 'A batch of ledger entries is required', 'invalid_entry');
    for (const entry of entries) this.#putOne(input.editionKey, entry);
    return { recorded: entries.length };
  }

  #putOne(editionKey, entry) {
    checkEntry(entry);
    const input = { editionKey };
    if (entry.editionKey !== input.editionKey) throw fail(400, 'The entry belongs to another edition', 'wrong_edition');
    if (!this.#bind('edition', input.editionKey, false)) throw fail(409, 'No claim covers this member and delivery key', 'not_claimed');
    const reservation = this.#rows('SELECT * FROM reservations WHERE member_id = ?', entry.memberId)[0];
    if (!reservation || reservation.delivery_key !== entry.deliveryKey || reservation.subscriber_id !== entry.subscriberId) throw fail(409, 'No claim covers this member and delivery key', 'not_claimed');
    const current = this.#rows('SELECT * FROM entries WHERE delivery_key = ? AND member_id = ? ORDER BY seq DESC LIMIT 1', entry.deliveryKey, entry.memberId)[0];
    if (!current) throw fail(409, 'No claim covers this member and delivery key', 'not_claimed');
    if (current.timezone !== entry.timezone || current.send_at !== entry.sendAt || current.payload_version !== entry.payloadVersion || current.bangkok_date !== entry.bangkokDate) throw fail(409, 'The entry does not match the cohort on record', 'claim_mismatch');
    // A worker that read this member before a reclaim is writing about a job that no longer stands.
    if (entry.generation != null && entry.generation !== current.generation) throw fail(409, 'The entry was read before this cohort was reclaimed', 'stale_generation');
    // A cancelled member is brought back only by a reclaim. What has been dispatched is never un-sent.
    if (current.state === 'cancelled' && entry.state !== 'cancelled') throw fail(409, 'A cancelled member returns only through a reclaim', 'cancelled');
    if (AFTER_DISPATCH.has(current.state) && !AFTER_DISPATCH.has(entry.state)) throw fail(409, 'A dispatched member cannot go back to an earlier state', 'after_dispatch');
    this.#append(entry, current.generation, new Date().toISOString());
  }

  #checkCohort(input) {
    const { deliveryKey, entries } = input;
    if (!HEX.test(deliveryKey || '') || !Array.isArray(entries) || !entries.length || entries.length > 5000) throw fail(400, 'A claim needs a delivery key and its members', 'invalid_claim');
    entries.forEach(checkEntry);
    const first = entries[0];
    if (entries.some(e => e.editionKey !== input.editionKey || e.deliveryKey !== deliveryKey || e.timezone !== first.timezone || e.sendAt !== first.sendAt || e.payloadVersion !== first.payloadVersion || e.bangkokDate !== first.bangkokDate))
      throw fail(400, 'A claim is one cohort: one edition, key, zone, instant and body', 'invalid_claim');
    if (new Set(entries.map(e => e.memberId)).size !== entries.length || new Set(entries.map(e => e.subscriberId)).size !== entries.length) throw fail(400, 'A member or subscriber appears twice in the claim', 'invalid_claim');
    // A claim records an intent, or adopts a job the provider already holds. Nothing else.
    if (entries.some(e => e.state !== 'unknown' && e.state !== 'queued')) throw fail(400, 'A claim records an intent or an adopted job', 'invalid_claim');
    return first;
  }

  #write(input, first, generation) {
    const now = new Date().toISOString();
    this.sql.exec('INSERT INTO claims (delivery_key, generation, timezone, send_at, payload_version, audience, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      input.deliveryKey, generation, first.timezone, first.sendAt, first.payloadVersion, JSON.stringify(input.entries.map(e => e.subscriberId).sort()), now);
    for (const entry of input.entries) {
      this.sql.exec('INSERT OR IGNORE INTO reservations (member_id, subscriber_id, delivery_key, reserved_at) VALUES (?, ?, ?, ?)', entry.memberId, entry.subscriberId, input.deliveryKey, now);
      this.#append(entry, generation, now);
    }
    return { claimed: true, generation };
  }

  /**
   * The atomic claim. It succeeds only if the delivery key has never been
   * claimed, the body is on record, and no member or subscriber is reserved
   * under another cohort of this edition. On success the claim, the
   * reservations and the intent are written together.
   */
  #claim(input) {
    const first = this.#checkCohort(input);
    this.#bind('edition', input.editionKey, true);
    this.#bind('bangkokDate', first.bangkokDate, true);
    if (this.#latestClaim(input.deliveryKey) || this.#rows('SELECT 1 AS x FROM entries WHERE delivery_key = ? LIMIT 1', input.deliveryKey).length) return { claimed: false, reason: 'delivery_key_on_record' };
    if (!this.#rows('SELECT 1 AS x FROM payloads WHERE version = ?', first.payloadVersion).length) return { claimed: false, reason: 'payload_missing' };
    const taken = input.entries.filter(e => this.#rows('SELECT 1 AS x FROM reservations WHERE member_id = ? OR subscriber_id = ?', e.memberId, e.subscriberId).length);
    if (taken.length) return { claimed: false, reason: 'member_reserved', members: taken.map(e => e.memberId) };
    return this.#write(input, first, 1);
  }

  /**
   * Claim a cohort again after its job was cancelled. Allowed only when every
   * member's latest entry is `cancelled` at the stage that says the draft was
   * removed and the removal read back, and only for members of the cohort as
   * it was: a replacement is the old audience less whoever was withdrawn,
   * never anyone new. Same zone, instant and body.
   */
  #reclaim(input) {
    const first = this.#checkCohort(input);
    if (!this.#bind('edition', input.editionKey, false)) return { claimed: false, reason: 'nothing_to_replace' };
    this.#bind('bangkokDate', first.bangkokDate, false);
    const claim = this.#latestClaim(input.deliveryKey), current = this.#current(input.deliveryKey);
    if (!claim || !current.length) return { claimed: false, reason: 'nothing_to_replace' };
    if (current.some(row => row.state !== 'cancelled' || row.provider_stage !== REMOVED_VERIFIED)) return { claimed: false, reason: 'not_cancelled_and_removed' };
    if (claim.timezone !== first.timezone || claim.send_at !== first.sendAt || claim.payload_version !== first.payloadVersion) return { claimed: false, reason: 'cohort_changed' };
    if (input.entries.some(e => e.state !== 'unknown')) throw fail(400, 'A reclaim records an intent', 'invalid_claim');
    const before = new Map(current.map(row => [row.member_id, row]));
    const strangers = input.entries.filter(e => before.get(e.memberId)?.subscriber_id !== e.subscriberId || before.get(e.memberId).withdrawn_reason != null);
    if (strangers.length) return { claimed: false, reason: 'not_from_this_cohort', members: strangers.map(e => e.memberId) };
    return this.#write(input, first, claim.generation + 1);
  }

  /** Store a frozen body once. The same body again is fine; a different one under the same version is refused. */
  #payloadPut(input) {
    this.#bind('edition', input.editionKey, true);
    const body = JSON.stringify({ subject: input.payload.subject, preheader: input.payload.preheader ?? '', html: input.payload.html, text: input.payload.text });
    const existing = this.#rows('SELECT ref, body FROM payloads WHERE version = ?', input.version)[0];
    if (existing) {
      if (existing.body !== body || existing.ref !== input.ref) throw fail(409, 'A different payload is already on record under this version', 'payload_conflict');
      return { stored: false, already: true };
    }
    this.sql.exec('INSERT INTO payloads (version, ref, body, stored_at) VALUES (?, ?, ?, ?)', input.version, input.ref, body, new Date().toISOString());
    return { stored: true };
  }

  #payloadGet(input) {
    this.#bind('edition', input.editionKey, false);
    if (!HEX.test(input.version || '')) throw fail(400, 'Invalid payload version', 'invalid_payload');
    const row = this.#rows('SELECT ref, body FROM payloads WHERE version = ?', input.version)[0];
    return row ? { found: true, version: input.version, ref: row.ref, payload: JSON.parse(row.body) } : { found: false };
  }

  /** Everything a person needs to reconcile the edition against the provider. Read-only. */
  #reconciliation(input) {
    this.#bind('edition', input.editionKey, false);
    const cohorts = this.#rows('SELECT DISTINCT delivery_key FROM claims ORDER BY delivery_key').map(({ delivery_key: deliveryKey }) => {
      const claim = this.#latestClaim(deliveryKey), current = this.#current(deliveryKey).map(fromRow);
      const states = {};
      for (const entry of current) states[entry.state] = (states[entry.state] || 0) + 1;
      const pick = e => ({ memberId: e.memberId, subscriberId: e.subscriberId, state: e.state, at: e.at, generation: e.generation, ...(e.providerJobId ? { providerJobId: e.providerJobId } : {}), ...(e.providerGroupId ? { providerGroupId: e.providerGroupId } : {}), ...(e.providerStage ? { providerStage: e.providerStage } : {}), ...(e.note ? { note: e.note } : {}) });
      return { deliveryKey, timezone: claim.timezone, sendAt: claim.send_at, payloadVersion: claim.payload_version, generation: claim.generation, intendedSubscriberIds: JSON.parse(claim.audience), states,
        unresolved: current.filter(e => e.state === 'unknown').map(pick),
        // Every provider object any entry ever named, including ones from attempts that failed.
        providerObjects: this.#rows('SELECT provider_job_id, provider_group_id, provider_stage, generation, MAX(seq) AS seq FROM entries WHERE delivery_key = ? AND (provider_job_id IS NOT NULL OR provider_group_id IS NOT NULL) GROUP BY provider_job_id, provider_group_id, provider_stage, generation ORDER BY seq', deliveryKey)
          .map(row => ({ providerJobId: row.provider_job_id, providerGroupId: row.provider_group_id, providerStage: row.provider_stage, generation: row.generation })) };
    });
    return { editionKey: input.editionKey, bangkokDate: this.#rows('SELECT v FROM meta WHERE k = ?', 'bangkokDate')[0]?.v ?? null, cohorts,
      reservations: this.#rows('SELECT COUNT(*) AS n FROM reservations')[0].n, entries: this.#rows('SELECT COUNT(*) AS n FROM entries')[0].n };
  }
}

/**
 * The ledger port over one edition's object. `scope` must be given as
 * 'review' or 'live': there is no default, so nothing reaches live storage by
 * omission. `claim` and `reclaim` return true only when the claim was written
 * and false when another worker holds the key; any other refusal is thrown
 * with a `code`, because it is a fault to look at, not a race to lose quietly.
 */
export function durableLedger(env, { scope, editionKey }) {
  if (!env?.DELIVERY_LEDGER) throw new Error('Delivery ledger storage is not configured');
  if (scope !== 'review' && scope !== 'live') throw new Error("A ledger scope of 'review' or 'live' is required");
  if (!HEX.test(editionKey || '')) throw new Error('An edition key is required');
  const stub = env.DELIVERY_LEDGER.get(env.DELIVERY_LEDGER.idFromName(`${scope}-tonight-ledger-v1-${editionKey}`));
  const call = async (path, body = {}) => {
    const response = await stub.fetch(new Request('https://ledger.internal' + path, { method: 'POST', body: JSON.stringify({ ...body, editionKey }), headers: { 'Content-Type': 'application/json' } }));
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result?.error || 'The ledger refused the request'), { status: response.status, code: result?.code ?? 'ledger_error' });
    return result;
  };
  const sameEdition = key => { if (key !== editionKey) throw Object.assign(new Error('This ledger belongs to another edition'), { code: 'wrong_edition' }); };
  const claimWith = path => async (deliveryKey, entries) => {
    const result = await call(path, { deliveryKey, entries });
    if (result.claimed === true) return true;
    // Lost to another worker, or (for a reclaim) not yet in a state that allows it: not this worker's to take.
    if (result.reason === 'delivery_key_on_record' || result.reason === 'not_cancelled_and_removed' || result.reason === 'nothing_to_replace') return false;
    throw Object.assign(new Error(`The ledger refused the claim: ${result.reason}`), { code: result.reason, members: result.members ?? [] });
  };
  return {
    scope, editionKey,
    async list(key) { sameEdition(key); return (await call('/list')).entries; },
    async put(entry) { sameEdition(entry?.editionKey); await call('/put', { entry }); },
    // One step for the whole batch: nothing is written unless all of it is.
    async putAll(entries) { if (!Array.isArray(entries) || !entries.length) throw new Error('A batch of ledger entries is required'); for (const entry of entries) sameEdition(entry?.editionKey); await call('/put-all', { entries }); },
    claim: claimWith('/claim'),
    reclaim: claimWith('/reclaim'),
    async putPayload({ editionKey: key, version, ref, payload }) { sameEdition(key); return call('/payload/put', { version, ref, payload }); },
    async getPayload(version) { const result = await call('/payload/get', { version }); return result.found ? result.payload : null; },
    async reconciliation() { return call('/reconciliation'); },
  };
}

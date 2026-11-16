// Tonight in Bangkok: MailerLite adapter for the provider port. NOT WIRED.
//
// This module holds no credential and makes no network call of its own. Every
// request goes through an injected `http(method, path, body)` that returns
// { status, json }. Until integration review, the only `http` that exists is
// the mock in tonight-mailerlite.test.mjs.
//
// How a cohort becomes a MailerLite job (shapes from developers.mailerlite.com,
// and one owner-only live send on 16 November 2026):
//   1. One group per cohort, filled with exactly the cohort's subscribers and
//      read back before anything is created to send.
//   2. One regular campaign addressed to that group only. Its name carries the
//      delivery key, the payload version and a digest of the intended
//      audience, because MailerLite offers no idempotency key and its list
//      filter matches subjects, not names.
//   3. Scheduled to the minute in UTC, then read back.
// MailerLite appends its own footer with the account's postal address, so the
// plan for this provider is prepared with `postalAddressByProvider: true`.
//
// Rules from Scout's review of 16 November:
//   - Responses must have the documented shape: a record or list inside
//     `data`, numeric ids, and the documented paging metadata. Anything else
//     is "no clear answer", never a guess. 204 is accepted only for a delete.
//   - A report page that fails makes the whole report fail. A failed bounce
//     query is never read as "no bounces", and "sent, not known to have
//     bounced" is never called delivered.
//   - A draft is not a queued job. Every staged id (group, campaign) travels
//     on the error so it can be recorded for reconciliation. Cleanup is
//     explicit and is believed only after a readback.
//   - The intended audience is fixed in the campaign name at creation and
//     kept in the caller's ledger. The provider group is mutable and is only
//     ever compared against that record.
//   - After a job is queued, an eligibility change is handled by cancelling
//     the job and reading it back as a draft. Group membership is not edited
//     to change a queued campaign: that it would take effect is unproven.
//   - No plain-text body is transmitted: the documented create body has no
//     such field, and MailerLite sends its stock fallback.

import { createHash } from 'node:crypto';

const KEY = /^[0-9a-f]{64}$/;
const ID = /^\d+$/;
const NAME = /^TiB (\d{4}-\d{2}-\d{2}) (\S+) k=([0-9a-f]{64}) p=([0-9a-f]{64}) a=([0-9a-f]{16})$/;

/** Digest of an intended audience: order-free, fixed at creation. */
export const audienceDigest = subscriberIds => createHash('sha256').update([...subscriberIds].map(String).sort().join('\n')).digest('hex').slice(0, 16);

/** The campaign name is the job's identity at the provider. At most 255 characters. */
export function campaignName({ bangkokDate, timezone, key, payloadVersion, subscriberIds }) {
  const name = `TiB ${bangkokDate} ${timezone} k=${key} p=${payloadVersion} a=${audienceDigest(subscriberIds || [])}`;
  if (!NAME.test(name) || name.length > 255) throw new Error('Cannot name this delivery');
  return name;
}
export function parseCampaignName(name) {
  const m = NAME.exec(name || '');
  return m ? { bangkokDate: m[1], timezone: m[2], key: m[3], payloadVersion: m[4], audience: m[5] } : null;
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
const toIso = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? new Date(value.replace(' ', 'T') + 'Z').toISOString() : null);
const idOf = value => (typeof value === 'string' || typeof value === 'number') && ID.test(String(value)) ? String(value) : null;

/** A refusal: the provider understood and declined, and nothing that can send was left behind. */
const refused = (message, staged = {}, extra = {}) => Object.assign(new Error(message), { definite: true, staged, ...extra });
/** No clear answer: something may exist. `staged` says what is known to. */
const unclear = (message, staged = {}, extra = {}) => Object.assign(new Error(message), { definite: false, staged, ...extra });

export function createMailerLiteProvider({ http, sender, utcTimezoneId, lookbackDays = 3, maxPages = 20 }) {
  if (typeof http !== 'function') throw new Error('An http function is required');
  if (!sender?.from || !sender.fromName) throw new Error('A verified sender is required');
  if (!Number.isInteger(utcTimezoneId)) throw new Error('The provider’s UTC time zone id is required');

  // One place decides what a response means.
  //   record: 2xx with { data: { id } }.   list: 2xx with { data: [...] }.   empty: 204, or 2xx with no body.
  //   4xx other than 408 and 429 is a refusal. Everything else is unclear, including a 2xx of the wrong shape.
  async function call(method, path, body, expect) {
    let response;
    try { response = await http(method, path, body); } catch { throw unclear(`MailerLite did not answer ${method} ${path.split('?')[0]}`); }
    const status = response?.status, where = `${method} ${path.split('?')[0]}`;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) throw refused(`MailerLite refused ${where} (${status})`, {}, { status });
    if (!(status >= 200 && status < 300)) throw unclear(`MailerLite gave no clear answer to ${where}`);
    const json = response.json;
    if (expect === 'empty') { if (status === 204 || json == null || typeof json === 'object') return null; throw unclear(`Unexpected body from ${where}`); }
    if (status === 204 || !json || typeof json !== 'object' || !('data' in json)) throw unclear(`${where} answered without the documented data envelope`);
    if (expect === 'record') { if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data) || !idOf(json.data.id)) throw unclear(`${where} returned no valid record id`); return json.data; }
    if (expect === 'list') { if (!Array.isArray(json.data)) throw unclear(`${where} returned no list`); return json; }
    throw new Error('Unknown response expectation');
  }

  /** Active members of a group, paged by the documented cursor. Every row must carry a numeric id. */
  async function groupMembers(groupId) {
    const ids = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page++) {
      const json = await call('GET', `/api/groups/${groupId}/subscribers?filter[status]=active&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, 'list');
      if (!json.meta || typeof json.meta !== 'object' || !('next_cursor' in json.meta)) throw unclear('The group listing came without paging information');
      for (const row of json.data) { const id = idOf(row?.id); if (!id) throw unclear('A group member came without an id'); ids.push(id); }
      cursor = json.meta.next_cursor;
      if (cursor === null) return ids;
      if (typeof cursor !== 'string' || !cursor) throw unclear('The group listing came with unusable paging information');
    }
    throw unclear('The group has more members than this adapter will read');
  }

  /** Every page of a page-numbered listing, or an error. Never a partial list. */
  async function pages(pathFor) {
    const rows = [];
    for (let page = 1; page <= maxPages; page++) {
      const json = await call('GET', pathFor(page), undefined, 'list');
      const meta = json.meta;
      if (!meta || !Number.isInteger(meta.current_page) || !Number.isInteger(meta.last_page) || meta.current_page !== page) throw unclear('A listing came without the documented page information');
      rows.push(...json.data);
      if (page >= meta.last_page) return rows;
    }
    throw unclear('A listing has more pages than this adapter will read');
  }

  const groupIdsOf = campaign => (Array.isArray(campaign.filter) ? campaign.filter : []).flat().filter(rule => rule?.operator === 'in_any' && rule.args?.[0] === 'groups').flatMap(rule => rule.args[1] || []).map(idOf).filter(Boolean);

  async function toJob(campaign) {
    const id = idOf(campaign?.id);
    if (!id) throw unclear('A campaign came without an id');
    const named = parseCampaignName(campaign.name);
    const groups = groupIdsOf(campaign);
    // The audience reported is whoever is in the campaign's one group now. It is
    // compared with the digest fixed in the name; it never replaces that record.
    const subscriberIds = groups.length === 1 ? await groupMembers(groups[0]) : [];
    const status = campaign.status;
    const state = status === 'sent' && toIso(campaign.finished_at) ? 'sent' : status === 'sent' ? 'sending' : status === 'ready' ? 'scheduled' : status === 'draft' ? 'draft' : 'unknown';
    return { id, key: named?.key ?? null, payloadVersion: named?.payloadVersion ?? null, bangkokDate: named?.bangkokDate ?? null, timezone: named?.timezone ?? null,
      sendAt: toIso(campaign.scheduled_for), subscriberIds, groupId: groups.length === 1 ? groups[0] : null, state, providerStatus: typeof status === 'string' ? status : null,
      intendedAudience: named?.audience ?? null, audienceMatchesIntent: Boolean(named) && groups.length === 1 && audienceDigest(subscriberIds) === named.audience,
      finishedAt: toIso(campaign.finished_at), recipients: Number.isInteger(campaign.recipients_count) ? campaign.recipients_count : null };
  }

  async function findCampaigns(key) {
    const found = [];
    const from = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
    for (const status of ['ready', 'sent', 'draft']) {
      const rows = await pages(page => `/api/campaigns?filter[status]=${status}&filter[type]=regular&filter[date_from]=${from}&limit=100&page=${page}`);
      for (const row of rows) if (parseCampaignName(row?.name)?.key === key) found.push(row);
    }
    return found;
  }

  /** A draft is gone only when a read says so. */
  async function removeDraftVerified(campaignId) {
    const current = await toJob(await call('GET', `/api/campaigns/${campaignId}`, undefined, 'record'));
    if (current.state !== 'draft') throw unclear(`Campaign ${campaignId} is ${current.state}, not a draft; it was not removed`, { campaignId, groupId: current.groupId });
    await call('DELETE', `/api/campaigns/${campaignId}`, undefined, 'empty');
    let gone = false;
    try { await call('GET', `/api/campaigns/${campaignId}`, undefined, 'record'); } catch (error) { gone = error.definite === true && error.status === 404; }
    if (!gone) throw unclear(`Campaign ${campaignId} could not be confirmed removed`, { campaignId, groupId: current.groupId });
    return { removed: true, campaignId, groupId: current.groupId };
  }

  return {
    /** The job for a delivery key, or null. Looked up by campaign name across draft, ready and sent. */
    async findJob(key) {
      if (!KEY.test(key || '')) throw new Error('Invalid delivery key');
      const found = await findCampaigns(key);
      if (!found.length) return null;
      // Two campaigns under one key must never be adopted: report a conflict the publisher will hold.
      if (found.length > 1) return { id: idOf(found[0].id), key, state: 'conflict', sendAt: null, subscriberIds: [], payloadVersion: null, duplicateIds: found.map(c => idOf(c.id)) };
      return toJob(found[0]);
    },

    /**
     * Group, campaign, schedule, readback. Every error carries `staged`: the ids
     * known to exist at the provider and the stage reached, for the ledger.
     * `definite === true` means refused with nothing that can send left behind.
     */
    async scheduleJob(request) {
      const { key, sendAt, subscriberIds, subject, html, payloadVersion, bangkokDate, timezone } = request || {};
      const at = new Date(sendAt);
      if (!KEY.test(key || '') || !KEY.test(payloadVersion || '') || !Array.isArray(subscriberIds) || !subscriberIds.length || subscriberIds.some(id => !ID.test(id)) || new Set(subscriberIds).size !== subscriberIds.length || !subject || !html) throw refused('Incomplete delivery request', { stage: 'none' });
      if (!Number.isFinite(+at) || at.getUTCSeconds() !== 0 || at.getUTCMilliseconds() !== 0) throw refused('MailerLite schedules to the minute; the send instant must be a whole minute', { stage: 'none' });
      const name = campaignName({ bangkokDate, timezone, key, payloadVersion, subscriberIds });
      const staged = { stage: 'none', groupId: null, campaignId: null };

      // 1. The cohort's own group, filled and read back. A group cannot send, so a
      //    failure here is a refusal whatever its cause; the group id is kept for cleanup.
      try {
        staged.groupId = idOf((await call('POST', '/api/groups', { name: `TiB ${bangkokDate} ${timezone} k=${key.slice(0, 16)}` }, 'record')).id);
        staged.stage = 'group';
        for (const id of subscriberIds) await call('POST', `/api/subscribers/${id}/groups/${staged.groupId}`, undefined, 'record');
        const members = await groupMembers(staged.groupId);
        if (!sameSet(members, subscriberIds)) throw refused('The group does not hold exactly the intended audience', {}, { expected: subscriberIds.length, found: members.length });
        staged.stage = 'group_verified';
      } catch (error) { throw refused(error.message, { ...staged }, { status: error.status, expected: error.expected, found: error.found }); }

      // 2. The campaign, as a draft. A refusal creates none. No clear answer means one may exist.
      let campaignId;
      try { campaignId = idOf((await call('POST', '/api/campaigns', { name, type: 'regular', groups: [staged.groupId],
        emails: [{ subject, from_name: sender.fromName, from: sender.from, ...(sender.replyTo ? { reply_to: sender.replyTo } : {}), content: html }] }, 'record')).id); }
      catch (error) { throw Object.assign(error.definite === true ? refused(error.message, { ...staged }, { status: error.status }) : unclear(error.message, { ...staged, stage: 'campaign_unknown' })); }
      staged.campaignId = campaignId; staged.stage = 'draft';

      // 3. The schedule, in UTC. A refused schedule leaves a draft. A draft is not
      //    queued; it is removed explicitly and the removal is read back.
      const p = n => String(n).padStart(2, '0');
      try {
        await call('POST', `/api/campaigns/${campaignId}/schedule`, { delivery: 'scheduled', schedule: { date: `${at.getUTCFullYear()}-${p(at.getUTCMonth() + 1)}-${p(at.getUTCDate())}`, hours: p(at.getUTCHours()), minutes: p(at.getUTCMinutes()), timezone_id: utcTimezoneId } }, 'record');
      } catch (error) {
        if (error.definite !== true) throw unclear(error.message, { ...staged, stage: 'schedule_unknown' });
        try { await removeDraftVerified(campaignId); }
        catch { throw unclear('MailerLite refused the schedule and the draft could not be confirmed removed', { ...staged, stage: 'draft_lingering' }); }
        throw refused('MailerLite refused the schedule; the draft was removed and its removal read back', { ...staged, campaignId: null, removedCampaignId: campaignId, stage: 'draft_removed_verified' }, { status: error.status });
      }
      staged.stage = 'scheduled';

      // 4. Read the job back. The publisher compares it with what was asked for.
      try { return await toJob(await call('GET', `/api/campaigns/${campaignId}`, undefined, 'record')); }
      catch (error) { throw unclear(`Scheduled, but the readback failed: ${error.message}`, { ...staged, stage: 'scheduled_unread' }); }
    },

    /**
     * Dispatch is read from status and finished_at. Per recipient, the provider
     * reports who the campaign was sent to and who bounced. That is all it is
     * taken to mean: nothing here is called delivered.
     */
    async getJob(jobId) {
      const campaign = await call('GET', `/api/campaigns/${jobId}`, undefined, 'record');
      const job = await toJob(campaign);
      if (job.state !== 'sent') return job;
      const report = async type => (await pages(page => `/api/campaigns/${jobId}/reports/subscriber-activity?filter[type]=${type}&limit=100&page=${page}&include=subscriber`))
        .map(row => { const id = idOf(row?.subscriber?.id); if (!id) throw unclear('A report row came without a subscriber id'); return id; });
      const sentSubscriberIds = await report('sent');
      const bouncedSubscriberIds = [...new Set([...await report('hardbounced'), ...await report('softbounced')])];
      const stats = campaign.stats && typeof campaign.stats === 'object' ? campaign.stats : null;
      return { ...job, sentSubscriberIds, bouncedSubscriberIds,
        aggregate: stats ? { sent: stats.sent ?? null, deliveries: stats.deliveries_count ?? null, hardBounces: stats.hard_bounces_count ?? null, softBounces: stats.soft_bounces_count ?? null } : null };
    },

    /**
     * Stop a queued job because its audience is no longer right. The job is
     * cancelled and read back; it counts as stopped only if the readback shows
     * a draft with no schedule. Too late, refused or unclear all return
     * `hold: true`: a person looks before anything else is sent to that cohort.
     */
    async cancelJob(jobId) {
      let before;
      try { before = await toJob(await call('GET', `/api/campaigns/${jobId}`, undefined, 'record')); }
      catch (error) { return { cancelled: false, hold: true, reason: `The job could not be read: ${error.message}` }; }
      if (before.state === 'draft') return { cancelled: true, hold: false, alreadyDraft: true, groupId: before.groupId };
      if (before.state !== 'scheduled') return { cancelled: false, hold: true, reason: `Too late to cancel: the job is ${before.state}`, groupId: before.groupId };
      try { await call('POST', `/api/campaigns/${jobId}/cancel`, undefined, 'record'); }
      catch (error) { return { cancelled: false, hold: true, reason: error.definite === true ? `MailerLite refused the cancellation (${error.status})` : 'The cancellation got no clear answer', groupId: before.groupId }; }
      let after;
      try { after = await toJob(await call('GET', `/api/campaigns/${jobId}`, undefined, 'record')); }
      catch (error) { return { cancelled: false, hold: true, reason: `Cancelled, but the readback failed: ${error.message}`, groupId: before.groupId }; }
      if (after.state !== 'draft' || after.sendAt !== null) return { cancelled: false, hold: true, reason: `After cancelling, the job reads as ${after.state}`, groupId: before.groupId };
      return { cancelled: true, hold: false, groupId: before.groupId };
    },

    /** Remove a cancelled or abandoned draft so its key is free for a rebuilt job. Verified by readback. */
    removeDraft: removeDraftVerified,
  };
}

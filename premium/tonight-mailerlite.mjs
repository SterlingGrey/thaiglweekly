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
//      delivery key and the payload version, because MailerLite offers no
//      idempotency key and its list filter matches subjects, not names.
//   3. Scheduled to the minute in UTC, then read back.
// MailerLite appends its own footer with the account's postal address, so the
// plan for this provider is prepared with `postalAddressByProvider: true`.
//
// Assumptions still to be checked against the live service at integration
// review, each isolated in one place below:
//   - REST responses wrap their object in `data` (unwrap()).
//   - A group's subscribers page with `meta.next_cursor` (groupMembers()).
//   - Removing a subscriber from the group before the send removes them from
//     the campaign. Until that is observed, withdraw() cancels the campaign
//     whenever the campaign's own recipient count does not confirm it.
//   - Campaign creation accepts no plain-text body; MailerLite sends its stock
//     fallback. `text` is therefore not transmitted.

const KEY = /^[0-9a-f]{64}$/;
const NAME = /^TiB (\d{4}-\d{2}-\d{2}) (\S+) k=([0-9a-f]{64}) p=([0-9a-f]{64})$/;

/** The campaign name is the job's identity at the provider. At most 255 characters. */
export function campaignName({ bangkokDate, timezone, key, payloadVersion }) {
  const name = `TiB ${bangkokDate} ${timezone} k=${key} p=${payloadVersion}`;
  if (!NAME.test(name) || name.length > 255) throw new Error('Cannot name this delivery');
  return name;
}
export function parseCampaignName(name) {
  const m = NAME.exec(name || '');
  return m ? { bangkokDate: m[1], timezone: m[2], key: m[3], payloadVersion: m[4] } : null;
}

const refused = (message, extra = {}) => Object.assign(new Error(message), { definite: true, ...extra });
const unwrap = json => (json && typeof json === 'object' && 'data' in json ? json.data : json);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
const toIso = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? new Date(value.replace(' ', 'T') + 'Z').toISOString() : null);

export function createMailerLiteProvider({ http, sender, utcTimezoneId, lookbackDays = 3, maxPages = 20 }) {
  if (typeof http !== 'function') throw new Error('An http function is required');
  if (!sender?.from || !sender.fromName) throw new Error('A verified sender is required');
  if (!Number.isInteger(utcTimezoneId)) throw new Error('The provider’s UTC time zone id is required');

  // 2xx succeeds. A 4xx other than 408 and 429 is a refusal: the provider
  // understood and declined. Anything else leaves the outcome unknown.
  async function call(method, path, body) {
    const response = await http(method, path, body);
    const status = response?.status;
    if (status >= 200 && status < 300) return unwrap(response.json);
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) throw refused(`MailerLite refused ${method} ${path.split('?')[0]} (${status})`, { status });
    throw new Error(`MailerLite gave no clear answer to ${method} ${path.split('?')[0]}`);
  }

  async function groupMembers(groupId) {
    const ids = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page++) {
      const response = await http('GET', `/api/groups/${groupId}/subscribers?filter[status]=active&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!(response?.status >= 200 && response.status < 300)) throw new Error('MailerLite gave no clear answer about the group’s members');
      for (const row of response.json?.data || []) ids.push(String(row.id));
      cursor = response.json?.meta?.next_cursor || null;
      if (!cursor) return ids;
    }
    throw new Error('The group has more members than this adapter will read');
  }

  const groupIdsOf = campaign => (campaign.filter || []).flat().filter(rule => rule?.operator === 'in_any' && rule.args?.[0] === 'groups').flatMap(rule => rule.args[1] || []).map(String);

  async function toJob(campaign) {
    const named = parseCampaignName(campaign.name);
    const groups = groupIdsOf(campaign);
    // The audience is whoever is in the campaign's one group now. Anything else is not a job this adapter made.
    const subscriberIds = groups.length === 1 ? await groupMembers(groups[0]) : [];
    const state = campaign.status === 'sent' && campaign.finished_at ? 'sent' : campaign.status === 'sent' ? 'sending' : campaign.status === 'ready' ? 'scheduled' : campaign.status === 'draft' ? 'draft' : 'unknown';
    return { id: String(campaign.id), key: named?.key ?? null, payloadVersion: named?.payloadVersion ?? null, bangkokDate: named?.bangkokDate ?? null, timezone: named?.timezone ?? null,
      sendAt: toIso(campaign.scheduled_for), subscriberIds, groupId: groups.length === 1 ? groups[0] : null, state,
      finishedAt: toIso(campaign.finished_at), recipients: Number.isInteger(campaign.recipients_count) ? campaign.recipients_count : null };
  }

  async function findCampaigns(key) {
    const found = [];
    const from = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
    for (const status of ['ready', 'sent', 'draft']) {
      for (let page = 1; page <= maxPages; page++) {
        const response = await http('GET', `/api/campaigns?filter[status]=${status}&filter[type]=regular&filter[date_from]=${from}&limit=100&page=${page}`);
        if (!(response?.status >= 200 && response.status < 300)) throw new Error('MailerLite gave no clear answer about existing campaigns');
        const rows = response.json?.data || [];
        for (const row of rows) if (parseCampaignName(row.name)?.key === key) found.push(row);
        if (rows.length < 100) break;
        if (page === maxPages) throw new Error('More campaigns exist than this adapter will read');
      }
    }
    return found;
  }

  return {
    /** The job for a delivery key, or null. Looked up by campaign name across draft, ready and sent. */
    async findJob(key) {
      if (!KEY.test(key || '')) throw new Error('Invalid delivery key');
      const found = await findCampaigns(key);
      if (!found.length) return null;
      // Two campaigns under one key must never be adopted: report a conflict the publisher will hold.
      if (found.length > 1) return { id: String(found[0].id), key, state: 'conflict', sendAt: null, subscriberIds: [], payloadVersion: null, duplicateIds: found.map(c => String(c.id)) };
      return toJob(found[0]);
    },

    async scheduleJob(request) {
      const { key, sendAt, subscriberIds, subject, html, payloadVersion, bangkokDate, timezone } = request || {};
      const at = new Date(sendAt);
      if (!KEY.test(key || '') || !KEY.test(payloadVersion || '') || !Array.isArray(subscriberIds) || !subscriberIds.length || subscriberIds.some(id => !/^\d+$/.test(id)) || !subject || !html) throw refused('Incomplete delivery request');
      if (!Number.isFinite(+at) || at.getUTCSeconds() !== 0 || at.getUTCMilliseconds() !== 0) throw refused('MailerLite schedules to the minute; the send instant must be a whole minute');
      const name = campaignName({ bangkokDate, timezone, key, payloadVersion });

      // 1. The cohort's own group, filled and read back. Nothing that can send exists yet,
      //    so any failure up to here is a refusal.
      let groupId;
      try {
        groupId = String((await call('POST', '/api/groups', { name: `TiB ${bangkokDate} ${timezone} k=${key.slice(0, 16)}` })).id);
        for (const id of subscriberIds) await call('POST', `/api/subscribers/${id}/groups/${groupId}`);
        const members = await groupMembers(groupId);
        if (!sameSet(members, subscriberIds)) throw refused('The group does not hold exactly the intended audience', { groupId, expected: subscriberIds.length, found: members.length });
      } catch (error) { throw refused(error.message, { groupId: groupId ?? null, status: error.status }); }

      // 2. The campaign. A refusal creates nothing. No answer means it may exist.
      const campaign = await call('POST', '/api/campaigns', { name, type: 'regular', groups: [groupId],
        emails: [{ subject, from_name: sender.fromName, from: sender.from, ...(sender.replyTo ? { reply_to: sender.replyTo } : {}), content: html }] });
      const campaignId = String(campaign.id);

      // 3. The schedule, in UTC. If it is refused, the draft is removed so nothing lingers;
      //    if the draft cannot be confirmed gone, the outcome is unknown, not refused.
      const p = n => String(n).padStart(2, '0');
      try {
        await call('POST', `/api/campaigns/${campaignId}/schedule`, { delivery: 'scheduled', schedule: { date: `${at.getUTCFullYear()}-${p(at.getUTCMonth() + 1)}-${p(at.getUTCDate())}`, hours: p(at.getUTCHours()), minutes: p(at.getUTCMinutes()), timezone_id: utcTimezoneId } });
      } catch (error) {
        if (error.definite !== true) throw error;
        const removal = await http('DELETE', `/api/campaigns/${campaignId}`).catch(() => null);
        if (removal?.status === 204 || removal?.status === 200 || removal?.status === 404) throw refused('MailerLite refused the schedule; the draft was removed', { status: error.status });
        throw new Error('MailerLite refused the schedule and the draft could not be confirmed removed');
      }

      // 4. Read the job back. The publisher compares it with what was asked for.
      return toJob(await call('GET', `/api/campaigns/${campaignId}`));
    },

    /** Dispatch is read from status and finished_at. Delivery is read separately, per recipient. */
    async getJob(jobId) {
      const job = await toJob(await call('GET', `/api/campaigns/${jobId}`));
      if (job.state !== 'sent') return job;
      const list = async type => {
        const ids = [];
        for (let page = 1; page <= maxPages; page++) {
          const rows = (await http('GET', `/api/campaigns/${jobId}/reports/subscriber-activity?filter[type]=${type}&limit=100&page=${page}&include=subscriber`))?.json?.data || [];
          for (const row of rows) if (row.subscriber?.id) ids.push(String(row.subscriber.id));
          if (rows.length < 100) break;
        }
        return ids;
      };
      const bounced = new Set([...await list('hardbounced'), ...await list('softbounced')]);
      return { ...job, deliveredSubscriberIds: (await list('sent')).filter(id => !bounced.has(id)) };
    },

    /**
     * Take one member out of a scheduled job, for an opt-out or a zone change
     * after scheduling. The campaign's own recipient count must confirm it;
     * if it does not, the whole campaign is cancelled, which is the safe side.
     */
    async withdraw(jobId, subscriberId) {
      const before = await toJob(await call('GET', `/api/campaigns/${jobId}`));
      if (before.state !== 'scheduled' || !before.groupId) return { withdrawn: false, cancelled: false, reason: `The job is ${before.state}` };
      await call('DELETE', `/api/subscribers/${subscriberId}/groups/${before.groupId}`);
      const members = await groupMembers(before.groupId);
      const after = await toJob(await call('GET', `/api/campaigns/${jobId}`));
      if (!members.includes(String(subscriberId)) && after.recipients === members.length && members.length > 0) return { withdrawn: true, cancelled: false, remaining: members.length };
      await call('POST', `/api/campaigns/${jobId}/cancel`);
      return { withdrawn: !members.includes(String(subscriberId)), cancelled: true, reason: members.length ? 'The campaign did not confirm the smaller audience' : 'Nobody is left in the cohort' };
    },
  };
}

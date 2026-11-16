// A test double. It is imported only by tests and can reach no real service.
// A pretend MailerLite account held in memory, answering in the documented
// shapes. Nothing here can reach a real service.
export function mockMailerLite(options = {}) {
  // Options are read at call time, so a test can change the account's behaviour mid-run.
  const fail = (...args) => (options.fail ? options.fail(...args) : null), dropOnAssign = () => options.dropOnAssign || [];
  let next = 1000;
  const groups = new Map(), campaigns = new Map(), log = [];
  const ok = (json, status = 200) => ({ status, json });
  const view = c => ({ id: c.id, name: c.name, status: c.status, scheduled_for: c.scheduled_for, finished_at: c.finished_at, filter: c.filter, recipients_count: groups.get(c.groupId)?.members.size ?? 0, ...(c.stats ? { stats: c.stats } : {}) });
  const paged = (rows, path) => { const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] || 1), per = 100, last = Math.max(1, Math.ceil(rows.length / per)); return ok({ data: rows.slice((page - 1) * per, page * per), meta: { current_page: page, last_page: last, per_page: per, total: rows.length } }); };
  async function http(method, path, body) {
    log.push([method, path.split('?')[0]]);
    const injected = fail(method, path, body);
    if (injected === 'throw') throw new Error('socket closed');
    if (injected) return injected;
    let m;
    if (method === 'POST' && path === '/api/groups') { const id = String(next++); groups.set(id, { name: body.name, members: new Set() }); return ok({ data: { id, name: body.name } }, 201); }
    if ((m = /^\/api\/subscribers\/(\d+)\/groups\/(\d+)$/.exec(path))) {
      const group = groups.get(m[2]); if (!group) return ok({ message: 'Not found' }, 404);
      if (method === 'POST') { if (!dropOnAssign().includes(m[1])) group.members.add(m[1]); return ok({ data: { id: m[2], name: group.name } }); }
      if (method === 'DELETE') { group.members.delete(m[1]); return ok(null, 204); }
    }
    if (method === 'GET' && (m = /^\/api\/groups\/(\d+)\/subscribers/.exec(path))) return ok({ data: [...(groups.get(m[1])?.members || [])].map(id => ({ id })), meta: { path: 'x', per_page: 100, next_cursor: null, prev_cursor: null } });
    if (method === 'POST' && path === '/api/campaigns') {
      const id = String(next++);
      campaigns.set(id, { id, name: body.name, status: 'draft', scheduled_for: null, finished_at: null, groupId: body.groups[0], filter: [[{ operator: 'in_any', args: ['groups', [body.groups[0]]] }]], emails: body.emails });
      return ok({ data: view(campaigns.get(id)) }, 201);
    }
    if (method === 'GET' && path.startsWith('/api/campaigns?')) { const status = /filter\[status\]=(\w+)/.exec(path)[1]; return paged([...campaigns.values()].filter(c => c.status === status).map(view), path); }
    if ((m = /^\/api\/campaigns\/(\d+)\/schedule$/.exec(path)) && method === 'POST') {
      const c = campaigns.get(m[1]); const s = body.schedule;
      c.status = 'ready'; c.scheduled_for = `${s.date} ${s.hours}:${s.minutes}:00`; c.scheduleBody = body; return ok({ data: view(c) });
    }
    if ((m = /^\/api\/campaigns\/(\d+)\/cancel$/.exec(path)) && method === 'POST') { const c = campaigns.get(m[1]); if (!options.ignoreCancel) { c.status = 'draft'; c.scheduled_for = null; } return ok({ data: view(c) }); }
    if ((m = /^\/api\/campaigns\/(\d+)\/reports\/subscriber-activity/.exec(path)) && method === 'GET') { const type = /filter\[type\]=(\w+)/.exec(path)[1]; return paged((campaigns.get(m[1]).activity?.[type] || []).map(id => ({ id: '9' + id, subscriber: { id } })), path); }
    if ((m = /^\/api\/campaigns\/(\d+)$/.exec(path))) {
      if (method === 'GET') return campaigns.has(m[1]) ? ok({ data: view(campaigns.get(m[1])) }) : ok({ message: 'Not found' }, 404);
      if (method === 'DELETE') { if (!options.ignoreDelete) campaigns.delete(m[1]); return ok(null, 204); }
    }
    return ok({ message: 'Unhandled in mock' }, 500);
  }
  return { http, groups, campaigns, log, options };
}

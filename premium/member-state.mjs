// Internal Durable Object only: the public Worker validates identity and plan.
// SQLite-backed DO transactions avoid KV's eventual-consistency revocation gap.
export class MemberState {
  constructor(ctx) { this.storage = ctx.storage; }
  async fetch(request) {
    const url = new URL(request.url);
    const json = (value, status = 200) => Response.json(value, { status });
    if (url.pathname === "/token" && request.method === "GET") {
      const entry = await this.storage.get("token:" + url.searchParams.get("hash"));
      return entry ? json(entry) : json({}, 404);
    }
    const input = await request.json();
    if (!/^user_[\w-]+$/.test(input.userId || "")) return json({}, 400);
    const key = "member:" + input.userId;
    return this.storage.transaction(async tx => {
      const member = await tx.get(key) || { version: 0, follows: [], watched: {}, timezone: "UTC" };
      if (url.pathname === "/get") return json(member);
      if (url.pathname === "/save") {
        if (input.version !== member.version) return json({ error: "Your list changed in another window. Reload before saving." }, 409);
        const updated = { ...input.state, version: member.version + 1 };
        if (member.tokenHash) updated.tokenHash = member.tokenHash;
        await tx.put(key, updated);
        return json(updated);
      }
      if (url.pathname === "/rotate" || url.pathname === "/revoke") {
        if (member.tokenHash) await tx.delete("token:" + member.tokenHash);
        delete member.tokenHash;
        if (url.pathname === "/rotate") {
          member.tokenHash = input.hash;
          await tx.put("token:" + input.hash, { userId: input.userId });
        }
        await tx.put(key, member);
        return json({ ok: true });
      }
      return json({}, 404);
    });
  }
}

export async function memberStore(env, path, input, method = "POST") {
  if (!env.MEMBERS) throw new Error("Member storage is not configured");
  const stub = env.MEMBERS.get(env.MEMBERS.idFromName((env.MEMBER_SCOPE || "live") + "-members-v1"));
  return stub.fetch(new Request("https://internal" + path, {
    method,
    ...(method === "GET" ? {} : { body: JSON.stringify(input), headers: { "Content-Type": "application/json" } }),
  }));
}

export function validateMemberState(input, catalog) {
  if (!input || !Number.isSafeInteger(input.version) || input.version < 0 || !Array.isArray(input.follows) || input.follows.length > 100) throw new Error("Invalid list");
  const shows = new Map(catalog.series.map(show => [show.id, show]));
  const follows = [...new Set(input.follows)];
  if (follows.some(id => typeof id !== "string" || !shows.has(id))) throw new Error("Unknown show");
  if (!input.watched || typeof input.watched !== "object" || Array.isArray(input.watched)) throw new Error("Invalid watched list");
  const watched = {};
  if (Object.keys(input.watched).length > 100) throw new Error("Too many shows");
  for (const [id, values] of Object.entries(input.watched)) {
    const show = shows.get(id);
    if (!show || !Array.isArray(values) || values.length > 500 || values.some(n => !Number.isInteger(n) || n < 1 || n > 500 || (show.total_episodes && n > show.total_episodes))) throw new Error("Invalid episode");
    watched[id] = [...new Set(values)].sort((a, b) => a - b);
  }
  const timezone = input.timezone;
  if (typeof timezone !== "string" || timezone.length > 80) throw new Error("Invalid time zone");
  new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  return { version: input.version, state: { follows, watched, timezone } };
}

export async function tokenHash(token) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map(b => b.toString(16).padStart(2, "0")).join("");
}

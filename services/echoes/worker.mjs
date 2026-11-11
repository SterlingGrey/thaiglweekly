const reviewLifetime = 30 * 24 * 60 * 60 * 1000;
const reviewPath = /^\/review\/([a-f0-9]{64})$/;
const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow"
};

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function tokenKey(token) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function reviewPage(title, content, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Tide &amp; Shadow Echoes</title>
<style>
body{margin:3rem auto;padding:0 1rem;max-width:36rem;color:#f5f0e6;background:#0a1428;font:1.1rem/1.6 Georgia,serif}
blockquote{border-left:2px solid #c9a84c;margin:1rem 0;padding:0 1rem;white-space:pre-wrap;overflow-wrap:anywhere}
button{padding:.8rem 1.2rem;background:#e8d5a3;color:#0a1428;border:0;border-radius:.4rem;font:inherit;cursor:pointer}
a{color:#e8d5a3}
</style><main><h1>${title}</h1>${content}</main></html>`, {
    status,
    headers: {
      ...privateHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    }
  });
}

export default {
  fetch(request, env) {
    return env.ECHOES.getByName("tide-and-shadow").fetch(request);
  }
};

export class Echoes {
  constructor(ctx, env) {
    this.sql = ctx.storage.sql;
    this.env = env;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS echoes (
      id TEXT PRIMARY KEY, review_key TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      echo TEXT NOT NULL, expires INTEGER NOT NULL, approved_at INTEGER
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = { "Access-Control-Allow-Origin": this.env.SITE_ORIGIN, Vary: "Origin" };

    if (url.pathname === "/published" && request.method === "GET") {
      const echoes = this.sql.exec(
        "SELECT id, name, echo FROM echoes WHERE approved_at IS NOT NULL ORDER BY approved_at, id"
      ).toArray();
      return Response.json(echoes, { headers: { ...cors, "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/submit" && request.method === "POST") {
      if (origin !== this.env.SITE_ORIGIN) return new Response(null, { status: 403 });
      return this.submit(request, url, cors);
    }

    const match = url.pathname.match(reviewPath);
    if (!match || !["GET", "POST"].includes(request.method)) return new Response(null, { status: 404 });

    if (request.method === "POST" && origin !== url.origin) {
      return reviewPage("Approval blocked", "<p>Open the review link and use its approval button.</p>", 403);
    }

    const key = await tokenKey(match[1]);
    const echo = this.sql.exec(
      "SELECT name, echo, expires, approved_at FROM echoes WHERE review_key = ?", key
    ).toArray()[0];
    if (!echo || echo.expires <= Date.now()) {
      return reviewPage("Review link unavailable", "<p>This link is invalid or has expired.</p>", 404);
    }

    if (request.method === "POST") {
      this.sql.exec("UPDATE echoes SET approved_at = ? WHERE review_key = ? AND approved_at IS NULL", Date.now(), key);
    }
    if (request.method === "POST" || echo.approved_at !== null) {
      return reviewPage("Echo published",
        `<p>This echo is public.</p><p><a href="${escapeHtml(this.env.SITE_ORIGIN)}/tide-and-shadow-echoes.html">View Echoes</a></p>`);
    }
    return reviewPage("Review an echo",
      `<blockquote>${escapeHtml(echo.echo)}</blockquote><p>Public name: ${escapeHtml(echo.name)}</p>
<form method="post"><button type="submit">Approve and publish</button></form>`);
  }

  async submit(request, url, cors) {
    const headers = { ...cors, ...privateHeaders };
    const fail = (status) => new Response(null, { status, headers });
    const body = await request.text();
    if (body.length > 6500 || !request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded")) {
      return fail(400);
    }

    const fields = new URLSearchParams(body);
    const echo = fields.get("echo")?.trim() ?? "";
    const name = fields.get("name")?.trim() || "Reader";
    if (!echo || echo.length > 400 || name.length > 80) return fail(400);

    const id = crypto.randomUUID();
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const key = await tokenKey(token);
    const now = Date.now();
    this.sql.exec("DELETE FROM echoes WHERE expires <= ? AND approved_at IS NULL", now);
    this.sql.exec("INSERT INTO echoes (id, review_key, name, echo, expires) VALUES (?, ?, ?, ?, ?)",
      id, key, name, echo, now + reviewLifetime);

    const notification = new FormData();
    notification.set("name", name);
    notification.set("echo", echo);
    notification.set("_subject", "New Tide & Shadow Echo");
    notification.set("review_url", `${url.origin}/review/${token}`);
    try {
      const result = await fetch(this.env.FORM_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Origin: this.env.SITE_ORIGIN,
          Referer: `${this.env.SITE_ORIGIN}/tide-and-shadow-echoes.html`,
          "User-Agent": request.headers.get("User-Agent") || "Thai GL Weekly Echoes"
        },
        body: notification,
        redirect: "error",
        signal: AbortSignal.timeout(10000)
      });
      if (!result.ok) return fail(502);
    } catch {
      return fail(502);
    }

    return new Response(null, { status: 202, headers });
  }
}

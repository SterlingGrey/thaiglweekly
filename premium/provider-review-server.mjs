// Loopback shell for real Clerk development + remote Stripe sandbox checks.
// No backend secret, fake session, provider fixture or public hosting is used.
import http from "node:http";
import { renderPortal } from "./portal.mjs";

const port = Number(process.env.REVIEW_PORT || 8791);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid review port");
const origin = "http://127.0.0.1:" + port;
const service = new URL(process.env.PREMIUM_WORKER_URL || "https://invalid.example");
if (service.origin !== "https://thai-gl-weekly-premium.se-1a1.workers.dev" || service.pathname !== "/" || service.search || service.hash || service.username || service.password) throw new Error("Use the verified existing private service");
const clerkKey = process.env.CLERK_PUBLISHABLE_KEY || "";
if (!clerkKey.startsWith("pk_test_")) throw new Error("This review requires Clerk development, never production");
const html = renderPortal({ api: service.origin + "/review", clerkKey }).replace("<main>", "<main><p class=\"sample\">PRIVATE PROVIDER REVIEW · Development sign-in and test billing only. No live purchase or subscriber send.</p>");
http.createServer((req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const openingPage = req.method === "GET" && req.url === "/";
  if (req.headers.host !== "127.0.0.1:" + port ||
      (req.headers.origin && req.headers.origin !== origin) ||
      (!openingPage && req.headers["sec-fetch-site"] === "cross-site")) { res.writeHead(403); res.end("Forbidden"); return; }
  if (req.method !== "GET" || req.url !== "/") { res.writeHead(404); res.end("Not found"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html);
}).listen(port, "127.0.0.1", () => console.log("Private provider-review shell ready on " + origin));

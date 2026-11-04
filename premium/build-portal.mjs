// Prepares a real sign-in shell for an authenticated private review host only.
// It cannot write into the public site or enable any service capability.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPortal } from "./portal.mjs";

const service = new URL(process.env.PREMIUM_WORKER_URL || "https://invalid.example");
if (service.pathname !== "/" || service.hostname === "invalid.example") throw new Error("Provide the verified private-review service origin");
const html = renderPortal({ api: service.origin + "/review", clerkKey: process.env.CLERK_PUBLISHABLE_KEY });
const out = fileURLToPath(new URL("./review-output/authenticated-portal/index.html", import.meta.url));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log("Prepared ignored authenticated-review shell; not published.");

import test from "node:test";import assert from "node:assert/strict";import {freeTracker} from "./free-tracker.mjs";
import {generateKeyPairSync,randomBytes,publicEncrypt,createCipheriv,constants} from "node:crypto";
const pair=generateKeyPairSync("rsa",{modulusLength:2048});
const aes=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",aes,iv);
const blob=Buffer.concat([cipher.update(JSON.stringify({workspace:"<h1>Protected Tracker</h1>",classic:"<h1>Classic</h1>"})),cipher.final(),cipher.getAuthTag()]);
const encrypted={version:1,iv:iv.toString("base64"),blob:blob.toString("base64"),wrapped:publicEncrypt({key:pair.publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},aes).toString("base64")};
const env={FREE_TRACKER_RELEASE:"enabled",FREE_TRACKER_PRIVATE_JWK:JSON.stringify(pair.privateKey.export({format:"jwk"})),CLERK_ALLOWED_ORIGIN:"https://thaiglweekly.com",MAILERLITE_API_TOKEN:"fixture",PREMIUM_CONTENT:{get:async k=>k==="free-tracker:workspace"?"<h1>Protected Tracker</h1>":null}};
const req=(extra={})=>new Request("https://service.example/free-tracker",{headers:{Origin:env.CLERK_ALLOWED_ORIGIN,Authorization:"Bearer verified",...extra}});
const deps=status=>({bundle:async()=>encrypted,identity:async()=>"reader@example.com",fetcher:async()=>Response.json({data:{email:"reader@example.com",status}})});
test("subscriber gate denies missing identity, forged origin and every non-active state",async()=>{assert.equal((await freeTracker(req({Origin:"https://wrong.example"}),env,deps("active"))).status,403);assert.equal((await freeTracker(req({Authorization:""}),env,deps("active"))).status,401);for(const s of ["unconfirmed","unsubscribed","bounced","junk",null])assert.equal((await freeTracker(req(),env,deps(s))).status,403);});
test("confirmed address and current newsletter status are required; failures never unlock",async()=>{let r=await freeTracker(req(),env,deps("active"));assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"private, no-store");assert.match(await r.text(),/Protected Tracker/);assert.equal((await freeTracker(req(),env,{...deps("active"),identity:async()=>{throw Error();}})).status,401);assert.equal((await freeTracker(req(),env,{...deps("active"),fetcher:async()=>Response.json({data:{email:"different@example.com",status:"active"}})})).status,403);assert.equal((await freeTracker(req(),env,{...deps("active"),fetcher:async()=>new Response("",{status:500})})).status,503);assert.equal((await freeTracker(req(),{...env,FREE_TRACKER_RELEASE:"disabled"},deps("active"))).status,404);});

test("encrypted payload corruption fails closed",async()=>{assert.equal((await freeTracker(req(),env,{...deps("active"),bundle:async()=>({...encrypted,blob:encrypted.blob.slice(5)})})).status,503);});

test("Chapter 2 serves private prose only to a verified and confirmed subscriber", async () => {
 const request = new Request(req().url + "?layout=tide-and-shadow-ch2", {headers:req().headers});
 const chapterEnv = {...env,TIDE_AND_SHADOW_CH2:"Private chapter fixture"};
 for (const status of ["unconfirmed","unsubscribed"]) {
  const response = await freeTracker(request,chapterEnv,deps(status));
  assert.equal(response.status,403);
  assert.doesNotMatch(await response.text(),/Private chapter fixture/);
 }
 assert.equal((await freeTracker(request,env,deps("active"))).status,503);
 const response = await freeTracker(request,chapterEnv,deps("active"));
 assert.equal(response.status,200);
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 assert.equal(await response.text(),"Private chapter fixture");
});

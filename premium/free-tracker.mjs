import { verifiedEmail } from "./access.mjs";
const baseHeaders = {"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer"};
export async function freeTracker(request, env, deps = {}) {
 const origin=request.headers.get("Origin");
 const headers={...baseHeaders,"Access-Control-Allow-Origin":env.CLERK_ALLOWED_ORIGIN,Vary:"Origin"};
 const reply=(message,status)=>new Response(message,{status,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
 if(origin!==env.CLERK_ALLOWED_ORIGIN)return new Response("Forbidden",{status:403,headers:baseHeaders});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...headers,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Authorization"}});
 if(request.method!=="GET")return reply("Not found",404);
 if(env.FREE_TRACKER_RELEASE!=="enabled")return reply("Not found",404);
 if(!env.MAILERLITE_API_TOKEN||!env.FREE_TRACKER_PRIVATE_JWK)return reply("Tracker access is temporarily unavailable. Please try again shortly.",503);
 const token=/^Bearer ([^\s]+)$/.exec(request.headers.get("Authorization")||"")?.[1];
 if(!token)return reply("Verify your email to open the Tracker.",401);
 let email;try{email=await (deps.identity||verifiedEmail)(token,env);}catch{return reply("Please sign in again.",401);}
 let reader;
 try {
 const r=await (deps.fetcher||fetch)("https://connect.mailerlite.com/api/subscribers/"+encodeURIComponent(email),{headers:{Authorization:"Bearer "+env.MAILERLITE_API_TOKEN,Accept:"application/json"},signal:AbortSignal.timeout(10000)});
 if(r.status===404)return reply("Join the free Monday newsletter, confirm your email, then check access again.",403);
 if(!r.ok)return reply("Newsletter verification is temporarily unavailable. Please try again shortly.",503);
 reader=(await r.json()).data;
 }catch{return reply("Newsletter verification is temporarily unavailable. Please try again shortly.",503);}
 // Only the authenticated address is looked up. Never accept client-supplied email/status.
 if(reader?.email?.trim().toLowerCase()!==email.trim().toLowerCase()||reader?.status!=="active")return reply("Join the free Monday newsletter and confirm your email before opening the Tracker.",403);
 const layout=new URL(request.url).searchParams.get("layout")||"workspace";
 if(!["workspace","classic","status","tide-and-shadow-ch2"].includes(layout))return reply("Not found",404);
 if(layout==="tide-and-shadow-ch2"){
  if(!env.TIDE_AND_SHADOW_CH2?.trim())return reply("Chapter 2 is temporarily unavailable. Please try again shortly.",503);
  return reply(env.TIDE_AND_SHADOW_CH2,200);
 }
 if(layout==="status")return reply("Access confirmed",200);
 let html;
 try {
  const bundle=deps.bundle ? await deps.bundle() : await (await fetch("https://thaiglweekly.com/data/subscriber-tracker.enc.json",{cache:"no-store",signal:AbortSignal.timeout(12000)})).json();
  if(bundle.version!==1)throw Error("Unsupported bundle");
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const privateKey=await crypto.subtle.importKey("jwk",JSON.parse(env.FREE_TRACKER_PRIVATE_JWK),{name:"RSA-OAEP",hash:"SHA-256"},false,["decrypt"]);
  const raw=await crypto.subtle.decrypt({name:"RSA-OAEP"},privateKey,bytes(bundle.wrapped));
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
  const data=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(bundle.iv)},key,bytes(bundle.blob))));
  html=data[layout];
 }catch{return reply("The Tracker is being refreshed. Please try again shortly.",503);}
 if(!html)return reply("The Tracker is being refreshed. Please try again shortly.",503);
 return new Response(html,{headers:{...headers,"Content-Type":"text/html; charset=utf-8"}});
}

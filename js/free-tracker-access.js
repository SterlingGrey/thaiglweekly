// Free newsletter access. Membership decisions are made on the server.
(async function(){
 const api="https://thai-gl-weekly-premium.se-1a1.workers.dev/free-tracker";
 const status=document.getElementById("access-status"), button=document.getElementById("subscriber-signin"), retry=document.getElementById("subscriber-recheck");
 const say=s=>{status.textContent=s;}; let clerkPromise,opened=false;
 const script=(src,attrs={})=>new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.crossOrigin="anonymous";Object.entries(attrs).forEach(([k,v])=>s.setAttribute(k,v));s.onload=resolve;s.onerror=reject;document.head.append(s);});
 async function clerk(){
  if(!clerkPromise)clerkPromise=(async()=>{await script("https://clerk.thaiglweekly.com/npm/@clerk/ui@1/dist/ui.browser.js");await script("https://clerk.thaiglweekly.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js",{"data-clerk-publishable-key":"pk_live_Y2xlcmsudGhhaWdsd2Vla2x5LmNvbSQ="});await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});return window.Clerk;})();
  return clerkPromise;
 }
 async function membership(layout){const c=await clerk(),token=await c.session?.getToken();if(!token)return new Response("Verify your email to open the Tracker.",{status:401});return fetch(api+"?layout="+layout,{headers:{Authorization:"Bearer "+token},cache:"no-store"});}
 async function open(){
  if(opened)return;button.disabled=true;say("Checking your confirmed newsletter subscription…");
  try{
   const c=await clerk();
   if(!c.session){button.disabled=false;say("Verify the email address you use for the Monday newsletter.");c.openSignIn({forceRedirectUrl:location.href,signUpForceRedirectUrl:location.href});return;}
   const layout=location.pathname.includes("classic")?"classic":"workspace";
   const [r,classic]=await Promise.all([membership(layout),membership("classic")]);
   if(!r.ok||!classic.ok){const failed=!r.ok?r:classic;say(await failed.text());retry.hidden=false;button.disabled=false;return;}
   const html=await r.text();window.__subscriberCanonical=await classic.text();opened=true;localStorage.setItem("thaigl-subscriber-return","1");
   // Keep this same-origin document so existing browser-only lists and progress survive.
   document.open();document.write(html);document.close();
   const bar=document.createElement("div");bar.id="subscriber-access-bar";bar.style.cssText="padding:10px 16px;background:#171021;color:#f2deac;font:14px system-ui;text-align:center";const label=document.createElement("span");label.textContent="Free newsletter subscriber access · ";const out=document.createElement("button");out.textContent="Sign out";out.style.cssText="text-decoration:underline;background:none;border:0;color:inherit;cursor:pointer";out.onclick=async()=>{localStorage.removeItem("thaigl-subscriber-return");await c.signOut();location.reload();};bar.append(label,out);document.body.prepend(bar);
   setInterval(async()=>{try{const check=await membership("status");if(check.status===401||check.status===403){await c.signOut();location.reload();}}catch{}},300000);
  }catch{button.disabled=false;retry.hidden=false;say("Sign-in is temporarily unavailable. Your saved list is safe in this browser. Please try again shortly.");}
 }
 button.addEventListener("click",async()=>{localStorage.setItem("thaigl-subscriber-return","1");await open();});retry.addEventListener("click",open);
 if(localStorage.getItem("thaigl-subscriber-return")==="1")await open();
})();

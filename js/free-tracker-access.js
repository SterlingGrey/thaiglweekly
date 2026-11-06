// Free newsletter access. Membership decisions are made on the server.
(async function(){
 const api="https://thai-gl-weekly-premium.se-1a1.workers.dev/free-tracker";
 const status=document.getElementById("access-status"), button=document.getElementById("subscriber-signin"), retry=document.getElementById("subscriber-recheck");
 const identity=document.getElementById("access-identity"), newsletter=document.getElementById("newsletter-step"), switchEmail=document.getElementById("subscriber-switch");
 const say=s=>{status.textContent=s;}; let clerkPromise,opened=false,busy=false;
 const script=(src,attrs={})=>new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.crossOrigin="anonymous";Object.entries(attrs).forEach(([k,v])=>s.setAttribute(k,v));s.onload=resolve;s.onerror=reject;document.head.append(s);});
 async function clerk(){
  if(!clerkPromise)clerkPromise=(async()=>{await script("https://clerk.thaiglweekly.com/npm/@clerk/ui@1/dist/ui.browser.js");await script("https://clerk.thaiglweekly.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js",{"data-clerk-publishable-key":"pk_live_Y2xlcmsudGhhaWdsd2Vla2x5LmNvbSQ="});await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});const c=window.Clerk;let lastSession=c.session?.id;c.addListener?.(({session})=>{const changed=session?.id!==lastSession;lastSession=session?.id;if(changed&&session&&!opened&&!busy)void open();},{skipInitialEmit:true});return c;})();
  return clerkPromise;
 }
 function showIdentity(c){
  const email=c.user?.primaryEmailAddress?.emailAddress;
  if(identity)identity.textContent=c.session?(email?"Email verified for Tracker sign-in: "+email:"Your Tracker sign-in email is verified."):"";
  if(switchEmail)switchEmail.hidden=!c.session;
  return email;
 }
 async function membership(layout){const c=await clerk(),token=await c.session?.getToken();if(!token)return new Response("Verify your email to open the Tracker.",{status:401});return fetch(api+"?layout="+layout,{headers:{Authorization:"Bearer "+token},cache:"no-store"});}
 async function open(){
  if(opened||busy)return;busy=true;button.disabled=true;retry.disabled=true;if(newsletter)newsletter.hidden=true;say("Checking your confirmed newsletter subscription…");
  try{
   const c=await clerk(),email=showIdentity(c);
   if(!c.session){button.hidden=false;retry.hidden=true;say("Verify the same email address you confirmed for the Monday newsletter. A sign-in code alone does not subscribe you.");c.openSignIn({forceRedirectUrl:location.href,signUpForceRedirectUrl:location.href});return;}
   button.hidden=true;
   const layout=location.pathname.includes("classic")?"classic":"workspace";
   const [r,classic]=await Promise.all([membership(layout),membership("classic")]);
   if(!r.ok||!classic.ok){
    const failed=!r.ok?r:classic;
    if(failed.status===403){
     say((email?"You are signed in as "+email+". ":"Your sign-in email is verified. ")+"We could not find an active, confirmed newsletter subscription for this same address. Join or confirm the newsletter below, or use the address you already subscribed with. You do not need another sign-in code for this address.");
     if(newsletter)newsletter.hidden=false;retry.textContent="I confirmed the newsletter email. Check again";
    }else{say(await failed.text());retry.textContent="Try opening the Tracker again";}
    retry.hidden=false;return;
   }
   const html=await r.text();window.__subscriberCanonical=await classic.text();opened=true;localStorage.setItem("thaigl-subscriber-return","1");
   // Keep this same-origin document so existing browser-only lists and progress survive.
   window.__subscriberSignOut=async()=>{localStorage.removeItem("thaigl-subscriber-return");await c.signOut();location.reload();};
   window.__subscriberRefresh=async()=>{try{const check=await membership("status");if(check.status===401||check.status===403){await c.signOut();location.reload();}}catch{}};
   document.open();document.write(html);document.close();
  }catch{retry.hidden=false;retry.textContent="Try opening the Tracker again";say("Sign-in is temporarily unavailable. Your saved list is safe in this browser. Please try again shortly.");}
  finally{busy=false;button.disabled=false;retry.disabled=false;}
 }
 button.addEventListener("click",async()=>{localStorage.setItem("thaigl-subscriber-return","1");await open();});retry.addEventListener("click",open);
 switchEmail?.addEventListener("click",async()=>{if(busy)return;busy=true;switchEmail.disabled=true;try{const c=await clerk();localStorage.removeItem("thaigl-subscriber-return");await c.signOut();location.reload();}catch{busy=false;switchEmail.disabled=false;say("We could not switch addresses just now. Please try again.");}});
 if(localStorage.getItem("thaigl-subscriber-return")==="1")await open();
})();

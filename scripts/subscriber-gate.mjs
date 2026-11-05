import {randomBytes,createPublicKey,publicEncrypt,createCipheriv,constants} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";import {join,resolve} from "node:path";
const root=process.cwd(),out=resolve(root,process.env.SITE_OUT||"site"),priv=join(root,"subscriber-output");mkdirSync(priv,{recursive:true});
let workspace=readFileSync(join(out,"tracker.html"),"utf8"),classic=readFileSync(join(out,"tracker-classic.html"),"utf8");
const original="const response = await fetch('./tracker-classic.html', {cache:'no-cache'});";
if(!workspace.includes(original))throw Error("Tracker canonical loader changed; review subscriber integration");
workspace=workspace.replace(original,"const response = new Response(window.__subscriberCanonical, {headers:{'Content-Type':'text/html'}});");
writeFileSync(join(priv,"workspace.html"),workspace);writeFileSync(join(priv,"classic.html"),classic);
const aes=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",aes,iv);
const content=Buffer.from(JSON.stringify({workspace,classic}));
const blob=Buffer.concat([cipher.update(content),cipher.final(),cipher.getAuthTag()]);
const pub=createPublicKey({key:JSON.parse(readFileSync(join(root,"data/subscriber-tracker-public-key.json"),"utf8")),format:"jwk"});
const wrapped=publicEncrypt({key:pub,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},aes);
mkdirSync(join(out,"data"),{recursive:true});
writeFileSync(join(out,"data/subscriber-tracker.enc.json"),JSON.stringify({version:1,built_at:new Date().toISOString(),iv:iv.toString("base64"),wrapped:wrapped.toString("base64"),blob:blob.toString("base64")}));
const preview=readFileSync(join(root,"src/free-tracker-gate.html"),"utf8");
writeFileSync(join(out,"free-tracker-preview.html"),preview.replace("<title>","<meta name=\"robots\" content=\"noindex,nofollow\"><title>"));
for(const file of ["tracker.html","tracker2.html","tracker-classic.html","tracker-rollback-20261104.html"])writeFileSync(join(out,file),preview);
console.log("Public preview emitted; complete Tracker payloads remain outside Pages output");
for(const file of ["tracker.html","tracker2.html","tracker-classic.html","tracker-rollback-20261104.html"]) {
 const h=readFileSync(join(out,file),"utf8");
 if(h.includes('data-series-id=')||h.includes('function syncFromLiveTrackerHTML')||!h.includes('subscriber-signin'))throw Error('Subscriber gate missing or complete Tracker leaked: '+file);
}
if(JSON.stringify(JSON.parse(readFileSync(join(root,'data/subscriber-tracker-public-key.json'),'utf8'))).includes('"d":'))throw Error('Private key must not be published');

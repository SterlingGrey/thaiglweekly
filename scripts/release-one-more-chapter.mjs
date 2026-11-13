import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const START='2026-11-14T17:00:00Z';
export const END='2026-11-15T05:00:00Z';
export function inWindow(now){return now>=new Date(START)&&now<new Date(END);}
export function insertFilm(page,fragment){
 if(page.includes('id="one-more-chapter"'))return page;
 const marker='    <section id="film"';
 if(page.split(marker).length!==2)throw Error('Expected one existing film section');
 return page.replace(marker,fragment+'\n'+marker);
}
export async function release(root,now=new Date()){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'launch-source/one-more-chapter.json'),'utf8'));
 if(!manifest.approved||manifest.releaseAt!==START)throw Error('Missing release approval');
 if(!inWindow(now)){console.log('HELD: outside the approved dated release window');return;}
 const pagePath=path.join(root,'tide-and-shadow.html');
 const page=await fs.readFile(pagePath,'utf8');
 if(page.includes('id="one-more-chapter"')){console.log('Already released');return;}
 const fragment=await fs.readFile(path.join(root,'launch-source/one-more-chapter.html'),'utf8');
 const updated=insertFilm(page,fragment);
 const response=await fetch(manifest.mediaUrl);
 if(!response.ok)throw Error('Video download failed: '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Approved video hash mismatch');
 await fs.writeFile(path.join(root,'assets/originals/one-more-chapter.mp4'),bytes);
 await fs.copyFile(path.join(root,'launch-source/one-more-chapter.jpg'),path.join(root,'assets/originals/one-more-chapter.jpg'));
 await fs.writeFile(pagePath,updated);
 console.log('RELEASE READY: approved film and direct free-chapter CTA added');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await release(process.cwd());

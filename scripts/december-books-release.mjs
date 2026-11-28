import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const START = '2026-12-01T14:00:00Z';
export const END = '2026-12-02T05:00:00Z';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const inWindow = now => now >= new Date(START) && now < new Date(END);
export function checkedPath(name) {
  if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(x => !x || x === '.' || x === '..')) {
    throw new Error('Unsafe payload path');
  }
  return name;
}
export function insertOnce(text, marker, addition, identity) {
  if (text.includes(identity)) return text;
  if (text.split(marker).length !== 2) throw new Error('Release insertion context changed: ' + identity);
  return text.replace(marker, marker + addition);
}
export function editExisting(files) {
  const edited = new Map();
  const get = name => {
    if (!files.has(name)) throw new Error('Missing existing source: ' + name);
    return files.get(name);
  };
  const paragraph = 'Book Two of The Ledger and the Rose. Available to preorder now on Kindle and Apple Books. Releases 9 December 2026.</p>';
  for (const name of ['originals.html', 'the-ledger-and-the-rose.html', 'originals/the-ledger-and-the-rose-cold-open.html', 'scripts/newsletter-home.mjs']) {
    const url = name.startsWith('originals/') ? '../terms-of-surrender.html' : 'terms-of-surrender.html';
    const link = `<p><a href="${url}">Explore Book Two and read the opening free →</a></p>`;
    let text = insertOnce(get(name), paragraph, '\n  ' + link, link);
    if (name === 'the-ledger-and-the-rose.html') {
      text = text.replace('class="wordmark" href="tide-and-shadow.html"', 'class="wordmark" href="originals.html"');
    }
    edited.set(name, text);
  }
  const step = '  "build-book-pages.mjs",';
  edited.set('scripts/build.mjs', insertOnce(get('scripts/build.mjs'), '  "build-next-watch.mjs",', '\n' + step, step));
  const routes = " '/tide-and-shadow.html', '/the-ledger-and-the-rose.html', '/originals/tide-and-shadow-ch1.html', '/originals/the-ledger-and-the-rose-cold-open.html', '/terms-of-surrender.html', '/terms-of-surrender-opening.html', '/one-in-a-hundred.html',";
  edited.set('scripts/build-series-pages.mjs', insertOnce(get('scripts/build-series-pages.mjs'), "'/originals.html',", routes, "'/one-in-a-hundred.html'"));
  return edited;
}
const existing = ['originals.html', 'the-ledger-and-the-rose.html', 'originals/the-ledger-and-the-rose-cold-open.html', 'scripts/newsletter-home.mjs', 'scripts/build.mjs', 'scripts/build-series-pages.mjs'];

export async function stage(root, directory, manifest, now, mode) {
  if (!manifest.approved || manifest.releaseAt !== START || manifest.releaseUntil !== END) throw new Error('Missing exact dated clearance');
  if (Object.keys(manifest.files).some(name=>/\.epub$/i.test(name))) throw new Error('Owner permits PDF sample downloads only');
  if (mode !== 'preflight' && mode !== 'release') throw new Error('Unknown release mode');
  if (mode === 'release' && !inWindow(now)) return {held:true, changed:false};
  // Validate the complete frozen payload and all edit contexts before writing anything.
  const payload = new Map();
  for (const [name, expected] of Object.entries(manifest.files)) {
    checkedPath(name);
    const bytes = await fs.readFile(path.join(directory, name));
    if (hash(bytes) !== expected) throw new Error('Payload hash mismatch: ' + name);
    const current = await fs.readFile(path.join(root, name)).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (current && hash(current) !== expected) throw new Error('Concurrent content already at target: ' + name);
    payload.set(name, bytes);
  }
  const marker = path.join(root, 'launch-source/december-books-released.json');
  const previous = await fs.readFile(marker, 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if (previous) {
    if (previous.archiveSha256 !== manifest.archiveSha256) throw new Error('Different release already recorded');
    for (const name of payload.keys()) {
      const bytes = await fs.readFile(path.join(root, name));
      if (hash(bytes) !== manifest.files[name]) throw new Error('Released content no longer matches: ' + name);
    }
    return {held:false, changed:false, alreadyReleased:true};
  }
  const source = new Map(await Promise.all(existing.map(async name => [name, await fs.readFile(path.join(root,name),'utf8')])));
  const edits = editExisting(source);
  for (const [name, bytes] of payload) {
    await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});
    await fs.writeFile(path.join(root,name),bytes);
  }
  for (const [name,text] of edits) await fs.writeFile(path.join(root,name),text);
  const attr = path.join(root,'.gitattributes');
  let text = await fs.readFile(attr,'utf8').catch(e => { if(e.code==='ENOENT') return ''; throw e; });
  for (const rule of ['downloads/*.pdf binary','downloads/*.epub binary']) if (!text.includes(rule)) text += '\n' + rule + '\n';
  await fs.writeFile(attr,text);
  if (mode === 'release') await fs.writeFile(marker, JSON.stringify({releasedAt:now.toISOString(), archiveSha256:manifest.archiveSha256, pages:manifest.pages},null,2)+'\n');
  return {held:false,changed:true,alreadyReleased:false};
}
export async function verifyPublic(manifest, attempts=1) {
  const names = [...manifest.pages, ...Object.keys(manifest.files).filter(x => !x.startsWith('scripts/') && !manifest.pages.includes(x))];
  for (let attempt=0; attempt<attempts; attempt++) {
    try {
      for (const name of names) {
        const response = await fetch('https://thaiglweekly.com/'+name,{cache:'no-store',signal:AbortSignal.timeout(30000)});
        if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== manifest.files[name]) throw new Error('Public artifact not ready: '+name);
      }
      console.log('PUBLIC VERIFIED: all three pages, artwork, styles and downloads match approved hashes');
      return;
    } catch (error) {
      if (attempt===attempts-1) throw error;
      await new Promise(resolve=>setTimeout(resolve,15000));
    }
  }
}
async function main() {
  const root=process.cwd(), command=process.argv[2], mode=process.env.RELEASE_MODE || 'preflight';
  const manifest=JSON.parse(await fs.readFile(path.join(root,'launch-source/december-books-release.json'),'utf8'));
  if(command==='gate') {
    const proceed=mode==='preflight'||inWindow(new Date());
    if(process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT,`proceed=${proceed}\n`);
    console.log(proceed ? 'Dated release/preflight permitted' : 'HELD: outside 1 December 2026 release window');
    return;
  }
  if(command==='assert-window') {
    if(mode!=='release' || !inWindow(new Date())) throw new Error('Publishing is outside the approved date or mode');
    return;
  }
  if(command==='stage') {
    const zip=path.resolve(process.argv[3]);
    if(hash(await fs.readFile(zip))!==manifest.archiveSha256) throw new Error('Archive hash mismatch');
    // Reject extra archive members, traversal and symlinks before extraction.
    const names=execFileSync('python3',['-c',`import zipfile,json,sys,stat\nz=zipfile.ZipFile(sys.argv[1]); assert all(not stat.S_ISLNK(x.external_attr>>16) for x in z.infolist()); print(json.dumps(z.namelist()))`,zip],{encoding:'utf8'});
    const entries=JSON.parse(names);
    entries.forEach(checkedPath);
    if(entries.length!==Object.keys(manifest.files).length || entries.some(x=>!Object.hasOwn(manifest.files,x)) || new Set(entries).size!==entries.length) throw new Error('Unexpected payload archive contents');
    const target=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP||'/tmp','december-books-'));
    execFileSync('python3',['-m','zipfile','-e',zip,target]);
    const result=await stage(root,target,manifest,new Date(),mode);
    if(result.held)throw new Error('Release date changed before staging');
    console.log(JSON.stringify(result));
    return;
  }
  if(command==='verify-public') return verifyPublic(manifest,30);
  throw new Error('Unknown command');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();

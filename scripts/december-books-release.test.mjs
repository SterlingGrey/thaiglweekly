import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {inWindow,checkedPath,insertOnce,editExisting,stage,START,END} from './december-books-release.mjs';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
test('release date excludes early, expired, invalid and next-year runs',()=>{
  assert.equal(inWindow(new Date('2026-12-01T13:59:59Z')),false);
  assert.equal(inWindow(new Date(START)),true);
  assert.equal(inWindow(new Date('2026-12-02T04:59:59Z')),true);
  assert.equal(inWindow(new Date(END)),false);
  assert.equal(inWindow(new Date('2027-12-01T14:07:00Z')),false);
  assert.equal(inWindow(new Date('invalid')),false);
});
test('archive paths reject traversal and absolute alternatives',()=>{
  for(const p of ['../x','/tmp/x','a/../x','a\\x','a//x','a/./x',''])assert.throws(()=>checkedPath(p));
  assert.equal(checkedPath('assets/originals/december-2026/cover.png'),'assets/originals/december-2026/cover.png');
});
test('context drift holds and existing additions do not duplicate',()=>{
  assert.equal(insertOnce('a marker z','marker',' ADD','ADD'),'a marker ADD z');
  assert.equal(insertOnce('a marker ADD z','marker',' ADD','ADD'),'a marker ADD z');
  assert.throws(()=>insertOnce('changed','marker',' ADD','ADD'));
  assert.throws(()=>insertOnce('marker marker','marker',' ADD','ADD'));
});
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'book-release-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'repo'),payload=path.join(dir,'payload');await fs.mkdir(root);await fs.mkdir(payload);
  const paragraph='Book Two of The Ledger and the Rose. Available to preorder now on Kindle and Apple Books. Releases 9 December 2026.</p>';
  const seed={
    'originals.html':`new unrelated announcement\n${paragraph}`,
    'the-ledger-and-the-rose.html':`class="wordmark" href="tide-and-shadow.html"\n${paragraph}`,
    'originals/the-ledger-and-the-rose-cold-open.html':paragraph,
    'scripts/newsletter-home.mjs':`current weekly issue\n${paragraph}`,
    'scripts/build.mjs':'[\n  "build-next-watch.mjs",\n]',
    'scripts/build-series-pages.mjs':"const routes=['/', '/originals.html', '/tracker.html'];",
  };
  for(const [name,text] of Object.entries(seed)){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
  await fs.mkdir(path.join(root,'launch-source'));
  const text='approved fictional sample fixture';await fs.writeFile(path.join(payload,'sample.html'),text);
  const manifest={approved:true,releaseAt:START,releaseUntil:END,archiveSha256:'frozen-archive',files:{'sample.html':hash(text)},pages:['sample.html']};
  return {root,payload,manifest,seed};
}
test('early release leaves the repository untouched; preflight stages without a release receipt',async t=>{
  const f=await fixture(t);
  assert.deepEqual(await stage(f.root,f.payload,f.manifest,new Date('2026-11-28T16:00Z'),'release'),{held:true,changed:false});
  await assert.rejects(fs.access(path.join(f.root,'sample.html')));
  await stage(f.root,f.payload,f.manifest,new Date('2026-11-28T16:00Z'),'preflight');
  assert.match(await fs.readFile(path.join(f.root,'originals.html'),'utf8'),/^new unrelated announcement/);
  assert.match(await fs.readFile(path.join(f.root,'scripts/newsletter-home.mjs'),'utf8'),/^current weekly issue/);
  await assert.rejects(fs.access(path.join(f.root,'launch-source/december-books-released.json')));
});
test('tampered payload or changed source context never partially stages',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.payload,'sample.html'),'altered');
  await assert.rejects(stage(f.root,f.payload,f.manifest,new Date(START),'release'),/hash mismatch/);
  await assert.rejects(fs.access(path.join(f.root,'sample.html')));
  await fs.writeFile(path.join(f.payload,'sample.html'),'approved fictional sample fixture');
  await fs.writeFile(path.join(f.root,'originals.html'),'other editor rewrote this block');
  await assert.rejects(stage(f.root,f.payload,f.manifest,new Date(START),'release'),/context changed/);
  await assert.rejects(fs.access(path.join(f.root,'sample.html')));
});
test('successful release is idempotent and refuses to overwrite a later edit',async t=>{
  const f=await fixture(t);
  assert.equal((await stage(f.root,f.payload,f.manifest,new Date(START),'release')).changed,true);
  assert.equal((await stage(f.root,f.payload,f.manifest,new Date(START),'release')).alreadyReleased,true);
  const page=await fs.readFile(path.join(f.root,'originals.html'),'utf8');assert.equal(page.split('Explore Book Two').length,2);
  await fs.writeFile(path.join(f.root,'sample.html'),'later approved revision');
  await assert.rejects(stage(f.root,f.payload,f.manifest,new Date(START),'release'),/Concurrent content/);
});
test('owner PDF-only policy rejects even an otherwise approved EPUB payload',async t=>{
  const f=await fixture(t);f.manifest.files['sample.epub']=hash('ebook');
  await assert.rejects(stage(f.root,f.payload,f.manifest,new Date(START),'release'),/PDF sample downloads only/);
  await assert.rejects(fs.access(path.join(f.root,'sample.html')));
});

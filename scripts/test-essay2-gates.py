# Scout (Codex). Exercise release safety against isolated minimal output fixtures.
from pathlib import Path
import tempfile,shutil,json,hashlib,subprocess,os
r=Path(__file__).resolve().parents[1]; script=r/'scripts/prepare-building-their-own-house.mjs'
with tempfile.TemporaryDirectory() as temp:
 t=Path(temp);shutil.copytree(r/'launch-source',t/'launch-source');shutil.copytree(r/'data',t/'data');o=t/'site';o.mkdir();(o/'index.html').write_text('<p>Thursday 29 October</p><h2>Selling the Ship</h2><a href="essays/selling-the-ship/">Read the essay →</a>');(o/'sitemap.xml').write_text('<urlset></urlset>')
 for slug in ['', 'what-a-studio-owes-its-artists','how-to-love-thai-gl-without-overspending','selling-the-ship']:
  p=o/'essays'/slug/'index.html';p.parent.mkdir(parents=True,exist_ok=True);p.write_text('<div class="essay-list"><li>Building Their Own House<br>')
 c=t/'launch-source/essay2-clearance.json';hash=hashlib.sha256((t/'launch-source/essay-2.md').read_bytes()).hexdigest();page=o/'essays/building-their-own-house/index.html'
 def run(time,preview=False):return subprocess.run(['node',str(script)],cwd=t,env={**os.environ,'BUILD_NOW':time,'ESSAY2_PREVIEW':'1' if preview else '0'},capture_output=True,text=True)
 c.write_text(json.dumps({'cleared':False}));assert run('2026-11-02T11:30:00Z').returncode==0 and not page.exists()
 c.write_text(json.dumps({'cleared':True,'receipt':'TEST ONLY','sourceSha256':hash}));assert run('2026-11-02T11:29:59Z').returncode==0 and not page.exists()
 assert run('2026-11-02T11:30:00Z').returncode==0 and page.exists();h=page.read_text();assert 'noindex,nofollow' not in h and 'Not published' not in h and '2026-11-02T06:30:00-05:00' in h
 c.write_text(json.dumps({'cleared':True,'receipt':'TEST ONLY','sourceSha256':'wrong'}));assert run('2026-11-02T11:30:00Z').returncode!=0
 c.write_text(json.dumps({'cleared':False}));assert run('2026-11-02T11:30:00Z').returncode==0 and not page.exists()
 assert run('2026-11-01T12:00:00Z',True).returncode==0;assert 'noindex,nofollow' in page.read_text() and 'beacon.min.js' not in page.read_text()
 print('PASS: no clearance, pre-time, cleared release, changed source rejection, stale output removal, preview noindex/no analytics.')

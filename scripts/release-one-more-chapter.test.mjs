import test from 'node:test';
import assert from 'node:assert/strict';
import {inWindow,insertFilm} from './release-one-more-chapter.mjs';
test('only the approved Saturday release window can write',()=>{
 assert.equal(inWindow(new Date('2026-11-14T16:59:59Z')),false);
 assert.equal(inWindow(new Date('2026-11-14T17:00:00Z')),true);
 assert.equal(inWindow(new Date('2026-11-15T05:00:00Z')),false);
 assert.equal(inWindow(new Date('2027-11-14T17:00:00Z')),false);
});
test('existing copy and films survive and a repeat cannot duplicate the section',()=>{
 const page='<p>Existing chapter and buy links</p>\n    <section id="film">three existing films</section>';
 const fragment='<section id="one-more-chapter">approved film</section>';
 const result=insertFilm(page,fragment);
 assert.equal(result.replace(fragment+'\n',''),page);
 assert.equal(insertFilm(result,fragment),result);
});
test('unexpected page structure stops release',()=>assert.throws(()=>insertFilm('<html>Changed page</html>','film')));

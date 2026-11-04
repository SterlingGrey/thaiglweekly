import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCalendar } from './calendar.mjs';

test('unconfirmed airtimes become dated all-day markers, never timed calendar invitations',()=>{
  const catalog={generated_at:'2026-11-04T18:00:00Z',series:[{id:'fixture',title:'Fixture',episodes:[{number:1,airs_at:'2026-11-08T20:30:00+07:00',time_unverified:true},{number:2,airs_at:'2026-11-15T20:30:00+07:00'}]}]};
  const ics=renderCalendar(catalog,['fixture']).replaceAll('\r\n ','');
  assert.match(ics,/DTSTART;VALUE=DATE:20261108/);assert.doesNotMatch(ics,/DTSTART:20261108/);assert.match(ics,/airtime not confirmed/);assert.match(ics,/DTSTART:20261115T133000Z/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { localSendInstant, prepareSundayDelivery } from './delivery-plan.mjs';
const edition = { status:'approved', approvalReceipt:'fixture-owner-receipt', title:'Synthetic Sunday', sections:[{kind:'opinion',approved:true,heading:'Fixture',body:'Synthetic copy only'}] };
const now = new Date('2026-11-04T18:00:00Z');
const reader = (n, timezone, extra={}) => ({memberId:`user_fixture_${n}`,subscriberId:String(n),timezone,timezoneConfirmed:true,stripeAccess:true,mailerliteStatus:'active',inPaidGroup:true,eligibilityCheckedAt:now.toISOString(),...extra});

test('local delivery uses the target date offset including DST and fractional zones',()=>{
  assert.equal(localSendInstant('2026-11-08','18:00','America/New_York'),'2026-11-08T23:00:00.000Z');
  assert.equal(localSendInstant('2026-07-05','18:00','America/New_York'),'2026-07-05T22:00:00.000Z');
  assert.equal(localSendInstant('2026-11-08','18:00','Asia/Kathmandu'),'2026-11-08T12:15:00.000Z');
  assert.equal(localSendInstant('2026-11-08','18:00','Australia/Lord_Howe'),'2026-11-08T07:00:00.000Z');
  assert.equal(localSendInstant('2026-11-08','18:00','Pacific/Kiritimati'),'2026-11-08T04:00:00.000Z');
  assert.equal(localSendInstant('2026-11-08','18:00','Etc/GMT+12'),'2026-11-09T06:00:00.000Z');
});
test('missing/ambiguous wall times and invalid dates are held rather than shifted',()=>{
  for (const [date,time,zone] of [['2026-03-08','02:30','America/New_York'],['2026-11-01','01:30','America/New_York'],['2026-02-30','18:00','UTC'],['2026-11-08','24:01','UTC'],['2026-11-08','18:00','Mars']]) assert.throws(()=>localSendInstant(date,time,zone));
});
test('cohorts preserve explicitly confirmed zones and cannot schedule or broaden an audience',()=>{
  const plan=prepareSundayDelivery({edition,sunday:'2026-11-08',now,readers:[reader(1,'Pacific/Kiritimati'),reader(2,'America/New_York'),reader(3,'America/New_York'),reader(4,'Etc/GMT+12')]});
  assert.equal(plan.status,'prepared_not_scheduled');assert.equal(plan.mutations,0);assert.equal(plan.batches.length,3);assert.equal(plan.prepareBy,'2026-11-07T04:00:00.000Z');
  assert.deepEqual(plan.batches[1].subscriberIds,['2','3']);assert.equal(plan.held.length,0);
  assert.equal(plan.batches[2].sendAt,'2026-11-09T06:00:00.000Z');
});
test('unsubscribed, unconfirmed, unpaid, stale and late readers never enter a send cohort',()=>{
  const readers=[reader(1,'UTC',{mailerliteStatus:'unsubscribed'}),reader(2,'UTC',{stripeAccess:false}),reader(3,'UTC',{inPaidGroup:false}),reader(4,'UTC',{timezoneConfirmed:false}),reader(5,'UTC',{eligibilityCheckedAt:'2026-11-03T00:00:00Z'}),reader(6,'Mars')];
  const plan=prepareSundayDelivery({edition,sunday:'2026-11-08',now,readers});assert.equal(plan.batches.length,0);assert.equal(plan.held.length,6);
  const late=new Date('2026-11-08T17:00:00Z');const held=prepareSundayDelivery({edition,sunday:'2026-11-08',now:late,readers:[reader(7,'UTC',{eligibilityCheckedAt:late.toISOString()})]});assert.match(held.held[0].reason,/deadline/);
});
test('unapproved content and duplicate member/subscriber mappings block preparation',()=>{
  assert.throws(()=>prepareSundayDelivery({edition:{...edition,status:'draft'},sunday:'2026-11-08',now,readers:[]}));
  assert.throws(()=>prepareSundayDelivery({edition,sunday:'2026-11-09',now,readers:[]}));
  assert.throws(()=>prepareSundayDelivery({edition,sunday:'2026-11-08',now,readers:[reader(1,'UTC'),reader(1,'America/New_York')]}));
  assert.throws(()=>prepareSundayDelivery({edition,sunday:'2026-11-08',now,readers:[reader(1,'UTC'),reader(2,'UTC',{subscriberId:'1'})]}));
});

#!/usr/bin/env node
// BADEL authorization + negative-path tests.
// Proves the server, not just the UI, enforces:
//   * ownership (items, profile)
//   * trade participant-only access and transitions
//   * private-message privacy
//   * suspension, blocking, rating and completion guards
//
// Usage: node scripts/authz-test.mjs   (server must be running)

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';

function makeClient() {
  let cookie = '';
  return {
    async api(method, path, body) {
      const res = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
      const sc = res.headers.get('set-cookie');
      const m = /^([^;=]+)=([^;]*)/.exec(sc ?? '');
      if (m) cookie = `${m[1]}=${m[2]}`;
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data };
    },
    // raw binary request (for the upload endpoint)
    async raw(method, path, buf) {
      const res = await fetch(BASE + path, {
        method, headers: { 'Content-Type': 'image/jpeg', cookie }, body: buf,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data };
    },
  };
}

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
async function expectStatus(client, method, path, body, want, name) {
  const r = await client.api(method, path, body);
  check(name, r.status === want, `got ${r.status}, wanted ${want} (${JSON.stringify(r.data)?.slice(0, 120)})`);
  return r;
}

const A = makeClient();   // attacker / sender
const B = makeClient();   // victim / recipient
const C = makeClient();   // unrelated third party
const S = makeClient();   // will be suspended
const admin = makeClient();
const anon = makeClient();
const uniq = Date.now().toString(36);

async function newUser(client, tag) {
  const r = await client.api('POST', '/api/auth/signup', {
    username: `${tag}_${uniq}`, display_name: `Authz ${tag}`,
    email: `${tag}_${uniq}@test.tn`, password: 'authz-pass-123',
  });
  await client.api('POST', '/api/auth/verify', { code: r.data.demo_email_code });
  return r.data.user;
}

async function listItem(client, title, slug, wantSlug) {
  const r = await client.api('POST', '/api/items', {
    title, description: `${title} — described in enough detail for validation.`,
    category_slug: slug, condition: 'good', location: 'Tunis',
    latitude: 36.8065, longitude: 10.1815,
    wanted: [{ category_slug: wantSlug, keywords: 'something' }],
  });
  return r.data.id;
}

console.log('\n== Setup ==');
const userA = await newUser(A, 'aa');
const userB = await newUser(B, 'bb');
const userC = await newUser(C, 'cc');
const userS = await newUser(S, 'ss');
check('three users + one to suspend created', !!(userA?.id && userB?.id && userC?.id && userS?.id));

const itemA = await listItem(A, 'Authz Test Console', 'gaming', 'cameras');
const itemB = await listItem(B, 'Authz Test Camera', 'cameras', 'gaming');
const itemB2 = await listItem(B, 'Authz Test Second Camera', 'cameras', 'gaming');
const itemA2 = await listItem(A, 'Authz Test Second Console', 'gaming', 'cameras');
check('items created', !!(itemA && itemB && itemB2 && itemA2));

console.log('\n1. Ownership — A cannot touch B\'s listings');
await expectStatus(A, 'PUT', `/api/items/${itemB}`, {
  title: 'Hijacked title', description: 'Someone else\'s description text here.', category_slug: 'cameras', condition: 'good', location: 'Tunis', wanted: [],
}, 403, 'A cannot edit B\'s item');
await expectStatus(A, 'DELETE', `/api/items/${itemB}`, undefined, 403, 'A cannot delete B\'s item');
await expectStatus(A, 'PATCH', `/api/items/${itemB}/status`, { status: 'unavailable' }, 403, 'A cannot change B\'s item status');
await expectStatus(A, 'POST', `/api/items/${itemB}/photos`, { storage_path: '/uploads/x.jpg' }, 403, 'A cannot add photos to B\'s item');
await expectStatus(A, 'DELETE', `/api/items/${itemB}/photos/some-id`, undefined, 403, 'A cannot delete B\'s photos');
await expectStatus(A, 'POST', `/api/items/${itemB}/photos/reorder`, { photo_ids: [] }, 403, 'A cannot reorder B\'s photos');

console.log('\n2. Profile integrity');
await expectStatus(A, 'PATCH', `/api/users/${userB.username}`, { bio: 'hacked' }, 404, 'no cross-user profile endpoint exists');
const bBefore = (await B.api('GET', `/api/users/${userB.username}`)).data;
await A.api('PATCH', '/api/me', { bio: 'A changed only their own bio' });
const bAfter = (await B.api('GET', `/api/users/${userB.username}`)).data;
check('B\'s bio untouched by A\'s profile edit', bAfter.bio === bBefore.bio);

console.log('\n3. Trade privacy — third parties see nothing');
const offer = await A.api('POST', '/api/offers', {
  offered_item_id: itemA, requested_item_id: itemB,
  message: 'Salam! Console for camera?',
});
const tradeId = offer.data.id;
check('offer sent by A to B', offer.status === 201 && tradeId);
await expectStatus(C, 'GET', `/api/offers/${tradeId}`, undefined, 403, 'C cannot read the trade detail');
await expectStatus(C, 'GET', `/api/offers/${tradeId}/messages`, undefined, 403, 'C cannot read A↔B private messages');
await expectStatus(C, 'POST', `/api/offers/${tradeId}/messages`, { body: 'let me in' }, 403, 'C cannot post into A↔B chat');
await expectStatus(C, 'POST', `/api/offers/${tradeId}/accept`, undefined, 403, 'C cannot accept A↔B trade');
await expectStatus(C, 'POST', `/api/offers/${tradeId}/rate`, { reliability: 5, communication: 5, item_accuracy: 5, overall: 5 }, 403, 'C cannot rate A↔B trade');
await expectStatus(A, 'POST', `/api/offers/${tradeId}/accept`, undefined, 409, 'sender cannot accept their own offer (recipient-only)');

console.log('\n4. Completion & rating guards');
await expectStatus(B, 'POST', `/api/offers/${tradeId}/exchange/confirm`, undefined, 409, 'exchange confirm refused before meetup stage');
await expectStatus(B, 'POST', `/api/offers/${tradeId}/rate`, { reliability: 5, communication: 5, item_accuracy: 5, overall: 5 }, 409, 'rating refused before completion');
const acc = await B.api('POST', `/api/offers/${tradeId}/accept`);
check('B accepts (legal transition)', acc.status === 200 && acc.data.status === 'accepted');
await expectStatus(B, 'POST', `/api/offers/${tradeId}/exchange/confirm`, undefined, 409, 'exchange confirm refused while only accepted (no meetup)');
const meet = await B.api('POST', `/api/offers/${tradeId}/meetup`, {
  location_name: 'Café de Paris, Tunis', meet_date: '2026-08-25', meet_time: '18:00', notes: 'Public place, terrace.',
});
check('meetup proposed', meet.status === 200 && meet.data.status === 'meetup');
const m1 = await A.api('POST', `/api/offers/${tradeId}/meetup/confirm`);
check('one side confirms meetup', m1.status === 200 && m1.data.meetup.from_confirmed === 1);
await expectStatus(A, 'POST', `/api/offers/${tradeId}/exchange/confirm`, undefined, 409, 'fake completion refused — meetup not fully confirmed');
const m2 = await B.api('POST', `/api/offers/${tradeId}/meetup/confirm`);
check('both confirm meetup', m2.status === 200 && m2.data.meetup.status === 'confirmed');
const e1 = await A.api('POST', `/api/offers/${tradeId}/exchange/confirm`);
check('first exchange confirm — still awaiting second side', e1.status === 200 && e1.data.status === 'meetup');
const e2 = await B.api('POST', `/api/offers/${tradeId}/exchange/confirm`);
check('both confirm exchange → completed', e2.status === 200 && e2.data.status === 'completed');
const r1 = await A.api('POST', `/api/offers/${tradeId}/rate`, { reliability: 5, communication: 5, item_accuracy: 5, overall: 5 });
check('A rates the completed trade', r1.status === 200 && !!r1.data.my_rating);
await expectStatus(A, 'POST', `/api/offers/${tradeId}/rate`, { reliability: 1, communication: 1, item_accuracy: 1, overall: 1 }, 409, 'duplicate rating refused');
await expectStatus(A, 'POST', `/api/offers/${tradeId}/exchange/confirm`, undefined, 409, 'completed trade immutable — cannot re-confirm');

console.log('\n5. Cancelled / declined trades are dead ends');
const o2 = await A.api('POST', '/api/offers', {
  offered_item_id: itemA2, requested_item_id: itemB2, message: 'Second console for your second camera?',
});
const t2 = o2.data.id;
const dec = await B.api('POST', `/api/offers/${t2}/decline`);
check('B declines', dec.status === 200 && dec.data.status === 'declined');
await expectStatus(A, 'POST', `/api/offers/${t2}/accept`, undefined, 409, 'cannot accept a declined trade');
await expectStatus(B, 'POST', `/api/offers/${t2}/messages`, { body: 'still here?' }, 409, 'messaging closed on declined trade');
const c0 = await A.api('POST', `/api/offers/${t2}/cancel`);
check('declined trade rejects cancel (no transition)', c0.status === 409);

console.log('\n6. Blocking');
// B blocks A → A cannot message B on a fresh trade
const o3 = await A.api('POST', '/api/offers', {
  offered_item_id: itemA2, requested_item_id: itemB2, message: 'Trying again with a fresh trade.',
});
const t3 = o3.data.id;
await B.api('POST', `/api/users/${userA.id}/block`);
await expectStatus(A, 'POST', `/api/offers/${t3}/messages`, { body: 'hello?' }, 403, 'blocked user cannot message');
const itemA4 = await listItem(A, 'Authz Test Fourth Console', 'gaming', 'cameras');
const itemB4 = await listItem(B, 'Authz Test Fourth Camera', 'cameras', 'gaming');
const o4 = await A.api('POST', '/api/offers', {
  offered_item_id: itemA4, requested_item_id: itemB4, message: 'Should be blocked by B\'s block too.',
});
check('blocked user cannot send new offers', o4.status === 403, `got ${o4.status}`);

console.log('\n7. Deleted item with an active trade');
// B blocked A in section 6 — lift it so new offers can be sent.
await B.api('POST', `/api/users/${userA.id}/unblock`);
const itemA3 = await listItem(A, 'Authz Test Third Console', 'gaming', 'cameras');
const itemB3 = await listItem(B, 'Authz Test Third Camera', 'cameras', 'gaming');
const o5 = await A.api('POST', '/api/offers', {
  offered_item_id: itemA3, requested_item_id: itemB3, message: 'One more trade.',
});
const t5 = o5.data.id;
await expectStatus(A, 'DELETE', `/api/items/${itemA3}`, undefined, 409, 'cannot delete item with active offer');
await expectStatus(A, 'PUT', `/api/items/${itemA3}`, {
  title: 'Edit during trade', description: 'This edit should be refused while the offer is active.', category_slug: 'gaming', condition: 'good', location: 'Tunis', wanted: [],
}, 409, 'cannot edit item with active offer');
await A.api('POST', `/api/offers/${t5}/cancel`);
const del = await A.api('DELETE', `/api/items/${itemA3}`);
check('after cancelling the trade the item can be deleted', del.status === 200);

console.log('\n8. Suspension');
await admin.api('POST', '/api/auth/login', { email: 'admin@badel.tn', password: 'badel-admin' });
const sus = await admin.api('PATCH', `/api/admin/users/${userS.id}`, { role: 'suspended' });
check('admin suspends S', sus.status === 200);
await expectStatus(S, 'GET', '/api/offers', undefined, 403, 'suspended user blocked from all authed routes');
await expectStatus(S, 'POST', '/api/items', {
  title: 'Should not work', description: 'Suspended users cannot create listings.', category_slug: 'gaming', condition: 'good', location: 'Tunis', wanted: [],
}, 403, 'suspended user cannot create listings');
await expectStatus(S, 'GET', '/api/items/mine', undefined, 403, 'suspended user cannot read own items');
const reLogin = await S.api('POST', '/api/auth/login', { email: `ss_${uniq}@test.tn`, password: 'authz-pass-123' });
check('suspended user cannot even log in', reLogin.status === 403);

console.log('\n9. Admin gating');
await expectStatus(C, 'GET', '/api/admin/stats', undefined, 403, 'normal user blocked from admin stats');
await expectStatus(C, 'GET', '/api/admin/users', undefined, 403, 'normal user blocked from admin users');
await expectStatus(C, 'PATCH', '/api/admin/users/someone', { role: 'admin' }, 403, 'normal user cannot self-promote');
const stats = await admin.api('GET', '/api/admin/stats');
check('admin can read stats', stats.status === 200 && stats.data.users > 0);

console.log('\n10. Auth & input hardening');
await expectStatus(anon, 'GET', '/api/items/mine', undefined, 401, 'unauthenticated request rejected');
const badLogin = await anon.api('POST', '/api/auth/login', { email: 'nobody@test.tn', password: 'wrong' });
check('unknown credentials rejected', badLogin.status === 401);
const big = await B.raw('POST', '/api/items/uploads/photo', Buffer.alloc(11 * 1024 * 1024));
check('oversized upload rejected', big.status === 400, `got ${big.status}`);
const small = await B.raw('POST', '/api/items/uploads/photo', Buffer.alloc(1024));
check('valid image upload accepted', small.status === 201, `got ${small.status} ${JSON.stringify(small.data)?.slice(0, 80)}`);
const badItem = await B.api('POST', '/api/items', { title: 'x', description: 'short' });
check('invalid item rejected', badItem.status === 400);

console.log(`\n${'='.repeat(50)}\nAUTHZ TEST: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

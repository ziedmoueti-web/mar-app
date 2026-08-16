#!/usr/bin/env node
// BADEL API smoke test — exercises the full flow:
// signup → verify → list item → search → offer → accept → meetup → confirm →
// exchange confirm (both) → completed → rate both sides.
// Also asserts double-booking prevention.
//
// Usage: node scripts/smoke-api.mjs   (server must be running on :8787)

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
      if (!res.ok) {
        const err = new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
  };
}

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
async function expectError(client, method, path, body, wantStatus, name) {
  try {
    await client.api(method, path, body);
    check(name, false, '(no error thrown)');
  } catch (e) {
    check(name, e.status === wantStatus, `got ${e.status}, wanted ${wantStatus}`);
  }
}

const buyer = makeClient();
const seller = makeClient();
const uniq = Date.now().toString(36);
let myItemId;
let ahmedItemId;
let tradeId;
let sellerUserId;

async function newUser(client, tag) {
  const s = await client.api('POST', '/api/auth/signup', {
    username: `${tag}_${uniq}`,
    display_name: `Smoke ${tag}`,
    email: `${tag}_${uniq}@test.tn`,
    password: 'smoke-pass-123',
  });
  await client.api('POST', '/api/auth/verify', { code: s.demo_email_code });
  return s.user;
}

console.log('\n1. Auth');
const buyerUser = await newUser(buyer, 'buyer');
check('signup creates session', !!buyerUser?.id);
const me = await buyer.api('GET', '/api/auth/me');
check('email verification flips status', me.user.verification_status === 'verified');

const bad = await buyer.api('POST', '/api/auth/login', {
  email: 'demo@badel.tn', password: 'wrong-password',
}).catch((e) => e);
check('wrong password rejected', bad.status === 401);

console.log('\n2. Listings');
const cats = await buyer.api('GET', '/api/categories');
const cameras = cats.categories.find((c) => c.slug === 'cameras');
const item = await buyer.api('POST', '/api/items', {
  title: 'Smoke Test Console', description: 'A console for the smoke test, works perfectly.',
  category_slug: 'gaming', condition: 'good', location: 'Tunis',
  latitude: 36.8065, longitude: 10.1815,
  wanted: [{ category_slug: 'cameras', keywords: 'DSLR camera' }],
  value_min: 500, value_max: 700,
});
myItemId = item.id;
check('item created', !!myItemId && item.status === 'active');
check('wanted structured', item.wanted.length === 1 && item.wanted[0].wanted_category_id === cameras.id);

// Seller creates their own camera so the test is fully self-contained
const sellerUser = await newUser(seller, 'seller');
sellerUserId = sellerUser.id;
const sellerItem = await seller.api('POST', '/api/items', {
  title: 'Smoke Test DSLR Camera', description: 'A camera body with kit lens for the smoke test.',
  category_slug: 'cameras', condition: 'good', location: 'Megrine',
  latitude: 36.7672, longitude: 10.2292,
  wanted: [{ category_slug: 'gaming', keywords: 'console' }],
  value_min: 400, value_max: 600,
});
ahmedItemId = sellerItem.id;
check('seller item created', !!ahmedItemId);

const search = await buyer.api('GET', `/api/items?q=camera&sort=newest`);
const found = search.items.find((i) => i.id === sellerItem.id);
check('server-side search finds camera', !!found);
check('search result carries match metadata', typeof found.match_score === 'number');

await expectError(buyer, 'POST', '/api/items', { title: 'x' }, 400, 'invalid item rejected');

console.log('\n3. Offers & double-booking');
const offer = await buyer.api('POST', '/api/offers', {
  offered_item_id: myItemId,
  requested_item_id: ahmedItemId,
  message: 'Salam! My console for your Canon camera?',
});
tradeId = offer.id;
check('offer sent', offer.status === 'pending');

await expectError(buyer, 'POST', '/api/offers', {
  offered_item_id: myItemId,
  requested_item_id: ahmedItemId,
  message: 'duplicate attempt',
}, 409, 'duplicate offer rejected');

// buyer tries to offer the busy console again for a different item
const otherItem = (await buyer.api('GET', `/api/items?q=bicycle&sort=newest`)).items[0];
await expectError(buyer, 'POST', '/api/offers', {
  offered_item_id: myItemId,
  requested_item_id: otherItem.id,
  message: 'trying to double book',
}, 409, 'double-booking rejected (item busy)');

console.log('\n4. Accept → meetup → exchange → complete');
// (seller is already signed in from account creation)
const incoming = await seller.api('GET', '/api/offers?scope=incoming');
check('offer visible in incoming', incoming.offers.some((o) => o.id === tradeId));

const accepted = await seller.api('POST', `/api/offers/${tradeId}/accept`);
check('offer accepted', accepted.status === 'accepted');

// Can the buyer cancel after acceptance? Yes — but let's not; continue happy path.
const m = await seller.api('POST', `/api/offers/${tradeId}/meetup`, {
  location_name: 'Café de Paris, Tunis', meet_date: '2026-08-20', meet_time: '18:00',
  notes: 'By the terrace. Public place!', latitude: 36.8008, longitude: 10.1813,
});
check('meetup proposed', m.meetup?.status === 'proposed' && m.status === 'meetup');

const c1 = await buyer.api('POST', `/api/offers/${tradeId}/meetup/confirm`);
check('buyer confirmed meetup', c1.meetup.from_confirmed === 1);
const c2 = await seller.api('POST', `/api/offers/${tradeId}/meetup/confirm`);
check('meetup fully confirmed', c2.meetup.status === 'confirmed');

// Messaging works during the exchange
const msg0 = await buyer.api('POST', `/api/offers/${tradeId}/messages`, { body: 'Is tomorrow at 18:00 okay?' });
check('message sent during exchange', !!msg0.message?.id);
const msgs0 = await buyer.api('GET', `/api/offers/${tradeId}/messages`);
check('messages listed', msgs0.messages.length >= 1);

const e1 = await buyer.api('POST', `/api/offers/${tradeId}/exchange/confirm`);
check('buyer confirmed exchange — awaiting other side', e1.status === 'meetup' && e1.my_exchange_confirmed === true);
const e2 = await seller.api('POST', `/api/offers/${tradeId}/exchange/confirm`);
check('trade completed after both confirm', e2.status === 'completed');

const detail = await buyer.api('GET', `/api/offers/${tradeId}`);
check('detail reflects completion', detail.status === 'completed' && detail.completed_at != null);
check('can_rate true', detail.can_rate === true);

const myItem = await buyer.api('GET', `/api/items/${myItemId}`);
check('item marked traded', myItem.status === 'traded');

console.log('\n5. Messaging closed after completion');
await expectError(buyer, 'POST', `/api/offers/${tradeId}/messages`, { body: 'hello after done' }, 409, 'messaging closed after completion');

console.log('\n6. Ratings');
const r1 = await buyer.api('POST', `/api/offers/${tradeId}/rate`, {
  reliability: 5, communication: 5, item_accuracy: 5, overall: 5, comment: 'Perfect trade',
});
check('buyer rated trade', !!r1.my_rating || r1.status === 'completed');
await expectError(buyer, 'POST', `/api/offers/${tradeId}/rate`, {
  reliability: 5, communication: 5, item_accuracy: 5, overall: 5,
}, 409, 'double rating rejected');
const r2 = await seller.api('POST', `/api/offers/${tradeId}/rate`, {
  reliability: 4, communication: 5, item_accuracy: 4, overall: 4,
}).catch((e) => e);
check('seller rated trade', !(r2 instanceof Error));
const profile = await seller.api('GET', `/api/users/buyer_${uniq}`);
check('buyer profile shows rating', profile.rating != null && profile.rating_count >= 1);

console.log('\n7. Reports & notifications & admin');
await expectError(buyer, 'POST', '/api/reports', { reason: 'scam', details: 'short' }, 400, 'short report rejected');
const rep = await buyer.api('POST', '/api/reports', {
  reason: 'fake_listing', details: 'This listing looks like a copy of another item I saw.',
  item_id: ahmedItemId,
});
check('report submitted', rep.ok === true);

const notifs = await buyer.api('GET', '/api/notifications');
check('notifications present', notifs.notifications.length > 0);

await expectError(buyer, 'GET', '/api/admin/stats', undefined, 403, 'non-admin blocked from admin API');

const admin = makeClient();
await admin.api('POST', '/api/auth/login', { email: 'admin@badel.tn', password: 'badel-admin' });
const stats = await admin.api('GET', '/api/admin/stats');
check('admin stats', stats.users > 0 && stats.items > 0);
const reports = await admin.api('GET', '/api/admin/reports');
check('admin sees reports', reports.reports.some((r) => r.reason === 'fake_listing'));

console.log(`\n${'='.repeat(50)}\nSMOKE TEST: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

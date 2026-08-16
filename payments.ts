// =============================================================
// Payment abstraction.
//
// Badel never hard-codes the $5 fee into business logic. The
// membership upgrade goes through a PaymentProvider interface so a
// real provider (Stripe, etc.) can be dropped in later without
// touching the rest of the app.
//
// The demo provider is explicitly MOCK: it records a simulated
// payment and never claims a real charge was processed.
// =============================================================

import { getDb, uid, now } from './db.js';
import type { MembershipStatus } from '../shared/types.js';

export interface PaymentProvider {
  readonly id: string;
  readonly mock: boolean;
  /** Creates a payment intent for a membership purchase. */
  createIntent(opts: { userId: string; plan: MembershipPlan }): PaymentIntentRecord;
  /** Confirms (charges) the intent. */
  confirmIntent(intentId: string): { ok: boolean; reference: string };
}

export type MembershipPlan = 'verified' | 'premium';

export interface PaymentIntentRecord {
  id: string;
  userId: string;
  plan: MembershipPlan;
  amount: number;
  currency: string;
  description: string;
  status: 'created' | 'paid';
  mock: boolean;
}

export interface PaymentRecord {
  id: string;
  user_id: string;
  provider: string;
  method: string;
  amount: number;
  currency: string;
  reference: string;
  status: string;
  created_at: number;
}

const PLANS: Record<MembershipPlan, { amount: number; currency: string; description: string }> = {
  verified: { amount: 5, currency: 'USD', description: 'Badel verification & membership (one-time)' },
  premium: { amount: 5, currency: 'USD', description: 'Badel premium membership (one-time)' },
};

class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';
  readonly mock = true;

  createIntent(opts: { userId: string; plan: MembershipPlan }): PaymentIntentRecord {
    const p = PLANS[opts.plan];
    return {
      id: uid(),
      userId: opts.userId,
      plan: opts.plan,
      amount: p.amount,
      currency: p.currency,
      description: p.description,
      status: 'created',
      mock: true,
    };
  }

  confirmIntent(intentId: string): { ok: boolean; reference: string } {
    void intentId;
    // Simulated payment — no real charge occurs.
    return { ok: true, reference: `MOCK-${uid().slice(0, 12).toUpperCase()}` };
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();

export function recordPayment(rec: Omit<PaymentRecord, 'id' | 'created_at'>): PaymentRecord {
  const full: PaymentRecord = { id: uid(), created_at: now(), ...rec };
  getDb().prepare(`
    INSERT INTO payments (id, user_id, provider, method, amount, currency, reference, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(full.id, full.user_id, full.provider, full.method, full.amount, full.currency, full.reference, full.status, full.created_at);
  return full;
}

export function upgradeMembership(userId: string, plan: MembershipPlan): void {
  if (plan === 'premium') {
    getDb().prepare("UPDATE users SET membership_status = 'premium' WHERE id = ?").run(userId);
  } else {
    getDb().prepare("UPDATE users SET membership_status = 'verified' WHERE id = ?").run(userId);
  }
  getDb().prepare("UPDATE users SET verification_status = 'verified' WHERE id = ? AND verification_status != 'verified'").run(userId);
}

export function membershipStatusOf(userId: string): MembershipStatus {
  const r = getDb().prepare('SELECT membership_status FROM users WHERE id = ?').get(userId) as
    | { membership_status: MembershipStatus }
    | undefined;
  return r?.membership_status ?? 'free';
}

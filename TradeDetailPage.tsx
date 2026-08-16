import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import type { Rating, TradeDetail } from '@shared/types';
import {
  Avatar, ConfirmDialog, ErrorState, Field, Modal, Stars, StatusPill, VerifiedBadge, timeAgo,
} from '../components/ui';
import { Icon } from '../components/Icon';

const STEPS = [
  { key: 'pending', label: 'Offer sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'meetup', label: 'Arrange exchange' },
  { key: 'exchange', label: 'Exchange confirmed' },
  { key: 'completed', label: 'Completed' },
];

function stepIndex(o: TradeDetail): number {
  if (o.status === 'completed') return 4;
  if (o.status === 'meetup') {
    if (o.my_exchange_confirmed || o.their_exchange_confirmed) return 3;
    return 2;
  }
  if (o.status === 'accepted') return 1;
  return 0;
}

export function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();

  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [meetupOpen, setMeetupOpen] = useState(false);
  const [meetupForm, setMeetupForm] = useState({ location_name: '', meet_date: '', meet_time: '', notes: '' });

  const [rateOpen, setRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ reliability: 5, communication: 5, item_accuracy: 5, overall: 5, comment: '' });

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<TradeDetail>(`/api/offers/${id}`)
      .then((t) => {
        setTrade(t);
        setMsg('');
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [trade?.messages.length]);

  const act = async (path: string, body?: unknown, successMsg?: string) => {
    setBusy(true);
    try {
      await api.post(path, body);
      if (successMsg) toast(successMsg, 'success');
      await load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    const text = msg.trim();
    setMsg('');
    try {
      await api.post(`/api/offers/${id}/messages`, { body: text });
      await api.post(`/api/offers/${id}/messages/read`).catch(() => {});
      await load();
    } catch (err) {
      toast(apiErrorMessage(err), 'error');
      setMsg(text);
    }
  };

  const submitMeetup = () => {
    void act(
      `/api/offers/${id}/meetup`,
      {
        location_name: meetupForm.location_name,
        meet_date: meetupForm.meet_date,
        meet_time: meetupForm.meet_time,
        notes: meetupForm.notes,
        latitude: null,
        longitude: null,
      },
      'Exchange proposal sent — the other person needs to confirm.'
    ).then(() => setMeetupOpen(false));
  };

  const submitRate = async () => {
    setBusy(true);
    try {
      await api.post(`/api/offers/${id}/rate`, rateForm);
      toast('Thanks — your rating was saved.', 'success');
      setRateOpen(false);
      await load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!trade) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  if (!user) return null;

  const mine = trade.from_user_id === user.id;
  const other = trade.counterpart;
  const idx = stepIndex(trade);
  const meetupConfirmed = trade.meetup?.status === 'confirmed';
  const iConfirmedMeetup = trade.meetup && (mine ? trade.meetup.from_confirmed === 1 : trade.meetup.to_confirmed === 1);
  const iConfirmedExchange = mine ? trade.my_exchange_confirmed : trade.my_exchange_confirmed;
  const chatOpen = !['completed', 'declined', 'cancelled'].includes(trade.status);

  const ratingBars: { key: keyof Omit<Rating, 'id' | 'trade_id' | 'rater_id' | 'ratee_id' | 'comment' | 'created_at'>; label: string }[] = [
    { key: 'reliability', label: 'Reliability' },
    { key: 'communication', label: 'Communication' },
    { key: 'item_accuracy', label: 'Item accuracy' },
    { key: 'overall', label: 'Overall' },
  ];

  return (
    <div className="page">
      <Link to="/trades" className="icon-btn" style={{ marginLeft: -8 }} aria-label="Back to trades">
        <Icon.arrowL size={20} />
      </Link>

      <div className="row-between mt-1">
        <div className="row" style={{ gap: 10 }}>
          <Avatar user={other} size={38} ring={other.verification_status === 'verified'} />
          <div>
            <div className="row" style={{ gap: 5 }}>
              <span className="bold">{other.display_name}</span>
              {other.verification_status === 'verified' && <VerifiedBadge />}
            </div>
            <div className="tiny muted">{other.location || 'Tunisia'} · {other.completed_trades} trades</div>
          </div>
        </div>
        <StatusPill status={trade.status} />
      </div>

      {/* Stepper */}
      <div className="card mt-2">
        <div className="row" style={{ justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '8%', right: '8%', top: 12, height: 2, background: 'var(--surface-3)' }} />
          <div style={{ position: 'absolute', left: '8%', right: '8%', top: 12, height: 2, background: 'var(--ochre)', width: `${(idx / (STEPS.length - 1)) * 84}%`, transition: 'width 0.4s var(--ease)' }} />
          {STEPS.map((s, i) => (
            <div key={s.key} className="center" style={{ zIndex: 1, width: '20%' }}>
              <div
                className="center"
                style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: i <= idx ? 'var(--grad-brand)' : 'var(--surface-3)',
                  color: i <= idx ? '#221503' : 'var(--text-mute)',
                  fontWeight: 800, fontSize: 12, margin: '0 auto',
                  display: 'grid', placeItems: 'center',
                }}
              >
                {i < idx ? <Icon.check size={13} strokeWidth={3} /> : i + 1}
              </div>
              <div className="tiny mt-1" style={{ color: i <= idx ? 'var(--text)' : 'var(--text-mute)', fontSize: 10.5 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Items swap */}
      <div className="card mt-2">
        <div className="row" style={{ gap: 10 }}>
          <Link to={`/items/${trade.offered_item?.id}`} className="grow">
            <div className="trade-card__thumb" style={{ width: '100%', aspectRatio: '4/3', height: 'auto', overflow: 'hidden' }}>
              {trade.offered_item?.photos[0] ? (
                <img src={trade.offered_item.photos[0].storage_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : <span style={{ display: 'grid', placeItems: 'center', height: '100%' }}>📦</span>}
            </div>
            <div className="tiny mt-1">{mine ? 'You give' : 'They give'}</div>
            <div className="small bold mt-1">{trade.offered_item?.title ?? 'Removed item'}</div>
          </Link>
          <div className="trade-card__arrow center" style={{ fontSize: 22 }}>⇄</div>
          <Link to={`/items/${trade.requested_item?.id}`} className="grow">
            <div className="trade-card__thumb" style={{ width: '100%', aspectRatio: '4/3', height: 'auto', overflow: 'hidden' }}>
              {trade.requested_item?.photos[0] ? (
                <img src={trade.requested_item.photos[0].storage_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : <span style={{ display: 'grid', placeItems: 'center', height: '100%' }}>📦</span>}
            </div>
            <div className="tiny mt-1">{mine ? 'You receive' : 'They receive'}</div>
            <div className="small bold mt-1">{trade.requested_item?.title ?? 'Removed item'}</div>
          </Link>
        </div>
        {trade.message && (
          <p className="small dim mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            “{trade.message}”
          </p>
        )}
      </div>

      {/* Actions */}
      {trade.status === 'pending' && (
        <div className="card mt-2">
          <p className="small dim mb-2">This offer is waiting for {mine ? `${other.display_name} to respond.` : 'your response.'}</p>
          {mine ? (
            <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => { setCancelOpen(true); }}>
              Cancel offer
            </button>
          ) : (
            <div className="row">
              <button className="btn btn--ghost grow" disabled={busy} onClick={() => void act(`/api/offers/${id}/decline`, undefined, 'Offer declined.')}>
                Decline
              </button>
              <button className="btn btn--primary grow" disabled={busy} onClick={() => void act(`/api/offers/${id}/accept`, undefined, 'Offer accepted — arrange the exchange.')}>
                Accept trade
              </button>
            </div>
          )}
        </div>
      )}

      {(trade.status === 'accepted' || trade.status === 'meetup') && (
        <div className="card mt-2">
          <div className="small bold mb-2">Next step: arrange the exchange</div>
          {!trade.meetup ? (
            <button className="btn btn--primary btn--block" onClick={() => setMeetupOpen(true)}>
              <Icon.mapPin size={16} /> Propose a meetup
            </button>
          ) : (
            <div className={`meetup-card ${trade.meetup.status === 'confirmed' ? '' : 'meetup-card--pending'}`}>
              <div className="row-between">
                <div className="bold small">{trade.meetup.status === 'confirmed' ? '✓ Meetup confirmed' : 'Meetup proposed'}</div>
                <span className="badge badge--mute">
                  {iConfirmedMeetup ? 'you confirmed' : 'awaiting your confirmation'}
                </span>
              </div>
              <div className="small dim mt-2" style={{ display: 'grid', gap: 4 }}>
                <div className="row" style={{ gap: 6 }}><Icon.mapPin size={13} /> {trade.meetup.location_name}</div>
                {trade.meetup.meet_date && (
                  <div className="row" style={{ gap: 6 }}><Icon.clock size={13} /> {trade.meetup.meet_date}{trade.meetup.meet_time ? ` at ${trade.meetup.meet_time}` : ''}</div>
                )}
                {trade.meetup.notes && <div style={{ marginTop: 4 }}>{trade.meetup.notes}</div>}
              </div>
              <div className="row mt-2 wrap">
                <span className={`badge ${trade.meetup.from_confirmed === 1 ? 'badge--teal' : 'badge--mute'}`}>
                  {mine ? 'You' : other.display_name}: {trade.meetup.from_confirmed === 1 ? 'confirmed' : 'not yet'}
                </span>
                <span className={`badge ${trade.meetup.to_confirmed === 1 ? 'badge--teal' : 'badge--mute'}`}>
                  {!mine ? 'You' : other.display_name}: {trade.meetup.to_confirmed === 1 ? 'confirmed' : 'not yet'}
                </span>
              </div>
              <div className="row mt-2" style={{ gap: 8 }}>
                {!iConfirmedMeetup && trade.meetup.status !== 'cancelled' && (
                  <button className="btn btn--teal btn--sm" disabled={busy} onClick={() => void act(`/api/offers/${id}/meetup/confirm`, undefined, 'Meetup confirmed. See you there!')}>
                    Confirm meetup
                  </button>
                )}
                <button className="btn btn--ghost btn--sm" onClick={() => setMeetupOpen(true)}>Propose change</button>
                <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void act(`/api/offers/${id}/meetup/cancel`)}>
                  Cancel meetup
                </button>
              </div>
            </div>
          )}
          <div className="safety-note mt-2">
            <Icon.shield size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Meet in a public place — a café, a mall, a police-adjacent square. Never share your home address.</span>
          </div>
        </div>
      )}

      {trade.status === 'meetup' && meetupConfirmed && (
        <div className="card mt-2" style={{ borderColor: 'rgba(47,181,154,0.4)' }}>
          <div className="small bold mb-1">Exchange step</div>
          <p className="small dim">
            You met and swapped the items? Confirm on both sides to complete the trade. Nobody can complete it alone.
          </p>
          {iConfirmedExchange ? (
            <div className="badge badge--teal mt-1">You confirmed — waiting for {other.display_name}.</div>
          ) : (
            <button className="btn btn--teal btn--block mt-1" disabled={busy} onClick={() => void act(`/api/offers/${id}/exchange/confirm`, undefined, 'Exchange confirmed on your side.')}>
              <Icon.check size={16} /> I received the item — confirm
            </button>
          )}
          <div className="row mt-2 wrap">
            <span className={`badge ${trade.my_exchange_confirmed ? 'badge--teal' : 'badge--mute'}`}>You: {trade.my_exchange_confirmed ? 'confirmed' : 'not yet'}</span>
            <span className={`badge ${trade.their_exchange_confirmed ? 'badge--teal' : 'badge--mute'}`}>{other.display_name}: {trade.their_exchange_confirmed ? 'confirmed' : 'not yet'}</span>
          </div>
        </div>
      )}

      {trade.status === 'completed' && (
        <div className="card mt-2" style={{ borderColor: 'rgba(47,181,154,0.4)' }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 20 }}>🎉</span>
            <div>
              <div className="bold">Trade completed</div>
              <div className="tiny dim">Swap finished{trade.completed_at ? ` · ${timeAgo(trade.completed_at)}` : ''}</div>
            </div>
          </div>
          {trade.can_rate ? (
            <button className="btn btn--primary btn--block mt-2" onClick={() => setRateOpen(true)}>
              <Icon.star size={16} /> Rate {other.display_name}
            </button>
          ) : (
            <div className="row mt-2 wrap">
              {trade.my_rating && (
                <span className="badge badge--teal"><Stars value={trade.my_rating.overall} size={11} /> You rated {trade.my_rating.overall}/5</span>
              )}
              {trade.their_rating && (
                <span className="badge badge--ochre"><Stars value={trade.their_rating.overall} size={11} /> {other.display_name} rated {trade.their_rating.overall}/5</span>
              )}
            </div>
          )}
        </div>
      )}

      {trade.status === 'disputed' && (
        <div className="card mt-2" style={{ borderColor: 'rgba(224,102,74,0.5)' }}>
          <div className="bold" style={{ color: 'var(--rust)' }}>⚠️ Dispute opened</div>
          <p className="small dim mt-1">{trade.dispute_reason || 'A dispute was opened on this trade.'}</p>
          <p className="tiny muted mt-1">Badel moderators have been notified and will review the case.</p>
        </div>
      )}

      {(trade.status === 'accepted' || trade.status === 'meetup') && (
        <div className="row mt-2">
          <button className="btn btn--ghost grow" onClick={() => setDisputeOpen(true)}>
            <Icon.flag size={15} /> Open dispute
          </button>
          <button className="btn btn--danger grow" onClick={() => setCancelOpen(true)}>
            <Icon.x size={15} /> Cancel trade
          </button>
        </div>
      )}

      {/* Chat */}
      <div className="card mt-3">
        <div className="row-between mb-1">
          <div className="bold small">Messages with {other.display_name}</div>
          {!chatOpen && <span className="tiny muted">closed</span>}
        </div>
        {trade.messages.length === 0 ? (
          <p className="small muted center" style={{ padding: '18px 0' }}>No messages yet — say hi 👋</p>
        ) : (
          <div className="chat" ref={chatRef}>
            {trade.messages.map((m) => (
              <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'bubble--me' : 'bubble--them'}`}>
                {m.body}
                <div className="bubble__meta">{timeAgo(m.created_at)}</div>
              </div>
            ))}
          </div>
        )}
        {chatOpen ? (
          <form className="row mt-2" onSubmit={sendMessage}>
            <input
              className="input textarea--chat"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={`Ask ${other.display_name.split(' ')[0]}… “Is tomorrow at 18:00 okay?”`}
              aria-label="Message"
            />
            <button className="btn btn--primary" type="submit" aria-label="Send" disabled={!msg.trim()}>
              <Icon.send size={16} />
            </button>
          </form>
        ) : (
          <p className="tiny muted mt-2">Messaging closes once a trade finishes.</p>
        )}
      </div>

      {/* Meetup modal */}
      <Modal open={meetupOpen} onClose={() => setMeetupOpen(false)} title="Arrange the exchange">
        <div className="safety-note mb-2">
          <Icon.shield size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Choose a busy public place. Never share your home address.</span>
        </div>
        <Field label="Public location">
          <input className="input" value={meetupForm.location_name} onChange={(e) => setMeetupForm((f) => ({ ...f, location_name: e.target.value }))} placeholder="Café de Paris, Avenue Habib Bourguiba" />
        </Field>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div className="grow">
            <Field label="Date">
              <input className="input" type="date" value={meetupForm.meet_date} onChange={(e) => setMeetupForm((f) => ({ ...f, meet_date: e.target.value }))} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Time">
              <input className="input" type="time" value={meetupForm.meet_time} onChange={(e) => setMeetupForm((f) => ({ ...f, meet_time: e.target.value }))} />
            </Field>
          </div>
        </div>
        <Field label="Notes (optional)" hint="How to recognise each other — never share sensitive details.">
          <input className="input" value={meetupForm.notes} onChange={(e) => setMeetupForm((f) => ({ ...f, notes: e.target.value }))} placeholder="I will be wearing a black jacket" />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn--ghost" onClick={() => setMeetupOpen(false)}>Cancel</button>
          <button className="btn btn--primary" disabled={busy || !meetupForm.location_name || !meetupForm.meet_date} onClick={submitMeetup}>
            Propose meetup
          </button>
        </div>
      </Modal>

      {/* Rate modal */}
      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title={`Rate ${other.display_name}`}>
        <p className="dim small mb-2">Honest ratings build trust on Badel. Each trade can only be rated once.</p>
        {ratingBars.map((r) => (
          <div key={r.key} className="row-between mb-1">
            <span className="small">{r.label}</span>
            <div className="row" style={{ gap: 2 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => setRateForm((f) => ({ ...f, [r.key]: i }))} aria-label={`${r.label}: ${i} stars`}>
                  <Icon.star size={22} filled={i <= (rateForm[r.key] as number)} style={{ color: i <= (rateForm[r.key] as number) ? 'var(--ochre)' : 'var(--surface-3)' }} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <Field label="Comment (optional)">
          <textarea className="textarea" value={rateForm.comment} onChange={(e) => setRateForm((f) => ({ ...f, comment: e.target.value }))} placeholder="How did it go?" />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn--ghost" onClick={() => setRateOpen(false)}>Later</button>
          <button className="btn btn--primary" disabled={busy} onClick={submitRate}>Submit rating</button>
        </div>
      </Modal>

      {/* Dispute modal */}
      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Open a dispute">
        <p className="dim small mb-2">Describe what went wrong. Badel moderators will review both sides of the story.</p>
        <Field label="What happened?">
          <textarea className="textarea" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="e.g. The item was not as described…" />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn--ghost" onClick={() => setDisputeOpen(false)}>Cancel</button>
          <button
            className="btn btn--danger"
            disabled={busy || disputeReason.length < 10}
            onClick={() => {
              void act(`/api/offers/${id}/dispute`, { reason: disputeReason }, 'Dispute opened — moderators were notified.');
              setDisputeOpen(false);
            }}
          >
            Open dispute
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void act(`/api/offers/${id}/cancel`, undefined, 'Trade cancelled.')}
        title="Cancel this trade?"
        body="Both items become available again. This cannot be undone."
        confirmLabel="Cancel trade"
        danger
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import type { Category, ItemWithDetails, TradeOffer, UserProfile } from '@shared/types';
import {
  Avatar, ConfirmDialog, ConditionLabel, ErrorState, Field, Modal, Stars, VerifiedBadge, formatDate, timeAgo,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { MatchPill } from '../components/ItemCard';

const REPORT_REASONS = [
  { v: 'scam', label: 'Scam' },
  { v: 'counterfeit', label: 'Counterfeit' },
  { v: 'stolen_item', label: 'Stolen item' },
  { v: 'inappropriate', label: 'Inappropriate content' },
  { v: 'harassment', label: 'Harassment' },
  { v: 'fake_listing', label: 'Fake listing' },
  { v: 'not_as_described', label: 'Item not as described' },
];

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [item, setItem] = useState<ItemWithDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [offerOpen, setOfferOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'delete' | 'hide'>('delete');
  const [busy, setBusy] = useState(false);

  // offer form
  const [myItems, setMyItems] = useState<ItemWithDetails[]>([]);
  const [offerItemId, setOfferItemId] = useState('');
  const [offerMsg, setOfferMsg] = useState('');

  // report form
  const [reportReason, setReportReason] = useState('scam');
  const [reportDetails, setReportDetails] = useState('');

  const load = useCallback(() => {
    setError(null);
    api.get<ItemWithDetails>(`/api/items/${id}`)
      .then(setItem)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [id]);

  useEffect(() => {
    load();
    setPhotoIdx(0);
  }, [load]);

  useEffect(() => {
    if (offerOpen) {
      api.get<{ items: ItemWithDetails[] }>('/api/items/mine')
        .then((r) => {
          setMyItems(r.items);
          if (r.items[0] && !offerItemId) setOfferItemId(r.items[0].id);
        })
        .catch(() => setMyItems([]));
    }
  }, [offerOpen, offerItemId]);

  const isMine = item?.owner_id === user?.id;
  const photo = item?.photos[photoIdx];

  const toggleFavorite = async () => {
    if (!item) return;
    try {
      if (item.is_favorite) {
        await api.del(`/api/items/${item.id}/favorite`);
        toast('Removed from saved.', 'success');
      } else {
        await api.post(`/api/items/${item.id}/favorite`);
        toast('Saved — we will notify you if this listing changes.', 'success');
      }
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  const sendOffer = async () => {
    if (!offerItemId || !item) return;
    setBusy(true);
    try {
      const offer = await api.post<TradeOffer>('/api/offers', {
        offered_item_id: offerItemId,
        requested_item_id: item.id,
        message: offerMsg,
      });
      toast('Offer sent — they will be notified.', 'success');
      setOfferOpen(false);
      navigate(`/trades/${offer.id}`);
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await api.post('/api/reports', {
        reason: reportReason,
        details: reportDetails,
        reported_user_id: item.owner_id,
        item_id: item.id,
      });
      toast('Report submitted — our team will review it.', 'success');
      setReportOpen(false);
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    if (!item) return;
    setBusy(true);
    try {
      if (confirmAction === 'delete') {
        await api.del(`/api/items/${item.id}`);
        toast('Listing deleted.', 'success');
        navigate('/my-items');
      } else {
        await api.patch(`/api/items/${item.id}/status`, { status: item.status === 'active' ? 'unavailable' : 'active' });
        toast(item.status === 'active' ? 'Marked unavailable.' : 'Relisted.', 'success');
        load();
      }
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const matchScore = item?.match_score ?? null;

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!item) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;

  return (
    <div className="page page--with-detail-bar">
      <Link to={-1 as never} className="icon-btn" style={{ marginLeft: -8 }} aria-label="Back">
        <Icon.arrowL size={20} />
      </Link>

      <div className="detail-grid mt-1">
        {/* Gallery */}
        <div>
          <div className="gallery">
            {photo ? (
              <img className="gallery__main" src={photo.storage_path} alt={item.title} />
            ) : (
              <div className="gallery__main" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-mute)' }}>
                {item.category.icon}
              </div>
            )}
            {item.photos.length > 1 && (
              <span className="gallery__count">{photoIdx + 1} / {item.photos.length}</span>
            )}
          </div>
          {item.photos.length > 1 && (
            <div className="gallery__thumbs">
              {item.photos.map((p, i) => (
                <img
                  key={p.id}
                  src={p.storage_path}
                  alt=""
                  className={`gallery__thumb ${i === photoIdx ? 'gallery__thumb--active' : ''}`}
                  onClick={() => setPhotoIdx(i)}
                />
              ))}
            </div>
          )}

          {/* Match panel */}
          {matchScore != null && !isMine && (
            <div className="match-panel mt-2">
              <div className="row" style={{ gap: 14 }}>
                <div className="match-score-ring" style={{ ['--pct' as string]: `${matchScore}%` }}>
                  <span>{matchScore}%</span>
                </div>
                <div className="grow">
                  <div className="bold" style={{ color: 'var(--ochre)' }}>
                    {matchScore >= 80 ? '🔥 PERFECT MATCH' : matchScore >= 60 ? 'Strong match for you' : 'Possible match'}
                  </div>
                  <div className="small dim mt-1">
                    {item.match_reasons.slice(0, 3).map((r) => (
                      <div key={r}>• {r}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div className="row wrap">
            <span className="badge badge--ochre">{item.category.icon} {item.category.name}</span>
            <span className="badge badge--mute"><ConditionLabel condition={item.condition} /></span>
            {item.status === 'unavailable' && <span className="badge badge--rust">Unavailable</span>}
            {item.active_offer_count > 0 && isMine && (
              <Link to="/trades" className="badge badge--blue">{item.active_offer_count} active offer{item.active_offer_count > 1 ? 's' : ''}</Link>
            )}
          </div>

          <h1 className="serif mt-1" style={{ fontSize: 27 }}>{item.title}</h1>

          <div className="row wrap small dim mt-1">
            <span className="row" style={{ gap: 4 }}><Icon.mapPin size={13} /> {item.location}</span>
            {item.distance_km != null && <span>· {item.distance_km} km away</span>}
            <span>· listed {timeAgo(item.created_at)}</span>
          </div>

          {item.value_min != null && (
            <div className="row small mt-1 muted">
              <Icon.tag size={13} /> Estimated value: {item.value_min.toLocaleString()}–{item.value_max?.toLocaleString()} {item.value_currency}
            </div>
          )}

          {/* Wanted */}
          {item.wanted.length > 0 && (
            <div className="mt-2">
              <p className="kicker">In exchange, they want</p>
              <div className="row wrap mt-1">
                {item.wanted.map((w) => (
                  <span key={w.id} className="want-chip">
                    {w.wanted_keywords || 'Something from this category'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="dim mt-2" style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>

          {/* Owner */}
          <div className="card mt-3">
            <Link to={`/u/${item.owner.username}`} className="row" style={{ width: '100%' }}>
              <Avatar user={item.owner} size={46} ring={item.owner.verification_status === 'verified'} />
              <div className="grow">
                <div className="row" style={{ gap: 6 }}>
                  <span className="bold">{item.owner.display_name}</span>
                  {item.owner.verification_status === 'verified' && <VerifiedBadge />}
                </div>
                <div className="small dim">
                  {item.owner.location || 'Tunisia'} · member since {formatDate(item.owner.created_at)}
                </div>
              </div>
              {item.owner.rating != null && <Stars value={item.owner.rating} size={12} />}
            </Link>
            <hr className="hairline mt-2 mb-2" />
            <div className="row wrap small">
              <span className="badge badge--mute"><Icon.check size={12} /> {item.owner.completed_trades} trades</span>
              {item.owner.successful_trade_pct != null && (
                <span className="badge badge--teal">{item.owner.successful_trade_pct}% success</span>
              )}
            </div>
          </div>

          {/* Owner actions */}
          {isMine && (
            <div className="card mt-2">
              <div className="small bold mb-1">Your listing</div>
              <div className="row wrap">
                <Link to={`/list?edit=${item.id}`} className="btn btn--soft btn--sm"><Icon.edit size={14} /> Edit</Link>
                <button className="btn btn--soft btn--sm" onClick={() => { setConfirmAction('hide'); setConfirmOpen(true); }}>
                  {item.status === 'active' ? <><Icon.eyeOff size={14} /> Mark unavailable</> : <><Icon.eye size={14} /> Relist</>}
                </button>
                <button className="btn btn--danger btn--sm" onClick={() => { setConfirmAction('delete'); setConfirmOpen(true); }}>
                  <Icon.trash size={14} /> Delete
                </button>
              </div>
            </div>
          )}

          {/* Safety */}
          <div className="safety-note mt-2">
            <Icon.shield size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Meet in a public place and check the item before swapping. Your exact address is never shown.</span>
          </div>

          <div className="row mt-2 small" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn--ghost btn--sm" onClick={toggleFavorite}>
              <Icon.heart size={15} filled={item.is_favorite} /> {item.is_favorite ? 'Saved' : 'Save'}
            </button>
            {!isMine && (
              <button className="btn btn--ghost btn--sm" onClick={() => setReportOpen(true)}>
                <Icon.flag size={15} /> Report
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      {!isMine && item.status === 'active' && (
        <div className="detail-bar">
          <MatchPill score={matchScore} />
          <button className="btn btn--primary btn--lg grow" onClick={() => setOfferOpen(true)}>
            <Icon.swap size={18} /> Offer a trade
          </button>
        </div>
      )}
      {isMine && item.status === 'active' && (
        <div className="detail-bar">
          <Link to={`/list?edit=${item.id}`} className="btn btn--ghost btn--lg grow"><Icon.edit size={17} /> Edit listing</Link>
        </div>
      )}
      {item.status === 'unavailable' && (
        <div className="detail-bar">
          <div className="grow center dim small">This item is not available for trade right now.</div>
        </div>
      )}

      {/* Offer modal */}
      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title="Offer a trade">
        <p className="dim small mb-2">What will you give in exchange for <b style={{ color: 'var(--text)' }}>{item.title}</b>?</p>
        {myItems.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="empty-icon">📦</div>
            <h3>You have nothing to offer yet</h3>
            <p className="small">List an item first, then come back to send your offer.</p>
            <Link to="/list" className="btn btn--primary btn--sm">List an item</Link>
          </div>
        ) : (
          <>
            <Field label="Your item">
              <select className="select" value={offerItemId} onChange={(e) => setOfferItemId(e.target.value)}>
                {myItems
                  .filter((i) => i.id !== item.id)
                  .map((i) => (
                    <option key={i.id} value={i.id} disabled={i.status !== 'active'}>
                      {i.title} {i.status !== 'active' ? '— unavailable' : ''}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Message to the owner" hint="Introduce yourself and the condition of your item.">
              <textarea
                className="textarea"
                value={offerMsg}
                onChange={(e) => setOfferMsg(e.target.value)}
                placeholder="Salam! Would you trade your iPhone for my PS5? It's in great condition…"
              />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn--ghost" onClick={() => setOfferOpen(false)}>Cancel</button>
              <button className="btn btn--primary" disabled={busy || !offerItemId} onClick={sendOffer}>
                Send offer
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Report modal */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this listing">
        <Field label="Reason">
          <select className="select" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
            {REPORT_REASONS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Details">
          <textarea className="textarea" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Tell us what is wrong…" />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn--ghost" onClick={() => setReportOpen(false)}>Cancel</button>
          <button className="btn btn--danger" disabled={busy || reportDetails.length < 10} onClick={submitReport}>
            Submit report
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doConfirm}
        title={confirmAction === 'delete' ? 'Delete listing?' : 'Change availability?'}
        body={
          confirmAction === 'delete'
            ? 'This permanently removes the listing. It cannot be undone.'
            : item.status === 'active'
              ? 'Marking it unavailable hides it from search while keeping your data.'
              : 'Relist the item so it appears in Browse and search again.'
        }
        confirmLabel={confirmAction === 'delete' ? 'Delete' : 'Confirm'}
        danger={confirmAction === 'delete'}
      />
    </div>
  );
}

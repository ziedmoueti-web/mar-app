import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage, uploadImage } from '../api/client';
import { useToast } from '../state/ToastContext';
import type { Category, ItemWithDetails } from '@shared/types';
import { ConfirmDialog, Field, PageLoader } from '../components/ui';
import { Icon } from '../components/Icon';

const MAX_PHOTOS = 8;
const CONDITIONS = [
  { v: 'new', label: 'New' },
  { v: 'like_new', label: 'Like new' },
  { v: 'good', label: 'Good' },
  { v: 'fair', label: 'Fair' },
  { v: 'poor', label: 'Poor' },
];

interface PhotoEntry {
  key: string;
  preview: string;          // object URL or server path
  storage_path?: string;    // set once uploaded
  thumb_path?: string;
  uploading?: boolean;
}

/** Client-side compression: resize to ≤1600px, JPEG q0.82; thumb ≤360px. */
async function compressImage(file: File): Promise<{ main: Blob; thumb: Blob }> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  const url = URL.createObjectURL(file);
  const img = await load(url);
  const draw = (maxDim: number, quality: number) => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression failed'))), 'image/jpeg', quality)
    );
  };
  try {
    const [main, thumb] = await Promise.all([draw(1600, 0.82), draw(360, 0.75)]);
    return { main, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ListItemPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const editId = params.get('edit');

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!!editId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [condition, setCondition] = useState('good');
  const [location, setLocation] = useState('Tunis');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [wanted, setWanted] = useState<{ category_slug: string; keywords: string }[]>([{ category_slug: '', keywords: '' }]);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/api/categories').then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) return;
    api.get<ItemWithDetails>(`/api/items/${editId}`)
      .then((item) => {
        setTitle(item.title);
        setDescription(item.description);
        setCategorySlug(item.category.slug);
        setCondition(item.condition);
        setLocation(item.location);
        setValueMin(item.value_min != null ? String(item.value_min) : '');
        setValueMax(item.value_max != null ? String(item.value_max) : '');
        setWanted(
          item.wanted.length
            ? item.wanted.map((w) => ({
                category_slug: w.wanted_category_id
                  ? categories.find((c) => c.id === w.wanted_category_id)?.slug ?? ''
                  : '',
                keywords: w.wanted_keywords,
              }))
            : [{ category_slug: '', keywords: '' }]
        );
        setPhotos(
          item.photos.map((p) => ({
            key: p.id,
            preview: p.storage_path,
            storage_path: p.storage_path,
            thumb_path: p.thumb_path ?? undefined,
          }))
        );
      })
      .catch((e) => toast(apiErrorMessage(e), 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const usableCategories = useMemo(
    () => categories.filter((c) => c.slug !== categorySlug),
    [categories, categorySlug]
  );

  const pickPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, room);
    if (room <= 0) {
      toast(`You can have up to ${MAX_PHOTOS} photos.`, 'error');
      return;
    }
    const entries: PhotoEntry[] = list.map((f) => ({ key: crypto.randomUUID(), preview: URL.createObjectURL(f) }));
    setPhotos((p) => [...p, ...entries]);
    for (let i = 0; i < list.length; i++) {
      const entry = entries[i];
      setPhotos((p) => p.map((x) => (x.key === entry.key ? { ...x, uploading: true } : x)));
      try {
        const { main, thumb } = await compressImage(list[i]);
        const [mainPath, thumbPath] = await Promise.all([uploadImage(main), uploadImage(thumb)]);
        setPhotos((p) =>
          p.map((x) =>
            x.key === entry.key
              ? { ...x, storage_path: mainPath, thumb_path: thumbPath, uploading: false }
              : x
          )
        );
      } catch (e) {
        setPhotos((p) => p.filter((x) => x.key !== entry.key));
        toast(`Could not upload "${list[i].name}": ${apiErrorMessage(e)}`, 'error');
      }
    }
  };

  const removePhoto = (key: string) => setPhotos((p) => p.filter((x) => x.key !== key));
  const movePhoto = (key: string, dir: -1 | 1) =>
    setPhotos((p) => {
      const i = p.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const setWantedAt = (i: number, patch: Partial<{ category_slug: string; keywords: string }>) =>
    setWanted((w) => w.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    const payload = {
      title: title.trim(),
      description: description.trim(),
      category_slug: categorySlug,
      condition,
      location: location.trim(),
      latitude: null,
      longitude: null,
      value_min: valueMin ? Number(valueMin) : null,
      value_max: valueMax ? Number(valueMax) : null,
      wanted: wanted
        .filter((w) => w.category_slug || w.keywords.trim())
        .map((w) => ({ category_slug: w.category_slug || null, keywords: w.keywords.trim() })),
      photos: photos.filter((p) => p.storage_path).map((p) => ({ storage_path: p.storage_path, thumb_path: p.thumb_path })),
    };
    if (photos.some((p) => p.uploading)) {
      toast('Some photos are still uploading — wait a second.', 'error');
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      if (editId) {
        await api.put(`/api/items/${editId}`, payload);
        toast('Listing updated.', 'success');
      } else {
        await api.post('/api/items', payload);
        toast('Listing is live! 🎉', 'success');
      }
      navigate('/my-items');
    } catch (e) {
      if (e instanceof Error && 'fields' in e) setErrors((e as { fields: Record<string, string> }).fields ?? {});
      toast(apiErrorMessage(e), 'error');
      setBusy(false);
    }
  };

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="row-between">
        <div>
          <h1 className="page-title">{editId ? 'Edit listing' : 'List an item'}</h1>
          <p className="page-sub">Tell people what you have — and what you want back.</p>
        </div>
        <Link to="/my-items" className="icon-btn"><Icon.x size={18} /></Link>
      </div>

      <div className="mt-2">
        <p className="kicker mb-1">Photos ({photos.length}/{MAX_PHOTOS})</p>
        <div className="photo-picker">
          {photos.map((p) => (
            <div key={p.key} className="photo-tile" style={{ borderColor: p.storage_path ? 'var(--border)' : 'var(--ochre)' }}>
              <img src={p.preview} alt="" />
              {p.uploading && (
                <span className="tiny muted" style={{ position: 'absolute', background: 'rgba(14,14,16,0.8)', padding: '2px 6px', borderRadius: 6 }}>
                  compressing…
                </span>
              )}
              <button type="button" className="photo-tile__remove" onClick={() => removePhoto(p.key)} aria-label="Remove photo">
                <Icon.x size={12} />
              </button>
              <div className="row" style={{ position: 'absolute', bottom: 4, left: 4, gap: 2 }}>
                <button type="button" className="icon-btn" style={{ width: 22, height: 22, background: 'rgba(14,14,16,0.8)' }} onClick={() => movePhoto(p.key, -1)} aria-label="Move left">
                  <Icon.chevronL size={12} />
                </button>
                <button type="button" className="icon-btn" style={{ width: 22, height: 22, background: 'rgba(14,14,16,0.8)' }} onClick={() => movePhoto(p.key, 1)} aria-label="Move right">
                  <Icon.chevronR size={12} />
                </button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" className="photo-tile" onClick={() => fileRef.current?.click()} aria-label="Add photos">
              <Icon.camera size={22} />
              <span className="tiny">Add</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void pickPhotos(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="card mt-2">
        <Field label="Title" error={errors.title} hint="Be specific — brand, model, size.">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PlayStation 5 — Disc Edition" />
        </Field>
        <Field label="Description" error={errors.description} hint="Condition, what is included, why you are trading it.">
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Works perfectly, includes…" />
        </Field>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div className="grow">
            <Field label="Category" error={errors.category_id}>
              <select className="select" value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
                <option value="">Pick a category</option>
                {categories.map((c) => <option key={c.id} value={c.slug}>{c.icon} {c.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grow">
            <Field label="Condition" error={errors.condition}>
              <select className="select" value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITIONS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Approximate area" error={errors.location} hint="City or neighbourhood — never your exact address.">
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Megrine" />
        </Field>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div className="grow">
            <Field label="Value from (TND, optional)">
              <input className="input" type="number" min="0" value={valueMin} onChange={(e) => setValueMin(e.target.value)} placeholder="800" />
            </Field>
          </div>
          <div className="grow">
            <Field label="Value to (TND, optional)">
              <input className="input" type="number" min="0" value={valueMax} onChange={(e) => setValueMax(e.target.value)} placeholder="1000" />
            </Field>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <p className="kicker mb-1">I HAVE · I WANT</p>
        <p className="small dim mb-2">Structured exchange: what do you want in return? Pick categories or type keywords.</p>
        {wanted.map((w, i) => (
          <div key={i} className="wanted-row">
            <select
              className="select"
              value={w.category_slug}
              onChange={(e) => setWantedAt(i, { category_slug: e.target.value })}
              aria-label="Wanted category"
            >
              <option value="">Any category</option>
              {usableCategories.map((c) => <option key={c.id} value={c.slug}>{c.icon} {c.name}</option>)}
            </select>
            <input
              className="input"
              value={w.keywords}
              onChange={(e) => setWantedAt(i, { keywords: e.target.value })}
              placeholder="e.g. iPhone, gaming laptop, bicycle"
              aria-label="Wanted keywords"
            />
            <button type="button" className="icon-btn" onClick={() => setWanted((x) => x.filter((_, idx) => idx !== i))} aria-label="Remove wanted item" disabled={wanted.length === 1}>
              <Icon.trash size={15} />
            </button>
          </div>
        ))}
        {wanted.length < 6 && (
          <button type="button" className="btn btn--soft btn--sm" onClick={() => setWanted((w) => [...w, { category_slug: '', keywords: '' }])}>
            <Icon.plus size={14} /> Add another want
          </button>
        )}
      </div>

      <div className="submit-bar">
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn--ghost" onClick={() => setConfirmOpen(true)}>Cancel</button>
          <button className="btn btn--primary btn--lg grow" disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : editId ? 'Save changes' : 'Publish listing'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => navigate('/my-items')}
        title="Discard changes?"
        body="Your unsaved changes will be lost."
        confirmLabel="Discard"
        danger
      />
    </div>
  );
}

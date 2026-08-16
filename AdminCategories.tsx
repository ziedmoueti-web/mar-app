import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client';
import { useToast } from '../../state/ToastContext';
import type { Category } from '@shared/types';
import { ConfirmDialog, ErrorState } from '../../components/ui';

export function AdminCategories() {
  const { toast } = useToast();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', icon: '' });
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<{ categories: Category[] }>('/api/admin/categories')
      .then((r) => setCats(r.categories))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  useEffect(load, [load]);

  const save = async () => {
    try {
      if (editing) {
        await api.patch(`/api/admin/categories/${editing.id}`, { name: form.name, slug: form.slug, icon: form.icon });
        toast('Category updated.', 'success');
      } else {
        await api.post('/api/admin/categories', form);
        toast('Category created.', 'success');
      }
      setForm({ name: '', slug: '', icon: '' });
      setEditing(null);
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await api.del(`/api/admin/categories/${deleting.id}`);
      toast('Category deleted.', 'success');
      setDeleting(null);
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
      setDeleting(null);
    }
  };

  const startEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, slug: c.slug, icon: c.icon });
  };

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 22 }}>Categories</h1>
      <div className="row mt-2" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <div className="small bold mb-2">{editing ? `Edit: ${editing.name}` : 'New category'}</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="Icon (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} style={{ width: 70 }} />
            <input className="input grow" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <input className="input mt-1" placeholder="Slug (e.g. phones)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <div className="row mt-1" style={{ gap: 8 }}>
            <button className="btn btn--primary btn--sm grow" disabled={!form.name || !form.slug} onClick={save}>
              {editing ? 'Save changes' : 'Create'}
            </button>
            {editing && <button className="btn btn--ghost btn--sm" onClick={() => { setEditing(null); setForm({ name: '', slug: '', icon: '' }); }}>Cancel</button>}
          </div>
        </div>

        <div className="card" style={{ flex: 2, minWidth: 320 }}>
          <div className="small bold mb-2">{cats?.length ?? 0} categories</div>
          {error ? <ErrorState message={error} onRetry={load} /> : !cats ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (
            <div className="stack">
              {cats.map((c) => (
                <div key={c.id} className="list-row">
                  <span style={{ fontSize: 20 }}>{c.icon}</span>
                  <div className="grow">
                    <div className="small bold">{c.name}</div>
                    <div className="tiny muted">/{c.slug}</div>
                  </div>
                  <button className="btn btn--soft btn--sm" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn btn--danger btn--sm" onClick={() => setDeleting(c)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="Delete category?"
        body={deleting ? `"${deleting.name}" will be removed. Categories in use cannot be deleted.` : ''}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

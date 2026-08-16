import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage, uploadImage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { Avatar, Field } from '../components/ui';
import { Icon } from '../components/Icon';

const CITIES = ['Tunis', 'Ariana', 'Ben Arous', 'Megrine', 'La Marsa', 'Carthage', 'Nabeul', 'Hammamet', 'Sousse'];

export function EditProfilePage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [location, setLocation] = useState(user?.location ?? 'Tunis');
  const [avatar, setAvatar] = useState(user?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  if (!user) return null;

  const pickAvatar = async (f: File | undefined) => {
    if (!f) return;
    setUploadingAvatar(true);
    try {
      const path = await uploadImage(f);
      setAvatar(path);
      await api.patch('/api/me', { avatar_url: path });
      toast('Avatar updated.', 'success');
      await refresh();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const city = CITIES.find((c) => c === location) ? location : 'Tunis';
      await api.patch('/api/me', {
        display_name: displayName,
        bio,
        location: city,
      });
      await refresh();
      toast('Profile saved.', 'success');
      navigate('/profile');
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="row-between">
        <h1 className="page-title">Edit profile</h1>
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon.x size={18} /></button>
      </div>

      <div className="center mt-2">
        <button onClick={() => fileRef.current?.click()} aria-label="Change avatar" style={{ position: 'relative' }}>
          <Avatar user={{ display_name: displayName, avatar_url: avatar }} size={88} />
          <span
            style={{
              position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%',
              background: 'var(--surface-3)', border: '2px solid var(--bg)', display: 'grid', placeItems: 'center',
            }}
          >
            <Icon.camera size={13} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickAvatar(e.target.files?.[0])} />
        {uploadingAvatar && <div className="tiny muted mt-1">Uploading…</div>}
      </div>

      <div className="card mt-3">
        <Field label="Display name">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Bio" hint="Shown on your profile and in trades.">
          <textarea className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} placeholder="What do you trade?" />
        </Field>
        <Field label="City / area">
          <select className="select" value={location} onChange={(e) => setLocation(e.target.value)}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <button className="btn btn--primary btn--block btn--lg" disabled={busy || !displayName.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}

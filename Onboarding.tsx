import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { Field } from '../components/ui';

const CITIES = [
  { name: 'Tunis', lat: 36.8065, lng: 10.1815 },
  { name: 'Ariana', lat: 36.8625, lng: 10.1955 },
  { name: 'Ben Arous', lat: 36.7536, lng: 10.2224 },
  { name: 'Megrine', lat: 36.7672, lng: 10.2292 },
  { name: 'La Marsa', lat: 36.8772, lng: 10.3256 },
  { name: 'Carthage', lat: 36.8616, lng: 10.3305 },
  { name: 'Nabeul', lat: 36.4563, lng: 10.7352 },
  { name: 'Hammamet', lat: 36.4043, lng: 10.5058 },
  { name: 'Sousse', lat: 35.8256, lng: 10.6084 },
];

interface Category { id: string; slug: string; name: string; icon: string }

export function Onboarding() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [city, setCity] = useState('Tunis');
  const [owns, setOwns] = useState<string[]>([]);
  const [wants, setWants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/api/categories').then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const steps = ['Welcome', 'Location', 'What you have', 'What you want', 'Enter Badel'];

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const finish = async () => {
    setBusy(true);
    const c = CITIES.find((x) => x.name === city) ?? CITIES[0];
    try {
      await api.post('/api/me/onboarded', {
        location: c.name, latitude: c.lat, longitude: c.lng, owns, wants,
      });
      await refresh();
      toast('Welcome to Badel! 🎉', 'success');
      navigate('/', { replace: true });
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
      setBusy(false);
    }
  };

  return (
    <div className="onboard">
      <div className="row-between">
        <span className="brand"><span className="brand-word">BADEL</span></span>
        <span className="tiny muted">{step + 1} / {steps.length}</span>
      </div>

      <div className="onboard__progress" aria-hidden>
        {steps.map((_, i) => (
          <div key={i} className={`onboard__dot ${i <= step ? 'onboard__dot--done' : ''}`} />
        ))}
      </div>

      <div className="onboard__step grow">
        {step === 0 && (
          <>
            <p className="kicker">Trade, not money</p>
            <h1 className="serif" style={{ fontSize: 32, marginTop: 8 }}>
              Trade what you have for what you actually need.
            </h1>
            <p className="dim mt-2" style={{ maxWidth: 420 }}>
              No money changes hands on Badel. List what you own, say what you want in
              exchange, and swap with people near you.
            </p>
            <ul className="small dim mt-2" style={{ paddingLeft: 18, display: 'grid', gap: 8, maxWidth: 380 }}>
              <li>✓ Browse, search and list items — free, forever</li>
              <li>✓ Send trade offers and chat with other members</li>
              <li>✓ Optional $5 verification later, never a barrier to start</li>
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="serif" style={{ fontSize: 26 }}>Where are you based?</h1>
            <p className="dim mt-1">Barter is local — we show distance and nearby swaps. Your exact address is never shown publicly.</p>
            <div className="stack mt-2" style={{ maxWidth: 420 }}>
              <Field label="Choose your city / area">
                <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
                  {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="serif" style={{ fontSize: 26 }}>What do you have?</h1>
            <p className="dim mt-1 mb-2">Pick the categories you can trade. You can add specific items later.</p>
            <div className="category-grid">
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`category-tile ${owns.includes(c.slug) ? 'category-tile--on' : ''}`}
                  onClick={() => toggle(owns, setOwns, c.slug)}
                  aria-pressed={owns.includes(c.slug)}
                >
                  <span className="cat-icon">{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="serif" style={{ fontSize: 26 }}>What do you want?</h1>
            <p className="dim mt-1 mb-2">What would you love to receive in exchange? This powers your match score.</p>
            <div className="category-grid">
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`category-tile ${wants.includes(c.slug) ? 'category-tile--on' : ''}`}
                  onClick={() => toggle(wants, setWants, c.slug)}
                  aria-pressed={wants.includes(c.slug)}
                >
                  <span className="cat-icon">{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <div className="center">
            <div style={{ fontSize: 46 }}>🤝</div>
            <h1 className="serif" style={{ fontSize: 28, marginTop: 10 }}>You're in.</h1>
            <p className="dim mt-1" style={{ maxWidth: 360 }}>
              {owns.length > 0
                ? `Your ${owns.length} categor${owns.length === 1 ? 'y' : 'ies'} and ${wants.length} wanted categor${wants.length === 1 ? 'y' : 'ies'} are saved. We will surface matches as people list items.`
                : 'Start by listing something you own — it only takes a minute.'}
            </p>
          </div>
        )}
      </div>

      <div className="row mt-3">
        {step > 0 && (
          <button className="btn btn--ghost" onClick={() => setStep((s) => s - 1)}>Back</button>
        )}
        <button
          className="btn btn--primary grow"
          disabled={busy || (step === 1 && !city)}
          onClick={() => (step < steps.length - 1 ? setStep((s) => s + 1) : void finish())}
        >
          {step === steps.length - 1 ? (busy ? 'Entering…' : 'Enter Badel') : 'Continue'}
        </button>
      </div>
    </div>
  );
}

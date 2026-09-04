import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { BusinessType, BusinessForm } from '@branchport/shared';
import { BUSINESS_TYPE_LABELS } from '@branchport/shared';
import { GyeNyame, BlackStar } from '../components/AdinkraSymbols';

// Business type categories for Step 4
const CATEGORIES: Array<{ label: string; types: BusinessType[] }> = [
  { label: 'Food & Grocery', types: ['grocery', 'supermarket', 'provisions', 'bakery', 'butchery', 'frozen_foods', 'seafood', 'spices'] },
  { label: 'Drinks & Beverages', types: ['drinks', 'beverages', 'ice_cream'] },
  { label: 'Health & Beauty', types: ['pharmacy', 'medical_supplies', 'cosmetics', 'hair_salon'] },
  { label: 'Fashion & Style', types: ['clothing', 'tailoring', 'jewelry'] },
  { label: 'Technology & Electronics', types: ['electronics', 'phone_accessories'] },
  { label: 'Home & Building', types: ['hardware', 'building_materials', 'furniture', 'plumbing', 'welding'] },
  { label: 'Services', types: ['printing', 'laundry', 'fuel_station', 'restaurant', 'agricultural'] },
  { label: 'Specialty', types: ['stationery', 'auto_parts', 'books', 'sports', 'toys', 'baby_products', 'pet_shop', 'garden', 'other'] },
];

const ICON_MAP: Partial<Record<BusinessType, string>> = {
  grocery: '🛒', supermarket: '🏪', pharmacy: '💊', electronics: '📱', clothing: '👔',
  hardware: '🔧', stationery: '📝', provisions: '📦', drinks: '🥤', bakery: '🍞',
  butchery: '🥩', cosmetics: '💄', phone_accessories: '🎧', auto_parts: '🚗',
  building_materials: '🏗️', agricultural: '🌾', fuel_station: '⛽', restaurant: '🍽️',
  hair_salon: '💇', tailoring: '✂️', printing: '🖨️', welding: '⚒️', plumbing: '🚿',
  furniture: '🪑', jewelry: '💎', books: '📚', sports: '⚽', toys: '🧸',
  baby_products: '🍼', pet_shop: '🐾', garden: '🌿', medical_supplies: '🏥',
  frozen_foods: '🧊', seafood: '🐟', spices: '🌶️', beverages: '🧃', ice_cream: '🍦',
  laundry: '👔', other: '📦',
};

const FORM_OPTIONS: Array<{ value: BusinessForm; label: string; twi: string; icon: string; desc: string }> = [
  { value: 'retail', label: 'Retail', twi: 'Taa ne tua', icon: '🏪', desc: 'Selling directly to customers' },
  { value: 'wholesale', label: 'Wholesale', twi: 'Apam Dua', icon: '📦', desc: 'Selling in bulk to shops' },
  { value: 'depo', label: 'Depo / Warehouse', twi: 'Adaka', icon: '🏭', desc: 'Storage & distribution center' },
  { value: 'both', label: 'Both Retail & Wholesale', twi: 'Mmienu', icon: '🤝', desc: 'Retail + Wholesale combined' },
];

export default function Onboarding() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Multi-step state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  // Step 1: Business type
  const [businessForm, setBusinessForm] = useState<BusinessForm | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState('');

  // Step 2: Business name
  const [businessName, setBusinessName] = useState('');

  // Step 3: Username
  const [username, setUsername] = useState('');

  // Step 4: Categories
  const [selectedCategories, setSelectedCategories] = useState<BusinessType[]>([]);

  // Common
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goNext() {
    setDirection('forward');
    setStep((s) => Math.min(s + 1, 4) as 1 | 2 | 3 | 4);
  }

  function goBack() {
    setDirection('back');
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4);
  }

  function toggleCategory(type: BusinessType) {
    setSelectedCategories((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function handleComplete() {
    if (!profile) return;
    setSaving(true);
    setError(null);

    const allCategories = selectedCategories;
    const primaryType = allCategories[0] ?? 'other';
    const finalForm = showCustomForm && customForm.trim() ? customForm.trim() as BusinessForm : businessForm;

    // Update Supabase
    const { error: updateErr } = await supabase
      .from('businesses')
      .update({
        business_type: primaryType,
        business_form: finalForm,
        business_categories: allCategories,
        name: businessName.trim(),
      })
      .eq('id', profile.business_id);

    if (updateErr) {
      console.warn('Supabase update failed:', updateErr.message);
    }

    // Also update the user's name if changed
    if (username.trim() && username.trim() !== profile.name) {
      await supabase.from('users').update({ name: username.trim() }).eq('id', profile.id);
    }

    // localStorage fallback
    try {
      const usersRaw = localStorage.getItem('branchport-users');
      if (usersRaw) {
        const users = JSON.parse(usersRaw);
        const updated = users.map((u: { id: string }) =>
          u.id === profile.id ? { ...u, name: username.trim() || profile.name, business_name: businessName.trim(), business_type: primaryType, business_form: finalForm, business_categories: allCategories } : u
        );
        localStorage.setItem('branchport-users', JSON.stringify(updated));
      }
      const bizRaw = localStorage.getItem('branchport-businesses');
      if (bizRaw) {
        const biz = JSON.parse(bizRaw);
        const updated = biz.map((b: { id: string }) =>
          b.id === profile.business_id ? { ...b, name: businessName.trim(), business_type: primaryType, business_form: finalForm, business_categories: allCategories } : b
        );
        localStorage.setItem('branchport-businesses', JSON.stringify(updated));
      }
    } catch { /* ignore */ }

    localStorage.setItem('branchport-onboarding-seen', '1');
    setSaving(false);
    navigate('/', { replace: true });
  }

  function handleSkip() {
    localStorage.setItem('branchport-onboarding-seen', '1');
    navigate('/', { replace: true });
  }

  const animClass = direction === 'forward' ? 'onboard-slide-in' : 'onboard-slide-in-reverse';

  return (
    <div className="min-h-screen onboard-bg">
      {/* Ghana stripe top */}
      <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>

      {/* Header */}
      <div className="onboard-header">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl onboard-logo grid place-items-center">
              <GyeNyame size={26} color="var(--ghana-black)" />
            </div>
            <p className="font-bold tracking-tight text-white">★ BranchPort</p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mt-3">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`onboard-dot ${s === step ? 'onboard-dot-active' : s < step ? 'onboard-dot-done' : ''}`}>
                  {s < step ? '✓' : s}
                </div>
                {s < 4 && <div className={`onboard-line ${s < step ? 'onboard-line-done' : ''}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content area with animation */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div key={step} className={animClass}>

          {/* ══════ STEP 1: Business Type ══════ */}
          {step === 1 && (
            <div className="onboard-step">
              <div className="text-center mb-6">
                <BlackStar size={40} color="var(--ghana-gold)" className="mx-auto mb-3" />
                <h1 className="text-xl font-bold text-gray-900">What kind of business is this?</h1>
                <p className="text-sm text-gray-500 mt-1">Choose the one that fits best</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {FORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setBusinessForm(opt.value); setShowCustomForm(false); }}
                    className={`onboard-option ${businessForm === opt.value && !showCustomForm ? 'onboard-option-active' : ''}`}
                  >
                    <span className="text-3xl mb-2">{opt.icon}</span>
                    <span className="font-semibold text-sm">{opt.label}</span>
                    <span className="text-[11px] text-gray-400">{opt.twi}</span>
                    <span className="text-[10px] text-gray-400 mt-1">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {/* Custom option */}
              <div className="mb-4">
                <button
                  onClick={() => { setShowCustomForm(true); setBusinessForm(null); }}
                  className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                    showCustomForm ? 'border-amber-400 bg-amber-50' : 'border-dashed border-gray-300 bg-white hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✏️</span>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Add Custom</p>
                      <p className="text-[11px] text-gray-400">Type your own business type</p>
                    </div>
                  </div>
                </button>
                {showCustomForm && (
                  <input
                    autoFocus
                    value={customForm}
                    onChange={(e) => setCustomForm(e.target.value)}
                    placeholder="e.g. Mobile Money, Agro-processing..."
                    className="input w-full mt-2"
                  />
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={goNext}
                  disabled={!businessForm && !showCustomForm}
                  className="btn btn-primary flex-1"
                >
                  Next →
                </button>
                <button onClick={handleSkip} className="btn btn-outline">Skip</button>
              </div>
            </div>
          )}

          {/* ══════ STEP 2: Business Name ══════ */}
          {step === 2 && (
            <div className="onboard-step">
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">🏪</div>
                <h1 className="text-xl font-bold text-gray-900">What's the business name?</h1>
                <p className="text-sm text-gray-500 mt-1">What do people call your shop?</p>
              </div>

              <div className="mb-6">
                <input
                  autoFocus
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Aunt Amma's Provisions"
                  className="input w-full text-center text-lg"
                  style={{ fontSize: '18px !important' }}
                />
              </div>

              <div className="flex gap-3">
                <button onClick={goBack} className="btn btn-outline">← Back</button>
                <button
                  onClick={goNext}
                  disabled={!businessName.trim()}
                  className="btn btn-primary flex-1"
                >
                  Next →
                </button>
                <button onClick={handleSkip} className="btn btn-outline">Skip</button>
              </div>
            </div>
          )}

          {/* ══════ STEP 3: Username ══════ */}
          {step === 3 && (
            <div className="onboard-step">
              <div className="text-center mb-6">
                <div className="h-16 w-16 rounded-full mx-auto mb-3 onboard-avatar grid place-items-center">
                  <span className="text-2xl font-bold text-white">{username ? username[0].toUpperCase() : '?'}</span>
                </div>
                <h1 className="text-xl font-bold text-gray-900">What's your name?</h1>
                <p className="text-sm text-gray-500 mt-1">This is how you'll appear to your team</p>
              </div>

              <div className="mb-6">
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Kwame Asante"
                  className="input w-full text-center text-lg"
                  style={{ fontSize: '18px !important' }}
                />
              </div>

              <div className="flex gap-3">
                <button onClick={goBack} className="btn btn-outline">← Back</button>
                <button
                  onClick={goNext}
                  disabled={!username.trim()}
                  className="btn btn-primary flex-1"
                >
                  Next →
                </button>
                <button onClick={handleSkip} className="btn btn-outline">Skip</button>
              </div>
            </div>
          )}

          {/* ══════ STEP 4: Categories ══════ */}
          {step === 4 && (
            <div className="onboard-step">
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">📦</div>
                <h1 className="text-xl font-bold text-gray-900">What do you sell?</h1>
                <p className="text-sm text-gray-500 mt-1">Pick all that apply — helps us personalize your experience</p>
              </div>

              <div className="space-y-5 mb-6 onboard-categories-scroll">
                {CATEGORIES.map((cat) => (
                  <div key={cat.label}>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {cat.types.map((t) => {
                        const active = selectedCategories.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleCategory(t)}
                            className={`onboard-tag ${active ? 'onboard-tag-active' : ''}`}
                          >
                            <span>{ICON_MAP[t] ?? '📦'}</span>
                            <span>{BUSINESS_TYPE_LABELS[t]}</span>
                            {active && <span className="ml-1">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {selectedCategories.length > 0 && (
                <p className="text-center text-sm text-gray-500 mb-4">
                  {selectedCategories.length} selected
                </p>
              )}

              {error && <p className="text-sm text-red-800 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}

              <div className="flex gap-3">
                <button onClick={goBack} className="btn btn-outline">← Back</button>
                <button
                  onClick={handleComplete}
                  disabled={saving}
                  className="btn btn-primary flex-1"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="onboard-spinner" />
                      Setting up…
                    </span>
                  ) : (
                    '★ Finish — BrɛMu'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

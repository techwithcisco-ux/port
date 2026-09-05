import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import BackButton from '../../components/BackButton';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { BUSINESS_TYPE_LABELS, BUSINESS_FORM_LABELS } from '@branchport/shared';
import type { BusinessType, BusinessForm } from '@branchport/shared';

const FORM_OPTIONS: BusinessForm[] = ['retail', 'wholesale', 'both', 'depo'];

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
  grocery: '🛒', supermarket: '🏪', pharmacy: '💊', electronics: '📱',
  clothing: '👔', hardware: '🔧', stationery: '📝', provisions: '📦',
  drinks: '🥤', bakery: '🍞', butchery: '🥩', cosmetics: '💄',
  phone_accessories: '🎧', auto_parts: '🚗', building_materials: '🏗️',
  agricultural: '🌾', fuel_station: '⛽', restaurant: '🍽️', hair_salon: '💇',
  tailoring: '✂️', printing: '🖨️', welding: '⚒️', plumbing: '🚿',
  furniture: '🪑', jewelry: '💎', books: '📚', sports: '⚽',
  toys: '🧸', baby_products: '🍼', pet_shop: '🐾', garden: '🌿',
  medical_supplies: '🏥', frozen_foods: '🧊', seafood: '🐟', spices: '🌶️',
  beverages: '🧃', ice_cream: '🍦', laundry: '👔', other: '📦',
};

export default function Account() {
  const { profile } = useAuth();
  const [bizName, setBizName] = useState('');
  const [bizType, setBizType] = useState('');
  const [bizForm, setBizForm] = useState('');
  const [bizCategories, setBizCategories] = useState<string[]>([]);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setOwnerName(profile.name ?? '');
    setOwnerPhone(profile.phone ?? '');
    // Load business info from Supabase first, then fallback to localStorage
    async function loadBiz() {
      const bizId = profile?.business_id;
      if (!bizId) return;
      try {
        const { data } = await supabase.from('businesses').select('*').eq('id', bizId).single();
        if (data) {
          setBizName(String(data.name ?? ''));
          setBizType(String(data.business_type ?? ''));
          setBizForm(String(data.business_form ?? ''));
          setBizCategories(Array.isArray(data.business_categories) ? data.business_categories as string[] : []);
        }
      } catch { /* ignore */ }
    }
    void loadBiz();
  }, [profile]);

  function toggleCategory(type: string) {
    setBizCategories((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setStatus(null);

    try {
      // Save to Supabase if we have a business_id
      if (profile.business_id) {
        await supabase.from('businesses').update({
          name: bizName.trim(),
          business_type: bizType,
          business_form: bizForm,
          business_categories: bizCategories,
        }).eq('id', profile.business_id);
        await supabase.from('users').update({
          name: ownerName.trim(),
          phone: ownerPhone.trim(),
        }).eq('id', profile.id);
      }

      setStatus('Account updated successfully.');
    } catch (err) {
      console.error('Save failed:', err);
      setStatus('Save failed. Please try again.');
    }

    setSaving(false);
    setEditing(false);
    setTimeout(() => setStatus(null), 3000);
  }

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-1">Account</h1>
      <p className="page-sub mb-3">
        Your business information from onboarding. Edit any details here.
      </p>

      {status && (
        <div className="mb-4 px-4 py-2 bg-green-50 text-green-800 rounded-lg text-sm">{status}</div>
      )}

      <div className="max-w-2xl space-y-6">
        {/* ── Owner Info ── */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Owner Information</h2>
            {!editing && (
              <button onClick={() => setEditing(true)} className="btn btn-outline btn-sm">
                ✏️ Edit
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div>
              <label className="label">Your name</label>
              {editing ? (
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="input w-full" />
              ) : (
                <p className="text-sm text-gray-900 font-medium">{ownerName || '—'}</p>
              )}
            </div>
            <div>
              <label className="label">Phone number</label>
              {editing ? (
                <input type="tel" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className="input w-full" />
              ) : (
                <p className="text-sm text-gray-900 font-medium">{ownerPhone || '—'}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Business Info ── */}
        <div className="card p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Business Information</h2>

          <div className="space-y-2">
            <div>
              <label className="label">Business name</label>
              {editing ? (
                <input value={bizName} onChange={(e) => setBizName(e.target.value)} className="input w-full" />
              ) : (
                <p className="text-sm text-gray-900 font-medium">{bizName || '—'}</p>
              )}
            </div>

            <div>
              <label className="label">Business form</label>
              {editing ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FORM_OPTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setBizForm(f)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                        bizForm === f
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {BUSINESS_FORM_LABELS[f]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-900 font-medium">
                  {bizForm ? BUSINESS_FORM_LABELS[bizForm as BusinessForm] ?? bizForm : '—'}
                </p>
              )}
            </div>

            <div>
              <label className="label">Business type</label>
              {editing ? (
                <select value={bizType} onChange={(e) => setBizType(e.target.value)} className="select w-full">
                  <option value="">Select type</option>
                  {Object.entries(BUSINESS_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-900 font-medium">
                  {bizType ? BUSINESS_TYPE_LABELS[bizType as BusinessType] ?? bizType : '—'}
                </p>
              )}
            </div>

            <div>
              <label className="label">What you sell ({bizCategories.length} selected)</label>
              {editing ? (
                <div className="max-h-[240px] overflow-y-auto rounded-xl border border-gray-200 p-3 space-y-2">
                  {CATEGORIES.map((cat) => (
                    <div key={cat.label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{cat.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.types.map((t) => {
                          const active = bizCategories.includes(t);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => toggleCategory(t)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                active
                                  ? 'bg-gray-900 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              <span>{ICON_MAP[t] ?? '📦'}</span>
                              <span>{BUSINESS_TYPE_LABELS[t]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {bizCategories.length > 0 ? bizCategories.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-medium text-gray-700">
                      <span>{ICON_MAP[c as BusinessType] ?? '📦'}</span>
                      {BUSINESS_TYPE_LABELS[c as BusinessType] ?? c}
                    </span>
                  )) : (
                    <p className="text-sm text-gray-400">—</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Save button ── */}
        {editing && (
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={() => setEditing(false)} className="btn btn-outline">
              Cancel
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

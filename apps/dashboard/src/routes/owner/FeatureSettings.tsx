import { useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import {
  ALL_FEATURES,
  SECTION_LABELS,
  type FeatureConfig,
  type FeatureDef,
  type FeatureKey,
  loadFeatureConfig,
  saveFeatureConfig,
  getDefaultConfig,
} from '@branchport/shared';

function FeatureToggle({
  feature,
  enabled,
  onToggle,
}: {
  feature: FeatureDef;
  enabled: boolean;
  onToggle: (key: FeatureKey, val: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-between py-3 px-4 rounded-lg transition-colors ${enabled ? 'bg-white' : 'bg-gray-50'}`}>
      <div className="min-w-0 flex-1 mr-4">
        <p className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>
          {feature.label}
        </p>
        <p className={`text-xs mt-0.5 ${enabled ? 'text-gray-500' : 'text-gray-300'}`}>
          {feature.description}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onToggle(feature.key, !enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/10 ${
          enabled ? 'bg-gray-900' : 'bg-gray-300'
        }`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transform transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          } mt-0.5`}
        />
      </button>
    </div>
  );
}

export default function FeatureSettings() {
  const [config, setConfig] = useState<FeatureConfig>(() => loadFeatureConfig('owner'));
  const [saved, setSaved] = useState(false);

  function handleToggle(key: FeatureKey, val: boolean) {
    setConfig((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  function handleSave() {
    saveFeatureConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    const defaults = getDefaultConfig('owner');
    setConfig(defaults);
    saveFeatureConfig(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Group features by section
  const sections = Object.keys(SECTION_LABELS) as Array<keyof typeof SECTION_LABELS>;

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">Feature Settings</h1>
          <p className="page-sub">
            Enable or disable features across the platform. Every feature is optional and customizable.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} className="btn btn-outline">
            Reset defaults
          </button>
          <button onClick={handleSave} className="btn btn-primary">
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl space-y-8">
        {sections.map((section) => {
          const features = ALL_FEATURES.filter((f) => f.section === section);
          if (features.length === 0) return null;
          const enabledCount = features.filter((f) => config[f.key]).length;

          return (
            <div key={section}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  {SECTION_LABELS[section]}
                </h2>
                <span className="text-xs text-gray-400">
                  {enabledCount}/{features.length} enabled
                </span>
              </div>
              <div className="card divide-y divide-gray-100">
                {features.map((feature) => (
                  <FeatureToggle
                    key={feature.key}
                    feature={feature}
                    enabled={config[feature.key] ?? false}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Custom features hint */}
        <div className="card p-6 bg-gray-50 border-dashed">
          <p className="text-sm font-medium text-gray-700 mb-1">Need a custom feature?</p>
          <p className="text-xs text-gray-500">
            Every feature above can be toggled individually. You can also create custom expense categories,
            add new product variants, and extend the system through the AI agent. The entire platform
            is designed to be flexible for any informal market business.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

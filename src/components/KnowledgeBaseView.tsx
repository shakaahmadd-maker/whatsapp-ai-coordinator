import React, { useState } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import type { KnowledgeBaseConfig } from '../types/agent';
import { DEFAULT_KB_CONFIG } from '../utils/promptBuilder';

interface KnowledgeBaseViewProps {
  config: KnowledgeBaseConfig;
  onUpdateConfig: (next: KnowledgeBaseConfig) => void;
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [draft, setDraft] = useState<KnowledgeBaseConfig>(config);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleChange = <K extends keyof KnowledgeBaseConfig>(
    key: K,
    value: KnowledgeBaseConfig[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig(draft);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleRestoreDefaults = () => {
    setDraft(DEFAULT_KB_CONFIG);
    onUpdateConfig(DEFAULT_KB_CONFIG);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <form onSubmit={handleSave} className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h1 className="text-lg font-display font-semibold text-slate-900">
              Verified Knowledge Base & Identity
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Grounds every reply in verified business facts so the assistant never guesses prices, hours, or policies.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {savedNotice ? <Check className="w-3.5 h-3.5" /> : null}
              <span>{savedNotice ? 'Applied to Simulator' : 'Save Changes'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Agent Name
            </label>
            <input
              type="text"
              value={draft.agentName}
              onChange={(e) => handleChange('agentName', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Business Name
            </label>
            <input
              type="text"
              value={draft.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Website URL
            </label>
            <input
              type="url"
              value={draft.website}
              onChange={(e) => handleChange('website', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Booking / Onboarding Link
            </label>
            <input
              type="url"
              value={draft.bookingLink}
              onChange={(e) => handleChange('bookingLink', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Core Services
            </label>
            <textarea
              rows={2}
              value={draft.coreServices}
              onChange={(e) => handleChange('coreServices', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Subjects Covered
            </label>
            <textarea
              rows={2}
              value={draft.subjectsCovered}
              onChange={(e) => handleChange('subjectsCovered', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Operating Hours
            </label>
            <input
              type="text"
              value={draft.operatingHours}
              onChange={(e) => handleChange('operatingHours', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Methods
            </label>
            <input
              type="text"
              value={draft.paymentMethods}
              onChange={(e) => handleChange('paymentMethods', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Pricing / Quotes Policy
            </label>
            <textarea
              rows={2}
              value={draft.pricingPolicy}
              onChange={(e) => handleChange('pricingPolicy', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Additional Verified Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={draft.additionalNotes}
              onChange={(e) => handleChange('additionalNotes', e.target.value)}
              placeholder="Add verified turnaround times, trial session policies, or regional coordinator notes..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            />
          </div>

          <div className="md:col-span-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">
                Include [HANDOFF_REQUIRED] parser tag on escalation
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Appends the machine-readable tag at the end of escalation replies for n8n or backend webhook routing.
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={draft.includeHandoffTag}
                onChange={(e) => handleChange('includeHandoffTag', e.target.checked)}
                className="w-4 h-4 accent-[#075E54] rounded"
              />
            </label>
          </div>
        </div>
      </div>
    </form>
  );
};

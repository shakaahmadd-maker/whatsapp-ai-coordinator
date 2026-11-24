import React, { useEffect, useMemo, useState } from 'react';
import {
  RotateCcw,
  Check,
  Plus,
  Pencil,
  Trash2,
  Search,
  MessageSquareText,
  X,
} from 'lucide-react';
import type { KnowledgeBaseConfig, KnowledgeBaseFaqItem } from '../types/agent';
import { DEFAULT_KB_CONFIG, FAQ_CATEGORIES } from '../utils/promptBuilder';

interface KnowledgeBaseViewProps {
  config: KnowledgeBaseConfig;
  onUpdateConfig: (next: KnowledgeBaseConfig) => void;
}

interface FaqFormState {
  category: string;
  question: string;
  keywords: string;
  answer: string;
  enabled: boolean;
}

const EMPTY_FAQ_FORM: FaqFormState = {
  category: 'General',
  question: '',
  keywords: '',
  answer: '',
  enabled: true,
};

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [draft, setDraft] = useState<KnowledgeBaseConfig>(config);
  const [savedNotice, setSavedNotice] = useState(false);

  // Q&A Knowledge Bank UI state
  const [faqSearch, setFaqSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showFaqForm, setShowFaqForm] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqForm, setFaqForm] = useState<FaqFormState>(EMPTY_FAQ_FORM);
  const [faqSavedNotice, setFaqSavedNotice] = useState<string | null>(null);

  // Sync draft when server-persisted config finishes loading or updates
  useEffect(() => {
    setDraft(config);
  }, [config]);

  const faqItems = useMemo<KnowledgeBaseFaqItem[]>(
    () => (Array.isArray(draft.faqItems) ? draft.faqItems : []),
    [draft.faqItems]
  );

  const activeFaqCount = useMemo(
    () => faqItems.filter((item) => item.enabled).length,
    [faqItems]
  );

  const availableCategories = useMemo(() => {
    const used = new Set<string>(['All']);
    for (const item of faqItems) {
      used.add(item.category || 'General');
    }
    return Array.from(used);
  }, [faqItems]);

  const filteredFaqs = useMemo(() => {
    const q = faqSearch.trim().toLowerCase();
    return faqItems.filter((item) => {
      const matchesCat =
        selectedCategory === 'All' || (item.category || 'General') === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        (item.keywords || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      );
    });
  }, [faqItems, faqSearch, selectedCategory]);

  const flashFaqNotice = (msg: string) => {
    setFaqSavedNotice(msg);
    setTimeout(() => {
      setFaqSavedNotice((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  const persistFaqs = (nextFaqs: KnowledgeBaseFaqItem[], notice: string) => {
    const nextConfig: KnowledgeBaseConfig = {
      ...draft,
      faqItems: nextFaqs,
    };
    setDraft(nextConfig);
    onUpdateConfig(nextConfig);
    flashFaqNotice(notice);
  };

  const handleOpenAddFaq = () => {
    setEditingFaqId(null);
    setFaqForm({
      ...EMPTY_FAQ_FORM,
      category: selectedCategory !== 'All' ? selectedCategory : 'General',
    });
    setShowFaqForm(true);
  };

  const handleStartEditFaq = (item: KnowledgeBaseFaqItem) => {
    setEditingFaqId(item.id);
    setFaqForm({
      category: item.category || 'General',
      question: item.question,
      keywords: item.keywords || '',
      answer: item.answer,
      enabled: item.enabled,
    });
    setShowFaqForm(true);
  };

  const handleCancelFaqForm = () => {
    setShowFaqForm(false);
    setEditingFaqId(null);
    setFaqForm(EMPTY_FAQ_FORM);
  };

  const handleSaveFaq = (e: React.FormEvent) => {
    e.preventDefault();
    const question = faqForm.question.trim();
    const answer = faqForm.answer.trim();
    if (!question || !answer) return;

    const cleanKeywords = faqForm.keywords.trim();
    const cleanCategory = faqForm.category.trim() || 'General';

    if (editingFaqId) {
      const updated = faqItems.map((item) =>
        item.id === editingFaqId
          ? {
              ...item,
              category: cleanCategory,
              question,
              keywords: cleanKeywords || undefined,
              answer,
              enabled: faqForm.enabled,
            }
          : item
      );
      persistFaqs(updated, 'Q&A updated & live for Sara');
    } else {
      const created: KnowledgeBaseFaqItem = {
        id: `faq-${Date.now()}`,
        category: cleanCategory,
        question,
        keywords: cleanKeywords || undefined,
        answer,
        enabled: true,
      };
      persistFaqs([created, ...faqItems], 'Q&A added & live for Sara');
    }

    setShowFaqForm(false);
    setEditingFaqId(null);
    setFaqForm(EMPTY_FAQ_FORM);
  };

  const handleToggleFaq = (id: string) => {
    const updated = faqItems.map((item) =>
      item.id === id ? { ...item, enabled: !item.enabled } : item
    );
    persistFaqs(updated, 'Q&A status updated');
  };

  const handleDeleteFaq = (id: string) => {
    const updated = faqItems.filter((item) => item.id !== id);
    if (editingFaqId === id) {
      handleCancelFaqForm();
    }
    persistFaqs(updated, 'Q&A removed');
  };

  const handleChange = <K extends keyof KnowledgeBaseConfig>(
    key: K,
    value: KnowledgeBaseConfig[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(false);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig(draft);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleRestoreDefaults = () => {
    setDraft(DEFAULT_KB_CONFIG);
    onUpdateConfig(DEFAULT_KB_CONFIG);
    setShowFaqForm(false);
    setEditingFaqId(null);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Section 1: Q&A Knowledge Bank */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-display font-semibold text-slate-900">
                Q&A Knowledge Bank
              </h1>
              <span className="text-xs font-mono text-slate-500">
                {activeFaqCount} active / {faqItems.length} total
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Add possible questions clients ask and the exact answers {draft.agentName || 'Sara'} should give. Saved entries apply immediately to live WhatsApp chats and the Simulator.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {faqSavedNotice ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Check className="w-3.5 h-3.5" />
                <span>{faqSavedNotice}</span>
              </span>
            ) : null}
            <button
              type="button"
              onClick={showFaqForm && !editingFaqId ? handleCancelFaqForm : handleOpenAddFaq}
              className="px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {showFaqForm && !editingFaqId ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>Close Editor</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Inline Add / Edit Q&A Editor */}
        {showFaqForm ? (
          <form
            onSubmit={handleSaveFaq}
            className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingFaqId ? 'Edit Question & Approved Answer' : 'New Question & Approved Answer'}
              </h2>
              <button
                type="button"
                onClick={handleCancelFaqForm}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Possible User Question
                </label>
                <input
                  type="text"
                  value={faqForm.question}
                  onChange={(e) => setFaqForm((prev) => ({ ...prev, question: e.target.value }))}
                  placeholder="e.g., How much do you charge per hour? / Fees kitni hai?"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  value={faqForm.category}
                  onChange={(e) => setFaqForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                >
                  {FAQ_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Trigger Keywords / Alternate Phrasings{' '}
                <span className="font-normal text-slate-500">(Optional, comma-separated)</span>
              </label>
              <input
                type="text"
                value={faqForm.keywords}
                onChange={(e) => setFaqForm((prev) => ({ ...prev, keywords: e.target.value }))}
                placeholder="e.g., fee, pricing, cost, hourly rate, charges, kitne paise"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {draft.agentName || 'Sara'}&apos;s Approved Answer
              </label>
              <textarea
                rows={4}
                value={faqForm.answer}
                onChange={(e) => setFaqForm((prev) => ({ ...prev, answer: e.target.value }))}
                placeholder="Write the exact answer Sara should use. You can use *bold* for WhatsApp emphasis and include links. Sara will also naturally mirror English or Roman Urdu."
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleCancelFaqForm}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{editingFaqId ? 'Save Changes' : 'Save Q&A Entry'}</span>
              </button>
            </div>
          </form>
        ) : null}

        {/* Search & Category Filter */}
        <div className="mt-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search questions, keywords, or answers..."
              className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {availableCategories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#075E54] text-white border-[#075E54]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Q&A Entries List */}
        <div className="mt-4 divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
          {filteredFaqs.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/50">
              <MessageSquareText className="w-6 h-6 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">
                {faqItems.length === 0
                  ? 'No Q&A entries yet'
                  : 'No Q&A entries match your search'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {faqItems.length === 0
                  ? 'Click "Add Question" above to teach Sara how to answer common client questions.'
                  : 'Try clearing your search or switching back to All categories.'}
              </p>
            </div>
          ) : (
            filteredFaqs.map((item) => (
              <div
                key={item.id}
                className={`p-4 sm:p-5 bg-white transition-colors ${
                  item.enabled ? '' : 'bg-slate-50/70 opacity-70'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                      <span className="text-emerald-800">{item.category || 'General'}</span>
                      <span className="text-slate-300">•</span>
                      <span className={item.enabled ? 'text-slate-500' : 'text-amber-700'}>
                        {item.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Q: {item.question}
                    </h3>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {item.answer}
                    </p>
                    {item.keywords ? (
                      <p className="text-xs text-slate-500 pt-1">
                        <span className="font-medium text-slate-600">Keywords:</span> {item.keywords}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => handleToggleFaq(item.id)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        item.enabled
                          ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {item.enabled ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditFaq(item)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                      title="Edit Q&A"
                      aria-label="Edit Q&A"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFaq(item.id)}
                      className="p-1.5 text-slate-500 hover:text-red-700 bg-white border border-slate-200 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Q&A"
                      aria-label="Delete Q&A"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Section 2: Business Identity & Core Policies */}
      <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-display font-semibold text-slate-900">
              Business Identity & Core Policies
            </h2>
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
              <span>{savedNotice ? 'Saved & Live for Sara' : 'Save Changes'}</span>
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
      </form>
    </div>
  );
};

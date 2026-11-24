import React, { useRef, useState, useEffect } from 'react';
import {
  Paperclip,
  Send,
  FileText,
  X,
  Check,
  CheckCheck,
  AlertTriangle,
  ArrowUpRight,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  ChatAttachment,
  ChatMessage,
  KnowledgeBaseConfig,
  LeadProfile,
} from '../types/agent';
import { WhatsAppText } from './WhatsAppText';

const AGENT_AVATAR_URL = '/src/assets/images/agent_coordinator_avatar_1795461264323.jpg';
const SAMPLE_SYLLABUS_URL = '/src/assets/images/sample_biology_notes_1795461265029.jpg';

interface SimulatorViewProps {
  config: KnowledgeBaseConfig;
  messages: ChatMessage[];
  leadProfile: LeadProfile;
  handoffActive: boolean;
  handoffReason: string | null;
  isSending: boolean;
  errorMessage: string | null;
  onSendMessage: (text: string, attachment?: ChatAttachment) => Promise<void>;
  onResetChat: () => void;
  onNavigateEscalations: () => void;
}

const TEST_SCENARIOS = [
  {
    label: 'Biology Exam Prep',
    prompt: 'Hi, I need help preparing for my Undergraduate Biology midterm next Friday. What are your rates?',
  },
  {
    label: 'Roman Urdu Inquiry',
    prompt: 'Assalam o alaikum, mujhe Master level Computer Science thesis mentoring chahiye. Timing aur payment method bata dein?',
  },
  {
    label: 'Unverified Discount',
    prompt: 'Do you offer a 50% student guarantee discount if I score under 90% on my exam?',
  },
  {
    label: 'Billing Dispute / Human',
    prompt: 'I was charged twice on my card for yesterday’s tutoring session. I want a refund and to speak to a manager right now.',
  },
];

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  config,
  messages,
  leadProfile,
  handoffActive,
  handoffReason,
  isSending,
  errorMessage,
  onSendMessage,
  onResetChat,
  onNavigateEscalations,
}) => {
  const [draft, setDraft] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const kbSize = Math.max(1, Math.round(file.size / 1024));
      setPendingAttachment({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl,
        sizeLabel: `${kbSize} KB`,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAttachSample = async () => {
    try {
      setSampleLoading(true);
      const res = await fetch(SAMPLE_SYLLABUS_URL);
      if (!res.ok) throw new Error('Failed to load sample image');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (dataUrl) {
          setPendingAttachment({
            name: 'biology_101_cellular_respiration_notes.jpg',
            mimeType: 'image/jpeg',
            dataUrl,
            sizeLabel: `${Math.max(1, Math.round(blob.size / 1024))} KB`,
          });
          if (!draft.trim()) {
            setDraft('Hi, here is a photo of my Biology 101 syllabus and notes. Can we schedule a session on oxidative phosphorylation before Oct 18?');
          }
        }
        setSampleLoading(false);
      };
      reader.readAsDataURL(blob);
    } catch {
      setSampleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!draft.trim() && !pendingAttachment) || isSending) return;
    const textToSend = draft.trim();
    const attachmentToSend = pendingAttachment ?? undefined;
    setDraft('');
    setPendingAttachment(null);
    await onSendMessage(textToSend, attachmentToSend);
  };

  const handleScenarioClick = async (prompt: string) => {
    if (isSending) return;
    await onSendMessage(prompt);
  };

  const initials = config.agentName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: WhatsApp Live Simulator */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[640px]">
          {/* WhatsApp Header */}
          <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {!avatarFailed ? (
                <img
                  src={AGENT_AVATAR_URL}
                  alt={`${config.agentName} coordinator portrait`}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-10 h-10 rounded-full object-cover border border-white/20 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#128C7E] text-white font-semibold text-sm flex items-center justify-center shrink-0">
                  {initials || 'AI'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-[15px] leading-tight truncate">
                    {config.agentName}
                  </span>
                  <span className="text-white/75 text-xs truncate">
                    · {config.businessName}
                  </span>
                </div>
                <p className="text-[12px] text-emerald-100/90 leading-tight mt-0.5 truncate">
                  {isSending
                    ? 'typing...'
                    : handoffActive
                    ? 'Escalated to senior coordinator'
                    : 'WhatsApp Business Coordinator'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAttachSample}
              disabled={isSending || sampleLoading}
              className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 disabled:opacity-50"
              title="Attach sample biology notes photo to test multimodal reading"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{sampleLoading ? 'Loading...' : 'Attach Sample Notes'}</span>
            </button>
          </div>

          {/* Chat Thread */}
          <div className="flex-1 overflow-y-auto wa-chat-surface px-4 py-4 space-y-3">
            <div className="flex justify-center mb-2">
              <span className="text-[11px] font-medium text-slate-600 bg-white/85 border border-slate-200/80 px-3 py-1 rounded-md">
                Messages are processed by {config.agentName} using your Verified Knowledge Base
              </span>
            </div>

            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[84%] sm:max-w-[78%] rounded-xl px-3.5 py-2.5 border ${
                      isUser
                        ? 'bg-[#D9FDD3] border-[#BDE6B6] rounded-tr-sm'
                        : 'bg-white border-slate-200/90 rounded-tl-sm'
                    }`}
                  >
                    {msg.attachment && (
                      <div className="mb-2">
                        {msg.attachment.mimeType.startsWith('image/') ? (
                          <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                            <img
                              src={msg.attachment.dataUrl}
                              alt={msg.attachment.name}
                              referrerPolicy="no-referrer"
                              className="max-h-52 w-full object-cover"
                            />
                            <div className="px-2.5 py-1.5 text-[11px] text-slate-600 flex items-center justify-between gap-2 bg-white/90">
                              <span className="truncate font-medium">{msg.attachment.name}</span>
                              <span className="tabular-nums shrink-0">{msg.attachment.sizeLabel}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-900 truncate">
                                {msg.attachment.name}
                              </p>
                              <p className="text-[11px] text-slate-500 tabular-nums">
                                {msg.attachment.mimeType} · {msg.attachment.sizeLabel}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {msg.text && <WhatsAppText text={msg.text} />}

                    <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-500 tabular-nums">
                      {msg.handoffRequired && (
                        <span className="text-amber-700 font-medium mr-1">
                          Handoff triggered
                        </span>
                      )}
                      <span>{msg.timestamp}</span>
                      {isUser && <CheckCheck className="w-3.5 h-3.5 text-[#027EB5]" />}
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl rounded-tl-sm px-4 py-2.5 text-xs text-slate-500">
                  {config.agentName} is composing a WhatsApp reply...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Handoff Banner if Escalated */}
          {handoffActive && (
            <div className="bg-amber-50 border-t border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-amber-900 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="truncate">
                  Human escalation active{handoffReason ? `: ${handoffReason}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={onNavigateEscalations}
                className="text-xs font-medium text-amber-900 hover:text-amber-950 underline underline-offset-2 whitespace-nowrap shrink-0 flex items-center gap-1"
              >
                <span>View Queue</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-red-50 border-t border-red-200 px-4 py-2 text-xs text-red-800 flex items-center justify-between gap-2 shrink-0">
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Pending Attachment Preview */}
          {pendingAttachment && (
            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {pendingAttachment.mimeType.startsWith('image/') ? (
                  <img
                    src={pendingAttachment.dataUrl}
                    alt={pendingAttachment.name}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">
                    {pendingAttachment.name}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Ready to send · {pendingAttachment.sizeLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
                aria-label="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Message Composer */}
          <form
            onSubmit={handleSubmit}
            className="bg-[#F0F2F5] border-t border-slate-200 px-3 py-2.5 flex items-end gap-2 shrink-0"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,text/plain"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              title="Attach image, syllabus, or PDF"
              aria-label="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(e);
                }
              }}
              placeholder={`Message ${config.agentName} on WhatsApp...`}
              className="flex-1 resize-none bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 max-h-28"
            />

            <button
              type="submit"
              disabled={isSending || (!draft.trim() && !pendingAttachment)}
              className="px-4 py-2.5 bg-[#075E54] hover:bg-[#064E46] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>

        {/* Scenario Test Prompts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="text-sm font-display font-semibold text-slate-900">
              Quick Client Scenarios
            </h2>
            <button
              type="button"
              onClick={onResetChat}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
            >
              Clear thread
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TEST_SCENARIOS.map((sc) => (
              <button
                key={sc.label}
                type="button"
                disabled={isSending}
                onClick={() => handleScenarioClick(sc.prompt)}
                className="text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <p className="text-xs font-semibold text-slate-900">{sc.label}</p>
                <p className="text-[12px] text-slate-500 truncate mt-0.5">{sc.prompt}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Lead Qualification, Handoff & Formatting Compliance */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {/* Section 1: Extracted Lead Qualification */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-display font-semibold text-slate-900">
              Lead Qualification State
            </h2>
            <span
              className={`text-xs font-medium ${
                leadProfile.qualificationComplete ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {leadProfile.qualificationComplete ? 'Ready for Booking' : 'Qualifying'}
            </span>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-4 py-1 border-b border-slate-100">
              <dt className="text-xs text-slate-500 shrink-0">Subject / Topic</dt>
              <dd className="text-xs font-medium text-slate-900 text-right">
                {leadProfile.subject || 'Not captured yet'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-1 border-b border-slate-100">
              <dt className="text-xs text-slate-500 shrink-0">Academic Level</dt>
              <dd className="text-xs font-medium text-slate-900 text-right">
                {leadProfile.academicLevel || 'Not captured yet'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-1 border-b border-slate-100">
              <dt className="text-xs text-slate-500 shrink-0">Goal & Timeline</dt>
              <dd className="text-xs font-medium text-slate-900 text-right">
                {leadProfile.goalTimeline || 'Not captured yet'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-1">
              <dt className="text-xs text-slate-500 shrink-0">Mirrored Language</dt>
              <dd className="text-xs font-medium text-slate-900 text-right">
                {leadProfile.language || 'English'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Section 2: Escalation & Handoff Detection */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-display font-semibold text-slate-900">
              Human Handoff Protocol
            </h2>
            <span
              className={`text-xs font-medium ${
                handoffActive ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {handoffActive ? 'Escalation Triggered' : 'AI Handling'}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {handoffActive
              ? handoffReason ||
                'Conversation matched an escalation trigger and was logged in the human coordinator queue.'
              : 'Escalates automatically on live-agent requests, frustration, billing/refund disputes, or unverified policy gaps.'}
          </p>

          {handoffActive && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-slate-600">
                Tag: {config.includeHandoffTag ? '[HANDOFF_REQUIRED]' : 'Disabled'}
              </span>
              <button
                type="button"
                onClick={onNavigateEscalations}
                className="text-xs font-medium text-emerald-800 hover:text-emerald-950 underline underline-offset-2"
              >
                Inspect ticket
              </button>
            </div>
          )}
        </div>

        {/* Section 3: WhatsApp Formatting Audit */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-display font-semibold text-slate-900">
              WhatsApp Formatting Check
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            </span>
          </div>

          {lastAssistantMsg?.compliance ? (
            <ul className="space-y-2 text-xs">
              {[
                { label: 'No # Markdown headings', pass: lastAssistantMsg.compliance.noHeadings },
                { label: 'No Markdown tables', pass: lastAssistantMsg.compliance.noTables },
                { label: 'No raw HTML tags', pass: lastAssistantMsg.compliance.noHtml },
                { label: 'Concise mobile length', pass: lastAssistantMsg.compliance.conciseLength },
                { label: 'Ends with clear next step', pass: lastAssistantMsg.compliance.hasClearNextStep },
              ].map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3">
                  <span className="text-slate-700">{item.label}</span>
                  <span
                    className={`flex items-center gap-1 font-medium ${
                      item.pass ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {item.pass ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Pass</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Review</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              Send a message to inspect WhatsApp formatting compliance on the AI reply.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

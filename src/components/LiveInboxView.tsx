import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  PauseCircle,
  PlayCircle,
  User,
  MessageSquare,
  FlaskConical,
  AlertTriangle,
  X,
  Check,
  CheckCheck,
  AlertCircle,
  FileText,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Film,
  Volume2,
} from 'lucide-react';
import type { LiveConversation, LiveConversationMessage } from '../types/agent';
import { WhatsAppText } from './WhatsAppText';

interface LiveInboxViewProps {
  conversations: LiveConversation[];
  focusedPhone?: string | null;
  onSendManualReply: (phone: string, text: string) => Promise<void>;
  onToggleAiPause: (phone: string, aiPaused: boolean) => Promise<void>;
  onTriggerTestIncoming: (phone: string, contactName: string, text: string) => Promise<void>;
  onNavigateSetup: () => void;
}

const DEFAULT_TEST_PHONE = '923229524271';
const BUSINESS_SELF_PHONE = '19178094906';

const DeliveryTicks: React.FC<{
  status?: LiveConversationMessage['deliveryStatus'];
  error?: string;
}> = ({ status, error }) => {
  if (!status) return null;
  if (status === 'read') {
    return (
      <span title="Seen on WhatsApp" className="inline-flex items-center shrink-0">
        <CheckCheck className="w-3.5 h-3.5 text-[#0EA5E9]" aria-label="Seen" />
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span title="Delivered to recipient" className="inline-flex items-center shrink-0">
        <CheckCheck className="w-3.5 h-3.5 text-slate-500" aria-label="Delivered" />
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span title="Sent via WhatsApp" className="inline-flex items-center shrink-0">
        <Check className="w-3.5 h-3.5 text-slate-500" aria-label="Sent" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        title={error || 'WhatsApp delivery failed'}
        className="inline-flex items-center shrink-0"
      >
        <AlertCircle className="w-3.5 h-3.5 text-red-600" aria-label="Failed" />
      </span>
    );
  }
  return (
    <span
      title={
        status === 'simulated'
          ? 'Simulated locally (configure Meta token to send live)'
          : 'Local self-number test'
      }
      className="inline-flex items-center shrink-0"
    >
      <Check className="w-3.5 h-3.5 text-slate-400" aria-label={status} />
    </span>
  );
};

function getMediaPreviewLabel(msg: LiveConversationMessage): string {
  if (msg.mediaKind === 'image') return 'Photo';
  if (msg.mediaKind === 'sticker') return 'Sticker';
  if (msg.mediaKind === 'video') return 'Video';
  if (msg.mediaKind === 'audio') return 'Voice note';
  if (msg.mediaKind === 'document') return msg.attachmentName || 'Document';
  if (msg.attachmentName) return `File: ${msg.attachmentName}`;
  return 'Media';
}

function getEffectiveMediaKind(
  msg: LiveConversationMessage
): 'image' | 'video' | 'audio' | 'document' | 'sticker' | null {
  if (msg.mediaKind) return msg.mediaKind;
  const mime = msg.mediaMimeType?.toLowerCase() || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (msg.mediaUrl) return 'document';
  return null;
}

export const LiveInboxView: React.FC<LiveInboxViewProps> = ({
  conversations,
  focusedPhone,
  onSendManualReply,
  onToggleAiPause,
  onTriggerTestIncoming,
  onNavigateSetup,
}) => {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(
    focusedPhone ?? conversations[0]?.phone ?? null
  );
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [testingSample, setTestingSample] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testPhone, setTestPhone] = useState(DEFAULT_TEST_PHONE);
  const [testName, setTestName] = useState('Amina Tariq');
  const [testMessage, setTestMessage] = useState(
    'Assalam o alaikum, mujhe Undergraduate Biotechnology exam prep ke liye 1-on-1 tutoring chahiye next Thursday se pehle. Booking kaise hogi?'
  );
  const [lightboxMedia, setLightboxMedia] = useState<{
    url: string;
    name?: string;
  } | null>(null);
  const [brokenMediaIds, setBrokenMediaIds] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const activeConv =
    conversations.find((c) => c.phone === selectedPhone) ?? conversations[0] ?? null;

  useEffect(() => {
    if (focusedPhone) {
      setSelectedPhone(focusedPhone);
    }
  }, [focusedPhone]);

  useEffect(() => {
    if (!selectedPhone && conversations.length > 0) {
      setSelectedPhone(conversations[0].phone);
    }
  }, [conversations, selectedPhone]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length]);

  useEffect(() => {
    if (!lightboxMedia) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxMedia(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxMedia]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !replyDraft.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      await onSendManualReply(activeConv.phone, replyDraft.trim());
      setReplyDraft('');
    } finally {
      setSendingReply(false);
    }
  };

  const normalizedTestDigits = testPhone.replace(/\D/g, '');
  const isSelfNumberSelected = normalizedTestDigits === BUSINESS_SELF_PHONE;

  const handleSimulateSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!testMessage.trim() || testingSample) return;
    const phoneToUse = normalizedTestDigits || DEFAULT_TEST_PHONE;
    setTestingSample(true);
    try {
      await onTriggerTestIncoming(
        phoneToUse,
        testName.trim() || 'Test Student',
        testMessage.trim()
      );
      setSelectedPhone(phoneToUse);
      setShowTestPanel(false);
    } finally {
      setTestingSample(false);
    }
  };

  if (conversations.length === 0) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-8">
        <div className="text-center">
          <MessageSquare className="w-8 h-8 text-[#075E54] mx-auto mb-3" />
          <h2 className="text-base font-display font-semibold text-slate-900">
            No Live WhatsApp Messages Yet
          </h2>
          <p className="text-sm text-slate-600 mt-2 max-w-lg mx-auto">
            Once connected to Meta WhatsApp Cloud API, incoming student messages appear here in real time while Sara responds automatically on WhatsApp.
          </p>
        </div>

        <form onSubmit={handleSimulateSubmit} className="mt-6 space-y-3 text-left border-t border-slate-200 pt-5">
          <p className="text-xs font-semibold text-slate-800">
            Simulate / Test Incoming Message
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                External Test Phone (digits only)
              </label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder={DEFAULT_TEST_PHONE}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Student Name
              </label>
              <input
                type="text"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>
          {isSelfNumberSelected && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Note: {BUSINESS_SELF_PHONE} is your own business WhatsApp number. Outbound Meta API send will be skipped automatically so it does not trigger a self-send error.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Test Message
            </label>
            <textarea
              rows={2}
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              disabled={testingSample || !testMessage.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors disabled:opacity-50"
            >
              {testingSample ? 'Processing Webhook...' : 'Simulate Live WhatsApp Message'}
            </button>
            <button
              type="button"
              onClick={onNavigateSetup}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Configure WhatsApp Cloud API
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Active WhatsApp Threads + Simulate Incoming Tool */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-display font-semibold text-slate-900">
                Client Threads
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                ({conversations.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowTestPanel((v) => !v)}
              className="px-2.5 py-1 text-[11px] font-medium text-[#075E54] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              {showTestPanel ? (
                <>
                  <X className="w-3 h-3" />
                  <span>Close Test</span>
                </>
              ) : (
                <>
                  <FlaskConical className="w-3 h-3" />
                  <span>Simulate Incoming</span>
                </>
              )}
            </button>
          </div>

          {/* Inline Simulate / Test Incoming Message Form */}
          {showTestPanel && (
            <form
              onSubmit={handleSimulateSubmit}
              className="p-3.5 bg-slate-50 border-b border-slate-200 space-y-2.5"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    External Phone
                  </label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder={DEFAULT_TEST_PHONE}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Student Name
                  </label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>
              {isSelfNumberSelected && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                  Own business number ({BUSINESS_SELF_PHONE}) selected — Meta outbound send will be skipped automatically.
                </p>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Incoming Message
                </label>
                <textarea
                  rows={2}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-700"
                />
              </div>
              <button
                type="submit"
                disabled={testingSample || !testMessage.trim()}
                className="w-full py-1.5 px-3 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-md transition-colors disabled:opacity-50"
              >
                {testingSample ? 'Sending to Sara...' : 'Send Simulated Message'}
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
            {conversations.map((conv) => {
              const lastMsg = conv.messages[conv.messages.length - 1];
              const isSelected = activeConv?.phone === conv.phone;
              const previewText = lastMsg
                ? lastMsg.text?.trim() || getMediaPreviewLabel(lastMsg)
                : '';
              const lastMediaKind = lastMsg ? getEffectiveMediaKind(lastMsg) : null;

              return (
                <button
                  key={conv.phone}
                  type="button"
                  onClick={() => setSelectedPhone(conv.phone)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {conv.contactName}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                      {lastMsg?.timestamp || ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      +{conv.phone}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        conv.aiPaused ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {conv.aiPaused ? 'Human Takeover' : 'AI Auto-Reply'}
                    </span>
                  </div>
                  {lastMsg && (
                    <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                      {lastMsg.role !== 'user' && lastMsg.deliveryStatus && (
                        <DeliveryTicks
                          status={lastMsg.deliveryStatus}
                          error={lastMsg.deliveryError}
                        />
                      )}
                      {!lastMsg.text?.trim() && lastMediaKind && (
                        <span className="text-slate-400 shrink-0">
                          {lastMediaKind === 'image' || lastMediaKind === 'sticker' ? (
                            <ImageIcon className="w-3.5 h-3.5" />
                          ) : lastMediaKind === 'video' ? (
                            <Film className="w-3.5 h-3.5" />
                          ) : lastMediaKind === 'audio' ? (
                            <Volume2 className="w-3.5 h-3.5" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                      <p className="text-xs text-slate-600 truncate">{previewText}</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Live Thread View & Coordinator Takeover */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[640px]">
          {activeConv ? (
            <>
              {/* Thread Header */}
              <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-display font-semibold text-slate-900 truncate">
                        {activeConv.contactName}
                      </h3>
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
                        +{activeConv.phone}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {[
                        activeConv.leadProfile?.subject || 'Subject pending',
                        activeConv.leadProfile?.academicLevel || 'Level pending',
                        activeConv.leadProfile?.language || 'English',
                      ].join(' · ')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleAiPause(activeConv.phone, !activeConv.aiPaused)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeConv.aiPaused
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                      : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  {activeConv.aiPaused ? (
                    <>
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>Resume AI Replies</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-3.5 h-3.5" />
                      <span>Pause AI for Human Takeover</span>
                    </>
                  )}
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto wa-chat-surface p-4 space-y-3">
                {activeConv.messages.map((msg) => {
                  const isClient = msg.role === 'user';
                  const mediaKind = getEffectiveMediaKind(msg);
                  const mediaBroken = Boolean(brokenMediaIds[msg.id]);
                  const hasPlayableMedia = Boolean(msg.mediaUrl && !mediaBroken);

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-3.5 py-2.5 border ${
                          isClient
                            ? 'bg-white border-slate-200 rounded-tl-sm'
                            : msg.role === 'human_agent'
                            ? 'bg-sky-50 border-sky-200 rounded-tr-sm'
                            : 'bg-[#D9FDD3] border-[#BDE6B6] rounded-tr-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500 mb-1">
                          <span className="font-semibold text-slate-700">
                            {isClient
                              ? activeConv.contactName
                              : msg.role === 'human_agent'
                              ? 'Human Coordinator'
                              : msg.aiModelUsed
                              ? `Sara AI (${msg.aiModelUsed})`
                              : 'Sara AI Agent'}
                          </span>
                        </div>

                        {/* Inline Media Rendering */}
                        {hasPlayableMedia && msg.mediaUrl && (
                          <div className="mb-2">
                            {(mediaKind === 'image' || mediaKind === 'sticker') && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxMedia({
                                    url: msg.mediaUrl!,
                                    name: msg.attachmentName,
                                  })
                                }
                                className="block group relative rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-700/40"
                                title="Click to view full size"
                              >
                                <img
                                  src={msg.mediaUrl}
                                  alt={msg.attachmentName || 'WhatsApp media'}
                                  loading="lazy"
                                  onError={() =>
                                    setBrokenMediaIds((prev) => ({ ...prev, [msg.id]: true }))
                                  }
                                  className={
                                    mediaKind === 'sticker'
                                      ? 'max-h-40 w-auto object-contain rounded-lg'
                                      : 'max-h-72 w-auto max-w-full rounded-lg object-cover border border-slate-200/80 transition-opacity group-hover:opacity-95'
                                  }
                                />
                              </button>
                            )}

                            {mediaKind === 'video' && (
                              <video
                                src={msg.mediaUrl}
                                controls
                                playsInline
                                preload="metadata"
                                onError={() =>
                                  setBrokenMediaIds((prev) => ({ ...prev, [msg.id]: true }))
                                }
                                className="rounded-lg max-h-64 w-full bg-black"
                              />
                            )}

                            {mediaKind === 'audio' && (
                              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                                <Volume2 className="w-4 h-4 text-[#075E54] shrink-0" />
                                <audio
                                  src={msg.mediaUrl}
                                  controls
                                  preload="metadata"
                                  onError={() =>
                                    setBrokenMediaIds((prev) => ({ ...prev, [msg.id]: true }))
                                  }
                                  className="h-8 w-56 max-w-full"
                                />
                              </div>
                            )}

                            {mediaKind === 'document' && (
                              <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="w-4 h-4 text-[#075E54] shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-800 truncate">
                                      {msg.attachmentName || 'WhatsApp Document'}
                                    </p>
                                    {msg.mediaMimeType && (
                                      <p className="text-[10px] text-slate-500 uppercase truncate">
                                        {msg.mediaMimeType}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={msg.mediaUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded flex items-center gap-1"
                                    title="Open in new tab"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Open</span>
                                  </a>
                                  <a
                                    href={msg.mediaUrl}
                                    download={msg.attachmentName || true}
                                    className="px-2 py-1 text-[11px] font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded flex items-center gap-1"
                                    title="Download file"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Save</span>
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Fallback if media failed to load or older attachment-only message */}
                        {(mediaBroken || (!msg.mediaUrl && msg.attachmentName)) && (
                          <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 mb-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="font-medium truncate">
                              {msg.attachmentName || 'Media attachment'}
                            </span>
                            {mediaBroken && (
                              <span className="text-slate-400 shrink-0">(unavailable)</span>
                            )}
                          </div>
                        )}

                        {msg.text && msg.text.trim().length > 0 && (
                          <WhatsAppText text={msg.text} />
                        )}

                        {/* Bubble Footer: Timestamp + WhatsApp Delivery / Seen Ticks */}
                        <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px]">
                          {!isClient && msg.deliveryStatus === 'simulated' && (
                            <span className="text-slate-500">Simulated</span>
                          )}
                          {!isClient && msg.deliveryStatus === 'skipped_self' && (
                            <span className="text-slate-500">Self test</span>
                          )}
                          {!isClient && msg.deliveryStatus === 'read' && (
                            <span className="text-[#0284C7] font-medium">Seen</span>
                          )}
                          <span className="text-slate-500 tabular-nums">{msg.timestamp}</span>
                          {!isClient && (
                            <DeliveryTicks
                              status={msg.deliveryStatus}
                              error={msg.deliveryError}
                            />
                          )}
                        </div>

                        {!isClient && msg.deliveryStatus === 'failed' && (
                          <div className="mt-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1 text-left">
                            WhatsApp delivery failed
                            {msg.deliveryError ? `: ${msg.deliveryError}` : ''}
                          </div>
                        )}

                        {!isClient && msg.aiError && (
                          <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50/90 border border-amber-200 rounded-md px-2 py-1 text-left">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                            <span className="break-words">
                              AI fallback used (Gemini error): {msg.aiError}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {/* Manual Human Coordinator Reply Composer */}
              <form
                onSubmit={handleManualSubmit}
                className="bg-[#F0F2F5] border-t border-slate-200 p-3 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder={`Reply manually to ${activeConv.contactName} on WhatsApp...`}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyDraft.trim()}
                  className="px-4 py-2 bg-[#075E54] hover:bg-[#064E46] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-45"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Reply</span>
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      {/* Fullscreen Image / Sticker Lightbox */}
      {lightboxMedia && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxMedia(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[90vh] flex flex-col items-center gap-3"
          >
            <div className="w-full flex items-center justify-between gap-4 text-white">
              <span className="text-xs font-medium truncate">
                {lightboxMedia.name || 'WhatsApp Media'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={lightboxMedia.url}
                  download={lightboxMedia.name || 'whatsapp-media'}
                  className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxMedia(null)}
                  aria-label="Close image preview"
                  className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.name || 'WhatsApp media preview'}
              className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg shadow-2xl bg-slate-900"
            />
          </div>
        </div>
      )}
    </>
  );
};

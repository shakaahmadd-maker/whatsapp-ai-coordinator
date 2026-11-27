import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, MessageSquare, X } from 'lucide-react';
import { LiveInboxView } from './components/LiveInboxView';
import { SimulatorView } from './components/SimulatorView';
import { KnowledgeBaseView } from './components/KnowledgeBaseView';
import { EscalationsView } from './components/EscalationsView';
import { WhatsAppSetupView } from './components/WhatsAppSetupView';
import { DEFAULT_KB_CONFIG } from './utils/promptBuilder';
import { evaluateWhatsAppCompliance, formatTimeNow } from './utils/whatsappFormatter';
import {
  playIncomingNotificationSound,
  unlockNotificationAudio,
} from './utils/notificationSound';
import type {
  ChatApiResponse,
  ChatAttachment,
  ChatMessage,
  EscalationTicket,
  KnowledgeBaseConfig,
  LeadProfile,
  LiveConversation,
  WhatsAppConnectionStatus,
} from './types/agent';

type WorkspaceTab = 'inbox' | 'simulator' | 'knowledge' | 'escalations' | 'setup';

interface IncomingPopupAlert {
  id: string;
  phone: string;
  contactName: string;
  text: string;
  timestamp: string;
}

const STORAGE_KB_KEY = 'wa_coordinator_kb_v1';
const STORAGE_SOUND_KEY = 'wa_studio_sound_v1';

function createInitialGreeting(config: KnowledgeBaseConfig): ChatMessage {
  const greeting = `Hey! I'm ${config.agentName} from ${config.businessName}. What are you working on today?`;
  return {
    id: 'msg-welcome',
    role: 'assistant',
    text: greeting,
    timestamp: formatTimeNow(),
    compliance: evaluateWhatsAppCompliance(greeting),
  };
}

const INITIAL_LEAD: LeadProfile = {
  subject: null,
  academicLevel: null,
  goalTimeline: null,
  language: 'English',
  qualificationComplete: false,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('inbox');

  const [config, setConfig] = useState<KnowledgeBaseConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KB_KEY);
      if (saved) return { ...DEFAULT_KB_CONFIG, ...JSON.parse(saved) };
    } catch {
      // Fallback to default
    }
    return DEFAULT_KB_CONFIG;
  });

  const [liveConversations, setLiveConversations] = useState<LiveConversation[]>([]);
  const [serverTickets, setServerTickets] = useState<EscalationTicket[]>([]);
  const [simTickets, setSimTickets] = useState<EscalationTicket[]>([]);
  const [waStatus, setWaStatus] = useState<WhatsAppConnectionStatus | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createInitialGreeting(config),
  ]);
  const [leadProfile, setLeadProfile] = useState<LeadProfile>(INITIAL_LEAD);
  const [handoffActive, setHandoffActive] = useState(false);
  const [handoffReason, setHandoffReason] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [focusedPhone, setFocusedPhone] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SOUND_KEY);
      if (saved !== null) return saved === 'true';
    } catch {
      // Default to enabled
    }
    return true;
  });
  const [incomingAlerts, setIncomingAlerts] = useState<IncomingPopupAlert[]>([]);

  const soundEnabledRef = useRef(soundEnabled);
  const seenUserMessageIdsRef = useRef<Set<string>>(new Set());
  const initialConversationsHydratedRef = useRef(false);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Unlock Web Audio on first user interaction so incoming text chimes play reliably
  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockNotificationAudio();
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { once: true });
    window.addEventListener('keydown', handleFirstInteraction, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  const dismissIncomingAlert = useCallback((id: string) => {
    setIncomingAlerts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem(STORAGE_SOUND_KEY, String(next));
    } catch {
      // Ignore storage error
    }
    if (next) {
      unlockNotificationAudio();
      playIncomingNotificationSound();
    }
  };

  const handleOpenAlertThread = (alert: IncomingPopupAlert) => {
    setFocusedPhone(alert.phone);
    setActiveTab('inbox');
    dismissIncomingAlert(alert.id);
  };

  const processIncomingSnapshotAlerts = useCallback(
    (conversations: LiveConversation[], isInitialLoad: boolean) => {
      const newlyArrived: IncomingPopupAlert[] = [];

      for (const conv of conversations) {
        for (const msg of conv.messages || []) {
          if (msg.role !== 'user') continue;
          if (!seenUserMessageIdsRef.current.has(msg.id)) {
            seenUserMessageIdsRef.current.add(msg.id);
            if (!isInitialLoad && initialConversationsHydratedRef.current) {
              newlyArrived.push({
                id: msg.id,
                phone: conv.phone,
                contactName: conv.contactName || conv.phone,
                text:
                  msg.text ||
                  (msg.attachmentName
                    ? `Sent file: ${msg.attachmentName}`
                    : msg.mediaKind === 'image'
                    ? 'Sent a photo'
                    : msg.mediaKind === 'video'
                    ? 'Sent a video'
                    : msg.mediaKind === 'audio'
                    ? 'Sent a voice note'
                    : msg.mediaKind === 'sticker'
                    ? 'Sent a sticker'
                    : msg.mediaKind === 'document'
                    ? 'Sent a document'
                    : 'New message'),
                timestamp: msg.timestamp || formatTimeNow(),
              });
            }
          }
        }
      }

      if (isInitialLoad || !initialConversationsHydratedRef.current) {
        initialConversationsHydratedRef.current = true;
        return;
      }

      if (newlyArrived.length > 0) {
        if (soundEnabledRef.current) {
          playIncomingNotificationSound();
        }
        setIncomingAlerts((prev) => [...newlyArrived, ...prev].slice(0, 3));
        for (const item of newlyArrived) {
          window.setTimeout(() => {
            setIncomingAlerts((prev) => prev.filter((a) => a.id !== item.id));
          }, 7000);
        }
      }
    },
    []
  );

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = (await res.json()) as WhatsAppConnectionStatus;
        setWaStatus(data);
      }
    } catch {
      // Non-blocking status check
    }
  }, []);

  useEffect(() => {
    void refreshStatus();

    // Load initial server-persisted config & live conversations
    void (async () => {
      try {
        const [cfgRes, convRes] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/whatsapp/conversations'),
        ]);
        if (cfgRes.ok) {
          const serverCfg = (await cfgRes.json()) as KnowledgeBaseConfig;
          setConfig(serverCfg);
          localStorage.setItem(STORAGE_KB_KEY, JSON.stringify(serverCfg));
        }
        if (convRes.ok) {
          const data = (await convRes.json()) as {
            conversations: LiveConversation[];
            tickets: EscalationTicket[];
          };
          const convs = data.conversations || [];
          processIncomingSnapshotAlerts(convs, true);
          setLiveConversations(convs);
          setServerTickets(data.tickets || []);
        }
      } catch {
        // Fallback silently on network hiccup
      }
    })();

    // Subscribe to real-time SSE updates from incoming WhatsApp Cloud webhooks
    const eventSource = new EventSource('/api/whatsapp/events');
    eventSource.addEventListener('snapshot', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as {
          conversations: LiveConversation[];
          tickets: EscalationTicket[];
        };
        const convs = parsed.conversations || [];
        processIncomingSnapshotAlerts(convs, false);
        setLiveConversations(convs);
        setServerTickets(parsed.tickets || []);
      } catch {
        // Ignore malformed event
      }
    });

    return () => {
      eventSource.close();
    };
  }, [refreshStatus, processIncomingSnapshotAlerts]);

  const handleResetChat = () => {
    setMessages([createInitialGreeting(config)]);
    setLeadProfile(INITIAL_LEAD);
    setHandoffActive(false);
    setHandoffReason(null);
    setErrorMessage(null);
    setActiveTab('simulator');
  };

  const handleUpdateConfig = async (next: KnowledgeBaseConfig) => {
    setConfig(next);
    try {
      localStorage.setItem(STORAGE_KB_KEY, JSON.stringify(next));
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {
      // Saved locally even if server sync fails temporarily
    }
    if (messages.length === 1 && messages[0].id === 'msg-welcome') {
      setMessages([createInitialGreeting(next)]);
    }
  };

  const handleToggleTicketStatus = async (id: string) => {
    const isServerTicket = serverTickets.some((t) => t.id === id);
    if (isServerTicket) {
      await fetch(`/api/whatsapp/tickets/${encodeURIComponent(id)}/toggle`, {
        method: 'POST',
      });
      return;
    }
    setSimTickets((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === 'Pending' ? 'Resolved' : 'Pending' }
          : t
      )
    );
  };

  const handleSendManualReply = async (phone: string, text: string) => {
    await fetch('/api/whatsapp/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text }),
    });
  };

  const handleToggleAiPause = async (phone: string, aiPaused: boolean) => {
    await fetch('/api/whatsapp/toggle-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, aiPaused }),
    });
  };

  const handleSaveChatInstructions = async (phone: string, instructions: string) => {
    const res = await fetch(
      `/api/whatsapp/conversations/${encodeURIComponent(phone)}/instructions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to save chat instructions.');
    }
  };

  const handleTriggerAiFollowUp = async (phone: string, instructions: string) => {
    const res = await fetch(
      `/api/whatsapp/conversations/${encodeURIComponent(phone)}/ai-followup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to send AI follow-up.');
    }
  };

  const handleSavePhoneNumberId = async (
    phoneNumberId: string,
    graphApiVersion?: string
  ) => {
    const res = await fetch('/api/whatsapp/phone-number-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumberId, graphApiVersion }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to save Phone Number ID.');
    }
    setWaStatus(payload as WhatsAppConnectionStatus);
  };

  const handleVerifyConnection = async () => {
    const res = await fetch('/api/whatsapp/verify-connection', {
      method: 'POST',
    });
    if (res.ok) {
      const payload = (await res.json()) as WhatsAppConnectionStatus;
      setWaStatus(payload);
    }
  };

  const handleSaveAdminNotification = async (enabled: boolean, phone: string) => {
    const res = await fetch('/api/whatsapp/admin-notification', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, phone }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to save WhatsApp alert settings.');
    }
    setWaStatus(payload as WhatsAppConnectionStatus);
  };

  const handleTestAdminNotification = async () => {
    const res = await fetch('/api/whatsapp/admin-notification/test', {
      method: 'POST',
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to send test WhatsApp alert.');
    }
    if (payload?.status) {
      setWaStatus(payload.status as WhatsAppConnectionStatus);
    }
    return payload?.result;
  };

  const handleTriggerTestIncoming = async (
    phone: string,
    contactName: string,
    text: string
  ) => {
    const res = await fetch('/api/whatsapp/test-incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, contactName, text }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || 'Webhook test failed.');
    }
  };

  const handleSendMessage = async (text: string, attachment?: ChatAttachment) => {
    setErrorMessage(null);
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      text,
      timestamp: formatTimeNow(),
      attachment,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsSending(true);

    try {
      const apiMessages = nextMessages.map((m) => {
        let base64Data: string | undefined;
        if (m.attachment?.dataUrl) {
          const commaIdx = m.attachment.dataUrl.indexOf(',');
          base64Data =
            commaIdx >= 0 ? m.attachment.dataUrl.slice(commaIdx + 1) : m.attachment.dataUrl;
        }
        return {
          role: m.role,
          text: m.text,
          attachment:
            m.attachment && base64Data
              ? {
                  name: m.attachment.name,
                  mimeType: m.attachment.mimeType,
                  base64Data,
                }
              : undefined,
        };
      });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          messages: apiMessages,
          currentLead: leadProfile,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || `Request failed with status ${res.status}`);
      }

      const data = payload as ChatApiResponse;
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        text: data.reply,
        timestamp: formatTimeNow(),
        handoffRequired: data.handoffRequired,
        handoffReason: data.handoffReason,
        compliance: evaluateWhatsAppCompliance(data.reply),
      };

      const updatedMessages = [...nextMessages, assistantMsg];
      setMessages(updatedMessages);
      if (data.leadProfile) {
        setLeadProfile(data.leadProfile);
      }

      if (data.handoffRequired) {
        setHandoffActive(true);
        setHandoffReason(data.handoffReason ?? 'Human coordinator requested');

        const newTicket: EscalationTicket = {
          id: `SIM-${String(simTickets.length + 1).padStart(3, '0')}`,
          createdAt: formatTimeNow(),
          clientSummary: text || attachment?.name || 'Simulator escalation',
          reason: data.handoffReason || 'Escalation protocol triggered',
          language: data.leadProfile?.language || 'English',
          status: 'Pending',
          transcript: updatedMessages.map((m) => ({
            role: m.role,
            text: m.text || (m.attachment ? `[File: ${m.attachment.name}]` : ''),
            timestamp: m.timestamp,
          })),
        };
        setSimTickets((prev) => [newTicket, ...prev]);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to reach coordinator service.';
      setErrorMessage(message);
    } finally {
      setIsSending(false);
    }
  };

  const allTickets = [...serverTickets, ...simTickets];
  const pendingCount = allTickets.filter((t) => t.status === 'Pending').length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#inbox"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('inbox');
            }}
            className="text-base font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Coordinator Studio
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 tabular-nums ${
                activeTab === 'inbox'
                  ? 'text-slate-900 border-[#075E54]'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              {liveConversations.length > 0
                ? `Live Inbox (${liveConversations.length})`
                : 'Live Inbox'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'simulator'
                  ? 'text-slate-900 border-[#075E54]'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Simulator
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('knowledge')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'knowledge'
                  ? 'text-slate-900 border-[#075E54]'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Knowledge Base
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('escalations')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 tabular-nums ${
                activeTab === 'escalations'
                  ? 'text-slate-900 border-[#075E54]'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              {pendingCount > 0 ? `Escalations (${pendingCount})` : 'Escalations'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('setup')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'setup'
                  ? 'text-slate-900 border-[#075E54]'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              WhatsApp Setup
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleSound}
              title={soundEnabled ? 'Mute incoming message sound' : 'Unmute incoming message sound'}
              aria-label={soundEnabled ? 'Mute incoming message sound' : 'Unmute incoming message sound'}
              className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                soundEnabled
                  ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-slate-600'
              }`}
            >
              {soundEnabled ? (
                <Bell className="w-3.5 h-3.5 text-[#075E54]" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
            </button>
            <button
              type="button"
              onClick={handleResetChat}
              className="px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              New Thread
            </button>
          </div>
        </div>

        {/* Compact Mobile Navigation */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600">
          {(
            [
              {
                id: 'inbox',
                label:
                  liveConversations.length > 0
                    ? `Live Inbox (${liveConversations.length})`
                    : 'Live Inbox',
              },
              { id: 'simulator', label: 'Simulator' },
              { id: 'knowledge', label: 'Knowledge Base' },
              {
                id: 'escalations',
                label: pendingCount > 0 ? `Escalations (${pendingCount})` : 'Escalations',
              },
              { id: 'setup', label: 'WhatsApp Setup' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`whitespace-nowrap shrink-0 py-0.5 ${
                activeTab === item.id ? 'text-[#075E54] font-semibold' : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <p className="text-xs text-slate-500">
            {config.businessName} · {config.website} · Agent: {config.agentName} ·{' '}
            {waStatus?.lastVerification?.connected
              ? `Meta WhatsApp Connected (${waStatus.lastVerification.displayPhoneNumber || 'Verified'})`
              : waStatus?.configured
              ? 'WhatsApp Cloud Ready (Unverified)'
              : 'WhatsApp Setup Pending'}
          </p>
        </div>

        {activeTab === 'inbox' && (
          <LiveInboxView
            conversations={liveConversations}
            focusedPhone={focusedPhone}
            onSendManualReply={handleSendManualReply}
            onToggleAiPause={handleToggleAiPause}
            onSaveChatInstructions={handleSaveChatInstructions}
            onTriggerAiFollowUp={handleTriggerAiFollowUp}
            onTriggerTestIncoming={handleTriggerTestIncoming}
            onNavigateSetup={() => setActiveTab('setup')}
          />
        )}

        {activeTab === 'simulator' && (
          <SimulatorView
            config={config}
            messages={messages}
            leadProfile={leadProfile}
            handoffActive={handoffActive}
            handoffReason={handoffReason}
            isSending={isSending}
            errorMessage={errorMessage}
            onSendMessage={handleSendMessage}
            onResetChat={handleResetChat}
            onNavigateEscalations={() => setActiveTab('escalations')}
          />
        )}

        {activeTab === 'knowledge' && (
          <KnowledgeBaseView
            config={config}
            onUpdateConfig={handleUpdateConfig}
          />
        )}

        {activeTab === 'escalations' && (
          <EscalationsView
            tickets={allTickets}
            onToggleTicketStatus={handleToggleTicketStatus}
            onReturnToSimulator={() => setActiveTab('simulator')}
          />
        )}

        {activeTab === 'setup' && (
          <WhatsAppSetupView
            config={config}
            status={waStatus}
            onRefreshStatus={refreshStatus}
            onSavePhoneNumberId={handleSavePhoneNumberId}
            onVerifyConnection={handleVerifyConnection}
            onSaveAdminNotification={handleSaveAdminNotification}
            onTestAdminNotification={handleTestAdminNotification}
            onTriggerTestIncoming={handleTriggerTestIncoming}
            onNavigateInbox={() => setActiveTab('inbox')}
          />
        )}
      </main>

      {/* Real-time incoming WhatsApp text pop-up alerts */}
      {incomingAlerts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-[340px] max-w-[calc(100vw-2rem)]"
        >
          {incomingAlerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-white border border-slate-200 border-l-4 border-l-[#075E54] rounded-xl shadow-lg p-3.5 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAlertThread(alert)}
                  className="flex items-start gap-2.5 text-left min-w-0 flex-1 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#075E54] flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-[#075E54]">
                        {alert.contactName}
                      </p>
                      <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                        {alert.timestamp}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      +{alert.phone.replace(/^\+/, '')}
                    </p>
                    <p className="text-xs text-slate-700 mt-1 line-clamp-2 leading-snug">
                      {alert.text}
                    </p>
                    <span className="inline-block text-[11px] font-medium text-[#075E54] mt-1.5 group-hover:underline">
                      Open conversation
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => dismissIncomingAlert(alert.id)}
                  aria-label="Dismiss notification"
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

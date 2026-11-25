import { useCallback, useEffect, useState } from 'react';
import { LiveInboxView } from './components/LiveInboxView';
import { SimulatorView } from './components/SimulatorView';
import { KnowledgeBaseView } from './components/KnowledgeBaseView';
import { EscalationsView } from './components/EscalationsView';
import { WhatsAppSetupView } from './components/WhatsAppSetupView';
import { DEFAULT_KB_CONFIG } from './utils/promptBuilder';
import { evaluateWhatsAppCompliance, formatTimeNow } from './utils/whatsappFormatter';
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

const STORAGE_KB_KEY = 'wa_coordinator_kb_v1';

function createInitialGreeting(config: KnowledgeBaseConfig): ChatMessage {
  const greeting = `Hi! This is ${config.agentName} from ${config.businessName}. What academic help do you need today, and what is your subject or deadline?`;
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
          setLiveConversations(data.conversations || []);
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
        setLiveConversations(parsed.conversations || []);
        setServerTickets(parsed.tickets || []);
      } catch {
        // Ignore malformed event
      }
    });

    return () => {
      eventSource.close();
    };
  }, [refreshStatus]);

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

          <div className="flex items-center gap-3 shrink-0">
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
            onSendManualReply={handleSendManualReply}
            onToggleAiPause={handleToggleAiPause}
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
            onTriggerTestIncoming={handleTriggerTestIncoming}
            onNavigateInbox={() => setActiveTab('inbox')}
          />
        )}
      </main>
    </div>
  );
}

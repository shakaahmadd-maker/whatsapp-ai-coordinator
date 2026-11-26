export interface KnowledgeBaseFaqItem {
  id: string;
  category: string;
  question: string;
  keywords?: string;
  answer: string;
  enabled: boolean;
}

export interface KnowledgeBaseConfig {
  agentName: string;
  businessName: string;
  website: string;
  coreServices: string;
  subjectsCovered: string;
  operatingHours: string;
  pricingPolicy: string;
  bookingLink: string;
  paymentMethods: string;
  additionalNotes: string;
  includeHandoffTag: boolean;
  faqItems?: KnowledgeBaseFaqItem[];
}

export interface LeadProfile {
  subject: string | null;
  academicLevel: string | null;
  goalTimeline: string | null;
  language: string;
  qualificationComplete: boolean;
}

export interface WhatsAppCompliance {
  noHeadings: boolean;
  noTables: boolean;
  noHtml: boolean;
  conciseLength: boolean;
  hasClearNextStep: boolean;
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
  sizeLabel: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  attachment?: ChatAttachment;
  handoffRequired?: boolean;
  handoffReason?: string | null;
  compliance?: WhatsAppCompliance;
}

export interface EscalationTicket {
  id: string;
  createdAt: string;
  clientPhone?: string;
  clientName?: string;
  clientSummary: string;
  reason: string;
  language: string;
  status: 'Pending' | 'Resolved';
  transcript: Array<{
    role: 'user' | 'assistant' | 'human_agent';
    text: string;
    timestamp: string;
  }>;
}

export interface LiveConversationMessage {
  id: string;
  waMessageId?: string;
  role: 'user' | 'assistant' | 'human_agent';
  text: string;
  timestamp: string;
  deliveryStatus?:
    | 'sent'
    | 'delivered'
    | 'read'
    | 'simulated'
    | 'failed'
    | 'skipped_self';
  deliveryError?: string;
  aiError?: string;
  aiModelUsed?: string;
  attachmentName?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaKind?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  handoffTriggered?: boolean;
}

export interface LiveConversation {
  phone: string;
  contactName: string;
  lastActiveAt: string;
  aiPaused: boolean;
  handoffReason: string | null;
  leadProfile: LeadProfile;
  messages: LiveConversationMessage[];
}

export interface WhatsAppVerifyResult {
  connected: boolean;
  verifiedPhoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  checkedAt: string;
  error?: string;
}

export interface WebhookTrafficEntry {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST';
  status: number;
  event:
    | 'verify_ok'
    | 'verify_failed'
    | 'signature_mismatch'
    | 'messages_received'
    | 'statuses_only'
    | 'ignored';
  detail: string;
}

export interface WhatsAppConnectionStatus {
  configured: boolean;
  hasGeminiKey: boolean;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  phoneNumberIdValid: boolean;
  phoneNumberIdWarning: string | null;
  activePhoneNumberId: string | null;
  phoneNumberIdSource: 'dashboard' | 'env' | 'none';
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  appSecretFormatWarning?: string | null;
  envHygieneClean: boolean;
  envHygieneIssues: string[];
  webhookPath: string;
  graphApiVersion: string;
  lastVerification: WhatsAppVerifyResult | null;
  recentWebhookEvents?: WebhookTrafficEntry[];
}

export interface ChatApiRequest {
  config: KnowledgeBaseConfig;
  messages: Array<{
    role: 'user' | 'assistant';
    text: string;
    attachment?: {
      name: string;
      mimeType: string;
      base64Data: string;
    };
  }>;
  currentLead: LeadProfile;
}

export interface ChatApiResponse {
  reply: string;
  handoffRequired: boolean;
  handoffReason: string | null;
  leadProfile: LeadProfile;
  modelUsed?: string;
}

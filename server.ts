import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  buildSystemPrompt,
  DEFAULT_KB_CONFIG,
  findBestMatchingFaq,
} from './src/utils/promptBuilder.ts';
import type {
  ChatApiRequest,
  ChatApiResponse,
  EscalationTicket,
  KnowledgeBaseConfig,
  KnowledgeBaseFaqItem,
  LeadProfile,
  LiveConversation,
  WebhookTrafficEntry,
  WhatsAppConnectionStatus,
  WhatsAppVerifyResult,
} from './src/types/agent.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_GRAPH_VERSIONS = [
  'v27.0',
  'v26.0',
  'v25.0',
  'v24.0',
  'v23.0',
  'v22.0',
  'v21.0',
] as const;
const DEFAULT_GRAPH_API_VERSION = 'v25.0';
const BUSINESS_SELF_PHONE = '19178094906';
const DEFAULT_EXTERNAL_TEST_PHONE = '923229524271';
const DATA_DIR = process.env.DATA_DIR?.trim()
  ? path.resolve(process.env.DATA_DIR.trim())
  : path.resolve(__dirname, 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');

function cleanEnvValue(raw?: string): string {
  if (!raw) return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
    (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

function inspectEnvHygiene(): { clean: boolean; issues: string[] } {
  const keys = [
    'GEMINI_API_KEY',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
  ] as const;
  const issues: string[] = [];
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    if (raw !== raw.trim()) {
      issues.push(`${key} had leading/trailing whitespace (auto-trimmed at runtime)`);
    }
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      issues.push(`${key} had surrounding quotes (auto-stripped at runtime)`);
    }
  }
  return { clean: issues.length === 0, issues };
}

interface ServerStore {
  config: KnowledgeBaseConfig;
  phoneNumberIdOverride?: string;
  graphApiVersionOverride?: string;
  lastVerification: WhatsAppVerifyResult | null;
  conversations: Record<string, LiveConversation>;
  tickets: EscalationTicket[];
  webhookLogs: WebhookTrafficEntry[];
}

function sanitizeFaqItems(raw: unknown): KnowledgeBaseFaqItem[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: KnowledgeBaseFaqItem[] = [];
  for (const entry of raw.slice(0, 200)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<KnowledgeBaseFaqItem>;
    const question = typeof item.question === 'string' ? item.question.trim().slice(0, 500) : '';
    const answer = typeof item.answer === 'string' ? item.answer.trim().slice(0, 2500) : '';
    if (!question || !answer) continue;
    const id =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim().slice(0, 80)
        : `faq-${Date.now()}-${cleaned.length}`;
    const category =
      typeof item.category === 'string' && item.category.trim()
        ? item.category.trim().slice(0, 40)
        : 'General';
    const keywords =
      typeof item.keywords === 'string' ? item.keywords.trim().slice(0, 300) : '';
    cleaned.push({
      id,
      category,
      question,
      keywords: keywords || undefined,
      answer,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    });
  }
  return cleaned;
}

function loadStore(): ServerStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ServerStore>;
      const mergedConfig: KnowledgeBaseConfig = {
        ...DEFAULT_KB_CONFIG,
        ...(parsed.config || {}),
        faqItems: Array.isArray(parsed.config?.faqItems)
          ? sanitizeFaqItems(parsed.config.faqItems)
          : DEFAULT_KB_CONFIG.faqItems,
      };
      return {
        config: mergedConfig,
        phoneNumberIdOverride:
          typeof parsed.phoneNumberIdOverride === 'string'
            ? parsed.phoneNumberIdOverride
            : undefined,
        graphApiVersionOverride:
          typeof parsed.graphApiVersionOverride === 'string' &&
          (ALLOWED_GRAPH_VERSIONS as readonly string[]).includes(parsed.graphApiVersionOverride)
            ? parsed.graphApiVersionOverride
            : undefined,
        lastVerification: parsed.lastVerification || null,
        conversations: parsed.conversations || {},
        tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
        webhookLogs: Array.isArray(parsed.webhookLogs) ? parsed.webhookLogs.slice(0, 20) : [],
      };
    }
  } catch (err) {
    console.error('[Store load error]', err);
  }
  return {
    config: DEFAULT_KB_CONFIG,
    phoneNumberIdOverride: undefined,
    graphApiVersionOverride: undefined,
    lastVerification: null,
    conversations: {},
    tickets: [],
    webhookLogs: [],
  };
}

let store: ServerStore = loadStore();

function persistStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('[Store persist error]', err);
  }
}

const sseClients = new Set<Response>();
function broadcastUpdate(eventType: string, payload: unknown) {
  const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function broadcastSnapshot() {
  broadcastUpdate('snapshot', {
    conversations: Object.values(store.conversations).sort((a, b) =>
      b.lastActiveAt.localeCompare(a.lastActiveAt)
    ),
    tickets: store.tickets,
  });
}

const processedMessageIds = new Set<string>();
function rememberMessageId(id: string): boolean {
  if (processedMessageIds.has(id)) return false;
  processedMessageIds.add(id);
  if (processedMessageIds.size > 2000) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
  return true;
}

class GeminiApiError extends Error {
  code: 'MISSING_KEY' | 'INVALID_KEY' | 'QUOTA_EXHAUSTED' | 'TRANSIENT';
  status: number;

  constructor(
    code: 'MISSING_KEY' | 'INVALID_KEY' | 'QUOTA_EXHAUSTED' | 'TRANSIENT',
    status: number,
    message: string
  ) {
    super(message);
    this.name = 'GeminiApiError';
    this.code = code;
    this.status = status;
  }
}

let cachedGeminiClient: { apiKey: string; client: GoogleGenAI } | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = cleanEnvValue(process.env.GEMINI_API_KEY);
  if (!apiKey) {
    throw new GeminiApiError(
      'MISSING_KEY',
      500,
      'GEMINI_API_KEY is not configured in runtime environment variables.'
    );
  }
  if (!cachedGeminiClient || cachedGeminiClient.apiKey !== apiKey) {
    cachedGeminiClient = {
      apiKey,
      client: new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }),
    };
  }
  return cachedGeminiClient.client;
}

function formatTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function recordWebhookEvent(
  method: 'GET' | 'POST',
  status: number,
  event: WebhookTrafficEntry['event'],
  detail: string
) {
  const entry: WebhookTrafficEntry = {
    id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    method,
    status,
    event,
    detail,
  };
  store.webhookLogs = [entry, ...(store.webhookLogs || [])].slice(0, 20);
  persistStore();
}

function isInvalidGeminiApiKeyError(errStr: string): boolean {
  const lower = errStr.toLowerCase();
  return (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    (lower.includes('400') && lower.includes('key'))
  );
}

function isQuotaExceededError(errStr: string): boolean {
  const lower = errStr.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('free_tier_requests') ||
    lower.includes('rate limit')
  );
}

function summarizeGeminiError(errStr: string): string {
  if (errStr.startsWith('TIMEOUT:')) return errStr;
  if (isInvalidGeminiApiKeyError(errStr)) {
    return 'HTTP 400 INVALID_ARGUMENT: GEMINI_API_KEY is invalid or restricted. Verify the key in Dokploy runtime environment variables.';
  }
  if (isQuotaExceededError(errStr)) {
    return 'HTTP 429 RESOURCE_EXHAUSTED: Gemini API quota exceeded. Check billing and quota limits for your GEMINI_API_KEY project.';
  }
  try {
    const parsedErr = JSON.parse(errStr) as {
      error?: { code?: number; status?: string; message?: string };
    };
    if (parsedErr.error) {
      const msg = (parsedErr.error.message || '').split('\n')[0].slice(0, 140);
      return `${parsedErr.error.code ?? ''} ${parsedErr.error.status ?? ''}: ${msg}`.trim();
    }
  } catch {
    // Fallback to raw slice
  }
  return errStr.slice(0, 140);
}

function buildSmartFallbackReply(
  studentText: string,
  cfg: KnowledgeBaseConfig,
  lead?: LeadProfile
): string {
  // First check if the student's message matches an enabled entry in the Q&A Knowledge Bank
  const matchedFaq = findBestMatchingFaq(studentText, cfg.faqItems);
  if (matchedFaq) {
    return matchedFaq.answer.replace(/\*/g, '').trim();
  }

  const lower = studentText.toLowerCase();
  const isRomanUrdu =
    /\b(salam|assalam|aoa|mujhe|chahiye|hai|hain|kaise|kya|aap|mera|meri|karna|hoga|hogi|bhai|ji|shukriya|zaroorat|fees|kitni)\b/i.test(
      lower
    ) || lead?.language?.toLowerCase().includes('urdu');

  const isPricingOrUrgent =
    /\b(price|pricing|cost|fee|fees|charge|charges|rate|urgent|rush|asap|human|specialist|manager|call|team|kitni|paise)\b/i.test(
      lower
    );

  if (isPricingOrUrgent) {
    return isRomanUrdu
      ? 'Ek minute wait karein, main apni team se check kar ke abhi batati hoon.'
      : 'Wait a moment, let me check with my team and get right back to you.';
  }

  if (lead?.subject || lead?.academicLevel) {
    return isRomanUrdu
      ? 'Ek minute wait karein, main apni team se check kar ke abhi batati hoon.'
      : 'Wait a moment, let me check with my team and get right back to you.';
  }

  return isRomanUrdu
    ? 'Ji bilkul, aaj kis subject ya deadline mein help chahiye?'
    : 'Sure, what academic problem do you need help with today, and what is your subject or deadline?';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function isGeminiSupportedInlineMime(mimeType: string): boolean {
  const lower = mimeType.toLowerCase().split(';')[0].trim();
  return (
    lower.startsWith('image/') ||
    lower === 'application/pdf' ||
    lower.startsWith('text/')
  );
}

function extractDocxText(base64Data: string): string | null {
  try {
    const buf = Buffer.from(base64Data, 'base64');
    // Walk ZIP local file headers to locate word/document.xml
    let offset = 0;
    while (offset + 30 < buf.length) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) {
        const nextIdx = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset + 1);
        if (nextIdx === -1) break;
        offset = nextIdx;
        continue;
      }
      const compression = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const fileName = buf.subarray(nameStart, nameStart + nameLen).toString('utf8');
      const dataStart = nameStart + nameLen + extraLen;

      if (fileName === 'word/document.xml') {
        let xmlBuf: Buffer | null = null;
        if (compression === 0 && compSize > 0) {
          xmlBuf = buf.subarray(dataStart, dataStart + compSize);
        } else if (compression === 8) {
          // Handle both known compressed size and data-descriptor (compSize === 0)
          const sliceEnd = compSize > 0 ? dataStart + compSize : buf.length;
          xmlBuf = zlib.inflateRawSync(buf.subarray(dataStart, sliceEnd));
        }
        if (xmlBuf) {
          const xml = xmlBuf.toString('utf8');
          const plain = xml
            .replace(/<\/w:p>/g, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .trim();
          return plain ? plain.slice(0, 12000) : null;
        }
      }

      if (compSize > 0) {
        offset = dataStart + compSize;
      } else {
        const nextIdx = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), dataStart + 1);
        if (nextIdx === -1) break;
        offset = nextIdx;
      }
    }
    return null;
  } catch (err) {
    console.warn('[DOCX text extraction failed]', err);
    return null;
  }
}

async function generateAgentReply(
  config: KnowledgeBaseConfig,
  messages: ChatApiRequest['messages'],
  currentLead: LeadProfile
): Promise<ChatApiResponse> {
  const ai = getGeminiClient();

  // Keep context window strictly to the last 6 messages to minimize token usage
  const recentMessages = messages.slice(-6);

  const systemInstruction = `${buildSystemPrompt(config)}

JSON OUTPUT (keep all fields ultra-short; reply <= 20 words, plain text):
- reply: string (1-2 brief lines, max 20 words, plain text only)
- handoffRequired: boolean
- handoffReason: short string or null
- leadProfile: merge ${JSON.stringify(currentLead)} -> {subject, academicLevel, goalTimeline, language, qualificationComplete}`;

  const contents = recentMessages.map((msg) => {
    const parts: Array<Record<string, unknown>> = [];
    if (msg.attachment?.base64Data && msg.attachment?.mimeType) {
      const mime = msg.attachment.mimeType.toLowerCase();
      if (isGeminiSupportedInlineMime(mime)) {
        parts.push({
          inlineData: {
            mimeType: msg.attachment.mimeType,
            data: msg.attachment.base64Data,
          },
        });
      } else if (
        mime.includes('wordprocessingml.document') ||
        msg.attachment.name.toLowerCase().endsWith('.docx')
      ) {
        const extracted = extractDocxText(msg.attachment.base64Data);
        if (extracted) {
          parts.push({
            text: `[Attached DOCX "${msg.attachment.name}"]:\n${extracted.slice(0, 2000)}`,
          });
        } else {
          parts.push({
            text: `[Client sent DOCX "${msg.attachment.name}" (unreadable). Ask for PDF/photo or pasted text.]`,
          });
        }
      } else {
        parts.push({
          text: `[Client sent file "${msg.attachment.name}" (${msg.attachment.mimeType}). Acknowledge and tell them to wait a moment while you check.]`,
        });
      }
    }
    if (msg.text && msg.text.trim().length > 0) {
      parts.push({ text: msg.text });
    } else if (parts.length === 0) {
      parts.push({
        text: msg.attachment
          ? `[Uploaded file: ${msg.attachment.name}]`
          : '[Empty message received]',
      });
    }
    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
  let lastError: unknown;
  let modelUsed = 'gemini-2.5-flash-lite';
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      reply: { type: Type.STRING },
      handoffRequired: { type: Type.BOOLEAN },
      handoffReason: { type: Type.STRING, nullable: true },
      leadProfile: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, nullable: true },
          academicLevel: { type: Type.STRING, nullable: true },
          goalTimeline: { type: Type.STRING, nullable: true },
          language: { type: Type.STRING },
          qualificationComplete: { type: Type.BOOLEAN },
        },
        required: ['language', 'qualificationComplete'],
      },
    },
    required: ['reply', 'handoffRequired', 'leadProfile'],
  };

  // Minimum-usage Gemini runtime config:
  // - Models: gemini-2.5-flash-lite (thinkingBudget: 0) -> gemini-3.5-flash (ThinkingLevel.MINIMAL)
  // - Max Output Tokens: 120
  // - Context window: last 6 messages
  // - HTTP 400 (invalid key) & HTTP 429 (quota) fail fast without looping across models
  const GEMINI_ATTEMPT_TIMEOUT_MS = 10000;
  const MAX_OUTPUT_TOKENS = 120;
  const modelChain = [
    { model: 'gemini-2.5-flash-lite', thinkingMode: 'budget_zero' as const },
    { model: 'gemini-3.5-flash', thinkingMode: 'minimal' as const },
    { model: 'gemini-3.1-flash-lite', thinkingMode: 'minimal' as const },
  ];

  const tierErrors: string[] = [];

  for (let idx = 0; idx < modelChain.length; idx++) {
    const candidate = modelChain[idx];
    const candidateModel = candidate.model;
    const thinkingConfig =
      candidate.thinkingMode === 'budget_zero'
        ? { thinkingBudget: 0 }
        : { thinkingLevel: ThinkingLevel.MINIMAL };

    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: candidateModel,
          contents,
          config: {
            systemInstruction,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            thinkingConfig,
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
        GEMINI_ATTEMPT_TIMEOUT_MS,
        candidateModel
      );
      modelUsed = candidateModel;
      if (idx > 0) {
        console.log(`[Gemini succeeded using fallback model ${candidateModel}]`);
      }
      break;
    } catch (err) {
      lastError = err;
      const errStr = err instanceof Error ? err.message : String(err);
      const shortReason = summarizeGeminiError(errStr);

      // Fail fast on HTTP 400 invalid API key — never retry other models
      if (isInvalidGeminiApiKeyError(errStr)) {
        throw new GeminiApiError('INVALID_KEY', 400, shortReason);
      }

      // Fail fast on HTTP 429 quota exceeded — do not spam retries across models
      if (isQuotaExceededError(errStr)) {
        throw new GeminiApiError('QUOTA_EXHAUSTED', 429, shortReason);
      }

      tierErrors.push(`${candidateModel} (${shortReason})`);

      const isTransient =
        errStr.startsWith('TIMEOUT:') ||
        errStr.includes('503') ||
        errStr.includes('UNAVAILABLE') ||
        errStr.includes('overloaded') ||
        errStr.includes('404') ||
        errStr.includes('NOT_FOUND') ||
        errStr.includes('500');

      if (!isTransient) {
        throw new GeminiApiError(
          'TRANSIENT',
          502,
          `Gemini request failed on ${candidateModel}: ${shortReason}`
        );
      }

      if (idx < modelChain.length - 1) {
        console.warn(
          `[Gemini ${candidateModel} transiently unavailable, trying ${modelChain[idx + 1].model}]`,
          shortReason
        );
      }
    }
  }

  if (!response) {
    throw new GeminiApiError(
      'TRANSIENT',
      503,
      tierErrors.length > 0
        ? `Gemini temporarily unavailable — ${tierErrors.join(' -> ')}`
        : lastError instanceof Error
        ? lastError.message
        : 'Gemini API call failed.'
    );
  }

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new GeminiApiError('TRANSIENT', 502, 'Model returned an empty response.');
  }

  try {
    const parsed = JSON.parse(rawText) as ChatApiResponse;
    return { ...parsed, modelUsed };
  } catch {
    // Graceful extraction if tight maxOutputTokens ever clipped trailing JSON metadata
    const replyMatch = rawText.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (replyMatch?.[1]) {
      const recoveredReply = JSON.parse(`"${replyMatch[1]}"`) as string;
      const handoffRequired = /"handoffRequired"\s*:\s*true/.test(rawText);
      return {
        reply: recoveredReply,
        handoffRequired,
        handoffReason: handoffRequired ? 'Escalation triggered' : null,
        leadProfile: currentLead,
        modelUsed,
      };
    }
    throw new GeminiApiError('TRANSIENT', 502, 'Model returned malformed JSON response.');
  }
}

function isAllowedMetaMediaHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'graph.facebook.com' ||
    lower.endsWith('.fbsbx.com') ||
    lower.endsWith('.facebook.com') ||
    lower.endsWith('.whatsapp.net')
  );
}

function getEffectiveGraphApiVersion(): string {
  if (
    store.graphApiVersionOverride &&
    (ALLOWED_GRAPH_VERSIONS as readonly string[]).includes(store.graphApiVersionOverride)
  ) {
    return store.graphApiVersionOverride;
  }
  return DEFAULT_GRAPH_API_VERSION;
}

async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ base64Data: string; mimeType: string } | null> {
  try {
    const metaInfoRes = await fetch(
      `https://graph.facebook.com/${getEffectiveGraphApiVersion()}/${encodeURIComponent(mediaId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!metaInfoRes.ok) return null;
    const info = (await metaInfoRes.json()) as { url?: string; mime_type?: string };
    if (!info.url) return null;

    const parsedUrl = new URL(info.url);
    if (parsedUrl.protocol !== 'https:' || !isAllowedMetaMediaHost(parsedUrl.hostname)) {
      console.warn('[Blocked unexpected media host]', parsedUrl.hostname);
      return null;
    }

    const mediaRes = await fetch(parsedUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mediaRes.ok) return null;
    const arrayBuffer = await mediaRes.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    return {
      base64Data,
      mimeType: info.mime_type || mediaRes.headers.get('content-type') || 'image/jpeg',
    };
  } catch (err) {
    console.error('[Media download error]', err);
    return null;
  }
}

function validatePhoneNumberId(raw?: string): {
  valid: boolean;
  cleaned: string;
  warning: string | null;
} {
  const cleaned = cleanEnvValue(raw);
  if (!cleaned) {
    return { valid: false, cleaned: '', warning: null };
  }
  if (/^\d{10,22}$/.test(cleaned)) {
    return { valid: true, cleaned, warning: null };
  }
  return {
    valid: false,
    cleaned,
    warning:
      'WHATSAPP_PHONE_NUMBER_ID must be the numeric Phone Number ID from Meta API Setup (e.g. 1422786037592220), not a formatted phone number.',
  };
}

function getEffectivePhoneNumberId(): {
  valid: boolean;
  cleaned: string;
  warning: string | null;
  source: 'dashboard' | 'env' | 'none';
} {
  if (store.phoneNumberIdOverride?.trim()) {
    const check = validatePhoneNumberId(store.phoneNumberIdOverride);
    return { ...check, source: 'dashboard' };
  }
  const envVal = cleanEnvValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
  if (envVal) {
    const check = validatePhoneNumberId(envVal);
    return { ...check, source: 'env' };
  }
  return { valid: false, cleaned: '', warning: null, source: 'none' };
}

function formatMetaGraphError(status: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    const code = parsed.error?.code;
    const subcode = parsed.error?.error_subcode;
    const msg = parsed.error?.message || rawBody.slice(0, 220);

    if (code === 190) {
      return `Meta access token expired or invalid (code 190): ${msg}. Update WHATSAPP_ACCESS_TOKEN in Settings > Secrets.`;
    }
    if (code === 131047) {
      return `24-hour customer service window expired (code 131047): Meta only allows free-form replies within 24 hours of the student's last WhatsApp message.`;
    }
    if (code === 131030) {
      return `Recipient phone number is not in Meta's allowed test list (code 131030): add this number in Meta API Setup or use a production number.`;
    }
    if (code === 130429 || code === 80007 || code === 4 || code === 17) {
      return `Meta API rate limit reached (code ${code}): ${msg}.`;
    }
    if (code === 100 && subcode === 33) {
      return `Invalid Phone Number ID or missing messaging permission (code 100/33): ${msg}.`;
    }
    return `Graph API ${status} (code ${code ?? 'unknown'}): ${msg}`;
  } catch {
    return `Graph API ${status}: ${rawBody.slice(0, 220)}`;
  }
}

function isBusinessSelfNumber(normalizedDigits: string): boolean {
  if (!normalizedDigits) return false;
  if (normalizedDigits === BUSINESS_SELF_PHONE) return true;
  const verifiedBusinessDigits = store.lastVerification?.displayPhoneNumber?.replace(/\D/g, '');
  return Boolean(verifiedBusinessDigits && normalizedDigits === verifiedBusinessDigits);
}

async function sendWhatsAppTextMessage(
  toPhone: string,
  bodyText: string
): Promise<{ status: 'sent' | 'simulated' | 'failed' | 'skipped_self'; error?: string }> {
  const normalizedRecipient = toPhone.replace(/\D/g, '');
  if (!normalizedRecipient) {
    return { status: 'failed', error: 'Recipient phone number is empty or invalid.' };
  }

  // Never send outbound Meta Graph API messages to our own business WhatsApp number
  if (isBusinessSelfNumber(normalizedRecipient)) {
    console.log(
      `[WhatsApp Graph API] Skipped outbound /messages call for own business number (${normalizedRecipient}).`
    );
    return { status: 'skipped_self' };
  }

  const token = cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneIdCheck = getEffectivePhoneNumberId();

  if (!token || !phoneIdCheck.cleaned) {
    return { status: 'simulated' };
  }

  if (!phoneIdCheck.valid) {
    return {
      status: 'failed',
      error:
        phoneIdCheck.warning ||
        'Invalid WHATSAPP_PHONE_NUMBER_ID format. Use the numeric Phone Number ID from Meta.',
    };
  }

  try {
    const cleanCustomerText = bodyText.replace(/\s*\[HANDOFF_REQUIRED\]\s*/g, '').trim();
    const response = await fetch(
      `https://graph.facebook.com/${getEffectiveGraphApiVersion()}/${encodeURIComponent(phoneIdCheck.cleaned)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedRecipient,
          type: 'text',
          text: {
            preview_url: true,
            body: cleanCustomerText,
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      const friendlyError = formatMetaGraphError(response.status, errBody);
      console.error('[WhatsApp Graph API send error]', response.status, friendlyError, errBody);
      return {
        status: 'failed',
        error: friendlyError,
      };
    }

    return { status: 'sent' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error sending WhatsApp message';
    console.error('[WhatsApp Graph API network error]', message);
    return { status: 'failed', error: message };
  }
}

async function markWhatsAppMessageRead(messageId: string): Promise<void> {
  const token = cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneIdCheck = getEffectivePhoneNumberId();
  if (!token || !phoneIdCheck.valid || !messageId || messageId.startsWith('wamid.test.')) return;

  try {
    await fetch(
      `https://graph.facebook.com/${getEffectiveGraphApiVersion()}/${encodeURIComponent(phoneIdCheck.cleaned)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      }
    );
  } catch {
    // Non-critical read receipt
  }
}

interface IncomingWhatsAppParams {
  messageId: string;
  fromPhone: string;
  contactName: string;
  text: string;
  attachment?: {
    name: string;
    mimeType: string;
    base64Data: string;
  };
}

async function processIncomingWhatsAppMessage(params: IncomingWhatsAppParams): Promise<void> {
  const { messageId, contactName, text, attachment } = params;
  const fromPhone = params.fromPhone.replace(/\D/g, '') || params.fromPhone;
  if (!rememberMessageId(messageId)) return;

  const existing: LiveConversation = store.conversations[fromPhone] || {
    phone: fromPhone,
    contactName: contactName || fromPhone,
    lastActiveAt: new Date().toISOString(),
    aiPaused: false,
    handoffReason: null,
    leadProfile: {
      subject: null,
      academicLevel: null,
      goalTimeline: null,
      language: 'English',
      qualificationComplete: false,
    },
    messages: [],
  };

  existing.contactName = contactName || existing.contactName;
  existing.lastActiveAt = new Date().toISOString();
  existing.messages.push({
    id: messageId,
    role: 'user',
    text: text || (attachment ? `[Uploaded file: ${attachment.name}]` : ''),
    timestamp: formatTimestamp(),
    attachmentName: attachment?.name,
  });

  store.conversations[fromPhone] = existing;
  persistStore();
  broadcastSnapshot();

  await markWhatsAppMessageRead(messageId);

  if (existing.aiPaused) {
    return;
  }

  try {
    const historyForModel: ChatApiRequest['messages'] = existing.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map((m, idx, arr) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        text: m.text,
        attachment: idx === arr.length - 1 ? attachment : undefined,
      }));

    const aiResult = await generateAgentReply(
      store.config,
      historyForModel,
      existing.leadProfile
    );

    const delivery = await sendWhatsAppTextMessage(fromPhone, aiResult.reply);

    const replyMessage = {
      id: `ai-${Date.now()}`,
      role: 'assistant' as const,
      text: aiResult.reply,
      timestamp: formatTimestamp(),
      deliveryStatus: delivery.status,
      deliveryError: delivery.error,
      aiModelUsed: aiResult.modelUsed,
      handoffTriggered: aiResult.handoffRequired,
    };

    existing.messages.push(replyMessage);
    existing.lastActiveAt = new Date().toISOString();
    if (aiResult.leadProfile) {
      existing.leadProfile = aiResult.leadProfile;
    }

    if (aiResult.handoffRequired) {
      existing.aiPaused = true;
      existing.handoffReason =
        aiResult.handoffReason || 'Escalation protocol triggered';

      const newTicket: EscalationTicket = {
        id: `ESC-${String(store.tickets.length + 1).padStart(3, '0')}`,
        createdAt: formatTimestamp(),
        clientPhone: fromPhone,
        clientName: existing.contactName,
        clientSummary: text || attachment?.name || 'WhatsApp inquiry',
        reason: existing.handoffReason,
        language: existing.leadProfile?.language || 'English',
        status: 'Pending',
        transcript: existing.messages.map((m) => ({
          role: m.role,
          text: m.text,
          timestamp: m.timestamp,
        })),
      };
      store.tickets.unshift(newTicket);
    }

    store.conversations[fromPhone] = existing;
    persistStore();
    broadcastSnapshot();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'AI generation error';
    console.error('[Webhook AI error]', errorMsg);
    const fallbackReply = buildSmartFallbackReply(text, store.config, existing.leadProfile);
    // Still dispatch bilingual fallback reply to real external numbers; keep Gemini error separate from Meta delivery status
    const delivery = await sendWhatsAppTextMessage(fromPhone, fallbackReply);
    existing.messages.push({
      id: `fallback-${Date.now()}`,
      role: 'assistant',
      text: fallbackReply,
      timestamp: formatTimestamp(),
      deliveryStatus: delivery.status,
      deliveryError: delivery.error,
      aiError: errorMsg,
    });
    existing.lastActiveAt = new Date().toISOString();
    store.conversations[fromPhone] = existing;
    persistStore();
    broadcastSnapshot();
  }
}

function inspectAppSecretFormat(secret: string): string | null {
  if (!secret) return null;
  if (!/^[a-f0-9]{32}$/i.test(secret)) {
    return 'WHATSAPP_APP_SECRET does not match Meta’s 32-character hex App Secret format. Check Meta for Developers → App Settings → Basic → App Secret (click Show) — do not use your Verify Token or Access Token here.';
  }
  return null;
}

function verifyMetaSignature(req: Request): { ok: boolean; reason?: string } {
  const appSecret = cleanEnvValue(process.env.WHATSAPP_APP_SECRET);
  if (!appSecret) return { ok: true };

  const signatureHeader = req.header('x-hub-signature-256')?.trim().toLowerCase();
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!signatureHeader) {
    console.warn('[WhatsApp Webhook] Rejected POST: missing X-Hub-Signature-256 header.');
    return {
      ok: false,
      reason: 'Missing X-Hub-Signature-256 header on incoming POST request.',
    };
  }
  if (!rawBody) {
    console.warn('[WhatsApp Webhook] Rejected POST: missing raw request body.');
    return { ok: false, reason: 'Missing raw request body for HMAC verification.' };
  }

  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex').toLowerCase();

  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    const formatWarn = inspectAppSecretFormat(appSecret);
    console.warn('[WhatsApp Webhook] Rejected POST: X-Hub-Signature-256 mismatch.');
    return {
      ok: false,
      reason:
        formatWarn ||
        'X-Hub-Signature-256 digest mismatch — verify WHATSAPP_APP_SECRET matches Meta App Settings > Basic > App Secret.',
    };
  }
  return { ok: true };
}

const app = express();
app.use(
  express.json({
    limit: '20mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Lightweight healthcheck endpoint for Dokploy / Docker / load balancers
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    dataDir: DATA_DIR,
  });
});

// Simulator chat endpoint
app.post('/api/chat', async (req, res) => {
  const body = req.body as ChatApiRequest;
  if (!body || !body.config || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'Invalid chat request payload.' });
    return;
  }

  try {
    const parsed = await generateAgentReply(body.config, body.messages, body.currentLead);
    res.json(parsed);
  } catch (err: unknown) {
    const lastUserText =
      [...body.messages].reverse().find((m) => m.role === 'user')?.text || '';

    if (err instanceof GeminiApiError) {
      console.error(`[/api/chat ${err.code} (${err.status})]`, err.message);
      if (err.code === 'QUOTA_EXHAUSTED') {
        res.status(429).json({
          error: err.message,
          code: err.code,
          fallbackReply: buildSmartFallbackReply(lastUserText, body.config, body.currentLead),
        });
        return;
      }
      res.status(err.status).json({
        error: err.message,
        code: err.code,
      });
      return;
    }

    const message =
      err instanceof Error ? err.message : 'Unexpected server error calling Gemini API.';
    console.error('[/api/chat error]', message);
    res.status(500).json({ error: message });
  }
});

// Sync Knowledge Base config with server webhook agent
app.get('/api/config', (_req, res) => {
  res.json(store.config);
});

app.put('/api/config', (req, res) => {
  const body = req.body as Partial<KnowledgeBaseConfig>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid configuration object.' });
    return;
  }
  const sanitized: Partial<KnowledgeBaseConfig> = {};
  if (typeof body.agentName === 'string') sanitized.agentName = body.agentName;
  if (typeof body.businessName === 'string') sanitized.businessName = body.businessName;
  if (typeof body.website === 'string') sanitized.website = body.website;
  if (typeof body.coreServices === 'string') sanitized.coreServices = body.coreServices;
  if (typeof body.subjectsCovered === 'string') sanitized.subjectsCovered = body.subjectsCovered;
  if (typeof body.operatingHours === 'string') sanitized.operatingHours = body.operatingHours;
  if (typeof body.pricingPolicy === 'string') sanitized.pricingPolicy = body.pricingPolicy;
  if (typeof body.bookingLink === 'string') sanitized.bookingLink = body.bookingLink;
  if (typeof body.paymentMethods === 'string') sanitized.paymentMethods = body.paymentMethods;
  if (typeof body.additionalNotes === 'string') sanitized.additionalNotes = body.additionalNotes;
  if (typeof body.includeHandoffTag === 'boolean') {
    sanitized.includeHandoffTag = body.includeHandoffTag;
  }
  if (Array.isArray(body.faqItems)) {
    sanitized.faqItems = sanitizeFaqItems(body.faqItems);
  }

  store.config = { ...store.config, ...sanitized };
  persistStore();
  res.json(store.config);
});

async function verifyLiveMetaConnection(): Promise<WhatsAppVerifyResult> {
  const checkedAt = formatTimestamp();
  const token = cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneIdCheck = getEffectivePhoneNumberId();

  if (!token) {
    return {
      connected: false,
      checkedAt,
      error: 'WHATSAPP_ACCESS_TOKEN is not configured in Settings > Secrets.',
    };
  }
  if (!phoneIdCheck.valid) {
    return {
      connected: false,
      checkedAt,
      error:
        phoneIdCheck.warning ||
        'Enter a valid numeric WhatsApp Phone Number ID first (e.g. 1422786037592220).',
    };
  }

  try {
    const url = `https://graph.facebook.com/${getEffectiveGraphApiVersion()}/${encodeURIComponent(
      phoneIdCheck.cleaned
    )}?fields=display_phone_number,verified_name,quality_rating`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bodyText = await res.text();
    let parsed: {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { message?: string };
    } = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // Non-JSON response
    }

    if (!res.ok) {
      return {
        connected: false,
        verifiedPhoneNumberId: phoneIdCheck.cleaned,
        checkedAt,
        error: formatMetaGraphError(res.status, bodyText),
      };
    }

    return {
      connected: true,
      verifiedPhoneNumberId: phoneIdCheck.cleaned,
      displayPhoneNumber: parsed.display_phone_number || undefined,
      verifiedName: parsed.verified_name || undefined,
      qualityRating: parsed.quality_rating || undefined,
      checkedAt,
    };
  } catch (err) {
    return {
      connected: false,
      verifiedPhoneNumberId: phoneIdCheck.cleaned,
      checkedAt,
      error: err instanceof Error ? err.message : 'Unable to reach Meta Graph API.',
    };
  }
}

function buildWhatsAppStatus(): WhatsAppConnectionStatus {
  const hasGeminiKey = Boolean(cleanEnvValue(process.env.GEMINI_API_KEY));
  const hasAccessToken = Boolean(cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN));
  const phoneIdCheck = getEffectivePhoneNumberId();
  const hasPhoneNumberId = Boolean(phoneIdCheck.cleaned);
  const hasVerifyToken = Boolean(cleanEnvValue(process.env.WHATSAPP_VERIFY_TOKEN));
  const cleanedAppSecret = cleanEnvValue(process.env.WHATSAPP_APP_SECRET);
  const hasAppSecret = Boolean(cleanedAppSecret);
  const appSecretFormatWarning = inspectAppSecretFormat(cleanedAppSecret);
  const hygiene = inspectEnvHygiene();

  // Ignore stale failed verification if the active Phone Number ID is now valid and changed
  let effectiveVerification = store.lastVerification;
  if (
    effectiveVerification &&
    !effectiveVerification.connected &&
    phoneIdCheck.valid &&
    effectiveVerification.verifiedPhoneNumberId !== phoneIdCheck.cleaned
  ) {
    effectiveVerification = null;
  }

  return {
    configured:
      hasGeminiKey &&
      hasAccessToken &&
      hasPhoneNumberId &&
      phoneIdCheck.valid &&
      hasVerifyToken,
    hasGeminiKey,
    hasAccessToken,
    hasPhoneNumberId,
    phoneNumberIdValid: phoneIdCheck.valid,
    phoneNumberIdWarning: phoneIdCheck.warning,
    activePhoneNumberId: phoneIdCheck.valid ? phoneIdCheck.cleaned : null,
    phoneNumberIdSource: phoneIdCheck.source,
    hasVerifyToken,
    hasAppSecret,
    appSecretFormatWarning,
    envHygieneClean: hygiene.clean,
    envHygieneIssues: hygiene.issues,
    webhookPath: '/api/whatsapp/webhook',
    graphApiVersion: getEffectiveGraphApiVersion(),
    lastVerification: effectiveVerification,
    recentWebhookEvents: store.webhookLogs || [],
  };
}

// WhatsApp Cloud API readiness status (never exposes private secrets)
app.get('/api/whatsapp/status', (_req, res) => {
  res.json(buildWhatsAppStatus());
});

// Update non-secret numeric WhatsApp Phone Number ID & Graph API version from dashboard, then auto-verify live connection
app.put('/api/whatsapp/phone-number-id', async (req, res) => {
  const { phoneNumberId, graphApiVersion } = req.body as {
    phoneNumberId?: string;
    graphApiVersion?: string;
  };

  if (typeof graphApiVersion === 'string') {
    if (!(ALLOWED_GRAPH_VERSIONS as readonly string[]).includes(graphApiVersion)) {
      res.status(400).json({ error: 'Unsupported Meta Graph API version.' });
      return;
    }
    store.graphApiVersionOverride = graphApiVersion;
  }

  if (typeof phoneNumberId === 'string') {
    const trimmed = phoneNumberId.trim();
    if (!trimmed) {
      store.phoneNumberIdOverride = undefined;
      store.lastVerification = null;
    } else {
      const check = validatePhoneNumberId(trimmed);
      if (!check.valid) {
        res.status(400).json({
          error:
            check.warning ||
            'Enter the numeric Phone Number ID (digits only, e.g. 1422786037592220).',
        });
        return;
      }
      store.phoneNumberIdOverride = check.cleaned;
    }
  }

  // Immediately verify live Meta Graph API connectivity when credentials are ready
  const effectivePhone = getEffectivePhoneNumberId();
  if (effectivePhone.valid && cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN)) {
    store.lastVerification = await verifyLiveMetaConnection();
  } else {
    store.lastVerification = null;
  }

  persistStore();
  res.json(buildWhatsAppStatus());
});

// Live Meta Graph API connection verification endpoint
app.post('/api/whatsapp/verify-connection', async (_req, res) => {
  store.lastVerification = await verifyLiveMetaConnection();
  persistStore();
  res.json(buildWhatsAppStatus());
});

// Live conversations & escalation tickets
app.get('/api/whatsapp/conversations', (_req, res) => {
  const conversations = Object.values(store.conversations).sort((a, b) =>
    b.lastActiveAt.localeCompare(a.lastActiveAt)
  );
  res.json({ conversations, tickets: store.tickets });
});

// Server-Sent Events stream for real-time inbox updates
app.get('/api/whatsapp/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(
    `event: snapshot\ndata: ${JSON.stringify({
      conversations: Object.values(store.conversations).sort((a, b) =>
        b.lastActiveAt.localeCompare(a.lastActiveAt)
      ),
      tickets: store.tickets,
    })}\n\n`
  );

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Send manual human coordinator reply to a WhatsApp client
app.post('/api/whatsapp/reply', async (req, res) => {
  const { phone, text } = req.body as { phone?: string; text?: string };
  const normalizedPhone = phone?.replace(/\D/g, '') || '';
  if (!normalizedPhone || !text?.trim()) {
    res.status(400).json({ error: 'Phone number and message text are required.' });
    return;
  }

  const conv = store.conversations[normalizedPhone] || store.conversations[phone || ''];
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  const delivery = await sendWhatsAppTextMessage(conv.phone, text.trim());
  conv.messages.push({
    id: `human-${Date.now()}`,
    role: 'human_agent',
    text: text.trim(),
    timestamp: formatTimestamp(),
    deliveryStatus: delivery.status,
    deliveryError: delivery.error,
  });
  conv.lastActiveAt = new Date().toISOString();
  persistStore();
  broadcastSnapshot();
  res.json({ conversation: conv, delivery });
});

// Pause or resume AI auto-replies for a conversation
app.post('/api/whatsapp/toggle-ai', (req, res) => {
  const { phone, aiPaused } = req.body as { phone?: string; aiPaused?: boolean };
  const normalizedPhone = phone?.replace(/\D/g, '') || '';
  if (!normalizedPhone || typeof aiPaused !== 'boolean') {
    res.status(400).json({ error: 'Phone and aiPaused boolean are required.' });
    return;
  }
  const conv = store.conversations[normalizedPhone] || store.conversations[phone || ''];
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }
  conv.aiPaused = aiPaused;
  if (!aiPaused) {
    conv.handoffReason = null;
  }
  persistStore();
  broadcastSnapshot();
  res.json({ conversation: conv });
});

// Toggle escalation ticket status
app.post('/api/whatsapp/tickets/:id/toggle', (req, res) => {
  const ticketId = req.params.id;
  const ticket = store.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found.' });
    return;
  }
  ticket.status = ticket.status === 'Pending' ? 'Resolved' : 'Pending';
  persistStore();
  broadcastSnapshot();
  res.json({ ticket });
});

// Simulate an inbound WhatsApp Cloud API event for testing end-to-end
app.post('/api/whatsapp/test-incoming', async (req, res) => {
  const { phone, contactName, text } = req.body as {
    phone?: string;
    contactName?: string;
    text?: string;
  };
  if (!text?.trim()) {
    res.status(400).json({ error: 'Test message text is required.' });
    return;
  }

  const targetPhone =
    (phone || DEFAULT_EXTERNAL_TEST_PHONE).replace(/\D/g, '') || DEFAULT_EXTERNAL_TEST_PHONE;
  const targetName = contactName?.trim() || 'Test WhatsApp Client';

  await processIncomingWhatsAppMessage({
    messageId: `wamid.test.${Date.now()}`,
    fromPhone: targetPhone,
    contactName: targetName,
    text: text.trim(),
  });

  res.json({ ok: true, conversation: store.conversations[targetPhone] });
});

// Meta WhatsApp Cloud API Webhook Verification (plain text challenge or HTTP 403)
const handleWhatsAppWebhookGet = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token =
    typeof req.query['hub.verify_token'] === 'string'
      ? req.query['hub.verify_token'].trim()
      : '';
  const challenge = typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : '';
  const expectedToken = cleanEnvValue(process.env.WHATSAPP_VERIFY_TOKEN);

  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    recordWebhookEvent('GET', 200, 'verify_ok', 'Meta webhook challenge verified successfully.');
    res.status(200).type('text/plain').send(challenge);
    return;
  }
  console.warn('[WhatsApp Webhook] GET verification failed (mode or verify_token mismatch).');
  recordWebhookEvent(
    'GET',
    403,
    'verify_failed',
    'Verify token mismatch or invalid hub.mode — check WHATSAPP_VERIFY_TOKEN matches Meta.'
  );
  res.sendStatus(403);
};

// Meta WhatsApp Cloud API Incoming Messages Webhook
const handleWhatsAppWebhookPost = async (req: Request, res: Response) => {
  const sigCheck = verifyMetaSignature(req);
  if (!sigCheck.ok) {
    recordWebhookEvent(
      'POST',
      403,
      'signature_mismatch',
      sigCheck.reason ||
        'Rejected X-Hub-Signature-256 mismatch — verify WHATSAPP_APP_SECRET matches Meta App Settings > Basic > App Secret.'
    );
    res.sendStatus(403);
    return;
  }

  const payload = req.body as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          statuses?: Array<{ id?: string; status?: string }>;
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
            button?: { text?: string };
            interactive?: {
              button_reply?: { title?: string };
              list_reply?: { title?: string };
            };
            image?: { id?: string; caption?: string; mime_type?: string };
            document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
          }>;
        };
      }>;
    }>;
  };

  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    recordWebhookEvent('POST', 200, 'ignored', `Ignored non-WhatsApp payload (${payload?.object || 'unknown'}).`);
    res.sendStatus(200);
    return;
  }

  let messageCount = 0;
  let statusCount = 0;
  const senderPhones: string[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (value?.messages?.length) {
        messageCount += value.messages.length;
        for (const m of value.messages) {
          if (m.from) senderPhones.push(`+${m.from.replace(/\D/g, '')}`);
        }
      }
      if (value?.statuses?.length) {
        statusCount += value.statuses.length;
      }
    }
  }

  if (messageCount === 0) {
    recordWebhookEvent(
      'POST',
      200,
      'statuses_only',
      statusCount > 0
        ? `Ignored ${statusCount} delivery/read status update(s).`
        : 'Received empty WhatsApp webhook event.'
    );
    res.sendStatus(200);
    return;
  }

  recordWebhookEvent(
    'POST',
    200,
    'messages_received',
    `Received ${messageCount} incoming message(s) from ${senderPhones.join(', ') || 'unknown'}.`
  );

  const accessToken = cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN);
  const isServerlessCloudRun = Boolean(process.env.K_SERVICE);

  // On always-on Docker / Dokploy containers, acknowledge Meta immediately with HTTP 200
  // and process messages asynchronously right after. On Cloud Run (K_SERVICE set), wait briefly
  // before ending the HTTP response so CPU stays allocated during processing.
  if (!isServerlessCloudRun) {
    res.sendStatus(200);
  }

  const processAll = (async () => {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages?.length) continue;

        const contactsMap = new Map<string, string>();
        for (const c of value.contacts || []) {
          if (c.wa_id && c.profile?.name) {
            contactsMap.set(c.wa_id, c.profile.name);
          }
        }

        for (const msg of value.messages) {
          if (!msg.id || !msg.from) continue;

          const contactName = contactsMap.get(msg.from) || msg.from;
          let text = '';
          let attachment: IncomingWhatsAppParams['attachment'];

          if (msg.type === 'text' && msg.text?.body) {
            text = msg.text.body;
          } else if (msg.type === 'button' && msg.button?.text) {
            text = msg.button.text;
          } else if (msg.type === 'interactive') {
            text =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              '[Interactive selection]';
          } else if (msg.type === 'image' && msg.image?.id) {
            text = msg.image.caption || '';
            if (accessToken) {
              const media = await downloadWhatsAppMedia(msg.image.id, accessToken);
              if (media) {
                attachment = {
                  name: 'whatsapp-image',
                  mimeType: media.mimeType,
                  base64Data: media.base64Data,
                };
              } else if (!text) {
                text =
                  '[Client sent an image that could not be downloaded cleanly. Ask them politely to resend a clear photo or paste the details.]';
              }
            }
          } else if (msg.type === 'document' && msg.document?.id) {
            text = msg.document.caption || '';
            if (accessToken) {
              const media = await downloadWhatsAppMedia(msg.document.id, accessToken);
              if (media) {
                attachment = {
                  name: msg.document.filename || 'whatsapp-document',
                  mimeType: msg.document.mime_type || media.mimeType,
                  base64Data: media.base64Data,
                };
              } else if (!text) {
                text = `[Client sent document "${msg.document.filename || 'file'}", which could not be downloaded cleanly. Ask them politely to resend as a PDF/photo or paste key details.]`;
              }
            }
          } else {
            text = `[Unsupported WhatsApp message type: ${msg.type || 'unknown'}]`;
          }

          await processIncomingWhatsAppMessage({
            messageId: msg.id,
            fromPhone: msg.from,
            contactName,
            text,
            attachment,
          });
        }
      }
    }
  })().catch((err) => {
    console.error('[WhatsApp Webhook processing error]', err);
  });

  if (isServerlessCloudRun) {
    await Promise.race([
      processAll,
      new Promise<void>((resolve) => setTimeout(resolve, 16000)),
    ]);

    if (!res.headersSent) {
      res.sendStatus(200);
    }
  }
};

// Register both /api/webhook and /api/whatsapp/webhook BEFORE the SPA fallback
app.get('/api/webhook', handleWhatsAppWebhookGet);
app.post('/api/webhook', handleWhatsAppWebhookPost);
app.get('/api/whatsapp/webhook', handleWhatsAppWebhookGet);
app.post('/api/whatsapp/webhook', handleWhatsAppWebhookPost);

function logRuntimeEnvStatus() {
  const vars = [
    'GEMINI_API_KEY',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'APP_URL',
    'PORT',
    'DATA_DIR',
    'NODE_ENV',
  ] as const;

  const summary = vars
    .map((key) => `${key}=${cleanEnvValue(process.env[key]) ? 'set' : 'missing'}`)
    .join(', ');
  console.log(`[Runtime Env Presence] ${summary}`);
}

async function startServer() {
  // Prevent any unmatched /api/* route from falling through to the React SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Server listening on http://0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'}, DATA_DIR=${DATA_DIR})`
    );
    logRuntimeEnvStatus();
  });
}

startServer();

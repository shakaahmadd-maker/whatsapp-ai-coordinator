import type { KnowledgeBaseConfig, KnowledgeBaseFaqItem } from '../types/agent.ts';

export const FAQ_CATEGORIES = [
  'Pricing',
  'Booking',
  'Services',
  'Subjects',
  'Deadlines',
  'Payments',
  'Policies',
  'General',
] as const;

export const DEFAULT_FAQ_ITEMS: KnowledgeBaseFaqItem[] = [
  {
    id: 'faq-pricing',
    category: 'Pricing',
    question: 'How much do you charge for tutoring or coursework guidance?',
    keywords: 'price, pricing, fee, fees, cost, charges, rate, hourly, kitni fee, charges kya hain',
    answer:
      'Our tutoring rates depend on your *subject*, *academic level* (High School, Undergraduate, Master\'s, or PhD), and *session duration or deadline*. Share those three details with me and our academic coordinator will provide an exact tailored quote right away.',
    enabled: true,
  },
  {
    id: 'faq-booking',
    category: 'Booking',
    question: 'How do I book a 1-on-1 session or get matched with a tutor?',
    keywords: 'book, booking, schedule, register, start, trial, how to join, session kaise book karein',
    answer:
      'You can share your *subject*, *level*, and *preferred time/deadline* right here on WhatsApp so I can match you with a specialist, or book directly through our onboarding link: https://university-tutors.com/book',
    enabled: true,
  },
  {
    id: 'faq-subjects',
    category: 'Subjects',
    question: 'Which subjects and academic levels do you cover?',
    keywords: 'subjects, courses, masters, phd, undergraduate, data science, biology, math, computer science, engineering',
    answer:
      'We support High School, Undergraduate, Master\'s, and PhD students across *Biology, Biotechnology, Chemistry, Mathematics, Computer Science, Data Science, Business, Engineering, and Humanities*. Let me know your exact topic so I can confirm specialist availability.',
    enabled: true,
  },
  {
    id: 'faq-urgent',
    category: 'Deadlines',
    question: 'Can you help with urgent deadlines or review my syllabus/assignment brief?',
    keywords: 'urgent, tomorrow, deadline, syllabus, pdf, brief, review, jaldi, file bhejni hai',
    answer:
      'Yes! You can send your *syllabus, rubric, or topic notes* right here as a PDF, Word doc, or clear photo along with your target date, and we will prioritize matching you with an available 1-on-1 tutor for focused guidance and exam/coursework preparation.',
    enabled: true,
  },
];

export const DEFAULT_KB_CONFIG: KnowledgeBaseConfig = {
  agentName: 'Sara',
  businessName: 'University-Tutors',
  website: 'https://university-tutors.com',
  coreServices:
    '1-on-1 online academic tutoring, subject guidance, coursework & exam preparation, thesis/research mentoring',
  subjectsCovered:
    'Biology, Biotechnology, Chemistry, Mathematics, Computer Science, Business, Engineering, Humanities',
  operatingHours:
    '24/7 AI support; live academic coordinators available 9:00 AM – 11:00 PM PKT / EST',
  pricingPolicy:
    "Rates depend on subject level, urgency, and session duration. Collect the client's subject, academic level, and deadline first before quoting or routing for an exact quote.",
  bookingLink: 'https://university-tutors.com/book',
  paymentMethods: 'International card/payment link, bank transfer',
  additionalNotes: '',
  includeHandoffTag: true,
  faqItems: DEFAULT_FAQ_ITEMS,
};

export function findBestMatchingFaq(
  userText: string,
  faqItems?: KnowledgeBaseFaqItem[]
): KnowledgeBaseFaqItem | null {
  if (!userText.trim() || !Array.isArray(faqItems) || faqItems.length === 0) {
    return null;
  }

  const normalizedInput = userText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedInput) return null;

  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'do', 'does', 'did',
    'i', 'you', 'we', 'they', 'my', 'your', 'our', 'me', 'to', 'of', 'in',
    'on', 'at', 'for', 'with', 'about', 'and', 'or', 'can', 'could', 'would',
    'please', 'hi', 'hello', 'hey', 'salam', 'assalam', 'alaikum', 'hai', 'hain',
    'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'kya', 'ap', 'aap', 'mujhe',
  ]);

  const inputWords = new Set(
    normalizedInput
      .split(' ')
      .filter((w) => w.length >= 3 && !stopWords.has(w))
  );

  let bestItem: KnowledgeBaseFaqItem | null = null;
  let bestScore = 0;

  for (const item of faqItems) {
    if (!item.enabled || !item.question.trim() || !item.answer.trim()) continue;

    let score = 0;

    // 1. Check explicit trigger keywords / phrases (strong signal)
    const rawKeywords = (item.keywords || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length >= 2);

    for (const kw of rawKeywords) {
      if (kw.includes(' ')) {
        if (normalizedInput.includes(kw)) score += 5;
      } else if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalizedInput)) {
        score += 3.5;
      }
    }

    // 2. Check meaningful token overlap with the saved question
    const questionTokens = item.question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    let overlapCount = 0;
    for (const token of new Set(questionTokens)) {
      if (inputWords.has(token)) {
        overlapCount += 1;
      }
    }
    if (questionTokens.length > 0 && overlapCount > 0) {
      score += overlapCount * 1.5 + (overlapCount / new Set(questionTokens).size) * 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 3.5 ? bestItem : null;
}

export function buildSystemPrompt(config: KnowledgeBaseConfig): string {
  const extraSection = config.additionalNotes.trim()
    ? `\n- **Additional Verified Policies:** ${config.additionalNotes.trim()}`
    : '';

  const enabledFaqs = (config.faqItems || []).filter(
    (item) => item.enabled && item.question.trim() && item.answer.trim()
  );

  const faqSection =
    enabledFaqs.length > 0
      ? `\n\n# APPROVED Q&A KNOWLEDGE BANK (PRIORITY ANSWERS)
Whenever a client asks a question that matches or closely relates to any entry below (regardless of phrasing, spelling, or language—including English, Urdu, or Roman Urdu), treat the corresponding **Approved Answer** as your authoritative answer.
- Preserve all facts, prices, links, timelines, and policies from the Approved Answer—never contradict or invent beyond it.
- Adapt the wording naturally to match the client's language (e.g., Roman Urdu if they write in Roman Urdu) and follow the WhatsApp formatting rules above.

${enabledFaqs
  .map((item, idx) => {
    const kwLine = item.keywords?.trim()
      ? `\n   - Trigger Keywords / Variants: ${item.keywords.trim()}`
      : '';
    return `${idx + 1}. [${item.category || 'General'}]
   - Possible Client Question: ${item.question.trim()}${kwLine}
   - Approved Answer: ${item.answer.trim()}`;
  })
  .join('\n\n')}`
      : '';

  const handoffTagLine = config.includeHandoffTag
    ? 'Append the exact tag `[HANDOFF_REQUIRED]` at the end of the escalation message so n8n/backend automation can route the ticket.'
    : 'Do not include any bracketed system tags in the customer-facing text.';

  return `# ROLE & IDENTITY
You are ${config.agentName}, the official AI Assistant for ${config.businessName} (${config.website}).
Your purpose is to assist prospective and existing clients on WhatsApp quickly, warmly, and accurately—answering questions, qualifying their needs, handling document/file submissions, and guiding them toward booking or getting matched with the right specialist.

# COMMUNICATION STYLE & WHATSAPP FORMATTING RULES
WhatsApp messages are read on mobile screens. Strictly obey these formatting rules:
1. **Language Mirroring:** Always reply in the exact language (or natural mix, e.g., English or Urdu/Roman Urdu) that the client uses.
2. **Concise & Scannable:** Keep replies brief (typically 2–5 short sentences or a compact bulleted list). Break thoughts into short 1–2 sentence paragraphs with blank lines between them.
3. **WhatsApp Markdown Only:** Use single asterisks for *bold* and underscores for _italics_. NEVER use Markdown tables (\`| --- |\`), \`#\` headings, or raw HTML tags—they render poorly on WhatsApp.
4. **Tone:** Friendly, calm, professional, and helpful—like an attentive human coordinator, never robotic or overly formal.
5. **One Clear Next Step:** End helpful answers with a single, low-friction question or action so the client knows how to proceed.

# VERIFIED KNOWLEDGE BASE (SOURCE OF TRUTH)
Use ONLY the facts below and the Approved Q&A Knowledge Bank to answer business questions. Never invent prices, turnaround times, guarantees, or policies.

- **Website:** ${config.website}
- **Core Services:** ${config.coreServices}
- **Subjects Covered:** ${config.subjectsCovered}
- **Operating Hours:** ${config.operatingHours}
- **Pricing / Quotes:** ${config.pricingPolicy}
- **Booking / Onboarding Link:** ${config.bookingLink}
- **Payment Methods:** ${config.paymentMethods}${extraSection}${faqSection}

# CONVERSATION WORKFLOW & LEAD QUALIFICATION
When a client reaches out for help, naturally gather missing details across turns (do NOT interrogate them with a long 10-question form at once—ask 1–2 key questions per message):
1. **Subject / Topic:** What subject or specific topic do they need help with?
2. **Academic Level:** High school, Undergraduate, Master's, or PhD?
3. **Goal & Timeline:** Is it ongoing 1-on-1 tutoring, exam prep, or a specific deadline/date?
4. **Action:** Once you have those details, summarize their request clearly, share the next step/link (${config.bookingLink}), or confirm that a coordinator will send a tailored match shortly.

# HANDLING DOCUMENTS, IMAGES & MEDIA
- If a client sends a PDF, image, syllabus, or assignment brief (or mentions uploading one), confirm receipt warmly, summarize what you see if text/content is provided, and ask for any missing details (such as their deadline or specific questions they want covered).
- If a file fails to load or is unreadable, politely ask them to resend it as a clear photo or PDF, or paste the key text directly in chat.

# STRICT GUARDRAILS & ANTI-HALLUCINATION
1. **Never Guess:** If a client asks about something not covered in your Verified Knowledge Base or Approved Q&A Knowledge Bank (e.g., custom discounts, unverified guarantees, specific tutor availability not in context), say honestly that you want to double-check with the team rather than making up an answer.
2. **Academic Integrity:** Frame all support around *1-on-1 tutoring, concept explanation, editing guidance, and exam/research mentoring*. Never promise academic dishonesty or use banned phrasing.
3. **Privacy:** Never ask for passwords, full credit card numbers, or sensitive personal IDs in WhatsApp chat.

# HUMAN HANDOFF & ESCALATION PROTOCOL
Immediately escalate to a human team member if ANY of the following occur:
- The client explicitly asks to speak with a human, manager, or live agent.
- The client expresses frustration, anger, or dissatisfaction.
- The inquiry involves a refund, payment dispute, billing issue, or custom enterprise/bulk package.
- You lack verified information to answer accurately after checking your context.

**When escalating, respond with:**
"I'm connecting you with a senior coordinator from our team so we can handle this properly for you. Someone will follow up right here shortly—thank you for your patience!"
(Mirror the client's language if they are messaging in another language such as Urdu/Roman Urdu while keeping the exact reassuring intent.)
${handoffTagLine}`;
}

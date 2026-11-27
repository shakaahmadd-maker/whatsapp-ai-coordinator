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
    ? `\n- Notes: ${config.additionalNotes.trim()}`
    : '';

  const enabledFaqs = (config.faqItems || []).filter(
    (item) => item.enabled && item.question.trim() && item.answer.trim()
  );

  const faqSection =
    enabledFaqs.length > 0
      ? `\n\nAPPROVED Q&A BANK (use exact facts, 1-2 brief plain-text lines, max 18 words):
${enabledFaqs
  .map((item, idx) => {
    const kw = item.keywords?.trim() ? ` (${item.keywords.trim()})` : '';
    return `${idx + 1}. Q: ${item.question.trim()}${kw} -> A: ${item.answer.trim()}`;
  })
  .join('\n')}`
      : '';

  const handoffTagLine = config.includeHandoffTag
    ? 'Append [HANDOFF_REQUIRED] at the end only when escalating.'
    : 'Never include bracketed system tags.';

  return `You are ${config.agentName}, a human coordinator at ${config.businessName} (${config.website}) chatting on WhatsApp. Act like a real person—never say or imply that you are an AI, bot, or assistant.

STRICT RULES
- Ask AT MOST ONE short question or ONE request per message (max 15-18 words, 1-2 brief lines). Never ask two things in one reply.
- Never repeat a question the student already answered, and never repeat the same greeting or "wait a moment" line twice.
- Do NOT say "Wait a moment..." until ALL required components for that specific task are collected.
- Plain text only (no markdown bold, italics, headings, tables, or bullet lists). Mirror the client's language naturally.
- Never invent prices or write/solve work in chat.

MEDIA & CONTENT VERIFICATION (CRITICAL — ALWAYS INSPECT BEFORE REPLYING)
- Whenever the client sends an image, sticker, photo, document, voice note, or video, carefully inspect the actual content FIRST before deciding how to reply.
- Check if the content is genuinely related to academic tutoring, assignments, homework, exams, coursework, thesis/writing, IT projects, or University-Tutors services.
- If an image/sticker/video/audio/file is irrelevant, a meme, joke, prank, trolling, gibberish, random photo, or spam: DO NOT treat it as an assignment or study file, DO NOT run the task checklist on it, DO NOT say "Wait a moment", and DO NOT play along or answer troll questions. Reply calmly in 1 brief plain-text line stating it does not look like an academic file and asking them to share actual coursework or study details if they need help.
- If the media IS genuine academic material (rubric, questions, syllabus, LMS screenshot, notes, code), briefly reference the real topic/detail you saw, fill leadProfile from what is visible (never re-ask details already shown in the file), and ask only for the next missing checklist piece.
- If a file/image failed to download or is unreadable/blurry, tell them honestly you could not open it and ask them to resend clearly. Never pretend you read media you could not see.

TASK CHECKLISTS (COLLECT ONE MISSING PIECE PER TURN)
1. First contact: Ask only what they need help with today (e.g., "Hey! What are you working on today?").
2. Thesis / Writing / Academic Writing Coach:
   - Collect: (a) topic & level, (b) word count & citation style, (c) rubric/guidelines file & deadline.
3. Assignment / Homework / Quizzes:
   - Collect: (a) subject, (b) file/rubric/questions, (c) exact deadline.
4. Coursework / Online Classes / PhD Classes Management:
   - Collect: (a) subject, (b) LMS credentials or syllabus/schedule, (c) duration/term details.
5. 1-on-1 Tutoring / Exams / Protected Exam:
   - Collect: (a) subject & topics, (b) exam format (if exam), (c) date & time.
6. IT Project Assistance:
   - Collect: (a) tech stack/language, (b) project specs/files, (c) deadline.

WHEN ALL COMPONENTS ARE COLLECTED
- Once you have every item for their task, set handoffRequired=true and qualificationComplete=true, and reply:
  "Thanks, I have everything! Wait a moment while I check this with our specialist."
  (Mirror Roman Urdu naturally if they write in Roman Urdu.)
- If they message again while waiting, reply briefly that the specialist is still reviewing and will update them shortly.
- If they explicitly demand a human specialist, refund, or billing help, set handoffRequired=true and hand off briefly.
- ${handoffTagLine}

VERIFIED FACTS (never invent beyond these)
- Website: ${config.website} | Booking: ${config.bookingLink}
- Services: ${config.coreServices}
- Subjects: ${config.subjectsCovered}
- Hours: ${config.operatingHours} | Payments: ${config.paymentMethods}
- Pricing: ${config.pricingPolicy}${extraSection}${faqSection}`;
}

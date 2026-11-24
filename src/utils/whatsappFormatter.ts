import type { WhatsAppCompliance } from '../types/agent.ts';

export function evaluateWhatsAppCompliance(text: string): WhatsAppCompliance {
  const trimmed = text.trim();
  const hasHeading = /^#{1,6}\s/m.test(trimmed);
  const hasTable = /\|[\s-]{2,}\|/.test(trimmed);
  const hasHtml = /<\/?[a-z][\s\S]*?>/i.test(trimmed);
  const conciseLength = trimmed.length > 0 && trimmed.length <= 750;
  const hasClearNextStep =
    /\?/.test(trimmed) ||
    /https?:\/\//i.test(trimmed) ||
    /follow up|connect|let me know|share|send|reply/i.test(trimmed);

  return {
    noHeadings: !hasHeading,
    noTables: !hasTable,
    noHtml: !hasHtml,
    conciseLength,
    hasClearNextStep,
  };
}

export function formatTimeNow(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

import React from 'react';

interface WhatsAppTextProps {
  text: string;
}

function renderInlineTokens(line: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s)]+|\[HANDOFF_REQUIRED\])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token === '[HANDOFF_REQUIRED]') {
      parts.push(
        <span
          key={key}
          className="font-mono text-[11px] font-medium text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded"
        >
          [HANDOFF_REQUIRED]
        </span>
      );
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      parts.push(
        <strong key={key} className="font-semibold text-slate-900">
          {token.slice(1, -1)}
        </strong>
      );
    } else if (token.startsWith('_') && token.endsWith('_') && token.length > 2) {
      parts.push(
        <em key={key} className="italic text-slate-800">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('~') && token.endsWith('~') && token.length > 2) {
      parts.push(
        <del key={key} className="line-through text-slate-500">
          {token.slice(1, -1)}
        </del>
      );
    } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      parts.push(
        <code key={key} className="font-mono text-[12px] bg-black/5 px-1 py-0.5 rounded">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      parts.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#027EB5] underline underline-offset-2 hover:text-[#015C85] break-all"
        >
          {token}
        </a>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts;
}

export const WhatsAppText: React.FC<WhatsAppTextProps> = ({ text }) => {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-[14px] leading-[1.45] text-[#111B21] break-words">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={i} className="h-1.5" aria-hidden="true" />;
        }

        if (/^[-•]\s+/.test(trimmed) || (/^\*\s+/.test(trimmed) && !trimmed.slice(1).includes('*'))) {
          const content = trimmed.replace(/^[-•*]\s+/, '');
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-slate-600 select-none">•</span>
              <span>{renderInlineTokens(content, `l-${i}`)}</span>
            </div>
          );
        }

        return <p key={i}>{renderInlineTokens(line, `l-${i}`)}</p>;
      })}
    </div>
  );
};

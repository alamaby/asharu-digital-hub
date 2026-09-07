'use client';

import { useState } from 'react';

const LEVEL_CLASS: Record<string, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-line bg-surface text-ink-muted'
};

interface Props {
  stage: string;
  level: string;
  time: string;
  message: string;
  expandLabel: string;
  collapseLabel: string;
}

const CLAMP_THRESHOLD = 220;

export function ResearchLogItem({ stage, level, time, message, expandLabel, collapseLabel }: Props) {
  const [expanded, setExpanded] = useState(false);
  const long = message.length > CLAMP_THRESHOLD;

  return (
    <li className={`rounded-xl border p-3 text-xs ${LEVEL_CLASS[level] ?? LEVEL_CLASS.info}`}>
      <p className="font-medium">
        [{stage}] {level} · {time}
      </p>
      <p className={`mt-1 whitespace-pre-wrap break-words text-xs ${expanded ? '' : 'line-clamp-3'}`}>
        {message}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-[11px] font-medium underline underline-offset-2 hover:opacity-80"
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      ) : null}
    </li>
  );
}

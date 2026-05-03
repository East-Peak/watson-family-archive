'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import ContextMarker from './ContextMarker';
import type { SidebarMessage, ChatSources } from '@/types/chat';
import type { VisualizationCommand } from '@/types/visualization';

// ─── MessageContent ────────────────────────────────────────────────────────

function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith('/person/')) {
            return (
              <Link href={href} className="text-amber-700 hover:text-amber-900 underline">
                {children}
              </Link>
            );
          }
          return (
            <a href={href} className="text-amber-700 hover:text-amber-900 underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="ml-1">{children}</li>,
        p: ({ children }) => <p className="my-1.5">{children}</p>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── VizCommandIndicator ──────────────────────────────────────────────────

const VIZ_ACTION_LABELS: Record<string, string> = {
  filter: 'Filtering',
  highlight: 'Highlighting',
  focusOn: 'Focusing on',
  showCollection: 'Showing collection on',
  reset: 'Resetting',
};

function VizCommandIndicator({
  command,
  onUndo,
}: {
  command: VisualizationCommand;
  onUndo: () => void;
}) {
  const label = VIZ_ACTION_LABELS[command.action] ?? command.action;
  const showUndo = command.action !== 'showCollection';

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-amber-50 border border-amber-200/40 rounded px-2 py-1">
      <span className="text-amber-600">
        {label} {command.target}
      </span>
      {showUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="ml-auto text-gray-400 hover:text-gray-600 underline transition-colors"
        >
          Undo
        </button>
      )}
    </div>
  );
}

// ─── SourceMetadata ───────────────────────────────────────────────────────

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-green-700 bg-green-50 border-green-200',
  medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  low: 'text-red-700 bg-red-50 border-red-200',
};

function SourceMetadata({ sources }: { sources: ChatSources }) {
  const { confidence, familyRecords, viewerScoped } = sources;

  return (
    <div className="mt-2 text-xs text-gray-400 space-y-1.5">
      {confidence && (
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${CONFIDENCE_COLORS[confidence.level] ?? 'text-gray-600 bg-gray-50 border-gray-200'}`}>
          <span>{confidence.level}</span>
          <span className="opacity-70">{confidence.score.toFixed(2)}</span>
        </div>
      )}
      {viewerScoped && (
        <p className="text-gray-400/70 text-[10px] italic">Based on your family records</p>
      )}
      {familyRecords.people.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {familyRecords.people.map((p) => (
            <Link
              key={p.id}
              href={`/person/${p.id}`}
              className="text-[10px] text-amber-600/80 hover:text-amber-800 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200/50 hover:border-amber-300 transition-colors"
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}
      {confidence?.reasons && confidence.reasons.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {confidence.reasons.map((r) => (
            <li key={r} className="text-gray-400">· {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Loading indicator ────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
      <span className="text-xs text-gray-400 ml-1">Searching your family tree...</span>
    </div>
  );
}

// ─── ChatMessages ─────────────────────────────────────────────────────────

interface ChatMessagesProps {
  messages: SidebarMessage[];
  isLoading: boolean;
  onUndoVisualization: (cmd: VisualizationCommand) => void;
}

export default function ChatMessages({ messages, isLoading, onUndoVisualization }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0"
    >
      {messages.map((msg, i) => {
        if (msg.type === 'context-marker') {
          return <ContextMarker key={i} content={msg.content} />;
        }

        if (msg.type === 'user') {
          return (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] px-3 py-2 rounded-lg bg-amber-50 text-sm text-gray-800">
                {msg.content}
              </div>
            </div>
          );
        }

        // assistant
        return (
          <div key={i} className="flex justify-start">
            <div className="max-w-[95%] px-3 py-2 rounded-lg bg-white border border-gray-100 text-sm text-gray-800">
              <MessageContent content={msg.content} />
              {msg.visualizationCommand && (
                <VizCommandIndicator
                  command={msg.visualizationCommand}
                  onUndo={() => onUndoVisualization(msg.visualizationCommand!)}
                />
              )}
              {msg.visualizationFeedback?.status === 'rejected' && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200/40 rounded px-2 py-1">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0l-7.07 12a2 2 0 001.74 3z" />
                  </svg>
                  <span>
                    Command not applied{msg.visualizationFeedback.reason ? `: ${msg.visualizationFeedback.reason}` : '.'}
                  </span>
                </div>
              )}
              {msg.sources && <SourceMetadata sources={msg.sources} />}
            </div>
          </div>
        );
      })}

      {isLoading && <LoadingDots />}

      <div ref={bottomRef} />
    </div>
  );
}

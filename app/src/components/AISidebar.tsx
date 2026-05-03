'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useChat } from '@/components/ChatProvider';
import { useMe } from '@/components/MeProvider';
import ContextCard from './AISidebar/ContextCard';
import ExampleQuestions from './AISidebar/ExampleQuestions';
import ChatMessages from './AISidebar/ChatMessages';
import SidebarInput from './AISidebar/SidebarInput';
import type { ChatApiResponse } from '@/types/chat';
import type { VisualizationCommand } from '@/types/visualization';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AISidebarProps {
  overlay?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the messages array is empty or contains only context-markers.
 * In that state, example questions are shown instead of the chat log.
 */
function shouldShowExamples(messages: ReturnType<typeof useChat>['messages']): boolean {
  if (messages.length === 0) return true;
  return messages.every(m => m.type === 'context-marker');
}

// ─── AISidebar ────────────────────────────────────────────────────────────────

export default function AISidebar({ overlay = false }: AISidebarProps) {
  const {
    messages,
    addMessage,
    replaceLastMessage,
    clearConversation,
    effectiveContext,
    setVisualizationCommand,
    closeSidebar,
    insertGenericPersonMarkerIfPending,
    routeContext,
    pageContext,
    pendingPrompt,
    clearPendingPrompt,
  } = useChat();

  const { me } = useMe();

  const [isLoading, setIsLoading] = useState(false);
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

  const sidebarRef = useRef<HTMLElement>(null);

  // ── Person context ───────────────────────────────────────────────────────────

  const isPersonPage = effectiveContext.type === 'person';
  const personId = isPersonPage ? (effectiveContext as { type: 'person'; personId?: string }).personId : undefined;
  const personName = isPersonPage ? (effectiveContext as { type: 'person'; personName?: string }).personName : undefined;

  // ── Escape key — close sidebar ───────────────────────────────────────────────

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSidebar();
        document.getElementById('sidebar-toggle')?.focus();
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [closeSidebar]);

  // ── sendMessage ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Build history BEFORE queuing state updates so the snapshot is current.
    // Include any pending person marker and the new user message in the payload.
    const pendingMarker = insertGenericPersonMarkerIfPending();
    const userMsg = { type: 'user' as const, content: trimmed, timestamp: Date.now() };

    // Assemble the full message list that will exist after state flushes
    const allMessages = [...messages, ...(pendingMarker ? [pendingMarker] : []), userMsg];
    const recentMessages = allMessages.slice(-6);
    const history = recentMessages.map(m => ({
      role: m.type === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    // Now queue the state updates
    addMessage(userMsg);

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          context: effectiveContext,
          viewer: me,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: ChatApiResponse = await response.json();

      // Apply visualization command if present
      if (data.visualizationCommand) {
        setVisualizationCommand(data.visualizationCommand);
      }

      addMessage({
        type: 'assistant',
        content: data.response,
        timestamp: Date.now(),
        sources: data.sources,
        visualizationCommand: data.visualizationCommand,
        visualizationFeedback: data.visualizationFeedback,
        peopleReferenced: data.peopleReferenced,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addMessage({
        type: 'assistant',
        content: `Sorry, I couldn't process that request. ${message}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
      setShouldAutoFocus(true);
    }
  }, [isLoading, messages, effectiveContext, me, addMessage, setVisualizationCommand, insertGenericPersonMarkerIfPending]);

  // ── handleUndoVisualization ──────────────────────────────────────────────────

  const handleUndoVisualization = useCallback((cmd: VisualizationCommand) => {
    const resetCmd: VisualizationCommand = {
      action: 'reset',
      target: cmd.target,
      params: {},
    };
    setVisualizationCommand(resetCmd);
  }, [setVisualizationCommand]);


  // ── Pending prompt handoff from search ───────────────────────────────────────
  // When SmartSearchInput calls askAI(query), pendingPrompt is set and the
  // sidebar opens. Consume the prompt once and fire sendMessage to kick off
  // the chat automatically.

  useEffect(() => {
    if (!pendingPrompt || isLoading) return;
    const prompt = pendingPrompt;
    clearPendingPrompt();
    sendMessage(prompt);
  }, [pendingPrompt, isLoading, clearPendingPrompt, sendMessage]);

  // ── handleNewConversation ────────────────────────────────────────────────────

  const handleNewConversation = useCallback(() => {
    clearConversation();
  }, [clearConversation]);

  // ── Sidebar classes ──────────────────────────────────────────────────────────

  const sidebarClass = overlay
    ? 'fixed right-0 top-14 bottom-0 w-[380px] md:w-[420px] z-40 bg-white/95 backdrop-blur-sm shadow-2xl hidden md:flex flex-col motion-safe:transition-transform motion-safe:duration-200'
    : 'w-[380px] md:w-[420px] flex-shrink-0 hidden md:flex flex-col bg-white border-l border-amber-200/40 h-full motion-safe:transition-transform motion-safe:duration-200';

  const showExamples = shouldShowExamples(messages);
  const pageType = effectiveContext.type;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        ref={sidebarRef}
        role="complementary"
        aria-label="Family Historian"
        className={sidebarClass}
      >
        {/* Sidebar header with close button */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-200/40">
          <span className="text-sm font-serif font-medium text-shield">Family Historian</span>
          <button
            type="button"
            onClick={() => { closeSidebar(); document.getElementById('sidebar-toggle')?.focus(); }}
            aria-label="Close sidebar"
            className="p-1.5 text-gray-400 hover:text-shield rounded-lg hover:bg-shield/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Person context card — only on person pages */}
        {isPersonPage && (
          <ContextCard
            personId={personId}
            personName={personName}
            onQuickAction={sendMessage}
          />
        )}

        {/* Conversation area */}
        {showExamples ? (
          <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
            <ExampleQuestions
              pageType={pageType}
              personName={personName}
              onSelect={sendMessage}
            />
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            onUndoVisualization={handleUndoVisualization}
          />
        )}

        {/* Input */}
        <SidebarInput
          onSend={sendMessage}
          onNewConversation={handleNewConversation}
          isLoading={isLoading}
          autoFocus={shouldAutoFocus}
        />
      </aside>

      {/* Mobile full-screen sheet */}
      <div
        className="flex flex-col md:hidden fixed inset-0 z-50 bg-white"
        role="dialog"
        aria-label="Family Historian"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-serif font-medium text-shield text-sm">Family Historian</h2>
          <button
            type="button"
            onClick={closeSidebar}
            aria-label="Close Family Historian"
            className="p-2 text-gray-400 hover:text-shield rounded-lg hover:bg-shield/5 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ContextCard
          personId={personId}
          personName={personName}
          onQuickAction={sendMessage}
        />

        {showExamples ? (
          <div className="flex-1 overflow-y-auto">
            <ExampleQuestions
              pageType={effectiveContext.type}
              personName={personName}
              onSelect={sendMessage}
            />
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            onUndoVisualization={handleUndoVisualization}
          />
        )}

        <SidebarInput
          onSend={sendMessage}
          onNewConversation={handleNewConversation}
          isLoading={isLoading}
          autoFocus={false}
        />
      </div>
    </>
  );
}

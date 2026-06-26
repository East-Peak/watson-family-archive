'use client';

import { useState, useRef, useEffect } from 'react';

interface SidebarInputProps {
  onSend: (text: string) => void;
  onNewConversation: () => void;
  isLoading: boolean;
  autoFocus?: boolean;
}

export default function SidebarInput({
  onSend,
  onNewConversation,
  isLoading,
  autoFocus,
}: SidebarInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="border-t border-amber-200/40 bg-white px-3 py-3">
      <div className="flex justify-end mb-1">
        <button
          type="button"
          onClick={onNewConversation}
          className="text-xs font-medium text-shield/70 hover:text-shield px-3 py-1.5 rounded-lg bg-shield/5 hover:bg-shield/10 border border-shield/10 hover:border-shield/20 transition-colors"
        >
          New conversation
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask about your family tree..."
          disabled={isLoading}
          className="flex-1 px-3 py-2 bg-white border border-shield/20 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          aria-label="Send message"
          className="p-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-lg transition-colors flex-shrink-0"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}

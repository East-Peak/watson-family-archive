'use client';

import { useState, useEffect } from 'react';

interface RebuildInfo {
  status: 'idle' | 'running';
  lastRebuild: string | null;
}

export default function RebuildStatus() {
  const [info, setInfo] = useState<RebuildInfo | null>(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetch('/api/admin/rebuild')
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info?.lastRebuild) return null;

  const lastDate = new Date(info.lastRebuild);
  const timeLabel = lastDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleRebuild = async () => {
    setTriggering(true);
    try {
      const secret = prompt('Admin secret:');
      if (!secret) { setTriggering(false); return; }
      const res = await fetch('/api/admin/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json();
      if (data.status === 'started') {
        setInfo({ ...info, status: 'running' });
      } else {
        alert(data.message || data.error);
      }
    } catch {
      alert('Rebuild request failed');
    }
    setTriggering(false);
  };

  return (
    <div className="flex items-center gap-2 text-xs text-shield/50">
      <span>Data refreshed {timeLabel}</span>
      {info.status === 'running' ? (
        <span className="text-amber-600 animate-pulse">Rebuilding...</span>
      ) : (
        <button
          onClick={handleRebuild}
          disabled={triggering}
          className="text-shield/40 hover:text-shield transition-colors underline"
        >
          Refresh
        </button>
      )}
    </div>
  );
}

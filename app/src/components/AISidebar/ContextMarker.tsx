interface ContextMarkerProps {
  content: string;
}

export default function ContextMarker({
  content: _content,
}: ContextMarkerProps) {
  // Internal context markers are hidden from both visual users AND assistive tech.
  // Only a decorative "navigated" divider is shown visually.
  return (
    <div
      className="flex items-center gap-2 py-2 opacity-30"
      aria-hidden="true"
      role="presentation"
    >
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[10px] text-gray-400">navigated</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

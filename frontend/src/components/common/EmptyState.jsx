export default function EmptyState({ message, hint }) {
  return (
    <div className="bg-neutral-0 border border-dashed border-neutral-200 rounded-xl px-4 py-6 text-center">
      <p className="text-sm font-medium text-neutral-500">{message}</p>
      {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
    </div>
  );
}

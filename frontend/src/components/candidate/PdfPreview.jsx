import { card } from '../../styles/layout'

export default function PdfPreview({ src, label, onDelete }) {
export default function PdfPreview({ src, label, onDelete }) {
  if (!src) {
    return (
      <div className={`${card.base} flex items-center justify-center aspect-[1/1.5] text-base text-neutral-400`}>
        No document attached.
      </div>
    )
  }
  return (
    <div className={`${card.flat} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
        <span className="text-sm font-medium text-neutral-500">{label}</span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-coral-200 px-2.5 py-1 text-xs font-semibold text-coral-600 transition-colors hover:bg-coral-50"
          >
            Delete {label}
          </button>
        )}
      </div>
      <div className="w-full aspect-[1/1.5] bg-neutral-50">
        <iframe
          title={label}
          src={`/api/files/${src}#toolbar=1&view=FitH`}
          className="w-full h-full bg-neutral-50"
        />
      </div>
    </div>
  )
}

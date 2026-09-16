import { card } from '../../styles/layout'

export default function PdfPreview({ src, label }) {
  if (!src) {
    return (
      <div className={`${card.base} flex items-center justify-center aspect-[1/1.5] text-base text-neutral-400`}>
        No document attached.
      </div>
    )
  }
  return (
    <div className={`${card.flat} overflow-hidden`}>
      <div className="px-4 py-2 border-b border-neutral-100 text-sm font-medium text-neutral-500">
        {label}
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

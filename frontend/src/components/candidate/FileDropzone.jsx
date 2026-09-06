import { useRef, useState } from 'react'
import { form } from '../../styles/layout'

export default function FileDropzone({ label, file, existingName = null, onFileChange, onRemove }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handlePick(fileList) {
    const picked = fileList?.[0]
    if (!picked) return
    onFileChange(picked)
  }

  const displayName = file?.name || existingName

  return (
    <div>
      <label className={form.label}>{label}</label>

      {displayName ? (
        <div className="flex items-center gap-2 pt-2">
          <span className="text-coral-500 text-base">📄</span>
          <span className="truncate text-sm text-primary-500 underline underline-offset-2">
            {displayName}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 text-base text-neutral-500 hover:text-neutral-800"
          >
            ×
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => handlePick(e.target.files)}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handlePick(e.dataTransfer.files)
            }}
            className={`flex h-[130px] w-full flex-col items-center justify-center rounded-lg border border-dashed text-center transition-colors ${
              dragging
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-300 bg-white'
            }`}
          >
            <p className="text-sm text-neutral-400">Drag & drop or click to upload</p>
            <p className="text-sm text-neutral-300">.PDF only</p>
          </button>
        </>
      )}
    </div>
  )
}

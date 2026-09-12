import { useRef } from "react";
import PdfPreview from "./PdfPreview.jsx";

export default function DocumentSlot({ url, label, uploading, onUpload, onDelete }) {
  const inputRef = useRef(null);
  if (url) {
    const pdfSrc = url.startsWith("/api/files/") ? url.slice("/api/files/".length) : url;
    return (
      <div className="flex-1 relative overflow-hidden">
        {onDelete && (
          <button
            onClick={onDelete}
            className="absolute top-4 right-4 z-10 rounded-xl border border-coral-200 bg-white/90 px-3 py-1 text-sm font-semibold text-coral-600 shadow-sm transition-colors hover:bg-coral-50 backdrop-blur-sm"
          >
            Delete {label}
          </button>
        )}
        <div className="h-full overflow-y-auto p-6">
          <PdfPreview src={pdfSrc} label={label} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-neutral-400">No {label.toLowerCase()} on file.</p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 text-sm transition-colors"
      >
        {uploading ? "Uploading…" : `Upload ${label}`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

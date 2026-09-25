import { useEffect, useRef, useState } from "react";
import { flex } from "../../styles/layout";
import { SECTION_COLORS } from "../../utils/constants.js";
import { formatTimer } from "../../utils/time.js";

const icon = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };

// Split button for the post-interview transcript: the left half opens a
// dropdown of the sections that were actually run (pick one to jump to it), the
// right half is an eye that shows/hides the section markers in the transcript.
// `sections` are started sections carrying their original `_idx`.
export default function SectionMenu({ sections, visible, onToggleVisible, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const tone = visible
    ? "bg-primary-50 border-primary-200 text-primary-600"
    : "bg-white border-neutral-200 text-neutral-500";

  return (
    <div ref={ref} className="relative shrink-0">
      <div className={`flex items-stretch overflow-hidden rounded-xl border transition-colors ${tone}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold hover:bg-black/5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.5" {...icon}>
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
          Sections
          <svg width="11" height="11" viewBox="0 0 24 24" strokeWidth="3" {...icon} className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onToggleVisible}
          aria-pressed={visible}
          aria-label={visible ? "Hide sections in transcript" : "Show sections in transcript"}
          title={visible ? "Hide sections in transcript" : "Show sections in transcript"}
          className="flex items-center border-l border-inherit px-3 hover:bg-black/5 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...icon}>
            {visible ? (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            ) : (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div role="listbox" className="absolute left-0 top-full mt-2 z-20 w-72 max-h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
          {sections.map((section) => {
            const color = SECTION_COLORS[section._idx % SECTION_COLORS.length];
            return (
              <button
                key={section._idx}
                type="button"
                role="option"
                onClick={() => { onSelect(section._idx); setOpen(false); }}
                className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-neutral-50"
              >
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-xs ${color.badge}`}>
                  {formatTimer(section.start_at)}
                </span>
                <div className={`${flex.col} min-w-0`}>
                  <span className="text-sm font-semibold text-neutral-800 transition-colors group-hover:text-primary-600">
                    {section.name}
                  </span>
                  {section.description && (
                    <span className="mt-0.5 line-clamp-1 text-xs text-neutral-400">{section.description}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import commentIcon from "../../assets/icons/comment.png";

// One strength/improvement row on the interviewer profile: the point, an
// acknowledge toggle, and an inline reflection-note editor. Acknowledgement and
// note are persisted via onUpdate(itemId, patch).
export default function FeedbackItemRow({ item, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note || "");
  const [busy, setBusy] = useState(false);

  async function toggleAck() {
    setBusy(true);
    try { await onUpdate(item.id, { acknowledged: !item.acknowledged }); }
    finally { setBusy(false); }
  }

  async function saveNote() {
    setBusy(true);
    try { await onUpdate(item.id, { note }); setEditing(false); }
    finally { setBusy(false); }
  }

  return (
    <div className="shrink-0 rounded-xl bg-neutral-100 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-neutral-800">{item.title}</p>
            {item.acknowledged && (
              <span className="rounded-pill bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                Acknowledged
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-snug text-neutral-500">{item.detail}</p>
          {item.note && !editing && (
            <p className="mt-1.5 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-600">
              <span className="font-semibold text-neutral-500">Your note: </span>
              {item.note}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleAck}
            disabled={busy}
            title={item.acknowledged ? "Acknowledged - click to undo" : "Acknowledge"}
            className={`rounded-lg p-1 transition ${item.acknowledged ? "text-green-600" : "text-neutral-400 hover:text-green-600"}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setEditing((o) => !o)}
            title={item.note ? "Edit note" : "Add a reflection note"}
            className="rounded-lg p-1 transition"
          >
            <img
              src={commentIcon}
              alt="Note"
              className={`h-4 w-4 transition ${item.note ? "opacity-90" : "opacity-40 hover:opacity-90"}`}
            />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-2">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a personal reflection…"
            className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setNote(item.note || ""); setEditing(false); }}
              className="text-[11px] font-medium text-neutral-400 hover:text-neutral-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveNote}
              disabled={busy}
              className="rounded-lg bg-primary-500 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

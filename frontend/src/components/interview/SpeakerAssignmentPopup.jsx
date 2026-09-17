import { useEffect, useRef, useState } from "react";

export default function SpeakerAssignmentPopup({entry, interviewerLabel, candidateLabel, onAssign, onClose}) {
  const [customOpen, setCustomOpen] = useState(entry.speaker_role === "other");
  const [customName, setCustomName] = useState(
    entry.speaker_role === "other" ? entry.speaker || "" : ""
  );

  const [line, setLine] = useState("all");
  const popupRef = useRef(null);

  // Close the popup when the user clicks anywhere outside it. Same pattern
  // as InterviewerCombobox — mousedown fires before click, so it closes
  // before any outside click has a chance to run its own handler.
  useEffect(() => {
    function handler(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const choices = [
    {
      id: "primary-interviewer",
      name: interviewerLabel || "Interviewer",
      role: "interviewer",
    },
    {
      id: "candidate",
      name: candidateLabel || "Candidate",
      role: "candidate",
    },
  ];

  function chooseSpeaker(person) {onAssign(entry, person, line); onClose()}

  function submitCustom(event) {
    event.preventDefault();
    const trimmed = customName.trim();
    if (!trimmed) return;
    onAssign(entry, {
      id: `custom:${trimmed.toLowerCase()}`,
      name: trimmed,
      role: "other",
    }, line);
    onClose();
  }

  return (
    <div ref={popupRef} role="dialog" aria-label="Choose speaker" className="absolute z-30 top-full left-0 mt-1 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-neutral-700">
          Choose speaker
        </span>

      </div>

      <label className="mt-2 flex items-start gap-2 cursor-pointer select-none rounded-md px-1 py-1 hover:bg-neutral-50">
        <input type="checkbox" checked={line === "all"} onChange={(e) => setLine(e.target.checked ? "all" : "one")} className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-primary-500 focus:ring-primary-500"/>
        <span className="text-xs text-neutral-600">
          Apply to <span className="font-semibold">all lines</span> by this voice
        </span>
      </label>

      <div className="mt-3 space-y-1">
        {choices.map(person => (
          <button key={person.id} type="button" onClick={() => chooseSpeaker(person)} className={`block w-full rounded-md border p-2 text-left ${entry.participant_id === person.id ? "border-primary-300 bg-primary-50" : "border-transparent hover:bg-neutral-50"}`}>
            <span className="block text-sm font-medium text-neutral-700">
              {person.name}
            </span>

            <span className="block text-xs capitalize text-neutral-500">
              {person.role}
            </span>
          </button>
        ))}

        {/* Custom name — for anyone who isn't the interviewer or candidate
            (e.g. a second interviewer, a note-taker, a translator). */}
        {customOpen ? (
          <form onSubmit={submitCustom} className="rounded-md border border-primary-200 bg-primary-50/40 p-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              Custom speaker name
            </label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Second Interviewer"
                className="flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700 focus:outline-none focus:border-primary-300"
              />
              <button
                type="submit"
                disabled={!customName.trim()}
                className="rounded-md bg-primary-500 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setCustomOpen(false); setCustomName(""); }}
              className="mt-1 text-xs text-neutral-500 hover:text-neutral-700"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className={`block w-full rounded-md border p-2 text-left ${entry.speaker_role === "other" ? "border-primary-300 bg-primary-50" : "border-transparent hover:bg-neutral-50"}`}
          >
            <span className="block text-sm font-medium text-neutral-700">
              {entry.speaker_role === "other" && entry.speaker ? entry.speaker : "Custom name…"}
            </span>
            <span className="block text-xs text-neutral-500">
              Someone else on the call
            </span>
          </button>
        )}

        <button type="button" onClick={() => chooseSpeaker(null)} className="block w-full rounded-md border border-transparent p-2 text-left text-xs text-neutral-500 hover:bg-neutral-50">
          Leave unassigned
        </button>
      </div>
    </div>
  );
}

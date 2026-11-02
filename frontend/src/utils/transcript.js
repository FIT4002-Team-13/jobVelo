import { parseTimestamp } from "./time.js";

// A same-speaker run keeps absorbing complete sentences until it reaches
// about this length, so a long answer reads as paragraphs, not one wall.
const PARAGRAPH_CHARS = 300;

const ENDS_SENTENCE = /[.?!…]["')\]]*$/;

// Display-only cleanup for the post-interview transcript. Live speech-to-text
// emits short fragments, often splitting one sentence (sometimes a single
// word) across several entries. This stitches consecutive same-speaker
// fragments back together - the stored transcript is untouched, so entry ids
// used by notes, evidence links and the live view all stay valid.
//
// A fragment joins the open row when the speaker is the same AND:
//   - the row doesn't end a sentence yet (always join - it's mid-sentence), or
//   - the row is still shorter than PARAGRAPH_CHARS.
// It never joins across a section start (markers sit between rows), and a
// row holds at most one note so every note keeps a single owning entry.
//
// Each row: { ...first entry, id, ids, rawIndices, text, comment, noteId }
//   id         - first fragment's id (stable React key / DOM anchor)
//   ids        - every merged entry id, for evidence/highlight lookups
//   rawIndices - positions in the original transcript array
//   noteId     - the entry a note edit writes to (the noted fragment, or
//                the first one when there's no note yet)
export function mergeTranscriptFragments(entries, sectionStarts = []) {
  const starts = sectionStarts.filter((s) => s != null).sort((a, b) => a - b);
  const sectionOf = (entry) => {
    const t = parseTimestamp(entry.timestamp);
    let n = 0;
    while (n < starts.length && starts[n] <= t) n++;
    return n;
  };

  const rows = [];
  (entries ?? []).forEach((entry, idx) => {
    const text = (entry.text ?? "").trim();
    const section = sectionOf(entry);
    const prev = rows[rows.length - 1];

    const canJoin =
      prev &&
      prev.speaker === entry.speaker &&
      prev._section === section &&
      !(prev.comment && entry.comment) &&
      (!ENDS_SENTENCE.test(prev.text) || prev.text.length < PARAGRAPH_CHARS);

    if (canJoin) {
      if (text) prev.text = prev.text ? `${prev.text} ${text}` : text;
      prev.ids.push(entry.id);
      prev.rawIndices.push(idx);
      if (entry.comment) {
        prev.comment = entry.comment;
        prev.noteId = entry.id;
      }
      return;
    }

    rows.push({
      ...entry,
      text,
      ids: [entry.id],
      rawIndices: [idx],
      noteId: entry.id,
      _section: section,
    });
  });

  return rows;
}

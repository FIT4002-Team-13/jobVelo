import { describe, expect, it } from "vitest";
import { mergeTranscriptFragments } from "../utils/transcript.js";

const e = (id, speaker, timestamp, text, extra = {}) => ({ id, speaker, timestamp, text, ...extra });

describe("mergeTranscriptFragments", () => {
  it("stitches a sentence split across same-speaker fragments", () => {
    const rows = mergeTranscriptFragments([
      e("1", "Alice", "00:01", "I worked on the"),
      e("2", "Alice", "00:02", "payments"),
      e("3", "Alice", "00:03", "team for two years."),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "1",
      timestamp: "00:01",
      text: "I worked on the payments team for two years.",
      ids: ["1", "2", "3"],
      rawIndices: [0, 1, 2],
    });
  });

  it("starts a new row when the speaker changes", () => {
    const rows = mergeTranscriptFragments([
      e("1", "Bob", "00:01", "Tell me about"),
      e("2", "Alice", "00:03", "Sure."),
      e("3", "Bob", "00:05", "yourself."),
    ]);
    expect(rows.map((r) => r.text)).toEqual(["Tell me about", "Sure.", "yourself."]);
  });

  it("breaks a long same-speaker run into paragraphs at sentence ends", () => {
    const long = "word ".repeat(70).trim() + ".";
    const rows = mergeTranscriptFragments([
      e("1", "Alice", "00:01", long),
      e("2", "Alice", "00:20", "Next point."),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("keeps joining a long row while it is still mid-sentence", () => {
    const long = "word ".repeat(70).trim();
    const rows = mergeTranscriptFragments([
      e("1", "Alice", "00:01", long),
      e("2", "Alice", "00:20", "and done."),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("does not merge across a section start", () => {
    const rows = mergeTranscriptFragments(
      [e("1", "Alice", "00:58", "I think"), e("2", "Alice", "01:02", "so.")],
      [60]
    );
    expect(rows).toHaveLength(2);
  });

  it("keeps at most one note per row and points edits at the noted entry", () => {
    const rows = mergeTranscriptFragments([
      e("1", "Alice", "00:01", "First"),
      e("2", "Alice", "00:02", "part", { comment: "note A" }),
      e("3", "Alice", "00:03", "second", { comment: "note B" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ text: "First part", comment: "note A", noteId: "2" });
    expect(rows[1]).toMatchObject({ text: "second", comment: "note B", noteId: "3" });
  });

  it("writes new notes to the row's first entry", () => {
    const [row] = mergeTranscriptFragments([e("1", "Alice", "00:01", "a"), e("2", "Alice", "00:02", "b")]);
    expect(row.noteId).toBe("1");
  });
});

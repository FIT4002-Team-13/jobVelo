import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api.js";

// Capture the URL + init of every fetch the api client makes, and hand back
// an empty-200 JSON response so request() resolves cleanly.
function stubFetch() {
  const calls = [];
  global.fetch = vi.fn((url, init = {}) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });
  return calls;
}

describe("api client", () => {
  let calls;

  beforeEach(() => {
    calls = stubFetch();
    // A token so `auth: true` calls attach the Authorization header.
    // Matches the authStore shape (single "smartrecruit.auth" key).
    localStorage.setItem(
      "smartrecruit.auth",
      JSON.stringify({ token: "test-token", user: {} })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("builds query strings, dropping empty values", async () => {
    await api.listInterviews({ cand_id: "c1", job_id: "j1", note: "", missing: null });
    expect(calls[0].url).toBe("/api/interviews?cand_id=c1&job_id=j1");
  });

  it("omits the query string entirely when no params are given", async () => {
    await api.listJobs();
    expect(calls[0].url).toBe("/api/jobs");
  });

  it("targets the aggregate interview-context endpoint", async () => {
    await api.getInterviewContext("intv 1");
    expect(calls[0].url).toBe("/api/interviews/intv%201/context");
  });

  it("targets the aggregate candidate-detail endpoint with job_id", async () => {
    await api.getCandidateDetail("cand1", "job1");
    expect(calls[0].url).toBe("/api/candidates/cand1/detail?job_id=job1");
  });

  it("sends completeInterview as a POST with the full body", async () => {
    await api.completeInterview("i1", { transcript: [], duration_seconds: 5, bias_incidents: [] });
    expect(calls[0].url).toBe("/api/interviews/i1/complete");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      transcript: [],
      duration_seconds: 5,
      bias_incidents: [],
    });
    expect(calls[0].init.headers.Authorization).toBe("Bearer test-token");
  });

  it("scopes listInterviewers to the interviewer role", async () => {
    await api.listInterviewers();
    expect(calls[0].url).toBe("/api/users?role=interviewer");
  });
});

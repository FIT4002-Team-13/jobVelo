import { useState, useEffect, useCallback } from "react";
import { authedFetch } from "../lib/api.js";

// The interviewer assigned to an interview (interview_users -> users). Distinct
// from the logged-in user, who may just be viewing someone else's candidate.
// `name`/`userId` stay "" while loading or when nobody is assigned.
export function useAssignedInterviewer(interviewId) {
  const [assigned, setAssigned] = useState({ name: "", userId: "" });

  const reload = useCallback(async () => {
    if (!interviewId) return;
    try {
      const linkRes = await authedFetch(`/api/interview-users/by-interview/${interviewId}`);
      const links = linkRes.ok ? await linkRes.json() : [];
      const userId = Array.isArray(links) ? links[0]?.user_id : null;
      if (!userId) return setAssigned({ name: "", userId: "" });
      const usersRes = await authedFetch("/api/users");
      const users = usersRes.ok ? await usersRes.json() : [];
      const u = Array.isArray(users) ? users.find((x) => x.userid === userId) : null;
      setAssigned({ name: u?.full_name || u?.username || u?.email || "", userId });
    } catch {
      // keep the previous value; callers fall back to "—" or an empty field
    }
  }, [interviewId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { assignedInterviewer: assigned, reloadAssignedInterviewer: reload };
}

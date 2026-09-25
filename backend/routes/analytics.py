"""Analytics endpoints.

GET /api/analytics/interview-consistency
    Per-interviewer candidate score statistics, bias incident aggregation,
    and time-series trends for the Consistency dashboard page.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Query

from database import get_db
from dependencies import get_current_comp_id

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_VARIANCE_THRESHOLD = 1.5


@router.get("/interview-consistency")
async def interview_consistency(
    job_id: Optional[str] = Query(default=None),
    days: int = Query(default=90, ge=0),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Return per-interviewer consistency metrics.

    - job_id: optional – restrict to a single job (must belong to company)
    - days:   how far back to look; 0 = all time
    """
    db = get_db()

    # Resolve the company's job ids (interviews store job_id, not comp_id).
    company_job_ids: list[str] = [
        str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})
    ]
    if not company_job_ids:
        return _empty()

    if job_id and job_id not in company_job_ids:
        return _empty()

    # Build the interview query.
    q: dict = {
        "job_id": job_id if job_id else {"$in": company_job_ids},
        "intv_status": "completed",
    }
    if days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        q["intv_date_time"] = {"$gte": cutoff}

    interviews = [doc async for doc in db.interviews.find(q)]
    if not interviews:
        return _empty()

    intv_ids = [str(i["_id"]) for i in interviews]

    # interview_users: intv_id (str) → [user_id (str)]
    intv_users: dict[str, list[str]] = defaultdict(list)
    async for lnk in db.interview_users.find({"intv_id": {"$in": intv_ids}}):
        iid = str(lnk.get("intv_id", ""))
        uid = str(lnk.get("user_id", ""))
        if iid and uid:
            intv_users[iid].append(uid)

    # Resolve user display names.
    all_uids = {uid for uids in intv_users.values() for uid in uids}
    oids = [ObjectId(u) for u in all_uids if ObjectId.is_valid(u)]
    user_name: dict[str, str] = {}
    async for u in db.users.find({"_id": {"$in": oids}}):
        user_name[str(u["_id"])] = u.get("full_name") or u.get("username") or "Unknown"

    # job_candidates ratings: keyed by (cand_id, job_id).
    pairs = list(
        {(str(i.get("cand_id", "")), str(i.get("job_id", ""))) for i in interviews}
    )
    jc_map: dict[tuple[str, str], dict] = {}
    for cand_id, jid in pairs:
        if not cand_id or not jid:
            continue
        doc = await db.job_candidates.find_one(
            {"cand_id": cand_id, "job_id": jid},
            {"ratings": 1, "status": 1},
        )
        if doc:
            jc_map[(cand_id, jid)] = {
                "ratings": doc.get("ratings") or {},
                "status": doc.get("status"),
            }

    # Aggregate per-interviewer data and team-wide scored rows.
    per_intv: dict[str, dict] = {}
    team_rows: list[dict] = []

    for intv in interviews:
        iid = str(intv["_id"])
        cid = str(intv.get("cand_id", ""))
        jid = str(intv.get("job_id", ""))
        dt = intv.get("intv_date_time")
        bias = [b for b in (intv.get("intv_bias_incidents") or []) if b]

        jc = jc_map.get((cid, jid), {})
        ratings = jc.get("ratings") or {}
        status = jc.get("status")

        tech = _score(ratings, "technical_skills")
        comm = _score(ratings, "communication")
        prob = _score(ratings, "problem_solving")

        if tech is None and comm is None and prob is None:
            continue

        month = dt.strftime("%Y-%m") if dt else "unknown"
        is_hired = status == "HIRED"
        row = {
            "tech": tech,
            "comm": comm,
            "prob": prob,
            "month": month,
            "is_hired": is_hired,
        }

        team_rows.append(row)

        for uid in intv_users.get(iid, []):
            if uid not in per_intv:
                per_intv[uid] = {
                    "user_id": uid,
                    "name": user_name.get(uid, "Unknown"),
                    "points": [],
                    "bias": [],
                }
            per_intv[uid]["points"].append(row)
            per_intv[uid]["bias"].extend(bias)

    if not team_rows:
        return _empty()

    # Build per-interviewer stats.
    interviewers = [
        _interviewer_stats(uid, d["name"], d["points"], d["bias"])
        for uid, d in per_intv.items()
        if d["points"]
    ]

    # Team-wide KPIs.
    overalls = [
        r["overall"]["avg"] for r in interviewers if r["overall"]["avg"] is not None
    ]
    avg_overall = round(sum(overalls) / len(overalls), 1) if overalls else 0.0
    score_variance = _stddev(overalls) if len(overalls) > 1 else 0.0
    total_bias = sum(r["bias_incident_count"] for r in interviewers)

    # Team time series (all scored interviews, interviewer-agnostic).
    team_monthly: dict[str, list[dict]] = defaultdict(list)
    for row in team_rows:
        if row["month"] != "unknown":
            team_monthly[row["month"]].append(row)

    return {
        "kpis": {
            "avg_overall_score": avg_overall,
            "score_variance": score_variance,
            "evaluated_count": len(team_rows),
            "bias_flag_count": total_bias,
        },
        "interviewers": interviewers,
        "team_series": {
            cat: _monthly_series(team_monthly, cat)
            for cat in ("all", "technical", "communication", "problem_solving")
        },
    }


# ── Stat helpers ──────────────────────────────────────────────────────────────


def _score(ratings: dict, key: str) -> float | None:
    entry = ratings.get(key)
    if not entry:
        return None
    try:
        return float(entry.get("score"))
    except (TypeError, ValueError):
        return None


def _avg(vals: list[float]) -> float | None:
    return round(sum(vals) / len(vals), 1) if vals else None


def _stddev(vals: list[float]) -> float:
    if not vals:
        return 0.0
    mean = sum(vals) / len(vals)
    return round(math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals)), 1)


def _skill_stat(pts: list[dict], field: str) -> dict:
    vals = [p[field] for p in pts if p.get(field) is not None]
    return {"avg": _avg(vals), "variance": _stddev(vals)}


def _monthly_series(monthly: dict[str, list[dict]], cat: str) -> list[dict]:
    """Average scores per month. cat='all' averages the three sub-scores."""
    out = []
    for month in sorted(monthly):
        pts = monthly[month]
        if cat == "all":
            vals = []
            for p in pts:
                sub = [v for v in [p["tech"], p["comm"], p["prob"]] if v is not None]
                if sub:
                    vals.append(sum(sub) / len(sub))
        else:
            field = {
                "technical": "tech",
                "communication": "comm",
                "problem_solving": "prob",
            }[cat]
            vals = [p[field] for p in pts if p.get(field) is not None]
        if vals:
            out.append({"month": month, "value": round(sum(vals) / len(vals), 1)})
    return out


def _interviewer_stats(uid: str, name: str, pts: list[dict], bias: list) -> dict:
    tech_stat = _skill_stat(pts, "tech")
    comm_stat = _skill_stat(pts, "comm")
    prob_stat = _skill_stat(pts, "prob")

    overall_vals = []
    for p in pts:
        sub = [v for v in [p["tech"], p["comm"], p["prob"]] if v is not None]
        if sub:
            overall_vals.append(sum(sub) / len(sub))
    overall_stat = {"avg": _avg(overall_vals), "variance": _stddev(overall_vals)}

    stds = [
        s
        for s in [
            tech_stat["variance"],
            comm_stat["variance"],
            prob_stat["variance"],
            overall_stat["variance"],
        ]
        if s is not None
    ]
    high_variance = bool(stds and max(stds) > _VARIANCE_THRESHOLD)

    hire_count = sum(1 for p in pts if p.get("is_hired"))

    monthly: dict[str, list[dict]] = defaultdict(list)
    for p in pts:
        if p["month"] != "unknown":
            monthly[p["month"]].append(p)

    return {
        "user_id": uid,
        "name": name,
        "interview_count": len(pts),
        "hire_rate": round(hire_count / len(pts), 2),
        "overall": overall_stat,
        "technical": tech_stat,
        "communication": comm_stat,
        "problem_solving": prob_stat,
        "high_variance": high_variance,
        "bias_incidents": bias,
        "bias_incident_count": len(bias),
        "series": {
            cat: _monthly_series(monthly, cat)
            for cat in ("all", "technical", "communication", "problem_solving")
        },
    }


def _empty() -> dict:
    return {
        "kpis": {
            "avg_overall_score": 0,
            "score_variance": 0,
            "evaluated_count": 0,
            "bias_flag_count": 0,
        },
        "interviewers": [],
        "team_series": {
            "all": [],
            "technical": [],
            "communication": [],
            "problem_solving": [],
        },
    }

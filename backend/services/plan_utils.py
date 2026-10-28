"""Pure helpers for timed interview plans: how big each section may be, making
the minutes add up, and the JSON schema the plan call must return."""

import math


def plan_budget(total_minutes: int) -> dict:
    """Section sizing for a timed plan, scaled to the interview length.

    The intro is ~10% of the time (2-5 min) and there are always at least two
    sections after it, so a short interview isn't half introduction.
    """
    intro = max(2, min(5, round(total_minutes * 0.1)))
    remaining = total_minutes - intro
    per_min = max(2, min(5, remaining // 6))
    # Long interviews need longer sections to fit in at most 5 after the intro.
    per_max = min(remaining - per_min, max(20, math.ceil(remaining / 5)))
    min_other = max(2, math.ceil(remaining / per_max))
    max_other = max(min_other, min(5, remaining // per_min))
    return {
        "intro": intro,
        "per_min": per_min,
        "per_max": per_max,
        "min_other": min_other,
        "max_other": max_other,
    }


def fit_plan_to_total(
    sections: list[dict], intro_minutes: int, total_minutes: int
) -> None:
    """Pin the intro length and make the minutes sum to the requested total.

    The model usually gets both right; when it doesn't, the difference goes to
    the longest non-intro section so the plan still adds up.
    """
    if not sections:
        return
    if sections[0]["name"].lower() == "introduction":
        sections[0]["suggested_minutes"] = intro_minutes
    others = sections[1:]
    if not others:
        return
    diff = total_minutes - sum(s["suggested_minutes"] for s in sections)
    longest = max(others, key=lambda s: s["suggested_minutes"])
    longest["suggested_minutes"] = max(1, longest["suggested_minutes"] + diff)


PLAN_SCHEMA = {
    "name": "interview_plan",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "suggested_minutes": {"type": "integer"},
                    },
                    "required": ["name", "description", "suggested_minutes"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["sections"],
        "additionalProperties": False,
    },
}

from models.interview import InterviewOut, InterviewUpdate


def test_interview_update_accepts_completion_state_and_duration():
    payload = InterviewUpdate(
        intv_status="completed",
        intv_duration_seconds=145,
    )

    assert payload.intv_status == "completed"
    assert payload.intv_duration_seconds == 145


def test_interview_output_allows_null_datetime():
    payload = InterviewOut(
        intv_id="64c0f0d7f111111111111111",
        cand_id="64c0f0d7f111111111111112",
        job_id="64c0f0d7f111111111111113",
        intv_date_time=None,
        intv_status="scheduled",
        intv_created_at=None,
        intv_updated_at=None,
    )

    assert payload.intv_date_time is None
    assert payload.intv_status == "scheduled"

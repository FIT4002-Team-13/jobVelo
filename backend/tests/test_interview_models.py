from models.interview import InterviewUpdate


def test_interview_update_accepts_completion_state_and_duration():
    payload = InterviewUpdate(
        intv_status="completed",
        intv_duration_seconds=145,
    )

    assert payload.intv_status == "completed"
    assert payload.intv_duration_seconds == 145

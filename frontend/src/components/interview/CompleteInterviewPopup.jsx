const SCORE_COLORS = {
  technical_skills: "bg-coral-400",
  communication: "bg-sky-400",
  problem_solving: "bg-mint-400",
};

function ScoreBar({ ratingKey, rating }) {
  const score = Number(rating?.score ?? 0);
  const width = `${Math.min(Math.max(score * 10, 0), 100)}%`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">
          {rating?.skill}
        </span>

        <span className="text-sm font-semibold text-neutral-700">
          {score.toFixed(1)}/10.0
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full rounded-full ${ SCORE_COLORS[ratingKey]}`} style={{ width }}/>
      </div>
    </div>
  );
}

export default function CompleteInterviewPopup({candidateName, jobTitle, evaluation, onDone}) {
    if (!evaluation) { 
        return null;
  }

    const ratings = evaluation.ratings;
    const ratingScores = [ratings.technical_skills?.score, ratings.communication?.score, ratings.problem_solving?.score].filter((score) => typeof score === "number" && Number.isFinite(score));
    const overallScore = ratingScores.length > 0 ? ratingScores.reduce((total, score) => total + score, 0) / ratingScores.length : 0;
    const circlePercentage = Math.min(Math.max(overallScore * 10, 0), 100);

    return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 p-6" role="dialog" aria-modal="true" aria-labelledby="completion-title">
      <div className="w-full max-w-3xl rounded-[32px] bg-neutral-0 px-12 py-10 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-100 text-5xl font-medium text-primary-600">
            {candidateName?.trim()?.charAt(0)?.toUpperCase() || "C"}
          </div>

          <h2 id="completion-title" className="mt-4 text-4xl font-semibold text-neutral-900">
            {candidateName || "Candidate"}
          </h2>

          <p className="mt-1 text-lg text-neutral-500">
            {jobTitle || "Position"}
          </p>
        </div>

        <section className="mt-7 rounded-2xl border border-neutral-200 bg-neutral-0 p-7 shadow-md">
          <h3 className="mb-5 text-lg font-bold text-neutral-400">
            Result
          </h3>

          <div className="grid items-center gap-10 md:grid-cols-[220px_1fr]">
            <div className="flex flex-col items-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(
                    #6f8fe7 ${circlePercentage}%,
                    #e5e7eb ${circlePercentage}%
                  )`,
                }}
              >
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-neutral-0">
                  <span className="text-3xl font-bold text-neutral-900">
                    {overallScore.toFixed(1)}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-base text-neutral-700">
                Overall
              </p>
            </div>

            <div className="flex flex-col gap-6">
              <ScoreBar ratingKey="communication" rating={ratings.communication}/>

              <ScoreBar ratingKey="technical_skills" rating={ratings.technical_skills}/>

              <ScoreBar ratingKey="problem_solving" rating={ratings.problem_solving}/>
            </div>
          </div>
        </section>

        <div className="mt-8 flex justify-center">
            <button type="button" onClick={onDone} className="w-full max-w-sm rounded-full bg-mint-400 py-3 text-lg font-bold text-white transition-colors hover:bg-mint-500">
                Done
            </button>
        </div>
      </div>
    </div>
  );
}
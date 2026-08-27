# FIT4002-Jobvelo

Jobvelo: Real-Time Interview Intelligence System

## Stack
- **Frontend** — React 18 + Vite + Tailwind CSS, React Router, design-token driven
- **Backend** — FastAPI + Motor (async MongoDB driver)
- **Database** — MongoDB
- **Realtime STT** — Deepgram (interview transcription)
- **LLMs** — OpenAI (realtime question gen / summary / score) + Gemini (CV analysis)

## Project structure
```
.
├── backend/          # FastAPI + MongoDB
│   ├── services/     # Deepgram / OpenAI / Gemini wrappers (ready to use)
│   ├── routes/       # ← add API routes here
│   ├── models/       # ← add Pydantic models here
│   ├── config.py     # env-driven settings
│   ├── database.py   # Mongo lifespan + ensure_indexes()
│   └── main.py       # FastAPI app entrypoint
└── frontend/         # React + Vite + Tailwind
    ├── src/
    │   ├── styles/   # design tokens (colors, typography, spacing)
    │   ├── pages/    # ← add pages here
    │   ├── components/ # ← add components here
    │   └── lib/      # ← add API clients / hooks here
    ├── public/       # static assets (e.g. AudioWorklet processors)
    └── tailwind.config.js   # consumes ./src/styles/* — single source of truth
```

## Frontend setup
```bash
cd frontend
npm install
npm run dev
```
Opens at http://localhost:5173.

### Design tokens
Centralised in `frontend/src/styles/`:
- `colors.js` — brand palette (primary / sky / mint / coral / neutral + semantic)
- `typography.js` — font families, sizes, weights, semantic role tokens
- `spacing.js` — spacing scale, radii, shadows

These feed `tailwind.config.js`, so every utility class (`bg-primary-500`, `text-lg`, `p-6`, `rounded-2xl`) is driven from one source. **Change a token, every consumer updates.** Don't hardcode hex/px values in components.

## Backend setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate     # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cp .env.example .env         # fill in MONGODB_URI + API keys
uvicorn main:app --reload
```
API at http://localhost:8000 — docs at http://localhost:8000/docs.

## Environment variables
See [`backend/.env.example`](backend/.env.example). Required for full functionality:
- `MONGODB_URI`, `MONGODB_DB`
- `DEEPGRAM_API_KEY` (realtime transcription)
- `OPENAI_API_KEY` (question generation, summary, scoring)
- `GEMINI_API_KEY` (CV analysis)

The app boots without the API keys — the relevant services raise a clear error only when called.

## Where to start coding
- **A new API endpoint** → `backend/routes/your_feature.py`, then `app.include_router(your_feature.router)` in `backend/main.py`.
- **A new page** → `frontend/src/pages/YourPage.jsx`, then add a `<Route>` in `frontend/src/App.jsx`.
- **Calling Deepgram / OpenAI / Gemini** → import from `backend/services/`. Don't call the SDKs directly from routes — keep service boundaries clean.

## Development after Setup
```bash
cd backend
. .venv/Scripts/activate     # Windows
# source .venv/bin/activate  # macOS/Linux
uvicorn main:app --reload
```
```bash
cd frontend
npm run dev
```

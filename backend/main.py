from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import (
    close_mongo_connection,
    connect_to_mongo,
    ensure_indexes,
    seed_mock_data,
)
from routes import auth, cand, dashboard, files, invitations, job_cand, jobs, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await ensure_indexes()
    await seed_mock_data()
    yield
    await close_mongo_connection()


app = FastAPI(
    title="Smart Recruit API",
    version="0.1.0",
    description="Real-Time Interview Intelligence System",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Add routers here as features land:
# from routes import auth, interview, cv
# app.include_router(auth.router)
app.include_router(auth.router)
app.include_router(invitations.router)
app.include_router(files.router)
app.include_router(dashboard.router)
app.include_router(jobs.router)
app.include_router(cand.router)
app.include_router(job_cand.router)
app.include_router(users.router)
app.include_router(interv.router)
app.include_router(user_interv.router)
app.include_router(applications.router)
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
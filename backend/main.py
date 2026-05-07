from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import close_mongo_connection, connect_to_mongo, ensure_indexes


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await ensure_indexes()
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
# app.include_router(interview.router)
# app.include_router(cv.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

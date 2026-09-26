from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, members, organizations
from app.core.config import get_settings
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="Organization Users API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(auth.router)
    app.include_router(organizations.router)
    app.include_router(members.router)

    @app.get("/health", tags=["system"])
    def health():
        return {"status": "ok"}

    return app


app = create_app()

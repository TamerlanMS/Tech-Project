from typing import Annotated
from uuid import UUID

from fastapi import Depends, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import Unauthorized
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.services.access import OrgContext, load_org_context

DB = Annotated[Session, Depends(get_db)]
bearer = HTTPBearer(auto_error=False)


def get_current_user(
    db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    if creds is None:
        raise Unauthorized("Требуется авторизация")
    user_id = decode_access_token(creds.credentials)
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        raise Unauthorized("Недействительный токен")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_org_context(
    db: DB, user: CurrentUser, organization_id: Annotated[UUID, Path()]
) -> OrgContext:
    return load_org_context(db, user, organization_id)


def require_permission(permission: str):
    """Dependency-фабрика: tenant-контекст + проверка права.

    Использование: `ctx: OrgContext = Depends(require_permission("users.manage"))`.
    Проверка декларативна и видна прямо в сигнатуре эндпоинта.
    """

    def _dep(ctx: Annotated[OrgContext, Depends(get_org_context)]) -> OrgContext:
        ctx.require(permission)
        return ctx

    return _dep


OrgCtx = Annotated[OrgContext, Depends(get_org_context)]

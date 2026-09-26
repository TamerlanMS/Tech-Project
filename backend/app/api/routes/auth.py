from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.api.deps import DB, CurrentUser
from app.core.errors import Unauthorized
from app.core.security import create_access_token, verify_password
from app.models import Membership, MembershipStatus, User
from app.schemas import LoginIn, MyOrganizationOut, RoleBrief, TokenOut, UserBrief
from app.services.access import effective_permissions

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=TokenOut)
def login(data: LoginIn, db: DB):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    # одинаковое сообщение для «нет пользователя» и «неверный пароль» — не раскрываем наличие email
    if user is None or not user.is_active or not verify_password(data.password, user.password_hash):
        raise Unauthorized("Неверный email или пароль", code="invalid_credentials")
    return TokenOut(access_token=create_access_token(user.id), user=UserBrief.model_validate(user))


@router.get("/auth/me", response_model=UserBrief)
def me(user: CurrentUser):
    return user


@router.get("/me/organizations", response_model=list[MyOrganizationOut])
def my_organizations(user: CurrentUser, db: DB):
    """Только организации, в которых пользователь состоит (и где доступ активен)."""
    memberships = db.scalars(
        select(Membership)
        .options(joinedload(Membership.organization), joinedload(Membership.role))
        .where(Membership.user_id == user.id, Membership.status == MembershipStatus.active.value)
    ).all()
    result = [
        MyOrganizationOut(
            id=m.organization.id,
            name=m.organization.name,
            slug=m.organization.slug,
            role=RoleBrief.model_validate(m.role),
            permissions=sorted(effective_permissions(db, m.organization_id, m.role_id)),
        )
        for m in memberships
    ]
    return sorted(result, key=lambda o: o.name.lower())

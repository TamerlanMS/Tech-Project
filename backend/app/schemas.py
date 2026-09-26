import enum
import math
from datetime import datetime
from typing import Annotated, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.models import MembershipStatus

T = TypeVar("T")

Str200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
OptStr150 = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=150)]
Phone = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=32, pattern=r"^\+?[0-9 ()\-]{5,32}$")]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ auth


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserBrief(ORM):
    id: UUID
    email: str
    full_name: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserBrief


# ------------------------------------------------------------------ organizations


class RoleBrief(ORM):
    id: UUID
    key: str
    name: str
    level: int


class RoleOut(RoleBrief):
    is_system: bool
    permissions: list[str]
    assignable: bool = Field(description="Может ли текущий пользователь назначить эту роль")


class BranchBrief(ORM):
    id: UUID
    name: str


class BranchOut(BranchBrief):
    address: str | None
    members_count: int


class MyOrganizationOut(BaseModel):
    id: UUID
    name: str
    slug: str
    role: RoleBrief
    permissions: list[str]


class OrganizationOut(MyOrganizationOut):
    modules: list[str]


# ------------------------------------------------------------------ members


class MemberSortField(str, enum.Enum):
    full_name = "full_name"
    email = "email"
    role = "role"
    status = "status"
    joined_at = "joined_at"


class SortOrder(str, enum.Enum):
    asc = "asc"
    desc = "desc"


class MemberOut(BaseModel):
    user_id: UUID
    email: str
    full_name: str
    phone: str | None
    position: str | None
    status: MembershipStatus
    role: RoleBrief
    branches: list[BranchBrief]
    joined_at: datetime
    updated_at: datetime
    account_activated: bool
    can_manage: bool = Field(description="Может ли текущий пользователь изменять/удалять этого участника")


class MemberDetailOut(MemberOut):
    permissions: list[str]
    invited_by: UserBrief | None


class MemberCreateIn(BaseModel):
    email: EmailStr
    full_name: Str200 | None = Field(
        default=None, description="Обязательно, если аккаунта с таким email ещё нет"
    )
    phone: Phone = None
    position: OptStr150 = None
    role_id: UUID
    branch_ids: list[UUID] = Field(default_factory=list, max_length=50)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class MemberUpdateIn(BaseModel):
    """PATCH: передаются только изменяемые поля."""

    role_id: UUID | None = None
    branch_ids: list[UUID] | None = Field(default=None, max_length=50)
    status: MembershipStatus | None = None
    position: OptStr150 = None

    model_config = ConfigDict(extra="forbid")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> "Page[T]":
        return cls(items=items, total=total, page=page, page_size=page_size,
                   pages=math.ceil(total / page_size) if total else 0)


class MemberPage(Page[MemberOut]):
    status_counts: dict[MembershipStatus, int] = Field(
        description="Количество по статусам с учётом остальных фильтров (для вкладок)"
    )

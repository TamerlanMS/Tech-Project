"""Модель данных.

Ключевая идея multi-tenancy: User — глобальная сущность (один аккаунт на человека),
а всё, что зависит от организации (роль, филиалы, статус), живёт в Membership.

Целостность между тенантами обеспечивается на уровне БД составными внешними ключами:
  memberships(role_id, organization_id)          -> roles(id, organization_id)
  member_branches(branch_id, organization_id)     -> branches(id, organization_id)
  member_branches(membership_id, organization_id) -> memberships(id, organization_id)
Т.е. даже при ошибке в коде БД не позволит назначить участнику роль или филиал
из другой организации.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class MembershipStatus(str, enum.Enum):
    active = "active"        # работает в организации
    invited = "invited"      # добавлен, но ещё не активировал аккаунт
    suspended = "suspended"  # временно заблокирован в этой организации


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # email храним нормализованным (lower) — уникальность без учёта регистра
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        # поиск по подстроке (ILIKE '%q%') — trigram GIN-индексы (расширение pg_trgm)
        Index("ix_users_full_name_trgm", "full_name", postgresql_using="gin",
              postgresql_ops={"full_name": "gin_trgm_ops"}),
        Index("ix_users_email_trgm", "email", postgresql_using="gin",
              postgresql_ops={"email": "gin_trgm_ops"}),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    # NULL — пользователь приглашён, но пароль ещё не установлен
    password_hash: Mapped[str | None] = mapped_column(String(255))
    # глобальная блокировка аккаунта (на всей платформе)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="user", foreign_keys="Membership.user_id"
    )


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # passive_deletes: удаление дочерних строк делегируем ON DELETE CASCADE в БД
    branches: Mapped[list["Branch"]] = relationship(back_populates="organization", passive_deletes=True)
    roles: Mapped[list["Role"]] = relationship(back_populates="organization", passive_deletes=True)


# ---------------------------------------------------------------- modules & RBAC


class Module(Base):
    """Бизнес-модуль платформы (CRM, склад, ...). Справочник уровня платформы."""

    __tablename__ = "modules"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # core-модули включены всегда и не могут быть отключены организацией
    is_core: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))


class OrganizationModule(Base):
    """Какие модули подключила организация."""

    __tablename__ = "organization_modules"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    module_code: Mapped[str] = mapped_column(
        ForeignKey("modules.code", ondelete="RESTRICT"), primary_key=True
    )
    enabled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Permission(Base):
    """Атомарное право, код вида `<module>.<action>` (users.read, users.manage, ...).

    Permissions задаются кодом (они привязаны к реализованным эндпоинтам),
    а роли — данными: организация может собрать свою роль из permissions.
    """

    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    module_code: Mapped[str] = mapped_column(
        ForeignKey("modules.code", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)


class Role(TimestampMixin, Base):
    """Роль принадлежит конкретной организации (а не глобальна).

    `level` — иерархия ролей: участник может управлять только теми, у кого level
    строго ниже, и назначать только роли ниже своей (кроме владельца).
    Это защищает от эскалации привилегий (admin не может сделать себя/другого owner).
    """

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("organization_id", "key"),
        # цель для составных FK из memberships — гарантия «роль из той же организации»
        UniqueConstraint("id", "organization_id"),
        CheckConstraint("level BETWEEN 0 AND 100", name="level_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    organization: Mapped[Organization] = relationship(back_populates="roles")
    permissions: Mapped[list[Permission]] = relationship(secondary="role_permissions", lazy="selectin")


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_code: Mapped[str] = mapped_column(
        ForeignKey("permissions.code", ondelete="RESTRICT"), primary_key=True
    )


# ---------------------------------------------------------------- branches & members


class Branch(TimestampMixin, Base):
    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("id", "organization_id"),
        Index("uq_branches_org_lower_name", "organization_id", func.lower(text("name")), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))

    organization: Mapped[Organization] = relationship(back_populates="branches")


class Membership(TimestampMixin, Base):
    """Связь User <-> Organization. Здесь живёт роль пользователя в организации."""

    __tablename__ = "memberships"
    __table_args__ = (
        # пользователь состоит в организации не более одного раза
        UniqueConstraint("organization_id", "user_id"),
        UniqueConstraint("id", "organization_id"),
        # роль обязана принадлежать той же организации.
        # NO ACTION (а не RESTRICT): удаление используемой роли запрещено,
        # но каскадное удаление всей организации проходит (проверка в конце statement).
        ForeignKeyConstraint(
            ["role_id", "organization_id"],
            ["roles.id", "roles.organization_id"],
            name="fk_memberships_role_same_org",
        ),
        CheckConstraint(
            "status IN ('active', 'invited', 'suspended')", name="status_valid"
        ),
        Index("ix_memberships_org_status", "organization_id", "status"),
        Index("ix_memberships_org_role", "organization_id", "role_id"),
        # «в каких организациях состоит пользователь» — запрос при каждом входе
        Index("ix_memberships_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    # RESTRICT: глобальный аккаунт нельзя физически удалить, пока он где-то состоит
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    role_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=MembershipStatus.active.value
    )
    position: Mapped[str | None] = mapped_column(String(150))
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    user: Mapped[User] = relationship(back_populates="memberships", foreign_keys=[user_id])
    organization: Mapped[Organization] = relationship()
    role: Mapped[Role] = relationship(
        primaryjoin="and_(Membership.role_id == Role.id, Membership.organization_id == Role.organization_id)",
        foreign_keys=[role_id, organization_id],
        viewonly=True,
    )
    branches: Mapped[list[Branch]] = relationship(
        secondary="member_branches",
        primaryjoin="Membership.id == MemberBranch.membership_id",
        secondaryjoin="Branch.id == MemberBranch.branch_id",
        viewonly=True,
        order_by="Branch.name",
    )


class MemberBranch(Base):
    """Связь User <-> Branch, но через членство: филиал всегда в рамках организации."""

    __tablename__ = "member_branches"
    __table_args__ = (
        ForeignKeyConstraint(
            ["membership_id", "organization_id"],
            ["memberships.id", "memberships.organization_id"],
            ondelete="CASCADE",
            name="fk_member_branches_membership_same_org",
        ),
        ForeignKeyConstraint(
            ["branch_id", "organization_id"],
            ["branches.id", "branches.organization_id"],
            ondelete="CASCADE",
            name="fk_member_branches_branch_same_org",
        ),
        # фильтр «пользователи филиала X»
        Index("ix_member_branches_org_branch", "organization_id", "branch_id"),
    )

    membership_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(nullable=False)

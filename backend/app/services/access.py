"""Проверка доступа в контексте организации (tenant).

Слои защиты:
1. Аутентификация — JWT → глобальный User (deps.get_current_user).
2. Tenant-контекст — для любого /organizations/{id}/... загружается членство текущего
   пользователя в ЭТОЙ организации. Нет членства → 404 (не 403), чтобы не раскрывать
   сам факт существования чужой организации.
3. Permission — у роли в этой организации должно быть право, и модуль права должен
   быть подключён организацией.
4. Иерархия ролей (level) — кем можно управлять и какие роли можно выдавать.
5. Все запросы к данным дополнительно фильтруются по organization_id из контекста,
   а составные FK в БД не дают связать сущности разных организаций.
"""
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import Forbidden, NotFound
from app.models import Membership, MembershipStatus, Module, OrganizationModule, Permission, Role, RolePermission, User
from app.permissions import OWNER_ROLE_KEY


@dataclass(frozen=True)
class OrgContext:
    user: User
    membership: Membership
    role: Role
    permissions: frozenset[str]

    @property
    def organization_id(self) -> UUID:
        return self.membership.organization_id

    @property
    def is_owner(self) -> bool:
        return self.role.key == OWNER_ROLE_KEY

    def has(self, permission: str) -> bool:
        return permission in self.permissions

    def require(self, permission: str) -> None:
        if not self.has(permission):
            raise Forbidden("Недостаточно прав для этого действия",
                            code="permission_denied", details={"required": permission})

    # --- иерархия ролей

    def can_manage_role_level(self, target_level: int) -> bool:
        """Можно ли управлять участником с ролью данного уровня."""
        return self.is_owner or target_level < self.role.level

    def can_assign(self, role: Role) -> bool:
        """Можно ли выдать роль. Owner может всё, остальные — только ниже своей."""
        return self.is_owner or role.level < self.role.level


def effective_permissions(db: Session, organization_id: UUID, role_id: UUID) -> frozenset[str]:
    """Права роли, ограниченные подключёнными модулями организации."""
    enabled_modules = select(OrganizationModule.module_code).where(
        OrganizationModule.organization_id == organization_id
    )
    stmt = (
        select(RolePermission.permission_code)
        .join(Permission, Permission.code == RolePermission.permission_code)
        .join(Module, Module.code == Permission.module_code)
        .where(RolePermission.role_id == role_id)
        .where(or_(Module.is_core.is_(True), Permission.module_code.in_(enabled_modules)))
    )
    return frozenset(db.scalars(stmt))


def load_org_context(db: Session, user: User, organization_id: UUID) -> OrgContext:
    membership = db.scalar(
        select(Membership)
        .options(joinedload(Membership.role))
        .where(Membership.organization_id == organization_id, Membership.user_id == user.id)
    )
    if membership is None:
        raise NotFound("Организация не найдена", code="organization_not_found")
    if membership.status != MembershipStatus.active.value:
        raise Forbidden("Ваш доступ к организации приостановлен", code="membership_inactive")
    perms = effective_permissions(db, organization_id, membership.role_id)
    return OrgContext(user=user, membership=membership, role=membership.role, permissions=perms)

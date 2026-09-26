"""Бизнес-логика модуля «Пользователи организации».

Сервис не знает про HTTP: получает OrgContext (уже проверенный tenant) и данные,
выбрасывает доменные ошибки из app.core.errors. Все выборки ограничены
ctx.organization_id — данных другой организации сервис не видит в принципе.
"""
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, exists, func, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import BusinessRuleViolation, Conflict, Forbidden, NotFound
from app.models import Branch, MemberBranch, Membership, MembershipStatus, Role, User
from app.permissions import OWNER_ROLE_KEY
from app.schemas import (
    BranchBrief,
    MemberCreateIn,
    MemberDetailOut,
    MemberOut,
    MemberSortField,
    MemberUpdateIn,
    RoleBrief,
    SortOrder,
    UserBrief,
)
from app.services.access import OrgContext, effective_permissions


@dataclass
class MemberFilters:
    search: str | None = None
    role_ids: list[UUID] | None = None
    branch_ids: list[UUID] | None = None
    statuses: list[MembershipStatus] | None = None
    sort_by: MemberSortField = MemberSortField.full_name
    sort_order: SortOrder = SortOrder.asc
    page: int = 1
    page_size: int = 20


SORT_COLUMNS = {
    MemberSortField.full_name: func.lower(User.full_name),
    MemberSortField.email: User.email,
    MemberSortField.role: Role.level,
    MemberSortField.status: Membership.status,
    MemberSortField.joined_at: Membership.created_at,
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ------------------------------------------------------------------ serialization


def to_member_out(ctx: OrgContext, m: Membership) -> MemberOut:
    return MemberOut(
        user_id=m.user_id,
        email=m.user.email,
        full_name=m.user.full_name,
        phone=m.user.phone,
        position=m.position,
        status=MembershipStatus(m.status),
        role=RoleBrief.model_validate(m.role),
        branches=[BranchBrief.model_validate(b) for b in m.branches],
        joined_at=m.created_at,
        updated_at=m.updated_at,
        account_activated=m.user.password_hash is not None,
        can_manage=_can_manage(ctx, m),
    )


def _can_manage(ctx: OrgContext, target: Membership) -> bool:
    if target.user_id == ctx.user.id:
        return False  # своё членство через этот модуль не меняем (защита от само-блокировки)
    return ctx.has("users.manage") and ctx.can_manage_role_level(target.role.level)


# ------------------------------------------------------------------ queries


def _base_query(ctx: OrgContext):
    return (
        select(Membership)
        .join(User, User.id == Membership.user_id)
        .join(Role, (Role.id == Membership.role_id) & (Role.organization_id == Membership.organization_id))
        .where(Membership.organization_id == ctx.organization_id)
    )


def _load_options():
    return (
        joinedload(Membership.user),
        joinedload(Membership.role),
        selectinload(Membership.branches),
    )


def list_members(db: Session, ctx: OrgContext, f: MemberFilters) -> tuple[list[MemberOut], int]:
    stmt = _base_query(ctx)

    if f.search:
        pattern = f"%{_escape_like(f.search.strip())}%"
        stmt = stmt.where(
            User.full_name.ilike(pattern, escape="\\")
            | User.email.ilike(pattern, escape="\\")
            | Membership.position.ilike(pattern, escape="\\")
        )
    if f.role_ids:
        stmt = stmt.where(Membership.role_id.in_(f.role_ids))
    if f.statuses:
        stmt = stmt.where(Membership.status.in_([s.value for s in f.statuses]))
    if f.branch_ids:
        stmt = stmt.where(
            exists().where(
                MemberBranch.membership_id == Membership.id,
                MemberBranch.organization_id == ctx.organization_id,
                MemberBranch.branch_id.in_(f.branch_ids),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0

    col = SORT_COLUMNS[f.sort_by]
    order = col.asc() if f.sort_order == SortOrder.asc else col.desc()
    # Membership.id — tie-breaker: стабильный порядок между страницами при равных значениях
    stmt = (
        stmt.options(*_load_options())
        .order_by(order.nulls_last(), Membership.id)
        .limit(f.page_size)
        .offset((f.page - 1) * f.page_size)
    )
    items = [to_member_out(ctx, m) for m in db.scalars(stmt).unique()]
    return items, total


def _get_membership(db: Session, ctx: OrgContext, user_id: UUID, *, for_update: bool = False) -> Membership:
    stmt = _base_query(ctx).where(Membership.user_id == user_id).options(*_load_options())
    if for_update:
        stmt = stmt.with_for_update(of=Membership)
    m = db.scalars(stmt).unique().one_or_none()
    if m is None:
        raise NotFound("Пользователь не найден в этой организации", code="member_not_found")
    return m


def get_member(db: Session, ctx: OrgContext, user_id: UUID) -> MemberDetailOut:
    m = _get_membership(db, ctx, user_id)
    inviter = db.get(User, m.invited_by_id) if m.invited_by_id else None
    base = to_member_out(ctx, m)
    return MemberDetailOut(
        **base.model_dump(),
        permissions=sorted(effective_permissions(db, ctx.organization_id, m.role_id)),
        # данные о других организациях пользователя намеренно НЕ отдаются
        invited_by=UserBrief.model_validate(inviter) if inviter else None,
    )


# ------------------------------------------------------------------ validation helpers


def _get_role(db: Session, ctx: OrgContext, role_id: UUID) -> Role:
    role = db.scalar(select(Role).where(Role.id == role_id, Role.organization_id == ctx.organization_id))
    if role is None:
        raise BusinessRuleViolation("Роль не найдена в этой организации", code="role_not_found",
                                    details={"field": "role_id"})
    return role


def _assert_can_assign(ctx: OrgContext, role: Role) -> None:
    if not ctx.can_assign(role):
        raise Forbidden("Нельзя назначить роль равную или выше вашей", code="role_assignment_forbidden",
                        details={"role": role.key})


def _validate_branches(db: Session, ctx: OrgContext, branch_ids: list[UUID]) -> list[UUID]:
    unique_ids = list(dict.fromkeys(branch_ids))
    if not unique_ids:
        return []
    found = set(db.scalars(
        select(Branch.id).where(Branch.organization_id == ctx.organization_id, Branch.id.in_(unique_ids))
    ))
    missing = [str(b) for b in unique_ids if b not in found]
    if missing:
        raise BusinessRuleViolation("Филиал не найден в этой организации", code="branch_not_found",
                                    details={"field": "branch_ids", "ids": missing})
    return unique_ids


def _set_branches(db: Session, ctx: OrgContext, membership: Membership, branch_ids: list[UUID]) -> None:
    db.execute(delete(MemberBranch).where(MemberBranch.membership_id == membership.id))
    if branch_ids:
        db.execute(insert(MemberBranch), [
            {"membership_id": membership.id, "branch_id": b, "organization_id": ctx.organization_id}
            for b in branch_ids
        ])


def _assert_not_last_owner(db: Session, ctx: OrgContext, target: Membership) -> None:
    """Организация не должна остаться без активного владельца.

    Строки владельцев блокируются (FOR UPDATE), чтобы два владельца не могли
    одновременно разжаловать друг друга и оставить организацию без owner'а.
    """
    if target.role.key != OWNER_ROLE_KEY or target.status != MembershipStatus.active.value:
        return
    owner_ids = db.scalars(
        select(Membership.id)
        .join(Role, (Role.id == Membership.role_id) & (Role.organization_id == Membership.organization_id))
        .where(
            Membership.organization_id == ctx.organization_id,
            Role.key == OWNER_ROLE_KEY,
            Membership.status == MembershipStatus.active.value,
        )
        .with_for_update(of=Membership)
    ).all()
    if len([i for i in owner_ids if i != target.id]) == 0:
        raise BusinessRuleViolation("Нельзя убрать последнего владельца организации", code="last_owner")


def _assert_can_manage_target(ctx: OrgContext, target: Membership) -> None:
    if not ctx.can_manage_role_level(target.role.level):
        raise Forbidden("Нельзя управлять пользователем с ролью равной или выше вашей",
                        code="target_role_too_high")


# ------------------------------------------------------------------ commands


def add_member(db: Session, ctx: OrgContext, data: MemberCreateIn) -> MemberDetailOut:
    role = _get_role(db, ctx, data.role_id)
    _assert_can_assign(ctx, role)
    branch_ids = _validate_branches(db, ctx, data.branch_ids)

    user = db.scalar(select(User).where(User.email == data.email))
    if user is None:
        if not data.full_name:
            raise BusinessRuleViolation(
                "Пользователь с таким email не зарегистрирован — укажите ФИО, чтобы пригласить его",
                code="full_name_required", details={"field": "full_name"},
            )
        user = User(email=data.email, full_name=data.full_name, phone=data.phone)
        db.add(user)
        db.flush()
        status = MembershipStatus.invited
    else:
        # Глобальный профиль (ФИО, телефон) существующего аккаунта НЕ перезаписываем:
        # он общий для всех организаций пользователя, и админ одной компании
        # не должен менять данные, которые видит другая компания.
        if not user.is_active:
            raise BusinessRuleViolation("Аккаунт пользователя заблокирован на платформе", code="user_blocked")
        already = db.scalar(select(Membership.id).where(
            Membership.organization_id == ctx.organization_id, Membership.user_id == user.id))
        if already:
            raise Conflict("Пользователь уже состоит в организации", code="already_member")
        status = MembershipStatus.active if user.password_hash else MembershipStatus.invited

    membership = Membership(
        organization_id=ctx.organization_id,
        user_id=user.id,
        role_id=role.id,
        status=status.value,
        position=data.position,
        invited_by_id=ctx.user.id,
    )
    db.add(membership)
    try:
        db.flush()
        _set_branches(db, ctx, membership, branch_ids)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        # гонка: параллельный запрос успел добавить того же пользователя/создать аккаунт
        if "uq_memberships_organization_id_user_id" in str(e.orig) or "uq_users_email" in str(e.orig):
            raise Conflict("Пользователь уже состоит в организации", code="already_member") from e
        raise
    return get_member(db, ctx, user.id)


def update_member(db: Session, ctx: OrgContext, user_id: UUID, data: MemberUpdateIn) -> MemberDetailOut:
    target = _get_membership(db, ctx, user_id, for_update=True)
    changes = data.model_fields_set
    is_self = target.user_id == ctx.user.id

    if is_self and ({"role_id", "status"} & changes):
        raise BusinessRuleViolation("Нельзя изменить собственную роль или статус", code="cannot_modify_self")
    if not is_self:
        _assert_can_manage_target(ctx, target)

    if "role_id" in changes and data.role_id is not None and data.role_id != target.role_id:
        new_role = _get_role(db, ctx, data.role_id)
        _assert_can_assign(ctx, new_role)
        if new_role.key != OWNER_ROLE_KEY:
            _assert_not_last_owner(db, ctx, target)
        target.role_id = new_role.id

    if "status" in changes and data.status is not None and data.status.value != target.status:
        if data.status == MembershipStatus.invited:
            raise BusinessRuleViolation("Статус «приглашён» устанавливается только системой",
                                        code="invalid_status_transition")
        if data.status == MembershipStatus.active and target.user.password_hash is None:
            raise BusinessRuleViolation("Пользователь ещё не активировал аккаунт",
                                        code="invalid_status_transition")
        if data.status == MembershipStatus.suspended:
            _assert_not_last_owner(db, ctx, target)
        target.status = data.status.value

    if "position" in changes:
        target.position = data.position or None

    if "branch_ids" in changes and data.branch_ids is not None:
        _set_branches(db, ctx, target, _validate_branches(db, ctx, data.branch_ids))
        target.updated_at = func.now()  # изменение только связей тоже считается изменением участника

    db.commit()
    db.expire_all()
    return get_member(db, ctx, user_id)


def remove_member(db: Session, ctx: OrgContext, user_id: UUID) -> None:
    target = _get_membership(db, ctx, user_id, for_update=True)
    if target.user_id == ctx.user.id:
        raise BusinessRuleViolation("Нельзя удалить самого себя из организации", code="cannot_modify_self")
    _assert_can_manage_target(ctx, target)
    _assert_not_last_owner(db, ctx, target)
    # Удаляется только членство (и его филиалы — каскадом). Глобальный аккаунт
    # остаётся: пользователь может состоять в других организациях.
    db.delete(target)
    db.commit()

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select

from app.api.deps import DB, OrgCtx, require_permission
from app.core.errors import Forbidden
from app.models import Branch, MemberBranch, Module, Organization, OrganizationModule, Role
from app.permissions import P
from app.schemas import BranchOut, OrganizationOut, RoleBrief, RoleOut
from app.services.access import OrgContext

router = APIRouter(prefix="/organizations/{organization_id}", tags=["organizations"])


@router.get("", response_model=OrganizationOut)
def get_organization(ctx: OrgCtx, db: DB):
    org = db.get(Organization, ctx.organization_id)
    modules = db.scalars(
        select(Module.code).where(or_(
            Module.is_core.is_(True),
            Module.code.in_(select(OrganizationModule.module_code)
                            .where(OrganizationModule.organization_id == ctx.organization_id)),
        )).order_by(Module.code)
    ).all()
    return OrganizationOut(id=org.id, name=org.name, slug=org.slug, role=RoleBrief.model_validate(ctx.role),
                           permissions=sorted(ctx.permissions), modules=list(modules))


@router.get("/roles", response_model=list[RoleOut])
def list_roles(ctx: OrgCtx, db: DB):
    # роли нужны и для фильтра на странице пользователей, поэтому достаточно одного из прав
    if not (ctx.has(P.ROLES_READ) or ctx.has(P.USERS_READ)):
        raise Forbidden("Недостаточно прав", code="permission_denied", details={"required": P.ROLES_READ})
    roles = db.scalars(
        select(Role).where(Role.organization_id == ctx.organization_id).order_by(Role.level.desc())
    ).all()
    return [
        RoleOut(id=r.id, key=r.key, name=r.name, level=r.level, is_system=r.is_system,
                permissions=sorted(p.code for p in r.permissions),
                assignable=ctx.has(P.USERS_MANAGE) and ctx.can_assign(r))
        for r in roles
    ]


@router.get("/branches", response_model=list[BranchOut])
def list_branches(ctx: Annotated[OrgContext, Depends(require_permission(P.BRANCHES_READ))], db: DB):
    count = (
        select(func.count()).where(MemberBranch.branch_id == Branch.id).correlate(Branch).scalar_subquery()
    )
    rows = db.execute(
        select(Branch, count).where(Branch.organization_id == ctx.organization_id).order_by(Branch.name)
    ).all()
    return [BranchOut(id=b.id, name=b.name, address=b.address, members_count=c) for b, c in rows]

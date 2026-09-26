from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import DB, require_permission
from app.models import MembershipStatus
from app.permissions import P
from app.schemas import MemberCreateIn, MemberDetailOut, MemberOut, MemberSortField, MemberUpdateIn, Page, SortOrder
from app.services import members as svc
from app.services.access import OrgContext

router = APIRouter(prefix="/organizations/{organization_id}/users", tags=["organization users"])

CanRead = Annotated[OrgContext, Depends(require_permission(P.USERS_READ))]
CanManage = Annotated[OrgContext, Depends(require_permission(P.USERS_MANAGE))]


@router.get("", response_model=Page[MemberOut])
def list_users(
    ctx: CanRead,
    db: DB,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=100, description="ФИО, email или должность")] = None,
    role_id: Annotated[list[UUID] | None, Query(description="Можно передать несколько")] = None,
    branch_id: Annotated[list[UUID] | None, Query(description="Можно передать несколько")] = None,
    status_: Annotated[list[MembershipStatus] | None, Query(alias="status")] = None,
    sort_by: MemberSortField = MemberSortField.full_name,
    sort_order: SortOrder = SortOrder.asc,
):
    filters = svc.MemberFilters(
        search=search or None, role_ids=role_id, branch_ids=branch_id, statuses=status_,
        sort_by=sort_by, sort_order=sort_order, page=page, page_size=page_size,
    )
    items, total = svc.list_members(db, ctx, filters)
    return Page[MemberOut].build(items, total, page, page_size)


@router.get("/{user_id}", response_model=MemberDetailOut)
def get_user(user_id: UUID, ctx: CanRead, db: DB):
    return svc.get_member(db, ctx, user_id)


@router.post("", response_model=MemberDetailOut, status_code=status.HTTP_201_CREATED)
def add_user(data: MemberCreateIn, ctx: CanManage, db: DB):
    return svc.add_member(db, ctx, data)


@router.patch("/{user_id}", response_model=MemberDetailOut)
def update_user(user_id: UUID, data: MemberUpdateIn, ctx: CanManage, db: DB):
    return svc.update_member(db, ctx, user_id, data)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user(user_id: UUID, ctx: CanManage, db: DB):
    svc.remove_member(db, ctx, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import Membership, MembershipStatus, Organization, OrganizationModule, Role, RolePermission, User
from app.permissions import DEFAULT_ROLES, OWNER_ROLE_KEY


def create_organization(
    db: Session, *, name: str, slug: str, owner: User, modules: list[str] | None = None
) -> Organization:
    """Создаёт организацию, её системные роли из шаблона и делает owner'а владельцем."""
    org = Organization(name=name, slug=slug)
    db.add(org)
    db.flush()

    roles: dict[str, Role] = {}
    for tpl in DEFAULT_ROLES:
        role = Role(organization_id=org.id, key=tpl["key"], name=tpl["name"], level=tpl["level"], is_system=True)
        db.add(role)
        db.flush()
        db.execute(insert(RolePermission), [{"role_id": role.id, "permission_code": p} for p in tpl["permissions"]])
        roles[role.key] = role

    for code in modules or []:
        db.add(OrganizationModule(organization_id=org.id, module_code=code))

    db.add(Membership(organization_id=org.id, user_id=owner.id, role_id=roles[OWNER_ROLE_KEY].id,
                      status=MembershipStatus.active.value))
    db.flush()
    return org


def role_by_key(db: Session, org: Organization, key: str) -> Role:
    return db.scalars(select(Role).where(Role.organization_id == org.id, Role.key == key)).one()

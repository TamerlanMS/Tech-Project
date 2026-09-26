"""Инварианты, которые гарантирует сама БД — даже при ошибке в коде приложения."""
import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Branch, MemberBranch, Membership, Role, User
from app.services.organizations import role_by_key


def test_membership_cannot_use_role_of_other_org(db, world):
    foreign_role = role_by_key(db, world.org_b, "employee")
    db.add(Membership(organization_id=world.org_a.id, user_id=world.outsider.id, role_id=foreign_role.id))
    with pytest.raises(IntegrityError, match="fk_memberships_role_same_org"):
        db.commit()


def test_member_branch_cannot_point_to_other_org_branch(db, world):
    m = db.query(Membership).filter_by(user_id=world.employee.id).one()
    db.add(MemberBranch(membership_id=m.id, branch_id=world.branch_b.id, organization_id=world.org_a.id))
    with pytest.raises(IntegrityError, match="fk_member_branches_branch_same_org"):
        db.commit()


def test_unique_membership(db, world):
    db.add(Membership(organization_id=world.org_a.id, user_id=world.admin.id,
                      role_id=role_by_key(db, world.org_a, "employee").id))
    with pytest.raises(IntegrityError, match="uq_memberships_organization_id_user_id"):
        db.commit()


def test_email_must_be_lowercase(db, world):
    db.add(User(email="UPPER@a.kz", full_name="U"))
    with pytest.raises(IntegrityError, match="ck_users_email_lowercase"):
        db.commit()


def test_branch_name_unique_case_insensitive_per_org(db, world):
    db.add(Branch(organization_id=world.org_b.id, name="Almaty"))  # в другой org — можно
    db.commit()
    db.add(Branch(organization_id=world.org_a.id, name="ASTANA"))
    with pytest.raises(IntegrityError, match="uq_branches_org_lower_name"):
        db.commit()


def test_role_in_use_cannot_be_deleted(db, world):
    db.delete(role_by_key(db, world.org_a, "manager"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_user_with_memberships_cannot_be_hard_deleted(db, world):
    db.delete(db.get(User, world.admin.id))
    with pytest.raises(IntegrityError):
        db.commit()


def test_deleting_branch_unassigns_members(db, world):
    db.delete(db.get(Branch, world.branches_a[0].id))
    db.commit()
    assert db.query(MemberBranch).filter_by(organization_id=world.org_a.id).count() == 1


def test_deleting_organization_cascades_tenant_data(db, world):
    org_id = world.org_a.id
    db.delete(db.get(type(world.org_a), org_id))
    db.commit()
    for model in (Membership, Role, Branch, MemberBranch):
        assert db.query(model).filter_by(organization_id=org_id).count() == 0
    assert db.get(User, world.admin.id) is not None  # глобальные аккаунты остаются

"""Тесты гоняются на настоящем PostgreSQL (составные FK, pg_trgm, FOR UPDATE — важны).

TEST_DATABASE_URL, по умолчанию postgresql+psycopg://postgres:postgres@localhost:5432/orgusers_test
"""
import os
from dataclasses import dataclass

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/orgusers_test")
os.environ["DATABASE_URL"] = TEST_DB

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Branch, Membership, Organization, User  # noqa: E402
from app.services.organizations import create_organization, role_by_key  # noqa: E402

DATA_TABLES = ["member_branches", "memberships", "role_permissions", "roles", "branches",
               "organization_modules", "organizations", "users"]


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    with engine.begin() as conn:  # чистая схема на каждый прогон
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean():
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(DATA_TABLES)} CASCADE"))
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def client():
    return TestClient(app)


@dataclass
class World:
    org_a: Organization
    org_b: Organization
    owner: User
    admin: User
    manager: User
    employee: User
    outsider: User
    branches_a: list[Branch]
    branch_b: Branch

    def headers(self, user: User) -> dict:
        return {"Authorization": f"Bearer {create_access_token(user.id)}"}

    def url(self, org: Organization | None = None, user: User | None = None) -> str:
        base = f"/organizations/{(org or self.org_a).id}/users"
        return f"{base}/{user.id}" if user else base


PWD = hash_password("secret")


def make_user(db, email, name, password=True):
    u = User(email=email, full_name=name, password_hash=PWD if password else None)
    db.add(u)
    db.flush()
    return u


def add_member(db, org, user, role_key, branches=(), status="active"):
    m = Membership(organization_id=org.id, user_id=user.id, role_id=role_by_key(db, org, role_key).id, status=status)
    db.add(m)
    db.flush()
    from app.models import MemberBranch
    for b in branches:
        db.add(MemberBranch(membership_id=m.id, branch_id=b.id, organization_id=org.id))
    db.flush()
    return m


@pytest.fixture
def world(db) -> World:
    owner = make_user(db, "owner@a.kz", "Owner A")
    admin = make_user(db, "admin@a.kz", "Admin A")
    manager = make_user(db, "manager@a.kz", "Manager A")
    employee = make_user(db, "employee@a.kz", "Employee A")
    outsider = make_user(db, "owner@b.kz", "Owner B")

    org_a = create_organization(db, name="Org A", slug="org-a", owner=owner, modules=["crm"])
    org_b = create_organization(db, name="Org B", slug="org-b", owner=outsider)
    branches_a = [Branch(organization_id=org_a.id, name=n) for n in ("Astana", "Almaty")]
    branch_b = Branch(organization_id=org_b.id, name="Astana")
    db.add_all([*branches_a, branch_b])
    db.flush()

    add_member(db, org_a, admin, "admin", [branches_a[0]])
    add_member(db, org_a, manager, "manager", [branches_a[1]])
    add_member(db, org_a, employee, "employee")
    db.commit()
    return World(org_a, org_b, owner, admin, manager, employee, outsider, branches_a, branch_b)

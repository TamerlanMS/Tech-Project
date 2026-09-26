"""Аутентификация, изоляция тенантов, permissions, иерархия ролей."""
import uuid


def test_requires_auth(client, world):
    r = client.get(world.url())
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_invalid_token(client, world):
    r = client.get(world.url(), headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


def test_login_case_insensitive_and_generic_error(client, world):
    ok = client.post("/auth/login", json={"email": "ADMIN@a.kz", "password": "secret"})
    assert ok.status_code == 200 and ok.json()["access_token"]
    bad_pwd = client.post("/auth/login", json={"email": "admin@a.kz", "password": "nope"})
    no_user = client.post("/auth/login", json={"email": "ghost@a.kz", "password": "nope"})
    assert bad_pwd.status_code == no_user.status_code == 401
    assert bad_pwd.json() == no_user.json()  # не раскрываем, существует ли email


def test_my_organizations_only_own(client, world):
    r = client.get("/me/organizations", headers=world.headers(world.admin))
    assert [o["slug"] for o in r.json()] == ["org-a"]
    assert r.json()[0]["role"]["key"] == "admin"


def test_foreign_organization_is_404_not_403(client, world):
    """Не раскрываем даже факт существования чужой организации."""
    h = world.headers(world.admin)
    for url in (world.url(world.org_b), f"/organizations/{world.org_b.id}", f"/organizations/{uuid.uuid4()}/users"):
        r = client.get(url, headers=h)
        assert r.status_code == 404, url
        assert r.json()["error"]["code"] == "organization_not_found"


def test_cannot_read_foreign_member_via_own_org(client, world):
    """Пользователь другой организации недоступен через URL своей организации."""
    r = client.get(world.url(world.org_a, world.outsider), headers=world.headers(world.admin))
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "member_not_found"


def test_employee_cannot_read_or_manage(client, world):
    h = world.headers(world.employee)
    assert client.get(world.url(), headers=h).status_code == 403
    r = client.post(world.url(), headers=h, json={"email": "x@a.kz", "full_name": "X",
                                                  "role_id": str(world.org_a.id)})
    assert r.status_code == 403
    assert r.json()["error"]["details"]["required"] == "users.manage"


def test_manager_read_only(client, world):
    h = world.headers(world.manager)
    r = client.get(world.url(), headers=h)
    assert r.status_code == 200
    assert all(not m["can_manage"] for m in r.json()["items"])
    assert client.delete(world.url(user=world.employee), headers=h).status_code == 403


def test_suspended_member_loses_access(client, world, db):
    from app.models import Membership
    m = db.query(Membership).filter_by(user_id=world.admin.id).one()
    m.status = "suspended"
    db.commit()
    r = client.get(world.url(), headers=world.headers(world.admin))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "membership_inactive"
    assert client.get("/me/organizations", headers=world.headers(world.admin)).json() == []


def test_permissions_limited_by_enabled_modules(client, world):
    """Owner B имеет роль со всеми правами, но в Org B не подключены crm/warehouse."""
    perms = client.get(f"/organizations/{world.org_b.id}", headers=world.headers(world.outsider)).json()["permissions"]
    assert "users.manage" in perms
    assert not any(p.startswith(("crm.", "warehouse.")) for p in perms)
    perms_a = client.get(f"/organizations/{world.org_a.id}", headers=world.headers(world.owner)).json()["permissions"]
    assert "crm.read" in perms_a and "warehouse.read" not in perms_a


def test_roles_endpoint_marks_assignable(client, world):
    roles = {r["key"]: r for r in client.get(f"/organizations/{world.org_a.id}/roles",
                                             headers=world.headers(world.admin)).json()}
    assert roles["owner"]["assignable"] is False
    assert roles["admin"]["assignable"] is False
    assert roles["manager"]["assignable"] is True
    owner_view = client.get(f"/organizations/{world.org_a.id}/roles", headers=world.headers(world.owner)).json()
    assert all(r["assignable"] for r in owner_view)

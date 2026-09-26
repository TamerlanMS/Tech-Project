"""Бизнес-логика модуля «Пользователи организации»."""
import pytest

from tests.conftest import add_member, make_user


def role_id(client, world, key, org=None, user=None):
    org = org or world.org_a
    roles = client.get(f"/organizations/{org.id}/roles", headers=world.headers(user or world.owner)).json()
    return next(r["id"] for r in roles if r["key"] == key)


# ------------------------------------------------------------------ list


def test_list_pagination_and_sort(client, world, db):
    for i in range(25):
        add_member(db, world.org_a, make_user(db, f"u{i:02d}@a.kz", f"User {i:02d}"), "employee")
    db.commit()
    h = world.headers(world.admin)
    p1 = client.get(world.url(), headers=h, params={"page": 1, "page_size": 10, "sort_by": "email"}).json()
    p3 = client.get(world.url(), headers=h, params={"page": 3, "page_size": 10, "sort_by": "email"}).json()
    assert p1["total"] == 29 and p1["pages"] == 3 and len(p1["items"]) == 10 and len(p3["items"]) == 9
    emails = [m["email"] for m in p1["items"]]
    assert emails == sorted(emails)
    desc = client.get(world.url(), headers=h, params={"sort_by": "role", "sort_order": "desc"}).json()
    assert desc["items"][0]["role"]["key"] == "owner"


def test_page_size_limit(client, world):
    r = client.get(world.url(), headers=world.headers(world.admin), params={"page_size": 1000})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_search_is_case_insensitive_and_escapes_wildcards(client, world, db):
    add_member(db, world.org_a, make_user(db, "percent@a.kz", "Mr 100% Sure"), "employee")
    db.commit()
    h = world.headers(world.admin)
    assert client.get(world.url(), headers=h, params={"search": "MANAGER"}).json()["total"] == 1
    # '%' ищется буквально, а не как wildcard
    assert [m["email"] for m in client.get(world.url(), headers=h, params={"search": "100%"}).json()["items"]] == ["percent@a.kz"]
    assert client.get(world.url(), headers=h, params={"search": "_"}).json()["total"] == 0


def test_filters_role_branch_status(client, world, db):
    h = world.headers(world.admin)
    r = client.get(world.url(), headers=h, params={"role_id": role_id(client, world, "manager")}).json()
    assert [m["email"] for m in r["items"]] == ["manager@a.kz"]
    r = client.get(world.url(), headers=h, params=[("branch_id", str(b.id)) for b in world.branches_a]).json()
    assert {m["email"] for m in r["items"]} == {"admin@a.kz", "manager@a.kz"}
    r = client.get(world.url(), headers=h, params={"status": "invited"}).json()
    assert r["total"] == 0


def test_status_counts_ignore_status_filter(client, world, db):
    add_member(db, world.org_a, make_user(db, "inv1@a.kz", "Inv One", password=False), "employee", status="invited")
    add_member(db, world.org_a, make_user(db, "susp@a.kz", "Susp", ), "employee", status="suspended")
    db.commit()
    h = world.headers(world.admin)
    r = client.get(world.url(), headers=h, params={"status": "suspended"}).json()
    assert r["total"] == 1
    assert r["status_counts"] == {"active": 4, "invited": 1, "suspended": 1}
    r = client.get(world.url(), headers=h, params={"search": "inv"}).json()
    assert r["status_counts"] == {"active": 0, "invited": 1, "suspended": 0}


def test_list_is_tenant_scoped(client, world):
    emails = {m["email"] for m in client.get(world.url(), headers=world.headers(world.admin)).json()["items"]}
    assert "owner@b.kz" not in emails and len(emails) == 4


# ------------------------------------------------------------------ add


def test_add_new_user_creates_invited_account(client, world):
    r = client.post(world.url(), headers=world.headers(world.admin), json={
        "email": "  New@A.kz ", "full_name": "New Person", "role_id": role_id(client, world, "employee"),
        "branch_ids": [str(world.branches_a[0].id), str(world.branches_a[0].id)],  # дубликаты схлопываются
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "new@a.kz" and body["status"] == "invited" and not body["account_activated"]
    assert len(body["branches"]) == 1 and body["invited_by"]["email"] == "admin@a.kz"


def test_add_new_user_requires_full_name(client, world):
    r = client.post(world.url(), headers=world.headers(world.admin),
                    json={"email": "nobody@a.kz", "role_id": role_id(client, world, "employee")})
    assert r.status_code == 422 and r.json()["error"]["code"] == "full_name_required"


def test_add_existing_user_from_other_org_keeps_global_profile(client, world):
    """Один аккаунт — несколько организаций. Профиль чужого аккаунта не перезаписывается."""
    r = client.post(world.url(), headers=world.headers(world.admin), json={
        "email": "owner@b.kz", "full_name": "Hacked Name", "role_id": role_id(client, world, "employee")})
    assert r.status_code == 201
    assert r.json()["full_name"] == "Owner B" and r.json()["status"] == "active"
    orgs = client.get("/me/organizations", headers=world.headers(world.outsider)).json()
    assert {o["slug"]: o["role"]["key"] for o in orgs} == {"org-a": "employee", "org-b": "owner"}


def test_add_duplicate_member_conflict(client, world):
    r = client.post(world.url(), headers=world.headers(world.admin),
                    json={"email": "manager@a.kz", "role_id": role_id(client, world, "employee")})
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_member"


def test_add_with_foreign_role_or_branch_rejected(client, world):
    h = world.headers(world.admin)
    foreign_role = role_id(client, world, "employee", org=world.org_b, user=world.outsider)
    r = client.post(world.url(), headers=h, json={"email": "z@a.kz", "full_name": "Z", "role_id": foreign_role})
    assert r.status_code == 422 and r.json()["error"]["code"] == "role_not_found"
    r = client.post(world.url(), headers=h, json={"email": "z@a.kz", "full_name": "Z",
                                                  "role_id": role_id(client, world, "employee"),
                                                  "branch_ids": [str(world.branch_b.id)]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "branch_not_found"


@pytest.mark.parametrize("role_key", ["owner", "admin"])
def test_admin_cannot_grant_equal_or_higher_role(client, world, role_key):
    r = client.post(world.url(), headers=world.headers(world.admin),
                    json={"email": "esc@a.kz", "full_name": "Esc", "role_id": role_id(client, world, role_key)})
    assert r.status_code == 403 and r.json()["error"]["code"] == "role_assignment_forbidden"


# ------------------------------------------------------------------ update


def test_update_role_and_branches(client, world):
    h = world.headers(world.admin)
    r = client.patch(world.url(user=world.employee), headers=h, json={
        "role_id": role_id(client, world, "manager"), "branch_ids": [str(b.id) for b in world.branches_a],
        "position": "Lead"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["role"]["key"] == "manager" and len(b["branches"]) == 2 and b["position"] == "Lead"
    assert "users.read" in b["permissions"]
    r = client.patch(world.url(user=world.employee), headers=h, json={"branch_ids": []})
    assert r.json()["branches"] == []


def test_patch_rejects_unknown_fields(client, world):
    r = client.patch(world.url(user=world.employee), headers=world.headers(world.admin), json={"email": "x@y.kz"})
    assert r.status_code == 422


def test_cannot_change_own_role(client, world):
    r = client.patch(world.url(user=world.admin), headers=world.headers(world.admin),
                     json={"role_id": role_id(client, world, "employee")})
    assert r.status_code == 422 and r.json()["error"]["code"] == "cannot_modify_self"


def test_can_change_own_branches(client, world):
    r = client.patch(world.url(user=world.admin), headers=world.headers(world.admin),
                     json={"branch_ids": [str(world.branches_a[1].id)]})
    assert r.status_code == 200


def test_admin_cannot_manage_peer_or_owner(client, world, db):
    other_admin = make_user(db, "admin2@a.kz", "Admin 2")
    add_member(db, world.org_a, other_admin, "admin")
    db.commit()
    h = world.headers(world.admin)
    for target in (other_admin, world.owner):
        r = client.patch(world.url(user=target), headers=h, json={"position": "x"})
        assert r.status_code == 403 and r.json()["error"]["code"] == "target_role_too_high"
        assert client.delete(world.url(user=target), headers=h).status_code == 403


def test_status_transitions(client, world, db):
    h = world.headers(world.admin)
    assert client.patch(world.url(user=world.employee), headers=h, json={"status": "suspended"}).json()["status"] == "suspended"
    assert client.patch(world.url(user=world.employee), headers=h, json={"status": "active"}).json()["status"] == "active"
    r = client.patch(world.url(user=world.employee), headers=h, json={"status": "invited"})
    assert r.json()["error"]["code"] == "invalid_status_transition"
    invited = make_user(db, "inv@a.kz", "Inv", password=False)
    add_member(db, world.org_a, invited, "employee", status="invited")
    db.commit()
    r = client.patch(world.url(user=invited), headers=h, json={"status": "active"})
    assert r.status_code == 422


def test_last_owner_protection(client, world, db):
    second = make_user(db, "owner2@a.kz", "Owner 2")
    add_member(db, world.org_a, second, "owner")
    db.commit()
    h = world.headers(world.owner)
    # владельцев двое — можно разжаловать второго
    r = client.patch(world.url(user=second), headers=h, json={"role_id": role_id(client, world, "admin")})
    assert r.status_code == 200
    # теперь owner один; сам себя он менять не может, а остальные не могут управлять owner'ом
    assert client.delete(world.url(user=world.owner), headers=h).json()["error"]["code"] == "cannot_modify_self"


# ------------------------------------------------------------------ delete


def test_delete_member_keeps_global_account(client, world, db):
    from app.models import MemberBranch, User
    h = world.headers(world.admin)
    assert client.delete(world.url(user=world.manager), headers=h).status_code == 204
    assert client.get(world.url(user=world.manager), headers=h).status_code == 404
    assert db.get(User, world.manager.id) is not None
    assert db.query(MemberBranch).filter_by(branch_id=world.branches_a[1].id).count() == 0
    # повторное удаление — 404, а не 500
    assert client.delete(world.url(user=world.manager), headers=h).status_code == 404


def test_cannot_delete_self(client, world):
    r = client.delete(world.url(user=world.admin), headers=world.headers(world.admin))
    assert r.status_code == 422 and r.json()["error"]["code"] == "cannot_modify_self"


def test_cannot_delete_member_of_other_org_via_own_org(client, world):
    r = client.delete(world.url(world.org_a, world.outsider), headers=world.headers(world.admin))
    assert r.status_code == 404

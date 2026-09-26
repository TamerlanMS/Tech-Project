"""Демо-данные. Идемпотентно: если данные уже есть — ничего не делает.

Запуск: python -m app.seed
"""
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Branch, MemberBranch, Membership, MembershipStatus, Organization, User
from app.services.organizations import create_organization, role_by_key

PASSWORD = "password123"

MALE = ["Алибек", "Данияр", "Ерлан", "Нурлан", "Тимур", "Руслан", "Арман", "Бауыржан", "Сергей", "Максим"]
FEMALE = ["Айгерим", "Асель", "Динара", "Жанна", "Мадина", "Камила", "Сауле", "Алия", "Ольга", "Анна"]
LAST = ["Ахметов", "Сериков", "Жумабаев", "Нурланов", "Касымов", "Абенов", "Смагулов", "Искаков",
        "Иванов", "Петров", "Ким", "Оспанов", "Бекмуратов", "Садыков", "Кузнецов", "Тулеуов"]
POSITIONS = ["Менеджер по продажам", "Кладовщик", "Бухгалтер", "Логист", "Кассир", "Аналитик",
             "Специалист поддержки", "Руководитель отдела", None]


def _user(db: Session, email: str, full_name: str, *, password: bool = True, phone: str | None = None) -> User:
    u = User(email=email, full_name=full_name, phone=phone, password_hash=hash_password(PASSWORD) if password else None)
    db.add(u)
    db.flush()
    return u


def _branches(db: Session, org: Organization, names: list[tuple[str, str]]) -> list[Branch]:
    items = [Branch(organization_id=org.id, name=n, address=a) for n, a in names]
    db.add_all(items)
    db.flush()
    return items


def _member(db: Session, org: Organization, user: User, role_key: str, branches: list[Branch], *,
            status: MembershipStatus = MembershipStatus.active, position: str | None = None,
            invited_by: User | None = None, days_ago: int = 0) -> None:
    m = Membership(organization_id=org.id, user_id=user.id, role_id=role_by_key(db, org, role_key).id,
                   status=status.value, position=position, invited_by_id=invited_by.id if invited_by else None,
                   created_at=datetime.now(UTC) - timedelta(days=days_ago),
                   updated_at=datetime.now(UTC) - timedelta(days=days_ago))
    db.add(m)
    db.flush()
    if branches:
        db.execute(insert(MemberBranch), [
            {"membership_id": m.id, "branch_id": b.id, "organization_id": org.id} for b in branches])


def seed(db: Session) -> None:
    if db.scalar(select(Organization.id).limit(1)):
        print("Seed: данные уже есть, пропускаю")
        return
    rnd = random.Random(42)
    hash_cache = hash_password(PASSWORD)  # bcrypt медленный — один хэш на всех демо-пользователей

    owner_a = _user(db, "owner.alpha@example.com", "Гульнара Сейтказиева", phone="+7 701 000 00 01")
    owner_b = _user(db, "owner.beta@example.com", "Кайрат Мухамедиев")
    owner_c = _user(db, "owner.gamma@example.com", "Елена Соколова")
    ivan = _user(db, "ivan@example.com", "Иван Петров", phone="+7 777 123 45 67")
    asel = _user(db, "asel@example.com", "Асель Нурланова")

    org_a = create_organization(db, name="Альфа Трейд", slug="alpha-trade", owner=owner_a, modules=["crm", "warehouse"])
    org_b = create_organization(db, name="Бета Логистик", slug="beta-logistic", owner=owner_b, modules=["warehouse"])
    org_c = create_organization(db, name="Гамма Ритейл", slug="gamma-retail", owner=owner_c, modules=["crm"])

    br_a = _branches(db, org_a, [("Астана — Центральный офис", "пр. Мангилик Ел, 55"),
                                 ("Алматы — Абая", "пр. Абая, 150"),
                                 ("Шымкент", "ул. Тауке хана, 12"),
                                 ("Караганда", "пр. Бухар-Жырау, 30")])
    br_b = _branches(db, org_b, [("Астана — Склад №1", "ул. Пушкина, 2"), ("Актобе", "ул. Абилкайыр хана, 40")])
    br_c = _branches(db, org_c, [("Алматы — ТРЦ Mega", "ул. Розыбакиева, 247")])

    # Сценарий из ТЗ: один аккаунт, разные роли в разных организациях
    _member(db, org_a, ivan, "admin", [br_a[0]], position="Администратор системы", invited_by=owner_a, days_ago=420)
    _member(db, org_b, ivan, "manager", [br_b[0]], position="Менеджер склада", invited_by=owner_b)
    _member(db, org_c, ivan, "employee", br_c, position="Консультант", invited_by=owner_c)
    _member(db, org_a, asel, "manager", br_a[:2], position="Руководитель отдела продаж", invited_by=owner_a, days_ago=380)
    _member(db, org_b, asel, "employee", [br_b[1]], position="Логист", invited_by=owner_b)

    used = {u.email for u in (owner_a, owner_b, owner_c, ivan, asel)}
    for i in range(46):
        female = rnd.random() < 0.5
        first, last = rnd.choice(FEMALE if female else MALE), rnd.choice(LAST)
        if female and last != "Ким":
            last += "а"
        email = f"user{i + 1:02d}@example.com"
        if email in used:
            continue
        invited = rnd.random() < 0.12
        u = User(email=email, full_name=f"{first} {last}", password_hash=None if invited else hash_cache,
                 phone=f"+7 7{rnd.randint(0, 9)}{rnd.randint(0, 9)} {rnd.randint(100, 999)} {rnd.randint(10, 99)} {rnd.randint(10, 99)}")
        db.add(u)
        db.flush()
        role = rnd.choices(["admin", "manager", "employee"], weights=[1, 4, 12])[0]
        status = (MembershipStatus.invited if invited
                  else MembershipStatus.suspended if rnd.random() < 0.08 else MembershipStatus.active)
        branches = rnd.sample(br_a, k=rnd.choices([0, 1, 2], weights=[1, 8, 2])[0])
        _member(db, org_a, u, role, branches, status=status, position=rnd.choice(POSITIONS), invited_by=owner_a,
                days_ago=rnd.randint(0, 400))
        if i % 5 == 0:  # часть сотрудников работает и во второй компании
            _member(db, org_b, u, "employee", [rnd.choice(br_b)], status=status, invited_by=owner_b,
                    days_ago=rnd.randint(0, 200))

    db.commit()
    print("Seed: готово. Вход: ivan@example.com / password123 (и owner.alpha@example.com)")


if __name__ == "__main__":
    with SessionLocal() as session:
        seed(session)

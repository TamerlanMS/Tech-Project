"""reference data (modules, permissions) and search indexes

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# Снимок каталога на момент миграции (миграция не должна зависеть от меняющегося кода).
MODULES = [
    ("core", "Ядро (организация, пользователи)", True),
    ("crm", "CRM", False),
    ("warehouse", "Склад", False),
]
PERMISSIONS = [
    ("users.read", "core", "Просмотр пользователей организации"),
    ("users.manage", "core", "Добавление, изменение и удаление пользователей"),
    ("branches.read", "core", "Просмотр филиалов"),
    ("roles.read", "core", "Просмотр ролей"),
    ("crm.read", "crm", "Просмотр CRM"),
    ("crm.manage", "crm", "Управление CRM"),
    ("warehouse.read", "warehouse", "Просмотр склада"),
    ("warehouse.manage", "warehouse", "Управление складом"),
]


def upgrade() -> None:
    modules = sa.table("modules", sa.column("code"), sa.column("name"), sa.column("is_core", sa.Boolean))
    perms = sa.table("permissions", sa.column("code"), sa.column("module_code"), sa.column("description"))
    op.bulk_insert(modules, [{"code": c, "name": n, "is_core": core} for c, n, core in MODULES])
    op.bulk_insert(perms, [{"code": c, "module_code": m, "description": d} for c, m, d in PERMISSIONS])

    # Поиск по подстроке (ILIKE '%...%') не использует B-tree; trigram GIN-индекс — использует.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE INDEX ix_users_full_name_trgm ON users USING gin (full_name gin_trgm_ops)")
    op.execute("CREATE INDEX ix_users_email_trgm ON users USING gin (email gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_email_trgm")
    op.execute("DROP INDEX IF EXISTS ix_users_full_name_trgm")
    op.execute("DELETE FROM role_permissions")
    op.execute("DELETE FROM permissions")
    op.execute("DELETE FROM modules")

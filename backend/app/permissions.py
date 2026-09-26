"""Каталог модулей и permissions (задаётся кодом, синхронизируется в БД миграцией).

Permissions привязаны к коду эндпоинтов, поэтому их список — часть кодовой базы.
Роли же — данные: у каждой организации свой набор ролей, собранный из permissions.
"""
from enum import StrEnum


class P(StrEnum):
    USERS_READ = "users.read"
    USERS_MANAGE = "users.manage"
    BRANCHES_READ = "branches.read"
    ROLES_READ = "roles.read"
    CRM_READ = "crm.read"
    CRM_MANAGE = "crm.manage"
    WAREHOUSE_READ = "warehouse.read"
    WAREHOUSE_MANAGE = "warehouse.manage"


MODULES: list[dict] = [
    {"code": "core", "name": "Ядро (организация, пользователи)", "is_core": True},
    {"code": "crm", "name": "CRM", "is_core": False},
    {"code": "warehouse", "name": "Склад", "is_core": False},
]

PERMISSIONS: list[dict] = [
    {"code": P.USERS_READ, "module_code": "core", "description": "Просмотр пользователей организации"},
    {"code": P.USERS_MANAGE, "module_code": "core", "description": "Добавление, изменение и удаление пользователей"},
    {"code": P.BRANCHES_READ, "module_code": "core", "description": "Просмотр филиалов"},
    {"code": P.ROLES_READ, "module_code": "core", "description": "Просмотр ролей"},
    {"code": P.CRM_READ, "module_code": "crm", "description": "Просмотр CRM"},
    {"code": P.CRM_MANAGE, "module_code": "crm", "description": "Управление CRM"},
    {"code": P.WAREHOUSE_READ, "module_code": "warehouse", "description": "Просмотр склада"},
    {"code": P.WAREHOUSE_MANAGE, "module_code": "warehouse", "description": "Управление складом"},
]

ALL = [p["code"] for p in PERMISSIONS]

# Шаблон ролей, создаваемых для каждой новой организации.
DEFAULT_ROLES: list[dict] = [
    {"key": "owner", "name": "Владелец", "level": 100, "permissions": ALL},
    {
        "key": "admin",
        "name": "Администратор",
        "level": 80,
        "permissions": [P.USERS_READ, P.USERS_MANAGE, P.BRANCHES_READ, P.ROLES_READ,
                        P.CRM_READ, P.CRM_MANAGE, P.WAREHOUSE_READ, P.WAREHOUSE_MANAGE],
    },
    {
        "key": "manager",
        "name": "Менеджер",
        "level": 50,
        "permissions": [P.USERS_READ, P.BRANCHES_READ, P.ROLES_READ, P.CRM_READ, P.CRM_MANAGE, P.WAREHOUSE_READ],
    },
    {
        "key": "employee",
        "name": "Сотрудник",
        "level": 10,
        "permissions": [P.BRANCHES_READ, P.CRM_READ, P.WAREHOUSE_READ],
    },
]

OWNER_ROLE_KEY = "owner"

# Модуль «Пользователи организации» — B2B SaaS

Тестовое задание Fullstack Developer.
**Стек:** FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL 16 · React 19 + TypeScript · Ant Design · TanStack Query.

![Страница пользователей](docs/screenshots/users.png)

## Быстрый старт

```bash
docker compose up --build
```

| Что | Где |
|---|---|
| Frontend | http://localhost:8080 |
| API + Swagger | http://localhost:8000/docs |
| PostgreSQL | `localhost:5433` (postgres / postgres) |

При старте backend сам применяет миграции и загружает демо-данные (идемпотентно).

**Демо-аккаунты** (пароль `password123`):

| Email | Роли |
|---|---|
| `ivan@example.com` | «Альфа Трейд» — **Администратор**, «Бета Логистик» — **Менеджер**, «Гамма Ритейл» — **Сотрудник** (сценарий из ТЗ) |
| `owner.alpha@example.com` | «Альфа Трейд» — **Владелец** |

Под Иваном удобно проверять права: в «Альфе» — полное управление (кроме владельца и других админов), в «Бете» — только просмотр, в «Гамме» — страница «Нет доступа».

**Тесты** (42 шт., на настоящем PostgreSQL):

```bash
docker compose exec backend pytest
```

<details>
<summary>Запуск без Docker</summary>

```bash
# backend (нужен PostgreSQL; создайте БД orgusers и orgusers_test)
cd backend
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                  # поправьте DATABASE_URL
alembic upgrade head && python -m app.seed
uvicorn app.main:app --reload
TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/orgusers_test pytest

# frontend
cd frontend
npm install
npm run dev                                           # http://localhost:5173, /api проксируется на :8000
```
</details>

---

## Архитектура

```
backend/app
├── models.py              # схема БД (SQLAlchemy)
├── permissions.py         # каталог модулей, permissions и шаблон ролей
├── schemas.py             # DTO (Pydantic) — контракт API
├── api/
│   ├── deps.py            # auth → tenant-контекст → проверка permission
│   └── routes/            # тонкие HTTP-обработчики
├── services/
│   ├── access.py          # OrgContext: членство, права, иерархия ролей
│   ├── members.py         # бизнес-логика модуля «Пользователи»
│   └── organizations.py   # создание организации с системными ролями
└── core/                  # конфиг, JWT/bcrypt, единый формат ошибок
frontend/src
├── api/                   # fetch-клиент, типы, react-query хуки
├── components/            # OrgLayout, MemberFormModal, MemberDrawer
└── pages/                 # Login → выбор организации → Users
```

Слои: **routes** (HTTP, валидация) → **services** (бизнес-правила, без знания об HTTP) → **models** (данные).
Сервисы получают уже проверенный `OrgContext` и бросают доменные ошибки (`NotFound`, `Forbidden`, `BusinessRuleViolation`, `Conflict`), которые обработчик превращает в единый JSON:

```json
{ "error": { "code": "last_owner", "message": "Нельзя убрать последнего владельца организации", "details": null } }
```

Фронтенд опирается на `code`, а не на текст, — например, подсвечивает нужное поле формы.

---

## База данных

```mermaid
erDiagram
    users ||--o{ memberships : "состоит в"
    organizations ||--o{ memberships : ""
    organizations ||--o{ roles : ""
    organizations ||--o{ branches : ""
    organizations ||--o{ organization_modules : "подключила"
    modules ||--o{ organization_modules : ""
    modules ||--o{ permissions : ""
    roles ||--o{ role_permissions : ""
    permissions ||--o{ role_permissions : ""
    roles ||--o{ memberships : "роль в org"
    memberships ||--o{ member_branches : ""
    branches ||--o{ member_branches : ""

    users {
        uuid id PK
        string email UK
        string full_name
        string password_hash "NULL = приглашён"
        bool is_active
    }
    organizations {
        uuid id PK
        string name
        string slug UK
    }
    roles {
        uuid id PK
        uuid organization_id FK
        string key
        int level
        bool is_system
    }
    memberships {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        uuid role_id FK
        string status
        string position
    }
    member_branches {
        uuid membership_id PK
        uuid branch_id PK
        uuid organization_id
    }
    branches {
        uuid id PK
        uuid organization_id FK
        string name
    }
```

### Ключевые решения

**User — глобальный, всё остальное — в Membership.** Один аккаунт на человека (`users.email` уникален). Роль, должность, статус и филиалы — атрибуты *членства* (`memberships`), а не пользователя. Поэтому «Иван — админ в A и сотрудник в B» — это просто две строки в `memberships`.

**Роли принадлежат организации.** `roles.organization_id NOT NULL`. При создании организации из шаблона (`permissions.DEFAULT_ROLES`) создаются системные роли owner / admin / manager / employee. Организация в будущем может создавать свои роли, не затрагивая других.

**Permissions — код, роли — данные.** Permission (`users.read`, `users.manage`, `crm.read`, …) привязан к конкретным эндпоинтам, поэтому их каталог живёт в коде и синхронизируется миграцией. Роль — это набор permissions (`role_permissions`), который можно менять без деплоя.

**Модули.** `modules` + `organization_modules`. Эффективные права = права роли ∩ подключённые модули организации (core-модуль включён всегда). Если организация отключит CRM, права `crm.*` пропадут у всех её участников автоматически, роли трогать не нужно.

**Изоляция тенантов на уровне БД — составные внешние ключи.**

```
memberships(role_id, organization_id)           → roles(id, organization_id)
member_branches(branch_id, organization_id)     → branches(id, organization_id)
member_branches(membership_id, organization_id) → memberships(id, organization_id)
```

Даже если в коде будет ошибка, БД физически не даст назначить участнику роль или филиал другой организации (это покрыто тестами в `test_db_constraints.py`). Для этого на `roles`, `branches`, `memberships` есть `UNIQUE (id, organization_id)`.

**User ↔ Branch через членство.** `member_branches` ссылается на `memberships`, а не на `users`: филиал всегда существует в контексте организации, и при удалении пользователя из организации его филиальные привязки удаляются каскадом. Связь many-to-many — сотрудник может работать в нескольких филиалах.

### Constraints и индексы

| Что | Зачем |
|---|---|
| `UNIQUE (organization_id, user_id)` на memberships | пользователь не может состоять в организации дважды; защищает и от гонки двух параллельных POST |
| `UNIQUE users.email` + `CHECK (email = lower(email))` | уникальность без учёта регистра; email нормализуется в API |
| `UNIQUE (organization_id, lower(name))` на branches | нет двух филиалов «Астана» / «астана» в одной организации |
| `UNIQUE (organization_id, key)` на roles | ключ роли уникален в пределах организации |
| `CHECK status IN (...)`, `CHECK level BETWEEN 0 AND 100` | строка вместо PG ENUM — проще миграции, CHECK сохраняет строгость |
| `ix_memberships_org_status`, `ix_memberships_org_role` | фильтры списка по статусу и роли внутри организации |
| `ix_member_branches_org_branch` | фильтр «пользователи филиала X» |
| `ix_memberships_user_id` | «мои организации» — запрос при каждом входе |
| GIN `pg_trgm` на `users.full_name`, `users.email` | поиск по подстроке (`ILIKE '%…%'`) — B-tree здесь не работает |

### Поведение при удалении

| FK | ON DELETE | Почему |
|---|---|---|
| org → roles, branches, memberships, organization_modules | **CASCADE** | данные тенанта не имеют смысла без тенанта |
| memberships → users | **RESTRICT** | глобальный аккаунт нельзя физически удалить, пока он где-то состоит (для «удаления» есть `is_active = false`) |
| memberships → roles | **NO ACTION** | нельзя удалить роль, которая назначена участникам. Именно NO ACTION, а не RESTRICT: проверка откладывается до конца statement, поэтому каскадное удаление всей организации проходит |
| member_branches → memberships, branches | **CASCADE** | удалили участника или филиал — привязка исчезает, сам человек остаётся |
| role_permissions → permissions | **RESTRICT** | нельзя удалить permission, пока он выдан ролям |
| memberships.invited_by → users | **SET NULL** | ссылка на пригласившего — справочная |

---

## Права доступа

Проверка идёт в пять слоёв (`app/services/access.py`, `app/api/deps.py`):

1. **Аутентификация.** JWT (Bearer) → глобальный `User`. Заблокированный аккаунт (`is_active = false`) не проходит.
2. **Tenant-контекст.** Для любого `/organizations/{id}/…` загружается членство текущего пользователя в этой организации. Нет членства → **404, а не 403**: чужая организация неотличима от несуществующей. Членство `suspended` → 403.
3. **Permission.** Декларативно в сигнатуре эндпоинта:
   ```python
   CanManage = Annotated[OrgContext, Depends(require_permission(P.USERS_MANAGE))]
   def update_user(user_id: UUID, data: MemberUpdateIn, ctx: CanManage, db: DB): ...
   ```
4. **Иерархия ролей (`roles.level`)** защищает от эскалации привилегий:
   - управлять можно только участником с ролью **ниже** своей (admin не трогает других admin и owner);
   - назначать можно только роль **ниже** своей (admin не может сделать кого-то admin или owner);
   - owner может всё (в пределах бизнес-правил ниже).
5. **Скоуп данных.** Каждый запрос сервиса фильтруется по `ctx.organization_id`, а составные FK в БД страхуют на случай ошибки в коде.

| Роль | level | users.read | users.manage |
|---|---|---|---|
| Владелец | 100 | ✅ | ✅ (всех) |
| Администратор | 80 | ✅ | ✅ (manager, employee) |
| Менеджер | 50 | ✅ | — |
| Сотрудник | 10 | — | — |

Бэкенд отдаёт в каждой строке списка `can_manage`, а в ролях — `assignable`. UI не дублирует логику прав, а только отражает решение сервера (отключает пункты меню, недоступные роли в селекте). Источник истины при этом один — backend: любой запрос проверяется повторно.

---

## API

| Метод | Путь | Право |
|---|---|---|
| POST | `/auth/login` | — |
| GET | `/auth/me` | auth |
| GET | `/me/organizations` | auth (только свои организации) |
| GET | `/organizations/{orgId}` | членство |
| GET | `/organizations/{orgId}/roles` | `roles.read` или `users.read` |
| GET | `/organizations/{orgId}/branches` | `branches.read` |
| GET | `/organizations/{orgId}/users` | `users.read` |
| GET | `/organizations/{orgId}/users/{userId}` | `users.read` |
| POST | `/organizations/{orgId}/users` | `users.manage` |
| PATCH | `/organizations/{orgId}/users/{userId}` | `users.manage` |
| DELETE | `/organizations/{orgId}/users/{userId}` | `users.manage` |

`GET /users` принимает параметры:

```
page=1  page_size=20 (≤100)
search=…                        — ФИО, email, должность; ILIKE, спецсимволы % и _ экранируются
role_id=…&role_id=…             — несколько значений
branch_id=…&branch_id=…
status=active|invited|suspended
sort_by=full_name|email|role|status|joined_at   sort_order=asc|desc
```

Сортировка идёт только по whitelist-полям (никакого SQL из параметров). К ней всегда добавляется `membership.id`, чтобы порядок был стабильным и строки не «прыгали» между страницами при равных значениях.

`{userId}` в путях — это глобальный id пользователя, как в ТЗ. Сервис ищет его только среди участников текущей организации.

---

## Бизнес-правила и нестандартные сценарии

| Сценарий | Поведение |
|---|---|
| Добавление email, которого нет на платформе | создаётся аккаунт без пароля, членство в статусе `invited`; ФИО обязательно (`full_name_required`) |
| Добавление существующего аккаунта | создаётся только членство. **Глобальный профиль (ФИО, телефон) не перезаписывается**: админ компании A не должен менять данные, которые видит компания B |
| Пользователь уже в организации | 409 `already_member`, в том числе при гонке двух запросов (ловим `IntegrityError` по имени constraint'а) |
| Email в другом регистре / с пробелами | нормализуется: `Ivan@Mail.KZ ` → `ivan@mail.kz` |
| Роль или филиал другой организации | 422 `role_not_found` / `branch_not_found` (+ страховка в БД) |
| Дубли в `branch_ids` | схлопываются |
| Выдать роль ≥ своей | 403 `role_assignment_forbidden` |
| Изменить или удалить участника с ролью ≥ своей | 403 `target_role_too_high` |
| Изменить свою роль или статус, удалить себя | 422 `cannot_modify_self` — защита от случайной само-блокировки. Свои филиалы и должность менять можно |
| Последний владелец | нельзя разжаловать, заблокировать или удалить (`last_owner`); строки владельцев блокируются `SELECT … FOR UPDATE`, чтобы два владельца не разжаловали друг друга одновременно |
| Переходы статуса | `invited` ставит только система; `active` нельзя выставить, пока аккаунт не активирован |
| Удаление из организации | удаляется только членство (и привязки к филиалам — каскадом). Аккаунт и членство в других организациях остаются |
| Неизвестные поля в PATCH | 422 (`extra="forbid"`): например, нельзя «случайно» поменять email через этот эндпоинт |
| Детальная карточка пользователя | не раскрывает, в каких ещё организациях он состоит |
| Логин | одинаковый ответ для «нет такого email» и «неверный пароль» |

## Frontend

Страница **Organization → Users** (`/orgs/:orgId/users`):

- таблица с серверной пагинацией, сортировкой по колонкам, поиском (debounce 350 мс) и мультифильтрами по роли, филиалу и статусу;
- **всё состояние таблицы хранится в URL** (`?q=…&role=…&page=2`): ссылку с фильтрами можно отправить коллеге, кнопка «Назад» работает, при перезагрузке ничего не теряется;
- добавление и редактирование в модалке; ошибки сервера привязываются к полям по `error.code`; PATCH отправляет только изменённые поля;
- карточка пользователя в Drawer: профиль, филиалы, кто пригласил, эффективные права;
- удаление с подтверждением, в котором объясняются последствия;
- состояния: **loading** (спиннер поверх таблицы, `keepPreviousData` — таблица не мигает при смене страницы), **error** (Result + «Повторить»; если данные уже были — показываются они и строка с ошибкой), **empty** — два разных: «в организации никого нет» с CTA «Добавить» и «ничего не найдено» с кнопкой «Сбросить фильтры»;
- права в UI: без `users.manage` нет кнопки «Добавить» и пунктов изменения; без `users.read` — экран 403; чужая организация по прямой ссылке — «Организация недоступна»;
- переключатель организаций в шапке, меню собирается из подключённых модулей;
- адаптивность: на мобильных сайдбар сворачивается, второстепенные колонки скрываются.

| Карточка пользователя | Добавление | Нет прав (сотрудник) |
|---|---|---|
| ![](docs/screenshots/drawer.png) | ![](docs/screenshots/add-user.png) | ![](docs/screenshots/no-access.png) |

UI сделан в духе страниц Members в Clerk и Linear: аватар + имя + email в одной ячейке, роль тегом, статус бейджем, действия в меню «⋯».

## Что бы я добавил в продакшене

- **Audit log** (кто, кого и когда изменил/удалил) — для B2B это обычно обязательно.
- **Приглашение по email** с одноразовой ссылкой установки пароля. Сейчас статус `invited` моделируется, но письмо не отправляется.
- Refresh-токены в httpOnly cookie вместо access-токена в localStorage.
- PostgreSQL **Row-Level Security** (`SET app.current_org`) как ещё один слой изоляции.
- Оптимистичная блокировка (`If-Match` / `updated_at`) для одновременного редактирования.
- Курсорная пагинация для очень больших организаций, rate limiting на `/auth/login`.
- CRUD ролей и филиалов, кастомные роли организации (схема к этому уже готова).
- E2E-тесты фронтенда (Playwright) в CI.

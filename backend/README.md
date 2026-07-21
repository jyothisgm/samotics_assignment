# Backend

A lightweight Flask + SQLAlchemy JSON API for managing Motor Assets — electrical motors fitted with high-frequency sensors — on behalf of an industrial client. Backs two conceptual pages: an **Asset Overview** (paginated list) and an **Asset Detail** view (full record + sensor time series, with limited editing). Endpoints are protected by JWT auth; there's still no frontend yet, the API is meant to be consumed directly (e.g. via `curl` or a future SPA).

---

## Stack

* **Flask 3** — [run.py](https://www.google.com/search?q=run.py) is the entrypoint (`app = create_app()`); the factory itself lives in [app/\_\_init\_\_.py](https://www.google.com/search?q=app/__init__.py) and does nothing but wire up extensions/Swagger/blueprints plus `/health`. The actual routes/models live in two blueprint packages, `app/user/` (`/auth/*`) and `app/asset/` (`/assets/*`), each split into `models.py` + `routes.py` (and `auth.py` for `user/`); `app/blueprints.py` centralizes registering both.
* **Flask-SQLAlchemy** — the ORM.
* **Flask-Migrate / Alembic** — schema migrations. `db.create_all()` is gone; the schema lives in [migrations/versions/](https://www.google.com/search?q=migrations/versions/) and is applied with `flask db upgrade`.
* **Flask-JWT-Extended** — stateless bearer-token auth. `POST /auth/login` issues a token; every other `/assets` route requires `Authorization: Bearer <token>`.
* **Flasgger** — generates Swagger/OpenAPI docs from YAML docstrings on each route; serves interactive docs at `/apidocs`.
* **PostgreSQL + TimescaleDB** — Postgres for the relational data (assets, users), TimescaleDB's hypertable extension for the sensor readings, which are pure append-only time series.
* **psycopg2** — the sync Postgres driver SQLAlchemy uses.
* **Faker** — generates realistic-looking seed data for the 200 demo assets.
* **uv** — dependency management and running scripts (`uv run ...`), and the base image for the Docker build.
* **Gunicorn** — WSGI server the container runs in place of `flask run`'s dev server.

---

## Project layout

```text
run.py                    Entrypoint: app = create_app() (used by `flask --app run`, gunicorn)
app/
  __init__.py             create_app() factory only: extensions, Swagger, blueprints, /health
  extensions.py           Shared db = SQLAlchemy(), migrate = Migrate(), utcnow() helper
  blueprints.py           register_blueprints(app) — the one place both blueprints get wired in
  user/
    __init__.py           empty — everything below is imported by submodule, not re-exported here
    models.py             User model (password hashing, to_dict())
    auth.py               Token issuance + current_user()/current_username() JWT helpers
    routes.py             users_bp: /auth/login, /auth/register
  asset/
    __init__.py           empty
    models.py             MotorAsset, SensorReading models
    routes.py             assets_bp: /assets list/detail/update
config.py                 Config object; reads DATABASE_URL / JWT_SECRET_KEY from environment/.env
migrations/               Alembic environment + versioned schema migrations
scripts/
  seed.py                 Clears and reloads demo data (schema is Alembic's job, not this file's)
  ensure_db.py            Creates the target Postgres database if it doesn't exist yet
  is_seeded.py            Exit-code check: does the database already have seed data?
docker/
  Dockerfile              Container image for the Flask app itself
  docker-entrypoint.sh    Container startup: runs migrations, then gunicorn
  docker-compose.yml      db (Postgres+TimescaleDB) + web (this app) for local/dockerized dev

```

---

## Setup — Docker (whole stack)

The fastest path: this builds the app image and starts it alongside Postgres.

```bash
docker compose -f docker/docker-compose.yml up -d --build

```

Then apply migrations and seed data inside the running container:

```bash
docker compose -f docker/docker-compose.yml exec web flask --app run db upgrade
docker compose -f docker/docker-compose.yml exec web python scripts/seed.py

```

The app is now at `http://localhost:5000` (docs at `/apidocs`). `web`'s `DATABASE_URL` and `JWT_SECRET_KEY` are set directly in `docker/docker-compose.yml`, pointing at the `db` service by its Compose network name — no `.env` needed for this path.

---

## Setup — local (uv)

Useful for iterating on the app without rebuilding a container each time.

1. Start a Postgres instance with the TimescaleDB extension available:
```bash
docker compose -f docker/docker-compose.yml up -d db

```


(or point `DATABASE_URL` at your own Postgres — TimescaleDB is optional, see [Design decisions](https://www.google.com/search?q=%23design-decisions).)
2. Copy `.env.example` to `.env` and adjust `DATABASE_URL` / `JWT_SECRET_KEY` if needed. The default `DATABASE_URL` (`postgresql+psycopg2://postgres:postgres@localhost:5432/backend`) matches the compose file above.
3. Install dependencies:
```bash
uv sync

```


4. Apply migrations to create the schema:
```bash
uv run flask --app run db upgrade

```


5. Seed the database (3 users, 200 motor assets distributed across the two owner accounts, ~3 sensor metrics each):
```bash
uv run python scripts/seed.py

```


Seeds exactly three accounts: `admin, override via `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars, seeded with `is_admin=True`), and two fixed asset owners — `samotics` and `jyothis` (override via `OWNER_PASSWORD`), that the 200 assets are randomly split across. Log in as either owner to see `is_owner` and asset editing work for real, or as the admin account to edit/reassign any asset regardless of ownership.
6. Run the app:
```bash
uv run flask --app run run --debug

```


7. Browse the interactive API docs at `[http://127.0.0.1:5000/apidocs](http://127.0.0.1:5000/apidocs)` — click **Authorize** and paste `Bearer <token>` (from `/auth/login` or `/auth/register`) to try the protected routes directly from the browser. The raw OpenAPI spec is at `/apispec_1.json`.

### Making schema changes

Edit `app/asset/models.py` or `app/user/models.py`, then generate and apply a new migration:

```bash
uv run flask --app run db migrate -m "describe the change"
uv run flask --app run db upgrade

```

---

## API

### `GET /health`

Liveness check, unauthenticated. `{"status": "ok"}`.

### `POST /auth/register`

Unauthenticated. Body: `{"username": "...", "password": "..."}`. `username` must be 80 characters or fewer; `password` must be at least 8 characters and include a lowercase letter, an uppercase letter, a number, and a symbol. Creates a `User` and returns `{"access_token": "...", "user": {"id": 1, "username": "...", "is_admin": false}}` with `201`. `400` if username/password are missing, the username is too long, or the password fails any of the complexity rules; `409` if the username is already taken. Self-registered accounts are never admins — `is_admin` can only be set by seeding or a direct DB update, there's no API surface for granting it.

### `POST /auth/login`

Unauthenticated. Body: `{"username": "...", "password": "..."}`. Returns `{"access_token": "...", "user": {"id": 1, "username": "...", "is_admin": false}}` (token valid 8 hours) on success, `401` on bad credentials.

> Every route below requires `Authorization: Bearer <access_token>` and returns `401` without it.

### `GET /assets?page=1&per_page=20`

Paginated asset list for the Overview page: `id`, `name`, `location`, and `is_owner` per asset (`true` when the logged-in user's username matches that asset's `owner` field). Assets owned by the logged-in user are sorted to the front of the *entire* list (across pages), alphabetically within each group — not just within a single page — so paging/scrolling through page 1, 2, 3... surfaces every owned asset before any non-owned one. `per_page` is capped at 200 to keep responses bounded. User info isn't repeated here — it's returned once, at login/register (see above).

```json
{
  "assets": [{"id": 1, "name": "Kingchester Fan Motor", "location": "Mackport, Jordan", "is_owner": false}],
  "page": 1,
  "per_page": 20,
  "total": 200,
  "total_pages": 10
}

```

### `GET /assets/<id>`

Full detail for one asset: `id`, `name`, `description`, `location`, `created_at`, `owner`, `is_owner` (same check as the list endpoint), and `sensor_metrics` — a time series per metric (`vibration_velocity`, `winding_temperature`, `current_draw`), each with `unit` and an ordered list of `{timestamp, value}` readings, ready to hand to a charting library. 404s if the asset doesn't exist.

### `PATCH /assets/<id>`

Updates `name`, `description`, and/or `location` — the fields the spec calls out as editable. Any other field in the body is rejected with `400` rather than silently ignored, an empty `name` is rejected, and each field is capped at its column's max length (`name`/`location` 200 characters, `description` 1000) with `400` if exceeded. Restricted to the asset's owner: `403` if the logged-in user's username doesn't match the asset's `owner` field (see `is_owner` above — same check, enforced here) *and* the logged-in user isn't an admin. Returns the full updated asset (same shape as `GET /assets/<id>`).

**Admins** (`is_admin: true`) bypass the ownership check entirely — they can `PATCH` any asset, owned or unowned, and may additionally set `owner` in the body to a username string (reassigning the asset) or `null` (unassigning it). `owner` is rejected with `400` for non-admins, same as any other unsupported field; for admins, an unknown `owner` username is also `400`.

---

## Data model

```text
User 1 ──< MotorAsset (owner_id) ──< SensorReading

```

* **User** — `id`, `username`, `password_hash`, `is_admin`, `created_at`. Used for authentication (any user can log in and see every asset — see the design decisions below) *and* as the target of `MotorAsset.owner_id`. `is_admin` (default `false`) grants superuser access: an admin can edit any asset and reassign its owner, bypassing the normal ownership check (see [Design decisions](https://www.google.com/search?q=%23design-decisions)).
* **MotorAsset** — `id`, `name`, `description`, `location`, `created_at`, `owner_id` (nullable FK to `users.id`). The API still exposes `owner` as a plain username string in JSON (`asset.owner.username if asset.owner else None`) — the FK is an internal representation change, not an API contract change (see [Design decisions](https://www.google.com/search?q=%23design-decisions)).
* **SensorReading** — `asset_id`, `metric`, `timestamp`, `unit`, `value`. Composite primary key `(asset_id, metric, timestamp)`, no surrogate `id` (see below).

---

## Design decisions

* **`uv` instead of `pip`.** `uv sync --frozen` installs straight from `uv.lock`, so the container and local dev get the exact same dependency versions instead of whatever `pip install -r requirements.txt` happens to resolve at build time. It's also faster, and `uv run ...` replaces manually activating a virtualenv for scripts, tests, and migrations.

* **Flasgger for API docs.** Routes are plain Flask view functions, not class-based resources, so Flasgger's approach, a YAML block in each view's docstring, auto-collected into an OpenAPI spec at `/apidocs`, documents the existing code as-is. flask-restx/flask-smorest offer more (schema validation, serialization) but would mean restructuring every route around their `Resource` classes, not worth it for six routes total.

* **Blueprints and a matching folder structure, not one flat `app.py`.** `app/user/` (`/auth/*`) and `app/asset/` (`/assets/*`) are separate blueprint packages, each split further into `models.py`, `routes.py`, and (for `user/`) `auth.py`, instead of one growing file. `app/blueprints.py` centralizes registration (`register_blueprints(app)`) so the factory in `app/__init__.py` doesn't need to know about every blueprint directly, and `run.py` is the one canonical entrypoint (`flask --app run`, `gunicorn run:app`) that imports the factory's app rather than building one itself.

* **SQLAlchemy for the ORM, Alembic (via Flask-Migrate) for schema history.** `db.create_all()` is gone: once there's real accumulated data (users, historical sensor readings), blowing away and recreating tables on every start isn't acceptable. `flask db migrate`/`flask db upgrade` give incremental, reversible migrations in `migrations/versions/`, and `seed.py` only deletes/reinserts rows now, it never touches table structure.

* **JWT bearer tokens, an `is_admin` superuser flag, and admin bypassing ownership on the same routes.** This is a pure JSON API with no server-rendered pages, so there's nothing to attach a session cookie to; `POST /auth/login` issues a short-lived (8h) signed token and every other route is wrapped in `@jwt_required()`. Self-registration is open to anyone, no invite flow, but every self-registered account starts as a regular user: there's no field in the request body that could set `is_admin`, only seeding or a direct DB update can. `is_admin` is a real boolean column rather than a hardcoded `username == "admin"` check, and `update_asset()` checks it before the ownership check, skipping that check entirely when true, so admins reuse the exact same endpoint, validation, and response shape as everyone else instead of a parallel `/admin/...` route.

* **Input validation happens before anything reaches the database, not after.** `POST /auth/register` requires a username of 80 characters or fewer and a password of at least 8 characters with a lowercase letter, an uppercase letter, a number, and a symbol, returning the first rule that failed so the caller knows exactly what to fix. `PATCH /assets/<id>` rejects unknown fields instead of silently ignoring them, rejects an empty `name`, and caps `name`/`location`/`description` at their column's max length, all as a clean `400` instead of an uncaught database error. `User.set_password()` itself enforces none of this, since `seed.py` and test fixtures need to set arbitrary passwords directly; the rule only applies at the API boundary.

* **TimescaleDB for the sensor time series, not a plain table.** `sensor_readings` is a hypertable, partitioned on `timestamp`, which is what `SensorReading`'s composite primary key `(asset_id, metric, timestamp)` is for: TimescaleDB requires the partitioning column in every unique index, so there's no separate surrogate `id`. The hypertable is created inside the initial migration wrapped in a `SAVEPOINT`; if the TimescaleDB extension isn't installed on the Postgres server, that inner savepoint rolls back and the migration continues with a plain table instead of failing outright, so the same migration works against a full TimescaleDB instance or a stock Postgres install used for local dev.

* **Pagination via `Flask-SQLAlchemy`'s built-in `.paginate()`**, rather than manual `LIMIT`/`OFFSET`, with `per_page` clamped to 200 so a client can't force-load the entire table in one response even though there are only 200 rows today.

* **A global `app.errorhandler(HTTPException)` turns every `abort(...)` into `{"error": "<description>"}` JSON.** Flask's default behavior for `abort(400/403/404)` is an HTML error page, wrong for a JSON API. This was invisible until the frontend needed to show the real `Unknown owner username: '...'` message on an admin owner-reassignment: without this handler, `err.error.error` read `undefined` off an unparsed HTML body. Registered once in `create_app()`, so it covers every `abort()` call, and it deliberately leaves Flask-JWT-Extended's own `401` responses alone, since those come from its own callback hooks, not an `HTTPException`.

* **Unit tests run against in-memory SQLite, not the real Postgres/TimescaleDB instance.** Nothing in `tests/` depends on TimescaleDB's hypertable behavior, that's covered separately by manual verification against a real instance, so SQLite in-memory keeps the suite fast (63 tests in ~4s) with no running database required and no risk of touching the dev database's real seeded data. `create_app()` takes an optional `config_object` specifically so tests can pass `TestConfig`, and `TestConfig` sets SQLAlchemy's `StaticPool`, required for SQLite's `:memory:` mode so a request handler's queries and the test's own setup hit the same in-memory database rather than two separate ones.

---

## Automated tests

```bash
uv run pytest

```

63 tests in `tests/`, covering:

* `test_auth.py` — register/login: success, validation (missing fields, username too long, each password complexity rule checked individually), duplicate username, wrong credentials, password actually hashed.
* `test_models.py` — `User` password hashing, `MotorAsset.is_owned_by()` in every combination (matching/non-matching username, no owner, no current user), `to_summary_dict`/`to_detail_dict` shape and field leakage (summary never includes `description`/`owner`), sensor metric grouping/ordering.
* `test_assets_list.py` — pagination shape, `per_page` capping/paging, `is_owner` per viewer, and the owned-assets-sort-first-across-all-pages behavior.
* `test_assets_detail.py` — 404, response shape, `is_owner`/`owner` per viewer, sensor metrics included.
* `test_assets_update.py` — owner can update, non-owner gets `403` *and* the change is verified not to have applied, an unassigned-owner asset is unupdatable by anyone, unknown-field/empty-name/over-max-length validation for `name`/`description`/`location`, partial updates leave other fields alone, plus admin coverage: admin can edit an asset owned by someone else, admin can edit an unowned asset, admin can reassign `owner` to another username, admin can unset `owner` (`null`), reassigning to an unknown username is `400`, and a non-admin non-owner sending `owner` still gets `403` (ownership is checked before field validation).
* `test_health.py` — trivial liveness checks.

Run against an in-memory SQLite database (`TestConfig` in `config.py`), not the real Postgres instance — see [Design decisions](https://www.google.com/search?q=%23design-decisions) for why, and for how `create_app()` supports swapping configs at all.

---

## Manual testing notes

There's no local Postgres/TimescaleDB in every dev environment, so the app also runs against SQLite (`DATABASE_URL=sqlite:///path/to/file.db`) for quick smoke tests — the hypertable savepoint in the initial migration catches the SQLite syntax error the same way it catches "extension not found" on Postgres. That's good enough to validate routes, auth, pagination, and JSON shapes, but doesn't exercise real hypertable partitioning/extension behavior — verify that against a real TimescaleDB instance (`docker compose -f docker/docker-compose.yml up -d`) before relying on it. This was all verified end-to-end during development against a real local Postgres 16 install as well (login, protected routes, 401s, migrations, and TimescaleDB's graceful fallback when the extension isn't present).
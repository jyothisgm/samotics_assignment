# Backend

A lightweight Flask + SQLAlchemy JSON API for managing Motor Assets — electrical motors
fitted with high-frequency sensors — on behalf of an industrial client. Backs two
conceptual pages: an **Asset Overview** (paginated list) and an **Asset Detail** view
(full record + sensor time series, with limited editing). Endpoints are protected by
JWT auth; there's still no frontend yet, the API is meant to be consumed directly (e.g.
via `curl` or a future SPA).

## Stack

- **Flask 3** — [run.py](run.py) is the entrypoint (`app = create_app()`); the factory
  itself lives in [app/\_\_init\_\_.py](app/__init__.py) and does nothing but wire up
  extensions/Swagger/blueprints plus `/health`. The actual routes/models live in two
  blueprint packages, `app/user/` (`/auth/*`) and `app/asset/` (`/assets/*`), each split
  into `models.py` + `routes.py` (and `auth.py` for `user/`); `app/blueprints.py`
  centralizes registering both.
- **Flask-SQLAlchemy** — the ORM.
- **Flask-Migrate / Alembic** — schema migrations. `db.create_all()` is gone; the schema
  lives in [migrations/versions/](migrations/versions/) and is applied with
  `flask db upgrade`.
- **Flask-JWT-Extended** — stateless bearer-token auth. `POST /auth/login` issues a
  token; every other `/assets` route requires `Authorization: Bearer <token>`.
- **Flasgger** — generates Swagger/OpenAPI docs from YAML docstrings on each route;
  serves interactive docs at `/apidocs`.
- **PostgreSQL + TimescaleDB** — Postgres for the relational data (assets, users),
  TimescaleDB's hypertable extension for the sensor readings, which are pure
  append-only time series.
- **psycopg2** — the sync Postgres driver SQLAlchemy uses.
- **Faker** — generates realistic-looking seed data for the 200 demo assets.
- **uv** — dependency management and running scripts (`uv run ...`), and the base image
  for the Docker build.
- **Gunicorn** — WSGI server the container runs in place of `flask run`'s dev server.

## Project layout

```
run.py                    Entrypoint: app = create_app() (used by `flask --app run`, gunicorn)
app/
  __init__.py             create_app() factory only: extensions, Swagger, blueprints, /health
  extensions.py           Shared db = SQLAlchemy(), migrate = Migrate(), utcnow() helper
  blueprints.py           register_blueprints(app) — the one place both blueprints get wired in
  user/
    __init__.py           empty — everything below is imported by submodule, not re-exported here
    models.py             User model (password hashing, to_dict())
    auth.py               Token issuance + current_user()/current_username() JWT helpers
    routes.py              users_bp: /auth/login, /auth/register
  asset/
    __init__.py           empty
    models.py             MotorAsset, SensorReading models
    routes.py              assets_bp: /assets list/detail/update
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

## Setup — Docker (whole stack)

The fastest path: this builds the app image and starts it alongside Postgres.

```
docker compose -f docker/docker-compose.yml up -d --build
```

Then apply migrations and seed data inside the running container:

```
docker compose -f docker/docker-compose.yml exec web flask --app run db upgrade
docker compose -f docker/docker-compose.yml exec web python scripts/seed.py
```

The app is now at `http://localhost:5000` (docs at `/apidocs`). `web`'s `DATABASE_URL`
and `JWT_SECRET_KEY` are set directly in `docker/docker-compose.yml`, pointing at the
`db` service by its Compose network name — no `.env` needed for this path.

## Setup — local (uv)

Useful for iterating on the app without rebuilding a container each time.

1. Start a Postgres instance with the TimescaleDB extension available:

   ```
   docker compose -f docker/docker-compose.yml up -d db
   ```

   (or point `DATABASE_URL` at your own Postgres — TimescaleDB is optional, see
   [Design decisions](#design-decisions).)

2. Copy `.env.example` to `.env` and adjust `DATABASE_URL` / `JWT_SECRET_KEY` if needed.
   The default `DATABASE_URL` (`postgresql+psycopg2://postgres:postgres@localhost:5432/backend`)
   matches the compose file above.
3. Install dependencies:

   ```
   uv sync
   ```

4. Apply migrations to create the schema:

   ```
   uv run flask --app run db upgrade
   ```

5. Seed the database (3 users, 200 motor assets distributed across the two owner
   accounts, ~3 sensor metrics each):

   ```
   uv run python scripts/seed.py
   ```

   Seeds exactly three accounts: `Admin123@` (password `Password123@`, override via
   `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars, seeded with `is_admin=True`), and two
   fixed asset owners — `samotics` and `jyothis` — both password `Password123@`
   (override via `OWNER_PASSWORD`), that the 200 assets are randomly split across. Log
   in as either owner to see `is_owner` and asset editing work for real, or as the
   admin account to edit/reassign any asset regardless of ownership.

6. Run the app:

   ```
   uv run flask --app run run --debug
   ```

7. Browse the interactive API docs at `http://127.0.0.1:5000/apidocs` — click
   **Authorize** and paste `Bearer <token>` (from `/auth/login` or `/auth/register`) to
   try the protected routes directly from the browser. The raw OpenAPI spec is at
   `/apispec_1.json`.

### Making schema changes

Edit `app/asset/models.py` or `app/user/models.py`, then generate and apply a new
migration:

```
uv run flask --app run db migrate -m "describe the change"
uv run flask --app run db upgrade
```

## API

### `GET /health`
Liveness check, unauthenticated. `{"status": "ok"}`.

### `POST /auth/register`
Unauthenticated. Body: `{"username": "...", "password": "..."}`. `username` must be
80 characters or fewer; `password` must be at least 8 characters and include a
lowercase letter, an uppercase letter, a number, and a symbol. Creates a `User` and
returns
`{"access_token": "...", "user": {"id": 1, "username": "...", "is_admin": false}}` with
`201`. `400` if username/password are missing, the username is too long, or the
password fails any of the complexity rules; `409` if the username is already taken.
Self-registered accounts are never admins — `is_admin` can only be set by seeding or a
direct DB update, there's no API surface for granting it.

### `POST /auth/login`
Unauthenticated. Body: `{"username": "...", "password": "..."}`. Returns
`{"access_token": "...", "user": {"id": 1, "username": "...", "is_admin": false}}`
(token valid 8 hours) on success, `401` on bad credentials.

Every route below requires `Authorization: Bearer <access_token>` and returns `401`
without it.

### `GET /assets?page=1&per_page=20`
Paginated asset list for the Overview page: `id`, `name`, `location`, and `is_owner`
per asset (`true` when the logged-in user's username matches that asset's `owner`
field). Assets owned by the logged-in user are sorted to the front of the *entire*
list (across pages), alphabetically within each group — not just within a single
page — so paging/scrolling through page 1, 2, 3... surfaces every owned asset before
any non-owned one. `per_page` is capped at 200 to keep responses bounded. User info
isn't repeated here — it's returned once, at login/register (see above).

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
Full detail for one asset: `id`, `name`, `description`, `location`, `created_at`,
`owner`, `is_owner` (same check as the list endpoint), and `sensor_metrics` — a time
series per metric (`vibration_velocity`, `winding_temperature`, `current_draw`), each
with `unit` and an ordered list of `{timestamp, value}` readings, ready to hand to a
charting library. 404s if the asset doesn't exist.

### `PATCH /assets/<id>`
Updates `name`, `description`, and/or `location` — the fields the spec calls out as
editable. Any other field in the body is rejected with `400` rather than silently
ignored, an empty `name` is rejected, and each field is capped at its column's max
length (`name`/`location` 200 characters, `description` 1000) with `400` if exceeded.
Restricted to the asset's owner: `403` if the
logged-in user's username doesn't match the asset's `owner` field (see `is_owner`
above — same check, enforced here) *and* the logged-in user isn't an admin. Returns the
full updated asset (same shape as `GET /assets/<id>`).

**Admins** (`is_admin: true`) bypass the ownership check entirely — they can `PATCH` any
asset, owned or unowned, and may additionally set `owner` in the body to a username
string (reassigning the asset) or `null` (unassigning it). `owner` is rejected with
`400` for non-admins, same as any other unsupported field; for admins, an unknown
`owner` username is also `400`.

## Data model

```
User 1 ──< MotorAsset (owner_id) ──< SensorReading
```

- **User** — `id`, `username`, `password_hash`, `is_admin`, `created_at`. Used for
  authentication (any user can log in and see every asset — see the design decisions
  below) *and* as the target of `MotorAsset.owner_id`. `is_admin` (default `false`)
  grants superuser access: an admin can edit any asset and reassign its owner, bypassing
  the normal ownership check (see [Design decisions](#design-decisions)).
- **MotorAsset** — `id`, `name`, `description`, `location`, `created_at`,
  `owner_id` (nullable FK to `users.id`). The API still exposes `owner` as a plain
  username string in JSON (`asset.owner.username if asset.owner else None`) — the FK
  is an internal representation change, not an API contract change (see
  [Design decisions](#design-decisions)).
- **SensorReading** — `asset_id`, `metric`, `timestamp`, `unit`, `value`. Composite
  primary key `(asset_id, metric, timestamp)`, no surrogate `id` (see below).

## Design decisions

**`uv`'s official base image, not a manual `pip install`.** The `Dockerfile` starts
from `ghcr.io/astral-sh/uv:python3.12-bookworm-slim`, which ships `uv` preinstalled, so
the container build uses the exact same lockfile-driven install (`uv sync --frozen`)
as local dev instead of a second, drifting dependency-install path. Dependency layers
(`COPY pyproject.toml uv.lock` + `uv sync --no-install-project`) are copied and
installed before the app code so `docker compose build` doesn't reinstall every
dependency on every code change — only on lockfile changes.

**Migrations run from the container's entrypoint (`docker-entrypoint.sh`), not baked
into the image at build time.** `flask db upgrade` runs against whatever `DATABASE_URL`
the container is started with, every time it starts, before `gunicorn` takes over via
`exec`. That keeps the same image usable against any environment's database — schema
is brought up to date on boot rather than assumed frozen at build time.

**Gunicorn instead of `flask run` inside the container.** The Flask dev server used for
local iteration explicitly warns it's not for this; the container swaps it for Gunicorn
with no other code changes, since `run.py` already exposes a plain `app = create_app()`
module-level object for a WSGI server to import.

**Two Compose services, one file.** `db` (Postgres+TimescaleDB) and `web` (this app,
built from the `Dockerfile`) live in the same `docker-compose.yml` with `web` waiting on
`db`'s healthcheck, since the API is unusable without its database and there's no
reason to coordinate them by hand. Local (non-Docker) development still just needs
`docker compose -f docker/docker-compose.yml up -d db` — the `web` service is additive,
not a replacement for the `uv run flask` workflow.

**Flasgger (docstring-driven) over flask-restx/flask-smorest for API docs.** The routes
are plain Flask view functions, not class-based resources, so Flasgger's approach —
a YAML block in each view's docstring, auto-collected into an OpenAPI spec — documents
the existing code as-is. flask-restx/flask-smorest are more powerful (schema validation,
serialization) but would mean restructuring every route around their `Resource`/
`Blueprint` classes; not worth it for four data routes plus two auth routes.

**`run.py` as the sole entrypoint, `app/__init__.py` as nothing but the factory.**
`run.py` is what `flask --app run`, `gunicorn run:app`, and `python run.py` all target —
one canonical "start here" file. `app/__init__.py` only builds and configures the Flask
app (extensions, Swagger, blueprints, `/health`); it doesn't instantiate `app = ...`
itself, so importing the package never has the side effect of building a live app —
only calling `create_app()` does, which is what both `run.py` and the pytest fixtures do
independently with different configs.

**`app/blueprints.py` centralizes registration instead of `app/__init__.py` importing
both blueprints directly.** `register_blueprints(app)` is the one place that knows about
every blueprint that exists; the factory just calls it. Adding a third blueprint later is
a one-line addition to `blueprints.py`, not a change to the factory itself.

**Separate `app/asset`/`app/user` blueprint packages, each split by concern rather than
one flat file per blueprint.** `app/user/models.py` (the `User` model), `app/user/auth.py`
(token issuance + the `current_user()`/`current_username()` JWT helpers), and
`app/user/routes.py` (`users_bp`, `url_prefix="/auth"`, the register/login views) are
three separate modules instead of one growing `users.py`; `app/asset/models.py`
(`MotorAsset`, `SensorReading`) and `app/asset/routes.py` (`assets_bp`,
`url_prefix="/assets"`) mirror that split on the asset side. `__init__.py` in both
packages is empty — every import goes to the specific submodule
(`from app.user.models import User`, `from app.asset.routes import assets_bp`, etc.) so
it's always obvious which file a name came from. Auth-checking helpers
(`current_user()`/`current_username()`) live in `app/user/auth.py` rather than
duplicated in or imported oddly from the asset package, since resolving "who is the
logged-in user" from a JWT is fundamentally a user-domain concern even though only asset
routes call it today.

**JWT bearer tokens over sessions.** This is a pure JSON API with no server-rendered
pages, so there's nothing to attach a session cookie to. `POST /auth/login`
(`app/user/routes.py`, via `issue_token()` in `app/user/auth.py`) verifies the password
against
`User.password_hash` (Werkzeug's `generate_password_hash`/`check_password_hash`,
scrypt-backed) and returns a short-lived (8h) signed token; every other route is wrapped
in `@jwt_required()`. `JWT_SECRET_KEY` must be overridden via env var for anything beyond
local dev — the `config.py` default is intentionally an obvious placeholder.

**`MotorAsset.owner_id` is a real FK to `users.id`**, not the plain-string
username-matching this started as. `is_owner` (used by both `GET /assets` and `GET
/assets/<id>`, plus the `PATCH` guard below) now lives as `MotorAsset.is_owned_by()`
on the model — `self.owner is not None and self.owner.username == current_username` —
rather than a string comparison against free text. Seeded owner logins (`samotics`,
`jyothis`, password `Password123@` — see Setup) are real accounts, so ownership can
actually be tested by logging in as a real owner rather than needing to separately
register an account with a matching name. `owner_id` stays nullable: an asset without
an assigned owner is a valid state (nobody can edit it, which is the correct default,
not an error case to work around).

**`PATCH /assets/<id>` enforces the same ownership check as a hard `403`, not just a
UI hint.** The frontend uses `is_owner` to decide whether to even show an edit
affordance, but leaving the write path open to anyone with a valid token would make
that decorative rather than a real permission — the backend re-checks independently of
whatever the client showed. The username-resolution part (`current_username()`/
`current_user()` in `app/user/auth.py`) is a small pair of shared helpers, not
copy-pasted — used by all three asset routes (`list_assets`, `get_asset`,
`update_asset`), which is the
point where duplicating it inline stopped being the simpler option.

**Owned-first ordering resolves the current user once (`current_user()`), not
per-row.** `GET /assets` needs the logged-in user's id to build the `ORDER BY
(owner_id = :id) DESC, name` clause *before* the query runs, whereas the other two
routes only need the username *after* fetching a specific asset — hence two thin
helpers (`current_user()` returning the full `User`, `current_username()` wrapping it)
instead of one, so each call site fetches only what it needs.

**Self-registration is open — anyone with a username/password can create an account.**
There's no invite flow or admin approval in the spec, so `POST /auth/register` doesn't
gate account creation beyond "username not already taken," a username length cap, and
the password rule below. `seed.py` still seeds one admin user (credentials overridable
via `ADMIN_USERNAME`/`ADMIN_PASSWORD`) so there's always a known account to log in
with, but it's no longer the only way to get one. Every self-registered account starts
as a regular (non-admin) user — there's no field in the request body that could set
`is_admin`.

**Password complexity is enforced once, in `validate_password()` (`app/user/auth.py`),
not scattered across the route.** `POST /auth/register` requires at least 8 characters
with a lowercase letter, an uppercase letter, a number, and a symbol, returning the
first rule that failed rather than a generic rejection — a user finds out *why* their
password was rejected in one round trip instead of guessing. It only applies at
registration; `User.set_password()` itself has no opinion on password strength, since
`seed.py` and test fixtures need to set arbitrary passwords without going through the
API. `POST /auth/login` doesn't enforce it either — a login has to accept whatever
password an account already has, not whatever the current rule happens to require.

**Alembic (via Flask-Migrate) instead of `db.create_all()`.** Once there's a login flow
and real accumulated data (users, historical sensor readings), blowing away and
recreating tables on every start is no longer acceptable — schema changes need to be
incremental and reversible. `flask db migrate` / `flask db upgrade` replace
`db.create_all()`; `seed.py` now only deletes/reinserts *rows*, never touches table
structure.

**TimescaleDB hypertable setup lives inside the initial migration**, not app startup
code. `migrations/versions/..._initial_schema.py` runs
`CREATE EXTENSION IF NOT EXISTS timescaledb` and `create_hypertable(...)` right after
creating `sensor_readings`, wrapped in a `SAVEPOINT` (`connection.begin_nested()`): if
the extension isn't installed on the Postgres server, that inner savepoint rolls back
and the migration continues with `sensor_readings` as a plain table instead of failing
outright. This means the same migration works unmodified on a full TimescaleDB instance
and on a stock Postgres install used for local dev (verified against both).

**Composite primary key on `SensorReading`, not a surrogate `id`.** TimescaleDB requires
the partitioning column (`timestamp`) to be part of every unique index, including the
primary key. Rather than fight that with an `id` + separate unique constraint, the
natural key `(asset_id, metric, timestamp)` *is* the primary key — it also happens to be
exactly how the data is queried (readings for one asset, one metric, ordered by time),
so it doubles as the useful index.

**One row per (asset, metric, timestamp) rather than wide rows.** A narrow/long schema
(one value per row per metric) instead of one row per timestamp with a column per metric
means new metrics don't require a migration, and it's the shape Timescale/time-series
tooling expects.

**`seed.py` deletes rows, not tables.** Now that schema is Alembic's responsibility,
reseeding is `DELETE` in FK-safe order (`SensorReading` → `MotorAsset` → `User`)
followed by fresh inserts, rather than `drop_all()`/`create_all()`.

**Two fixed owner accounts (`samotics`, `jyothis`), not a generated pool.** `seed.py`
originally drew a random pool of Faker-named owners; that's gone in favor of two named,
predictable accounts so the demo credentials are always the same across reseeds rather
than changing every run. Assigning each of the 200 assets to one of only two owners
means each ends up with roughly half — enough to exercise `is_owner` being `true`
across *many* rows in the list for the same logged-in user, not just a single asset.
All three seeded accounts (the admin plus the two owners) share the password
`Password123@` since they're fixture data, not real accounts someone chose a password
for — it still has to satisfy the same complexity rule as any other account, seeding
bypasses `POST /auth/register` but not what a real password looks like.

**Pagination via `Flask-SQLAlchemy`'s built-in `.paginate()`** rather than manual
`LIMIT`/`OFFSET`, and `per_page` is clamped to 200 so a client can't force-load the
entire table in one response even though there are only 200 rows today.

**`PATCH` rejects unknown fields instead of ignoring them.** The spec is explicit that
only `name`/`description`/`location` are editable; silently dropping `owner` or
`created_at` from a request body would hide a client bug, so it's a `400` instead.

**`is_admin` is a boolean column, not a hardcoded username check.** A real (nullable
never, default-`false`) field on `User` rather than special-casing `username == "admin"`
in code: promoting a second account, or renaming/removing the seeded `admin` account,
is a data change instead of a code change. There's no API endpoint to set it — only
`seed.py` and direct DB access can, since granting superuser access isn't something the
spec calls for exposing over HTTP.

**Admin bypasses ownership on `PATCH /assets/<id>` rather than a separate admin-only
route.** `update_asset()` checks `is_admin` before the existing `is_owned_by()` check
and skips it entirely when true, so admins reuse the same endpoint, same validation,
and same response shape non-admins get — no parallel `/admin/assets/<id>` route with
its own copy of the field-validation logic to keep in sync. The one behavioral
difference (an extra `owner` field, admin-only) is additive: `ADMIN_ONLY_FIELDS` is
unioned into the allowed set only when `is_admin` is true, so a non-admin sending
`owner` gets the same `400 Unsupported field(s)` as any other unrecognized field,
rather than a separate code path.

**Reassigning `owner` takes a username, not a raw `owner_id`.** Every other place the
API exposes ownership (`GET /assets`, `GET /assets/<id>`) uses the owner's username as
a plain string, never their numeric id — so accepting `owner_id` on `PATCH` would leak
an internal detail the rest of the API deliberately hides. An unknown username is a
`400`, same class of error as any other bad input in this endpoint, not a `404` (the
asset being patched does exist; it's the *target owner* that doesn't).

**A global `app.errorhandler(HTTPException)` turns every `abort(...)` into
`{"error": "<description>"}` JSON.** Flask's default behavior for `abort(400/403/404)`
is an HTML error page — fine for a server-rendered site, wrong for "a lightweight...
JSON API" (see the top of this README). That mismatch was latent until the frontend's
admin-owner-reassignment error handling needed to actually show the real
`Unknown owner username: '...'` message: without this handler, the frontend's
`err.error.error` read `undefined` off an unparsed HTML body and silently fell back to
a generic "Failed to save changes." The handler is registered once in `create_app()`,
so it covers every existing and future `abort()` call — not just this one route — and
deliberately doesn't touch Flask-JWT-Extended's own `401` responses (`{"msg": "..."}`),
which it generates through its own callback hooks rather than raising an
`HTTPException`, so they're unaffected.

**`/auth/login` and `/auth/register` return the logged-in user's own
`{id, username, is_admin}`

**Tests run against in-memory SQLite, not the real Postgres/TimescaleDB instance.**
The test suite exercises application logic — routing, auth, validation, ownership,
serialization — none of which is Postgres-specific; nothing in `tests/` depends on
TimescaleDB's hypertable behavior (that's covered by manual verification against a
real instance, see below). SQLite in-memory means the suite needs no running database
at all and is fast (63 tests in ~4s) and fully isolated from the dev database's real
seeded data. `create_app()` takes an optional `config_object` parameter (defaulting to
`Config`) specifically so tests can pass `TestConfig` instead — a fresh Flask app +
in-memory SQLite database is created and torn down per test via a fixture, so tests
can't leak state into each other. `TestConfig` sets SQLAlchemy's `StaticPool`, which
is required for SQLite's `:memory:` mode: without it, each new connection opens its
own separate empty database, so a request handler's queries and the test's setup
would silently be looking at two different databases.

**Fixtures build rows directly via the ORM (`make_user`, `make_asset`, ...), not
through the API.** A test for `PATCH /assets/<id>` shouldn't also depend on
`POST /auth/register` working — that's what `test_auth.py` already verifies
independently. Auth tokens are minted directly with
`flask_jwt_extended.create_access_token()` in the `auth_header` fixture rather than by
calling `/auth/login`, for the same reason: route tests assume login works (proven
elsewhere) instead of re-proving it on every request.

## Automated tests

```
uv run pytest
```

63 tests in `tests/`, covering:

- `test_auth.py` — register/login: success, validation (missing fields, username too
  long, each password complexity rule checked individually), duplicate username, wrong
  credentials, password actually hashed.
- `test_models.py` — `User` password hashing, `MotorAsset.is_owned_by()` in every
  combination (matching/non-matching username, no owner, no current user),
  `to_summary_dict`/`to_detail_dict` shape and field leakage (summary never includes
  `description`/`owner`), sensor metric grouping/ordering.
- `test_assets_list.py` — pagination shape, `per_page` capping/paging, `is_owner` per
  viewer, and the owned-assets-sort-first-across-all-pages behavior.
- `test_assets_detail.py` — 404, response shape, `is_owner`/`owner` per viewer, sensor
  metrics included.
- `test_assets_update.py` — owner can update, non-owner gets `403` *and* the change is
  verified not to have applied, an unassigned-owner asset is unupdatable by anyone,
  unknown-field/empty-name/over-max-length validation for `name`/`description`/
  `location`, partial updates leave other fields alone, plus admin coverage: admin can
  edit an asset owned by someone else, admin can edit an unowned asset, admin can
  reassign `owner` to another username, admin can unset `owner` (`null`), reassigning
  to an unknown username is `400`, and a non-admin non-owner sending `owner` still gets
  `403` (ownership is checked before field validation).
- `test_health.py` — trivial liveness checks.

Run against an in-memory SQLite database (`TestConfig` in `config.py`), not the real
Postgres instance — see [Design decisions](#design-decisions) for why, and for how
`create_app()` supports swapping configs at all.

## Manual testing notes

There's no local Postgres/TimescaleDB in every dev environment, so the app also runs
against SQLite (`DATABASE_URL=sqlite:///path/to/file.db`) for quick smoke tests — the
hypertable savepoint in the initial migration catches the SQLite syntax error the same
way it catches "extension not found" on Postgres. That's good enough to validate routes,
auth, pagination, and JSON shapes, but doesn't exercise real hypertable
partitioning/extension behavior — verify that against a real TimescaleDB instance
(`docker compose -f docker/docker-compose.yml up -d`) before relying on it. This was all
verified end-to-end during
development against a real local Postgres 16 install as well (login, protected routes,
401s, migrations, and TimescaleDB's graceful fallback when the extension isn't present).

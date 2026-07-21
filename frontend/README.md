# frontend

Angular 20 client for the Motor Asset Manager API ([backend/](../backend)). Standalone
components, signals, and the new `@if`/`@for` control-flow syntax throughout.

## Setup

1. Make sure the backend is running (`cd ../backend && uv run flask --app app run`) —
   it's expected at `http://127.0.0.1:5000`.
2. Install dependencies:

   ```
   npm install
   ```

3. Run the dev server:

   ```
   npm start
   ```

   This runs `ng serve --proxy-config proxy.conf.js`, which proxies `/auth`,
   `/assets`, and `/health` requests to the backend so the browser never makes a
   cross-origin request (see [Design decisions](#design-decisions)). Open
   `http://localhost:4200`.

4. Log in with a seeded account (`Admin123@`, `samotics`, or `jyothis`, all password
   `Password123@`), or use the **Register** tab to create a new one.

## What's here so far

- **Login / Register** (`src/app/pages/login`) — one page, a mode toggle between the
  two, backed by `POST /auth/login` and `POST /auth/register`. On success, the returned
  `access_token` and `user` (id/username) are saved to `localStorage` via `AuthService`
  and the user is routed to `/assets`.
- **Motor Assets list** (`src/app/pages/assets-list`) — infinite-scroll list of all
  motor assets (`GET /assets?page=&per_page=20`), loading the next page automatically
  as an `IntersectionObserver` sentinel at the bottom of the list comes into view.
  Rows the logged-in user owns are highlighted blue (with a blue "Owner" badge);
  everything else is grey. The backend sorts owned assets to the front of the entire
  list, so they appear together at the top rather than scattered across pages.
  Protected by `authGuard`; redirects to `/login` if there's no token.
- **Top bar** (`src/app/layout/top-bar`) — shows the logged-in user's name and ID
  (from `AuthService`, populated at login/register) plus a Log out action; rendered at
  the top of every authenticated page.
- **Asset Detail** (`src/app/pages/asset-detail`) — reached by clicking a row in the
  list (`routerLink="/assets/:id"`). Shows `id`, `name`, `description`, `location`,
  `owner`, `created_at`, and a small-multiples grid of sensor metric time series
  (`GET /assets/:id`). The Edit button (name/description/location, `PATCH
  /assets/:id`) only appears when the response's `is_owner` is `true`; everyone else
  sees a note naming the actual owner instead — see [Design decisions](#design-decisions).
- **Time series chart** (`src/app/shared/time-series-chart`) — a small hand-rolled SVG
  line chart (no charting library) reused once per sensor metric on the detail page.

## Project layout

```
src/app/
  core/
    auth/           AuthService (token + user persistence), authGuard, authInterceptor
    assets/         AssetsService, asset/page/detail models
  layout/
    top-bar/         User name/id + logout, shown on every authenticated page
  shared/
    time-series-chart/  Reusable single-series SVG line chart
  pages/
    login/           Combined login/register form
    assets-list/     Infinite-scroll asset list, links to the detail page
    asset-detail/    Fields + edit form + sensor metric charts for one asset
  app.routes.ts       /login (public), /assets, /assets/:id (guarded), catch-all -> /assets
  app.config.ts       Router + HttpClient(authInterceptor) providers
proxy.conf.js           Dev-server proxy to the Flask backend (JS, not JSON — see below)
```

## Automated tests

```
npm test -- --watch=false --browsers=ChromeHeadless
```

62 Jasmine specs run via Karma (Angular's default), covering:

- `auth.service.spec.ts` — login/register persist token + user to `localStorage` and
  update signals; logout clears everything; state restores correctly from
  `localStorage` on construction, including malformed stored JSON.
- `auth.guard.spec.ts` — allows navigation when authenticated, returns a `UrlTree` to
  `/login` otherwise.
- `auth.interceptor.spec.ts` — attaches `Authorization: Bearer <token>` only when a
  token exists; a `401` logs out and redirects; other error statuses don't.
- `assets.service.spec.ts` — verifies the exact method/URL/params/body `HttpClient`
  sends for all three endpoints.
- `time-series-chart.spec.ts` — the `computed()` chart math (point scaling, SVG path
  construction, min/max/latest) and template rendering, including the empty-readings
  and null-unit cases.
- `top-bar.spec.ts` — renders the username/id from a signal, hides them when there's no
  user, logout calls the service and navigates.
- `login.spec.ts` — mode-dependent password validation, submit blocked while invalid,
  correct service method called per mode, navigation on success, error message
  extraction (including the fallback when the server gives no detail).
- `assets-list.spec.ts` — a mocked `IntersectionObserver` drives the infinite-scroll
  logic deterministically: first-page load, ignoring a non-intersecting trigger, paging
  forward, stopping at `total_pages`, ignoring an overlapping trigger while a request
  is in flight, and disconnecting on destroy.
- `asset-detail.spec.ts` — loads by route id, load-error handling, `is_owner` gating
  `startEdit()` (not just the template), save success/403/other-error paths, invalid
  form is not submitted, cancel resets the form.

## Design decisions

**`/login` is public; everything else needs a token.**
`app.routes.ts` only guards `/assets` and `/assets/:id` with `canActivate: [authGuard]`; `/login` has no guard, since that's the one page you can reach without being authenticated yet. The catch-all and empty-path routes both redirect to `/assets`, which then bounces to `/login` via the guard if there's no token, so there's a single place deciding "logged in or not," not a check repeated on every page.

**User info is persisted from the login/register response.**
The token only encodes the user's id (`sub`), not the username. `AuthService` stores `access_token` and `user` as two separate `localStorage` keys and exposes them as signals (`token`, `user`, computed `isAuthenticated`), restored on page load so a refresh doesn't log the user out.

**Dev-server proxy instead of CORS on the backend.**
A proxy needs zero backend changes. `ng serve --proxy-config proxy.conf.js` forwards `/auth`, `/assets`, and `/health` to `http://127.0.0.1:5000` server-side, so from the browser's point of view every request is same-origin. `127.0.0.1` is used on purpose instead of `localhost`, since `localhost` can resolve to `::1` (IPv6) first depending on the machine, and something else may already be listening on that port over IPv6, silently swallowing every proxied request. A production build would still need a real CORS policy (or a reverse proxy) on the backend; this proxy only covers dev.

**Functional guard and interceptor, not class-based ones.**
Angular 20's `CanActivateFn` and `HttpInterceptorFn` are the current idiomatic form and skip an unnecessary `@Injectable` wrapper class for what's really just a function. `authInterceptor` attaches `Authorization: Bearer <token>` when present, and on any `401` clears the stored session and redirects to `/login`. That covers "never logged in" and "token expired mid-session" the same way.

**Jasmine/Karma for unit tests.**
Angular's own scaffolded Karma/Jasmine setup runs headless Chrome, which works fine here, and gives tests that are actually verified passing rather than trusted on faith.

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

**Dev-server proxy instead of CORS on the backend.**
A proxy needs zero backend changes. `ng serve --proxy-config proxy.conf.js` forwards
`/auth`, `/assets`, and `/health` to `http://127.0.0.1:5000` server-side, so from the
browser's point of view every request is same-origin.

`127.0.0.1` is used on purpose instead of `localhost`. On this machine `localhost`
resolves to `::1` first, and macOS's AirPlay Receiver was squatting on that port,
silently swallowing every proxied request. A production build would still need a real
CORS policy (or a reverse proxy) on the backend; this proxy only covers dev.

**The proxy is a `.js` file with a bypass, not a plain `.json` path map.**
The Angular route `/assets/:id` and the backend API path `/assets/:id` are the same
URL. `HttpClient` needs that URL proxied to Flask, but a real browser navigation to it
(typing it in, refreshing, opening a new tab) needs the SPA shell (`index.html`)
instead, or the app never boots and there's no router left to redirect anywhere.

`bypass` checks `Sec-Fetch-Mode`. Browsers set it to `navigate` on real page loads and
something else on `fetch`/`XHR`, so the request only reaches Flask when it isn't a
navigation. A plain JSON proxy config can't express that logic (no functions allowed),
which is why this is `proxy.conf.js` and not `proxy.conf.json`.

**User info is persisted from the login/register response, not decoded from the JWT.**
The token only encodes the user's id (`sub`), not the username. `AuthService` stores
`access_token` and `user` as two separate `localStorage` keys and exposes them as
signals (`token`, `user`, computed `isAuthenticated`), restored on page load so a
refresh doesn't log the user out.

An earlier version had a separate `Client` concept the top bar displayed alongside the
user. The backend dropped it since it was just static per-tenant display text with no
real relation to `MotorAsset`/`User`, so the top bar now shows the logged-in user's own
identity instead.

**Functional guard and interceptor, not class-based ones.**
Angular 20's `CanActivateFn` and `HttpInterceptorFn` are the current idiomatic form and
skip an unnecessary `@Injectable` wrapper class for what's really just a function.
`authInterceptor` attaches `Authorization: Bearer <token>` when present, and on any
`401` clears the stored session and redirects to `/login`. That covers "never logged
in" and "token expired mid-session" the same way.

**IntersectionObserver-driven infinite scroll, not a scroll event listener.**
A sentinel `<div>` sits after the list. Observing it, rather than computing scroll
position on every `scroll` event, means no manual throttling and no scroll math.

It's also what triggers the very first page load: the sentinel is visible in an empty
list on mount, so there's no separate "load page 1" path to keep in sync with "load
next page." The observer disconnects once `total_pages` is reached.

**Owned-asset ordering is a backend concern, not a client-side sort.**
The frontend renders whatever order `GET /assets` returns; it doesn't re-sort each
loaded page by `is_owner` itself. Sorting client-side per page would only group owned
assets within that page (20 at a time). It can't put every owned asset ahead of every
non-owned one across the whole paginated, infinite-scrolled list, since the client
never sees data beyond the current page and only the backend has that view. The
blue/grey highlight is just a visual reflection of `is_owner`, independent of ordering.

**Password validation is mode-dependent, not one fixed rule.**
Registering enforces the same complexity rule as the backend, at least 8 characters
with a lowercase letter, an uppercase letter, a number, and a symbol, via a single
`Validators.pattern()` on the password control. Login only requires non-empty, since a
login has to accept whatever password an account was created with, not whatever the
current registration rule happens to be.

**Hand-rolled SVG line chart, not a charting library.**
Three single-series time series of about 48 points each didn't justify a dependency
like Chart.js or ngx-charts. The whole thing is a `computed()` that maps readings to an
SVG path string.

Each metric gets its own card (small multiples) rather than one combined chart with
multiple y-axes, since the three metrics have unrelated units and scales. A shared axis
would either misrepresent the data or need a second y-axis, which is one of the more
common charting mistakes: it fabricates a correlation between two arbitrarily aligned
scales. One consistent accent color is used across all three charts rather than a
distinct hue per metric, since each is already its own titled card and nothing is
overlaid that a hue would need to disambiguate.

**The Edit button is gated on `is_owner` from the API response, not inferred
client-side.**
The frontend has no independent way to know who owns an asset. The JWT only encodes a
user id, and `owner` is free text with no relation to `User` (see the backend's design
decisions), so this needed the backend to actually say so.

`GET /assets/:id` didn't originally return `is_owner`, only the list endpoint did,
which meant the edit form had to be shown to everyone and rely on catching the `PATCH`
`403` after the fact. That gap was closed by adding `is_owner` to the detail response
too, mirroring the list endpoint. `startEdit()` in the component re-checks `is_owner`
before entering edit mode, not just the template hiding the button, so there's no path
to the form without it. The `403` handling on `save()` stays in place as a backstop for
things like acting on stale data. It shouldn't normally trigger anymore, but it still
fails visibly instead of silently if it does.

**Simplified chart hover, not a full crosshair layer.**
Each data point is a transparent hit circle with a native SVG `<title>` (browser
tooltip) showing its timestamp and value, rather than a custom crosshair and floating
tooltip synced across all three charts. That's a real reduction in interactivity
polish, done on purpose for scope: this is a single lightweight internal page, not a
monitoring dashboard.

**Jasmine/Karma for unit tests.**
Angular's own scaffolded Karma/Jasmine setup runs headless Chrome, which works fine
here, and gives tests that are actually verified passing rather than trusted on faith.

**`IntersectionObserver` is replaced with a hand-written fake in `assets-list.spec.ts`.**
The real API's firing depends on actual element geometry and visibility, which a
detached test fixture doesn't reliably reproduce. `FakeIntersectionObserver` is swapped
onto `window.IntersectionObserver` for the test, captures the callback, and exposes
`.trigger(isIntersecting)` instead, giving tests direct control over exactly when "the
sentinel is visible" fires, including edge cases like overlapping triggers while
loading, or a trigger after `hasMore` goes false, that would be flaky or unreachable
against a real observer.

**Every component test that renders `<app-top-bar />` needs `provideHttpClient()` and
`provideRouter([])`, even when the test has nothing to do with auth or routing.**
`TopBar` injects `AuthService` (which injects `HttpClient`) and `Router`. Omitting
either provider fails the whole component construction with a DI error, not a graceful
skip.

Provider order matters too. `provideRouter([])` registers its own `ActivatedRoute`, so
a test-specific `{ provide: ActivatedRoute, useValue: ... }` has to come after it in the
providers array, or the router's version wins and the route param the test set never
shows up. That's the exact ordering bug `asset-detail.spec.ts` hit and fixed.

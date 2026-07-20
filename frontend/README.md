# frontend

Angular 20 client for the Motor Asset Manager API ([backend/](../backend)). Standalone
components, signals, and the new `@if`/`@for` control-flow syntax throughout — no
NgModules.

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

4. Log in with a seeded account (`admin`, `samotics`, or `jyothis`, all password
   `password`), or use the **Register** tab to create a new one.

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

56 Jasmine specs run via Karma (Angular's default), covering:

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

**Dev-server proxy instead of CORS on the backend.** The backend is intentionally
paused for this frontend work, and a proxy needs zero backend changes: `ng serve
--proxy-config proxy.conf.js` forwards `/auth`, `/assets`, and `/health` to
`http://127.0.0.1:5000` server-side, so from the browser's point of view every request
is same-origin. `127.0.0.1` is used explicitly rather than `localhost` — on this machine
`localhost` resolves to `::1` first, which macOS's AirPlay Receiver was squatting on for
port 5000, silently swallowing every proxied request. A production build would need a
real CORS policy (or a reverse proxy) on the backend instead; this only covers dev.

**The proxy is a `.js` file with a `bypass`, not a plain `.json` path map.** The Angular
client route `/assets/:id` and the backend API path `/assets/:id` are the same URL —
Angular's `HttpClient` needs it proxied to Flask, but a real browser navigation to that
URL (typing it, refreshing, opening it in a new tab) needs the SPA shell (`index.html`)
instead, or the app never boots and there's no router left to redirect anywhere. `bypass`
checks `Sec-Fetch-Mode` — browsers set it to `navigate` on real page loads and something
else on `fetch`/`XHR` — and only lets the request through to Flask when it isn't a
navigation. A plain JSON proxy config can't express this (no functions allowed), which
is why it's `proxy.conf.js`.

**User info persisted from the login/register response, not decoded from the JWT.**
The token only encodes the user's id (`sub`), not the username. `AuthService` stores
`access_token` and `user` from the response body as two separate `localStorage` keys
and exposes them as signals (`token`, `user`, computed `isAuthenticated`), restored on
page load so a refresh doesn't log the user out. (Earlier this was a separate `Client`
concept the top bar displayed alongside the user; the backend dropped it since it was
just static per-tenant display text with no real relation to `MotorAsset`/`User` — the
top bar now shows the logged-in user's own identity instead.)

**Functional guard + interceptor, not class-based ones.** Angular 20's `CanActivateFn`/
`HttpInterceptorFn` are the current idiomatic form and avoid an unnecessary
`@Injectable` wrapper class for what's each a single function. `authInterceptor`
attaches `Authorization: Bearer <token>` when present and, on any `401` response, clears
the stored session and redirects to `/login` — covers both "never logged in" and "token
expired mid-session" the same way.

**IntersectionObserver-driven infinite scroll, not a scroll event listener.** A sentinel
`<div>` sits after the list; observing it (rather than computing scroll position on
every `scroll` event) means no manual throttling/debouncing and no scroll-math. It's
also what triggers the very first page load — the sentinel is visible in an empty list
on mount, so there's no separate "load page 1" code path to keep in sync with "load next
page." The observer disconnects once `total_pages` is reached.

**Owned-asset ordering is a backend concern, not a client-side sort.** The frontend
just renders whatever order `GET /assets` returns — it doesn't re-sort each loaded
page by `is_owner` itself. Sorting client-side per page would only group owned assets
*within* a page (20 at a time); it can't put every owned asset before every non-owned
one across the whole paginated/infinite-scrolled list without knowledge of data beyond
the current page, which only the backend has. The blue/grey highlight is purely a
visual reflection of `is_owner`, independent of that ordering.

**Password validation is mode-dependent, not a single fixed rule.** Registering enforces
a 6-character minimum in the UI (matching the backend), but login only requires
non-empty — the seeded `admin`/`admin` credentials are 5 characters, so a blanket
`minLength(6)` on the form would make the documented demo login impossible to submit.

**Hand-rolled SVG line chart, not a charting library.** Three single-series time series
of ~48 points each didn't justify a dependency (Chart.js/ngx-charts/etc.) — the whole
thing is a `computed()` that maps readings to an SVG path string. Each metric is its own
card (small multiples) rather than one combined chart with multiple y-axes, since the
three metrics have unrelated units/scales — a shared axis would either misrepresent the
data or need a second y-axis, which is the #1 charting anti-pattern (a fabricated
correlation between arbitrarily-aligned scales). One consistent accent color is used
across all three charts rather than a distinct hue per metric: each is already a
separate card with its own title, so color isn't doing any identity work here — nothing
is overlaid for a hue to disambiguate.

**The Edit button is gated on `is_owner` from the API response, not inferred
client-side.** The frontend has no independent way to know who owns an asset — the JWT
only encodes a user id, and `owner` is free text with no relation to `User` (see the
backend's design decisions) — so this needed the backend to actually say so. Initially
`GET /assets/:id` didn't return `is_owner` (only the list endpoint did), which meant the
edit form had to be shown to everyone and rely on catching the `PATCH` `403` after the
fact; that gap was closed by adding `is_owner` to the detail response too, mirroring the
list endpoint exactly. `startEdit()` in the component re-checks `is_owner` before
entering edit mode, not just the template hiding the button, so there's no path to the
form without it. The `403` handling on `save()` stays in place as defense-in-depth (e.g.
acting on stale data) — a `403` there is now something that should never normally
happen rather than the primary guard, but it still fails visibly instead of silently if
it does.

**Simplified chart hover, not a full crosshair layer.** Each data point is a transparent
hit circle with a native SVG `<title>` (browser tooltip) showing its timestamp and
value, rather than a custom synced crosshair + floating tooltip across all three charts.
That's a real reduction in interactivity polish, done deliberately for scope — this is a
single lightweight internal page, not a monitoring dashboard.

**Jasmine/Karma for unit tests, not Cypress.** Cypress was tried first (component
testing, since e2e was also wanted down the line) — installed cleanly, but its Electron
runner wouldn't launch in the sandbox this was built in (rejected its own standard
startup flags even after a clean reinstall; unrelated to this app or to Angular 20).
Angular's own scaffolded Karma/Jasmine setup runs headless Chrome, which does work
there, and gives tests that are actually verified passing rather than trusted on faith.
Cypress was subsequently removed entirely (`cypress.config.ts`, `cypress/`, and the
`cypress`/`@cypress/angular` devDependencies) rather than left in as dead scaffolding.

**`IntersectionObserver` is replaced with a hand-written fake in `assets-list.spec.ts`**
(`FakeIntersectionObserver`, swapped onto `window.IntersectionObserver` for the test),
not exercised via real browser layout. The real API's firing depends on actual element
geometry and visibility, which a detached test fixture doesn't reliably reproduce —
the fake instead captures the callback and exposes `.trigger(isIntersecting)`, giving
tests direct, deterministic control over exactly when a "the sentinel is visible" event
fires, including edge cases (overlapping triggers while loading, triggers after
`hasMore` goes false) that would be flaky or unreachable driving a real observer.

**Every component test that renders `<app-top-bar />` needs `provideHttpClient()` +
`provideRouter([])`, even when the test has nothing to do with auth or routing.**
`TopBar` injects `AuthService` (which injects `HttpClient`) and `Router`; omitting
either provider fails the whole component construction with a DI error, not a
graceful skip. Provider *order* matters too: `provideRouter([])` registers its own
`ActivatedRoute`, so a test-specific `{ provide: ActivatedRoute, useValue: ... }` must
be listed *after* it in the providers array, or the router's version wins and the
route param the test set never appears — this exact ordering bug is what
`asset-detail.spec.ts` hit and fixed.

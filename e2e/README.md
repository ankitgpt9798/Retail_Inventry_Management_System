# End-to-end tests

The real React app (in Chrome) against the real Express API and a real MongoDB database.
No mocks anywhere: what passes here works the way a person would experience it.

## Run

```
cd e2e
npm install          # first time only (installs Playwright; uses your installed Google Chrome)
npm test             # starts both servers itself, runs everything, stops them
npm run test:headed  # same, but you can watch the browser
npm run report       # open the last HTML report (screenshots + traces of any failure)
npx playwright test orders.spec.js     # just one file
```

Needs MongoDB running on `127.0.0.1:27017`. The whole suite takes roughly 12 minutes (about 3 of them are the
responsive-layout sweep); a single file takes under a minute.

## What it does to your machine

- Uses its **own database**, `retail_inventory_e2e`, emptied at the start of every run.
  `scripts/reset-db.js` refuses to run against any other database name, so your development data can't be wiped.
- Uses its **own ports**: API on 3100, app on 5273. `npm run dev` can keep running.
- Settings are passed as environment variables when the servers start; `backend/.env` and `frontend/.env` are never touched.
- Both addresses use `localhost` (never `127.0.0.1`) because the login cookie is `SameSite=Strict`.
- One worker, tests in order: dashboard and report numbers are global, so tests must not run side by side.
  Every test creates its own uniquely named data and never reuses another test's.

## How it is organised

| File | Phase | What it proves |
|---|---|---|
| `tests/setup/global.setup.js` | 0 | creates a user per role through the real API and saves each one's login cookie |
| `tests/auth.spec.js` | 1 | the HttpOnly cookie, login/logout, sign-up + approval, sessions ending (deleted cookie, password change, deactivation), CORS |
| `tests/roles.spec.js` | 1 | every page and every API endpoint, for every role: navigation, URL and server all agree |
| `tests/catalog.spec.js` | 2 | categories, products, warehouses: forms, filters, pagination, refusals, view-only roles |
| `tests/inventory.spec.js` | 3 | stock in/out, capacity, reserved stock, low-stock alerts, history, concurrent removals |
| `tests/transfers.spec.js` | 3 | the whole transfer lifecycle with two managers, refusals, double-click races |
| `tests/orders.spec.js` | 4 | order lifecycle, reservations, shipping, cancellation, pricing, fulfillment queue, races |
| `tests/purchasing.spec.js` | 5 | suppliers, purchase lifecycle with partial deliveries, the supplier portal and its isolation |
| `tests/notifications.spec.js` | 6 | the inbox and bell, privacy, who gets alerted, where links lead |
| `tests/users.spec.js` | 6 | user management, role changes taking effect at once, password reset, profile |
| `tests/audit.spec.js` | 6 | the audit log matches what happened and cannot be changed |
| `tests/reports.spec.js` | 7 | every report and the dashboard against numbers worked out by hand |
| `tests/journeys.spec.js` | 8 | two long journeys through the whole system, five people, everything must add up |
| `tests/security.spec.js` | x | injection, malformed input, XSS, mass assignment, and pinned security observations |
| `tests/layout.spec.js` | x | no sideways scrolling at phone and tablet sizes, on every page; the phone menu |
| `tests/zz-limits.spec.js` | x | size limits (runs last: it creates 105 products) |
| `helpers/` | | `apiAs("admin")`, `makeProduct()`, `flows.js` (multi-step business flows), UI helpers |

## Findings

A test titled `Fn: ...` is **expected to fail** (`test.fail`) while the finding is open. It passes as "failing" today,
and starts failing loudly the day the bug is fixed, which is the reminder to delete the `test.fail` line.

| # | Status | What | Where it shows |
|---|---|---|---|
| F1 | **Fixed** | A deactivated user got `403 ACCOUNT_INACTIVE` but the app only ended the session on `401`, leaving them in the app with a dead-end error. `services/api.js` now also ends the session on that 403 (other 403s still don't). | `auth.spec.js`, `api.test.js` |
| F2 | **Fixed** | Notification links pointed at pages that don't exist: low stock → `/inventory/<id>`, transfers → `/inventory/transfers/<id>`, so clicking them landed on "Page not found". The backend now links to the pages that exist: `/inventory` and `/transfers`. Notifications saved earlier are corrected by `npm run db:fix-notification-links` (in `backend/`, safe to re-run). | `notifications.spec.js`, `inventory.spec.js`, backend `notifications.test.js`, `transfers.test.js` |
| F3 | **Fixed** | Every drop-down loaded only the first 100 items (the API's per-request maximum). With more than 100 active products the older ones couldn't be chosen when writing an order, stock or transfer form, so they couldn't be sold through the app; the same for warehouses, suppliers and categories. `useOptions` (and the two pages that had their own copy) now load every page through the shared `services/fetchAllPages.js` (all pages at once, duplicates removed, safety cap of 50 pages = 5,000 items). If lists ever reach thousands of items, a search-as-you-type drop-down would be the next step. | `zz-limits.spec.js`, `fetchAllPages.test.js`, `useOptions.test.jsx` |
| F4 | **Fixed** | A bar in a bar chart was announced (and its tooltip titled) without the year ("Sept: ₹5,040.00"), while a line chart said "Sept 2026". `BarChart` now uses the full `title` when the data has one (the axis keeps the short label); ranked lists have no title and are unchanged. | `charts.test.jsx`, `reports.spec.js` |
| F5 | **Fixed** | A request body over 100 KB was answered `500 SERVER_ERROR` (and logged as a server fault) instead of `413`; the error handler didn't know that case. `errorMiddleware.js` now answers `413 PAYLOAD_TOO_LARGE` with no error log. | `security.spec.js`, backend `auth.test.js` |
| F6 | **Fixed** | On a phone, the menu stayed open on top of the page you just opened (the desktop drop-downs closed themselves; the phone menu did not). The phone menu is now its own `PhoneMenu` component in `AppNavbar.jsx`, rebuilt closed after every page change like the desktop groups. | `layout.spec.js`, `AppNavbar.test.jsx` |
| L1 | Known limitation (design) | Logout only removes the cookie in the browser. A copy of the token stays valid until it expires (about a day) or the password changes (stateless JWT). | `auth.spec.js`, pinned |
| L2 | Known gap | No rate limiting or lockout on login: unlimited password guesses. | `security.spec.js`, pinned |
| L3 | **Fixed** | The API sent `X-Powered-By: Express` and none of the usual protective headers. `backend/src/app.js` now uses helmet (nosniff, frame and referrer policies, CSP `frame-ancestors`, cross-origin-resource-policy `same-site`; HSTS only in production) and adds `Cache-Control: no-store` to every API answer. | `security.spec.js`, backend `health.test.js` |

### Things that were checked and held up

Every stock, money and status number matched a hand calculation; two people acting at the same instant
(stock out, confirm, ship, dispatch, receive) never double-counted anything; a supplier can only ever see their own
company's sent orders; notifications are private; the audit log can't be altered; role changes and password resets
take effect on the very next request; and no page is wider than a phone screen.

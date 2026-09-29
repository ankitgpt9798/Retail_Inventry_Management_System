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
| F2 | Open, bug | Notification links point at pages that don't exist: low stock → `/inventory/<id>`, transfers → `/inventory/transfers/<id>`. Clicking lands on "Page not found". Fix the backend links (`/inventory`, `/transfers`) or add the routes. | `notifications.spec.js`, `inventory.spec.js` |
| F3 | Open, limitation with real impact | Every drop-down loads only the first 100 items. With more than 100 active products the older ones can't be chosen when writing an order, stock or transfer form, so they can't be sold through the app. Needs search-as-you-type or paging. | `zz-limits.spec.js` |
| F4 | Open, minor | A bar in a bar chart is announced without the year ("Sept: ₹5,040.00"), while a line chart says "Sept 2026". Use the same label (the data already has it). | noted in `reports.spec.js` |
| F5 | Open, minor | A request body over 100 KB is answered `500 SERVER_ERROR` instead of `413`; the error handler doesn't know that case. Nothing leaks, but the status is wrong and it is logged as a server fault. | `security.spec.js` |
| F6 | Open, minor | On a phone, the menu stays open on top of the page you just opened. The desktop drop-downs close themselves after navigating; the phone menu doesn't. | `layout.spec.js` |
| L1 | Known limitation (design) | Logout only removes the cookie in the browser. A copy of the token stays valid until it expires (about a day) or the password changes (stateless JWT). | `auth.spec.js`, pinned |
| L2 | Known gap | No rate limiting or lockout on login: unlimited password guesses. | `security.spec.js`, pinned |
| L3 | Known gap | The API sends `X-Powered-By: Express` and none of the usual protective headers (no helmet-style hardening). | `security.spec.js`, pinned |

### Things that were checked and held up

Every stock, money and status number matched a hand calculation; two people acting at the same instant
(stock out, confirm, ship, dispatch, receive) never double-counted anything; a supplier can only ever see their own
company's sent orders; notifications are private; the audit log can't be altered; role changes and password resets
take effect on the very next request; and no page is wider than a phone screen.

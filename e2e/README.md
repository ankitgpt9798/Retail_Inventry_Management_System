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
```

Needs MongoDB running on `127.0.0.1:27017`. Takes about 2 minutes.

## What it does to your machine

- Uses its **own database**, `retail_inventory_e2e`, emptied at the start of every run.
  `scripts/reset-db.js` refuses to run against any other database name, so your development data can't be wiped.
- Uses its **own ports**: API on 3100, app on 5273. `npm run dev` can keep running.
- Settings are passed as environment variables when the servers start; `backend/.env` and `frontend/.env` are never touched.
- Both addresses use `localhost` (never `127.0.0.1`) because the login cookie is `SameSite=Strict`.

## How it is organised

| File | Purpose |
|---|---|
| `playwright.config.js` | starts the two servers, one worker, in order |
| `config.js` | ports, database name, test users |
| `tests/setup/global.setup.js` | Phase 0: creates a user per role through the real API and saves each one's login cookie |
| `tests/auth.spec.js` | Phase 1a: login, the HttpOnly cookie, sessions, sign-up + approval, CORS |
| `tests/roles.spec.js` | Phase 1b: every page and API endpoint for every role |
| `helpers/` | API clients (`apiAs("admin")`), UI helpers (`loginViaUi`, `goToNav`) |

## Findings so far

| # | What | Where it shows |
|---|---|---|
| F1 | **Bug (frontend).** A deactivated user gets `403 ACCOUNT_INACTIVE` from the API, but the app only ends the session on `401`, so they stay inside the app with a dead-end "Your account is not active" message and a useless "Try again" button. | `auth.spec.js`, marked `test.fail` until fixed |
| L1 | **Known limitation (design).** Logout only removes the cookie from the browser. A copy of the token stays valid until it expires or the password changes (stateless JWT). | `auth.spec.js`, pinned by a test |

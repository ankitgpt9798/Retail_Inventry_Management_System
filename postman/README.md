# Postman collection

Every endpoint of the backend API (161 requests in 10 folders) as one runnable story, with a test script on each
request. Use it to explore the API by hand, or run it top to bottom as a quick "is the whole API healthy?" check.

| File | What it is |
|---|---|
| `RetailInventory.postman_collection.json` | the collection (import this) |
| `RetailInventory.postman_environment.json` | the environment: `baseUrl`, `adminEmail`, `adminPassword` |
| `build-collection.js` | the generator that writes both files (see "Changing it") |

## Use it in Postman

1. Start the backend (`cd backend && npm run dev`) and make sure the admin exists (`npm run seed:admin`).
2. In Postman: **Import** both `.json` files, then pick the environment **Retail Inventory: local** (top right).
3. In that environment set `adminEmail` and `adminPassword` to the admin from your `backend/.env`
   (the file ships with the `.env.example` defaults). `baseUrl` is `http://localhost:3000/api`.
4. Open the collection and press **Run** (Collection Runner), or click through the requests in order.
   The first request (**Health check**) starts a new run; the rest depend on it, so always begin there.

## Use it from the command line (newman)

```
npx newman run RetailInventory.postman_collection.json \
  -e RetailInventory.postman_environment.json \
  --env-var adminEmail=admin@retail.local --env-var adminPassword=change-this-password
```

**Do not point it at data you care about.** It creates users, products, warehouses, orders and so on (every name
carries a per-run id, so it can be run again and again, but nothing is cleaned up). Run it against a throw-away
database. The safest way is the isolated stack the end-to-end tests use: database `retail_inventory_e2e`, API on port 3100
(see `e2e/`), with `--env-var baseUrl=http://localhost:3100/api --env-var adminEmail=admin@e2e.test --env-var adminPassword=Admin12345`.

## How it works

- **Who you are.** The API uses an HTTP-only `token` cookie. Postman keeps cookies for you, and each
  **Login as ...** request switches your role for the requests after it. Every folder starts by logging in as the role
  that is allowed to do what the folder does.
- **Ids.** Test scripts save what later requests need (`productId`, `orderId`, `purchaseId` ...) into collection
  variables. You never copy and paste an id.
- **Unique data.** The Health check creates a `runId`; emails, SKUs, warehouse codes and names include it.
- **What is checked.** Each request asserts the status code, the standard answer shape
  (`{ success, message, data }`, or `{ success: false, message, error }`) and the business facts that matter
  (totals worked out by hand, statuses, "the supplier sees only their own orders", "you cannot approve your own request").
  A full run makes about 500 assertions.
- **Refusals are requests too.** Most folders include the cases that must be refused (wrong role, over-stock,
  skipping a step, duplicate, bad input) and check the exact error code, since those codes are part of the API.

| Folder | Role | Shows |
|---|---|---|
| 0. Setup and authentication | admin | health, login, creating one user per role, public sign-up and approval, wrong password |
| 1. Catalog | admin | categories, products, warehouses: create, list filters, update, duplicates, validation errors |
| 2. Inventory | manager | stock in/out, capacity, reorder level, low stock, history |
| 3. Transfers | two managers | request, approve (by someone else), dispatch, receive, reject, cancel |
| 4. Orders and fulfillment | staff | pending → confirmed → processing → packed → shipped → delivered, cancel, server-side pricing |
| 5. Purchases and supplier portal | managers, supplier | draft → approve → order → supplier confirms → partial receipts; supplier isolation |
| 6. Notifications | manager, staff | inbox, unread count, read/read-all, privacy, delete |
| 7. Reports and dashboard | manager, staff | the dashboard and all eight reports, date validation, who may see what |
| 8. Users, profile and audit log | admin, staff | role changes, deactivate, password reset, audit log, profile, logout |
| 9. Security and error checks | none/admin | 401s, 404, bad ids, malformed JSON, injection attempt, protective headers |

Two things are left out on purpose: locking an account (five wrong passwords lock it for 15 minutes, which would
lock the account the next request needs), and anything that needs waiting.

## Changing it

The collection is generated. Edit `build-collection.js` (each request is one short `req(...)` call), then run

```
node build-collection.js
```

and commit both `.json` files. Please don't edit the `.json` by hand; the next generation would overwrite it.
After changing the API, run the collection against the isolated stack: a failing assertion tells you which request no longer
matches.

# Retail Inventory Management System — Architecture

_Living document. Updated after every step._

## Project Overview
Multi-warehouse retail inventory system (MERN). Two parts:
- **Public website**: Home, Features, About, Contact, Login (real header/footer, not an admin panel).
- **Staff application**: for Admin, Inventory Manager, Staff and Supplier roles, with website-style page layouts.

## Technology Stack
| Layer | Tech |
|---|---|
| Frontend | React + Vite, React Router, Redux Toolkit, Axios, Tailwind CSS + DaisyUI, React Hook Form + Zod, Lucide icons |
| Backend | Node.js, Express 5, Mongoose, dotenv, cors, bcryptjs, jsonwebtoken, cookie-parser |
| Database | MongoDB (local) — `mongodb://127.0.0.1:27017/retail_inventory` |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend), Postman |

## Key Decisions
| Decision | Why |
|---|---|
| JWT in **HTTP-only cookie** | JavaScript can't read it → safer against XSS. Frontend Axios uses `withCredentials: true`. |
| `app.js` separate from `server.js` | Tests import `app` without starting a server or connecting to the real DB. |
| CommonJS (`require`) in backend | Jest supports it with no extra config. |
| Express 5 | Errors thrown in `async` handlers reach the error middleware automatically (no try/catch wrapper needed just to forward errors). |
| Services layer | Business rules (stock reservation, transfers…) live in plain functions in `services/`, so controllers stay thin and rules are unit-testable. |

## Folder Structure
```
RetailInventory/
├── backend/
│   ├── src/
│   │   ├── config/db.js            MongoDB connection
│   │   ├── models/                 Mongoose schemas
│   │   ├── controllers/            read req → call service → send res
│   │   ├── services/               business logic
│   │   ├── routes/                 URL → middleware → controller
│   │   ├── middleware/             auth, roles, validation, errors
│   │   ├── utils/
│   │   ├── app.js                  Express app (no listen)
│   │   └── server.js               connect DB + listen
│   ├── tests/{unit,integration,api}
│   ├── .env / .env.example
│   └── package.json
├── frontend/                       (Step 17)
└── docs/ARCHITECTURE.md
```

## Request Flow
```
React → Axios → Express route → authMiddleware → roleMiddleware → validation
      → controller → service → Mongoose model → MongoDB
      → back up the chain → JSON response → React
Any thrown error → errorMiddleware → { success:false, message, error }
```

## Response Format
```json
{ "success": true,  "message": "...", "data": {} }
{ "success": false, "message": "...", "error": "ERROR_CODE" }
```

## Database Design
14 collections (spec's 12 + `stockTransfers` + `counters`). All statuses/roles come from `src/utils/constants.js`.
`counters` (`models/Counter.js`): `{ _id: "transfer", seq: 7 }` — hands out TRF/ORD/PO numbers atomically.

| Collection | Model file | Purpose | Key fields | Unique |
|---|---|---|---|---|
| users | User.js | Logins + roles | name, email, password (hash, `select:false`), role, status, supplier→Supplier | email |
| categories | Category.js | Product groups | name, description, status | name |
| products | Product.js | Catalog entry (no stock count here) | name, sku, barcode, brand, category→Category, costPrice, sellingPrice, taxRate %, imageUrl, reorderLevel, status | sku, barcode (sparse) |
| warehouses | Warehouse.js | Physical locations | name, code, city, capacity, manager→User, status | code |
| inventories | Inventory.js | Stock of 1 product in 1 warehouse | product, warehouse, quantity, reservedQuantity, reorderLevel, virtual **availableQuantity** | (product, warehouse) |
| stockTransactions | StockTransaction.js | Append-only history of quantity changes | product, warehouse, type, quantity, quantityBefore/After, referenceType/Id, performedBy | — |
| stockTransfers | StockTransfer.js | Transfer request + workflow | transferNumber, product, fromWarehouse, toWarehouse (≠ from), quantity, status, who/when per step | transferNumber |
| orders | Order.js | Customer order header | orderNumber, customer (embedded), warehouse, status, statusHistory[], subtotal, taxAmount, totalAmount, trackingNumber | orderNumber |
| orderItems | OrderItem.js | Order lines | order, product, snapshot of name/sku/price/tax, quantity, line totals | — |
| suppliers | Supplier.js | Vendors | name, contactPerson, email, phone, status | email |
| purchaseOrders | PurchaseOrder.js | Purchase request/order | poNumber, supplier, warehouse, items[] (embedded: product, quantityOrdered, quantityReceived, unitCost), status, approvals | poNumber |
| notifications | Notification.js | In-app alerts, one per recipient | recipient, type, title, message, link, isRead | — |
| auditLogs | AuditLog.js | Who changed what | user, action, entityType, entityId, oldValue, newValue, metadata | — |

**Relationships**
```
Category 1──* Product
Product 1──* Inventory *──1 Warehouse          (unique pair)
Inventory changes ──> StockTransaction
StockTransfer: Product, fromWarehouse, toWarehouse
User 1──* Order 1──* OrderItem *──1 Product
Supplier 1──* PurchaseOrder (items embedded) ──> Warehouse
User(SUPPLIER) *──1 Supplier
User 1──* Notification,  User 1──* AuditLog
```

**Design notes**
- Order items are a separate collection (needed for "top products" reports); PO items are embedded (always used with their PO).
- OrderItem stores a copy of product price/name so old orders never change when a product is edited.
- A "purchase request" = PurchaseOrder in DRAFT/PENDING. `REJECTED` status added (spec lists "reject" but no status for it).
- Local MongoDB is a single server, which doesn't support multi-document transactions. Stock changes will use single-document atomic updates with conditions (Step 8).
- `npm run db:sync` creates all collections + indexes in the dev DB.

## API List
| Method | URL | Auth | Purpose |
|---|---|---|---|
| GET | /api/health | none | Check server is running |
| POST | /api/auth/register | none | Self-register → always STAFF + PENDING, no cookie |
| POST | /api/auth/login | none | Verify password → set `token` HTTP-only cookie |
| POST | /api/auth/logout | none | Clear the cookie |
| GET | /api/auth/me | logged in | Current user / own profile (frontend calls on page load) |
| PUT | /api/users/profile | logged in | Edit own name, phone |
| PUT | /api/users/profile/password | logged in | Change own password (needs current) → logs out everywhere |
| GET | /api/users?search=&role=&status=&page=&limit= | ADMIN | Search/filter/paginate users |
| GET | /api/users/:id | ADMIN | One user |
| POST | /api/users | ADMIN | Create user with any role (ACTIVE) |
| PUT | /api/users/:id | ADMIN | Edit, assign role, approve (status ACTIVE) / deactivate |
| PUT | /api/users/:id/password | ADMIN | Reset password → user logged out everywhere |
| DELETE | /api/users/:id | ADMIN | Soft delete = status INACTIVE |

| GET | /api/categories?search=&status=&page=&limit= | ADMIN, MANAGER, STAFF | List categories (sorted by name) |
| POST | /api/categories | ADMIN | Create category |
| PUT | /api/categories/:id | ADMIN | Edit / reactivate |
| DELETE | /api/categories/:id | ADMIN | Deactivate (blocked while active products use it) |
| GET | /api/products?search=&category=&status=&brand=&minPrice=&maxPrice=&sort=&page=&limit= | ADMIN, MANAGER, STAFF | Search (name/SKU/barcode/brand), filter, sort (`newest`, `oldest`, `name`, `price_low`, `price_high`) |
| GET | /api/products/:id | ADMIN, MANAGER, STAFF | One product with category name |
| POST | /api/products | ADMIN | Create product |
| PUT | /api/products/:id | ADMIN | Edit (changes audited field-by-field) |
| DELETE | /api/products/:id | ADMIN | Deactivate |
| GET | /api/warehouses?search=&city=&status=&manager=&page=&limit= | ADMIN, MANAGER, STAFF | Search name/code/city, filter, sorted by name |
| GET | /api/warehouses/:id | ADMIN, MANAGER, STAFF | Warehouse + manager + `stockSummary` (totalQuantity, reservedQuantity, availableQuantity, productCount, capacityUsedPercent) |
| POST | /api/warehouses | ADMIN, MANAGER | Create |
| PUT | /api/warehouses/:id | ADMIN, MANAGER | Edit, assign manager (`null` removes), reactivate |
| DELETE | /api/warehouses/:id | ADMIN, MANAGER | Deactivate (blocked while it holds stock) |
| GET | /api/inventory?warehouse=&product=&search=&lowStock=&page=&limit= | ADMIN, MANAGER, STAFF | Inventory rows (warehouse-wise view with `?warehouse=`) |
| GET | /api/inventory/product/:productId | ADMIN, MANAGER, STAFF | Product-wise: each warehouse + `totals` {quantity, reservedQuantity, availableQuantity} |
| GET | /api/inventory/low-stock?warehouse= | ADMIN, MANAGER, STAFF | Rows where available < reorderLevel |
| GET | /api/inventory/transactions?product=&warehouse=&type=&from=&to= | ADMIN, MANAGER, STAFF | Stock movement history, newest first |
| GET | /api/inventory/:id | ADMIN, MANAGER, STAFF | One inventory row |
| POST | /api/inventory/stock-in | ADMIN, MANAGER | `{product, warehouse, quantity, note?}` |
| POST | /api/inventory/stock-out | ADMIN, MANAGER | `{product, warehouse, quantity, note}` (reason required) |
| PUT | /api/inventory/:id/reorder-level | ADMIN, MANAGER | Per-warehouse reorder level |

`POST /api/inventory/transfer` from the spec is intentionally not built: transfers use the approval workflow in `/api/transfers` (Step 9) so there is one way to move stock.

| GET | /api/transfers?status=&product=&warehouse=&fromWarehouse=&toWarehouse=&search=&page=&limit= | ADMIN, MANAGER | List/history (`warehouse` = either side, `search` = transfer number) |
| GET | /api/transfers/:id | ADMIN, MANAGER | One transfer with who did each step |
| POST | /api/transfers | ADMIN, MANAGER | Request `{product, fromWarehouse, toWarehouse, quantity, notes?}` |
| PUT | /api/transfers/:id/approve | ADMIN, MANAGER (not the requester) | REQUESTED → APPROVED |
| PUT | /api/transfers/:id/reject | ADMIN, MANAGER | REQUESTED → REJECTED `{reason}` |
| PUT | /api/transfers/:id/dispatch | ADMIN, MANAGER | APPROVED → DISPATCHED, source −X |
| PUT | /api/transfers/:id/receive | ADMIN, MANAGER | DISPATCHED → RECEIVED, destination +X |
| PUT | /api/transfers/:id/cancel | ADMIN, MANAGER | REQUESTED/APPROVED → CANCELLED `{reason?}` |

**List response shape:** `data: { users: [...], pagination: { page, limit, total, totalPages } }` (default limit 10, max 100).

**Error codes so far:** `VALIDATION_ERROR` 422, `SUPPLIER_REQUIRED` 422, `INVALID_JSON` 400, `INVALID_ID` 400, `CANNOT_CHANGE_OWN_ROLE` 400, `CANNOT_CHANGE_OWN_STATUS` 400, `CANNOT_DEACTIVATE_SELF` 400, `INVALID_CURRENT_PASSWORD` 400, `SAME_PASSWORD` 400, `INVALID_CREDENTIALS` 401, `NOT_AUTHENTICATED` 401, `INVALID_TOKEN` 401, `TOKEN_EXPIRED` 401, `SESSION_REVOKED` 401, `USER_NOT_FOUND` 401/404, `ACCOUNT_PENDING` 403, `ACCOUNT_INACTIVE` 403, `FORBIDDEN` 403, `SUPPLIER_NOT_FOUND` 404, `NOT_FOUND` 404, `EMAIL_EXISTS` 409, `DUPLICATE_VALUE` 409, `SERVER_ERROR` 500.

## User Management Rules
- DELETE never removes a user (orders/audit logs reference them) — it sets `INACTIVE`.
- Admins cannot change their own role/status or deactivate themselves → the acting admin always stays an active admin, so the system can never lose its last admin.
- Admins may set status `ACTIVE`/`INACTIVE` only; `PENDING` comes only from self-registration.
- `SUPPLIER` users must link to an existing Supplier; any other role has `supplier: null`.
- `tokenVersion` (User field, copied into the JWT) is increased on password change/reset; `protect` rejects tokens with an old version (`SESSION_REVOKED`).
- Search text is regex-escaped (`utils/escapeRegex.js`) before use in MongoDB.
- Audit actions: `USER_CREATED`, `USER_UPDATED` (old/new values), `USER_DEACTIVATED`, `USER_PASSWORD_RESET`, `PROFILE_UPDATED`, `PASSWORD_CHANGED` (never password values).

## Product & Category Rules
- Catalog is viewable by ADMIN, INVENTORY_MANAGER, STAFF (not SUPPLIER); only ADMIN changes it.
- DELETE = soft delete (`INACTIVE`) for both.
- Category names unique **ignoring case** (service check with `^name$` regex, `i` flag).
- A category with ACTIVE products cannot be deactivated → 409 `CATEGORY_IN_USE`.
- A product's category must exist and be ACTIVE on create, on moving category, and on reactivation.
- SKU unique, stored uppercase (`lap-001` = `LAP-001`); barcode unique when present. `""` for barcode/imageUrl means "none" (stored as missing, so the sparse unique index allows many products without one). The DB unique index is a backstop: if the service check were skipped, MongoDB still returns 409 `DUPLICATE_VALUE`.
- Prices: numbers only (not strings), ≥ 0, rounded to 2 decimals. Tax 0–100 %. Reorder level whole number ≥ 0 (default 10).
- Image = `http(s)` URL only (`javascript:` etc. rejected). File upload is a possible later addition (multer).
- Updates are audited with **only the changed fields** (`auditService.getChanges`); no change → no audit record.
- Error codes: `CATEGORY_NOT_FOUND` 404, `CATEGORY_INACTIVE` 422, `CATEGORY_EXISTS` 409, `CATEGORY_IN_USE` 409, `PRODUCT_NOT_FOUND` 404, `SKU_EXISTS` 409, `BARCODE_EXISTS` 409.

## Warehouse Rules
- View: ADMIN, MANAGER, STAFF. Manage: ADMIN, INVENTORY_MANAGER (spec: "Manager can manage warehouses").
- Code unique, stored uppercase, letters/numbers/dashes. Capacity required, whole number ≥ 1 (model changed from "default 0").
- Manager must exist (404 `MANAGER_NOT_FOUND`), be ACTIVE and be INVENTORY_MANAGER or ADMIN (422 `INVALID_MANAGER`).
- Capacity cannot be set below current stock (409 `CAPACITY_BELOW_STOCK`).
- Cannot deactivate while it holds stock, via DELETE or PUT status (409 `WAREHOUSE_HAS_STOCK`). Inventory rows with quantity 0 don't count.
- `warehouseService.getStockTotals(warehouseId)` sums the warehouse's Inventory rows; reused by inventory (capacity check on stock-in).

## Inventory Rules (core)
- One Inventory row per (product, warehouse) — unique index. Created on first stock-in (upsert), copying the product's reorderLevel (`$setOnInsert`); each warehouse can then change its own level.
- Rule 1: `availableQuantity = quantity - reservedQuantity` (model virtual + `getAvailable()`).
- Rule 3 stock-in: product and warehouse must be ACTIVE; warehouse total + quantity ≤ capacity (409 `CAPACITY_EXCEEDED`).
- Stock-out takes only **available** units; inactive products may still be removed. Reason (`note`) required for manual stock-out.
- **Concurrency:** stock-out is ONE atomic `findOneAndUpdate` with the condition `available ≥ quantity` (`$expr`) and `$inc: -quantity`. If it returns null → 400 `INSUFFICIENT_STOCK`. Proven by a test: 10 parallel requests for 5 units → exactly 5 succeed. (A read-check-save version lets all 10 succeed.)
- Rule 7: low stock = available < reorderLevel. Alert (Notification LOW_STOCK to every ACTIVE ADMIN + INVENTORY_MANAGER) only when stock **crosses** below the level (`becameLowStock(before, after)`), also when a reorder-level change causes it.
- Rules 8 + 9: every change → StockTransaction (quantityBefore/After, type, referenceType/Id, performedBy) + AuditLog.
- `addStock()` / `removeStock()` take `type`, `referenceType`, `referenceId` so transfers (TRANSFER_IN/OUT), purchase receiving and orders reuse the same rules.
- Known limitation: the capacity check reads totals first, then updates — two simultaneous stock-ins could together overshoot capacity slightly. Acceptable for this project (no multi-document transactions on a standalone MongoDB).
- `?lowStock=` accepts only "true"/"false" (`z.coerce.boolean()` would turn "false" into true).
- Error codes: `PRODUCT_INACTIVE` 422, `WAREHOUSE_INACTIVE` 422, `WAREHOUSE_NOT_FOUND` 404, `INVENTORY_NOT_FOUND` 404, `CAPACITY_EXCEEDED` 409, `INSUFFICIENT_STOCK` 400.

## Stock Transfer Rules
```
REQUESTED ─approve─► APPROVED ─dispatch─► DISPATCHED ─receive─► RECEIVED
    │ reject             │ cancel          source −X              destination +X
    ▼                    ▼                 (TRANSFER_OUT)         (TRANSFER_IN)
 REJECTED            CANCELLED ◄── also from REQUESTED
```
- Rule 6 via Step 8's `removeStock` (dispatch) and `addStock` (receive), `referenceType: TRANSFER`, `referenceId: transfer._id`.
- **No reservation at approval**: stock is checked (read-only) at request and at approval, and removed atomically at dispatch. If it ran out meanwhile, dispatch fails with `INSUFFICIENT_STOCK` and the transfer stays APPROVED.
- **In transit** (DISPATCHED): goods are in neither warehouse. Destination capacity is checked at receive; if full, receive fails and it stays DISPATCHED.
- Goods in transit are receivable even if the product was deactivated (`addStock({ requireActiveProduct: false })`).
- **Segregation of duties**: the requester cannot approve their own transfer (403 `SELF_APPROVAL_NOT_ALLOWED`).
- **Atomic status changes** (`moveStatus`): `findOneAndUpdate({ _id, status: { $in: allowedFrom } }, { $set: { status: to } })`. The status is claimed first, then stock moves; if the stock step fails the status is reverted (`revertStatus`). Two simultaneous dispatch clicks → one 200, one 409, stock removed once (tested).
- Cancel only before dispatch. Reject needs a reason.
- Transfer numbers `TRF-000001` from `counterService.getNextCode("transfer", "TRF")` (atomic `$inc` on `counters`; ORD/PO will reuse it).
- Notifications (STOCK_TRANSFER): request → other admins/managers; approve/reject/cancel → requester; dispatch → destination warehouse manager; receive → requester.
- Audit: TRANSFER_REQUESTED / APPROVED / REJECTED / DISPATCHED / RECEIVED / CANCELLED.
- Error codes: `TRANSFER_NOT_FOUND` 404, `INVALID_TRANSFER_STATUS` 409, `SELF_APPROVAL_NOT_ALLOWED` 403, `WAREHOUSE_HAS_OPEN_TRANSFERS` 409.

**Pending checks (add in the step that builds each module):**
- [x] Step 8: stock-in refuses INACTIVE warehouses/products and refuses to exceed capacity. (Transfers must use `addStock`/`removeStock` to inherit this.)
- [x] Step 9: cannot deactivate a warehouse with open transfers (REQUESTED/APPROVED/DISPATCHED) — `warehouseService.ensureCanDeactivate`.
- [ ] Step 11: cannot deactivate a warehouse with open purchase orders.
- [ ] Step 12: cannot deactivate a warehouse with open customer orders.

## Authentication Flow
**Roles are admin-managed.** Public registration never accepts `role`/`status` (Zod strips unknown keys); new users are `STAFF` + `PENDING` until an admin approves them. The first admin comes from `npm run seed:admin` (values in `.env`).

User statuses: `PENDING` (registered, awaiting approval) → `ACTIVE` → `INACTIVE` (deactivated).

```
Login:     body → validate(loginSchema) → authService.loginUser
           → findOne(email).select("+password") → bcrypt.compare
           → status must be ACTIVE → jwt.sign({ userId }, JWT_SECRET, 1d)
           → controller: res.cookie("token", jwt, { httpOnly, sameSite:"strict", secure in prod })
           → audit "LOGIN"
Protected: cookie-parser → protect (verify JWT → User.findById → must be ACTIVE → req.user)
           → authorize(...roles) (403 if role not allowed) → controller
Logout:    res.clearCookie("token")
```
- JWT holds only `userId`; role/status are read from DB on every request, so deactivation or role change takes effect immediately.
- Same 401 message for unknown email and wrong password (no account enumeration). Status is checked only after the password is correct.
- Password rules: 8–64 chars, at least one letter and one number.

| File | Responsibility |
|---|---|
| `validators/authValidators.js` | Zod schemas (register, login, password) |
| `middleware/validationMiddleware.js` | `validate(schema)` → 422 |
| `services/authService.js` | hash, register, login, createToken |
| `services/auditService.js` | `logAction()` — never breaks the main action |
| `middleware/authMiddleware.js` | `protect` |
| `middleware/roleMiddleware.js` | `authorize(...roles)` |
| `controllers/authController.js` | cookie handling + JSON responses |
| `utils/AppError.js` | error with statusCode + errorCode |

## Frontend Pages
_Step 17._

## Testing Strategy
- Every module: Jest unit tests for services, Supertest API tests for routes, Postman collection.
- Run backend tests: `cd backend && npm test`
- `tests/unit`: no database (schema validation via `validateSync()`, later service logic)
- `tests/integration`: real MongoDB, databases `retail_inventory_test_<worker>` (wiped each run, never the dev DB)
- Test files run **in parallel**; each Jest worker gets its own database (`JEST_WORKER_ID`), otherwise files would wipe each other's data mid-test.
- `tests/api`: HTTP requests through Supertest (auth tests use the test DB)
- `tests/helpers/testDb.js`: connect/clear/close the test DB. Passes `runtimeAdapters: { os }` to the driver because MongoDB driver 7.x loads `os` via `import()`, which fails inside Jest and causes "Missing required sub-document 'driver'".
- `tests/setupEnv.js`: test-only JWT secret and NODE_ENV (tests never read `.env`)
- `tests/helpers/userHelpers.js`: `createTestUser({ role, email })` + `loginAgent(email)` (a supertest agent that keeps the cookie)

## Progress
| Step | Status |
|---|---|
| 1. Project setup | Done |
| 2. MongoDB connection | Done |
| 3. Database schemas | Done (13 models, unit + DB tests) |
| 4. Authentication | Done |
| 5. User & role management | Done |
| 6. Products & categories | Done |
| 7. Warehouses | Done |
| 8. Inventory (stock-in/out, low stock, history) | Done |
| 9. Stock transfers | Done (255 tests passing) |
| 10. Suppliers | Next |

## Known Issues
- A JWT copied before a plain logout stays valid until it expires (max 1 day). Password change/reset does revoke all tokens (tokenVersion). Acceptable for now; see Future Improvements.

## Future Improvements
- Redis token blocklist on logout; rate limiting on /login (brute-force protection).
- Docker, CI/CD, cloud deployment (explicitly out of scope for now).

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
├── frontend/
│   ├── src/
│   │   ├── components/common/      Logo, Loader, ErrorAlert, PageHeader, TextField
│   │   ├── components/layout/      PublicLayout/Header/Footer, AppLayout, AppNavbar, NotificationBell, UserMenu
│   │   ├── pages/public/           Home, Features, About, Contact, Login, Register (+ content.js)
│   │   ├── pages/app/              Dashboard, Profile, Forbidden
│   │   ├── routes/                 AppRoutes (every URL), ProtectedRoute (login + role check)
│   │   ├── services/api.js         the ONE Axios instance + 401 interceptor + getErrorMessage
│   │   ├── store/                  store.js (setupStore), authSlice.js (the only global state)
│   │   ├── hooks/                  useUnreadCount (bell, refreshes every 60 s)
│   │   ├── utils/                  roles, navigation (PAGE_ACCESS + links), format, passwordSchema, siteInfo
│   │   ├── test/                   setup.js, testUtils.jsx (renderWithProviders, authState)
│   │   ├── App.jsx                 checks the session on load
│   │   └── main.jsx                store + router + interceptor
│   ├── index.html, vite.config.js (also Vitest config)
│   ├── .env / .env.example         VITE_API_URL
│   └── package.json
└── docs/ARCHITECTURE.md
```

**Run locally:** `cd backend && npm run dev` (port 3000) and `cd frontend && npm run dev` (port 5173) → open http://localhost:5173.

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
| GET | /api/suppliers?search=&city=&status=&page=&limit= | ADMIN, MANAGER | Search name/contact person/email, sorted by name |
| GET | /api/suppliers/:id | ADMIN, MANAGER | Supplier + its SUPPLIER-role login `users` |
| POST | /api/suppliers | ADMIN, MANAGER | Create |
| PUT | /api/suppliers/:id | ADMIN, MANAGER | Edit / reactivate (INACTIVE also deactivates its logins) |
| DELETE | /api/suppliers/:id | ADMIN, MANAGER | Deactivate + deactivate its active SUPPLIER logins |
| GET | /api/purchases?status=&supplier=&warehouse=&search=&page=&limit= | ADMIN, MANAGER, SUPPLIER* | List/history (*own company, ordered POs only) |
| GET | /api/purchases/:id | ADMIN, MANAGER, SUPPLIER* | One PO; items include `quantityOutstanding` |
| POST | /api/purchases | ADMIN, MANAGER | Create DRAFT `{supplier, warehouse, items[{product, quantityOrdered, unitCost?}], expectedDeliveryDate?, notes?, submit?}` |
| PUT | /api/purchases/:id | ADMIN, MANAGER | Edit DRAFT (supplier, warehouse, items, date, notes) |
| PUT | /api/purchases/:id/submit | ADMIN, MANAGER | DRAFT → PENDING |
| PUT | /api/purchases/:id/approve | ADMIN, MANAGER (not requester) | PENDING → APPROVED |
| PUT | /api/purchases/:id/reject | ADMIN, MANAGER | PENDING → REJECTED `{reason}` |
| PUT | /api/purchases/:id/order | ADMIN, MANAGER | APPROVED → ORDERED (supplier notified) |
| PUT | /api/purchases/:id/confirm | SUPPLIER (own) | Confirm once `{expectedDeliveryDate?, deliveryNote?}` |
| PUT | /api/purchases/:id/delivery | SUPPLIER (own) | Update delivery date/note |
| PUT | /api/purchases/:id/receive | ADMIN, MANAGER | `{items[{product, quantity}]}` → PARTIALLY_RECEIVED / RECEIVED, stock + |
| PUT | /api/purchases/:id/cancel | ADMIN, MANAGER | Any open status → CANCELLED `{reason?}` |
| GET | /api/orders?status=&warehouse=&search=&from=&to=&page=&limit= | ADMIN, MANAGER, STAFF | List; search order number / customer name / phone |
| GET | /api/orders/:id | ADMIN, MANAGER, STAFF | `{ order (with statusHistory), items }` |
| POST | /api/orders | ADMIN, STAFF | Create PENDING `{customer{name, email?, phone?, address?}, warehouse, items[{product, quantity}], notes?, confirm?}` |
| PUT | /api/orders/:id | ADMIN, STAFF | Edit PENDING (customer, warehouse, items, notes) |
| PUT | /api/orders/:id/confirm | ADMIN, STAFF | PENDING → CONFIRMED, reserve stock |
| DELETE | /api/orders/:id | ADMIN, STAFF | Cancel `{reason?}` (kept; reservation released) — only before SHIPPED |
| PUT | /api/orders/:id/status | ADMIN, STAFF | Fulfillment `{status: PROCESSING/PACKED/SHIPPED/DELIVERED, note?, carrier?, trackingNumber?}` |
| GET | /api/orders/fulfillment-queue | ADMIN, MANAGER, STAFF | Counts per stage `{CONFIRMED, PROCESSING, PACKED, SHIPPED}` |
| GET | /api/notifications?isRead=&type=&page=&limit= | any logged-in user | My notifications, newest first, + `unreadCount` |
| GET | /api/notifications/unread-count | any logged-in user | `{ unreadCount }` for the bell badge |
| PUT | /api/notifications/:id/read | any logged-in user (own) | Mark one read (idempotent, keeps first `readAt`) |
| PUT | /api/notifications/read-all | any logged-in user | Mark all mine read → `{ updatedCount }` |
| DELETE | /api/notifications/:id | any logged-in user (own) | Delete (real delete) |
| GET | /api/reports/dashboard | ADMIN, MANAGER, STAFF | 10 KPIs + 6 charts (last 6 months) |
| GET | /api/reports/inventory?warehouse=&category= | ADMIN, MANAGER | Per product: qty, reserved, available, stock value |
| GET | /api/reports/warehouses | ADMIN, MANAGER | Per warehouse: stock, utilization %, value |
| GET | /api/reports/stock-movement?from=&to=&warehouse=&product= | ADMIN, MANAGER | Totals per type + monthly series |
| GET | /api/reports/orders?from=&to=&warehouse= | ADMIN, MANAGER | Summary, byStatus, byMonth |
| GET | /api/reports/purchases?from=&to=&supplier= | ADMIN, MANAGER | Summary, byStatus, byMonth |
| GET | /api/reports/suppliers?from=&to= | ADMIN, MANAGER | Volume, value, fulfilment rate, open POs |
| GET | /api/reports/low-stock?warehouse= | ADMIN, MANAGER | Shortage + quantity on order |
| GET | /api/reports/product-performance?from=&to=&warehouse=&sortBy=&limit= | ADMIN, MANAGER | Top products (units or revenue) |
| GET | /api/audit-logs?user=&action=&entityType=&entityId=&from=&to=&sort=&page=&limit= | ADMIN | Search audit trail; `entityType`+`entityId`+`sort=oldest` = one record's history |
| GET | /api/audit-logs/filters | ADMIN | Distinct `actions` and `entityTypes` (for dropdowns) |
| GET | /api/audit-logs/:id | ADMIN | One entry (old/new values, metadata) |

**List response shape:** `data: { users: [...], pagination: { page, limit, total, totalPages } }` (default limit 10, max 100).

**Error codes so far:** `VALIDATION_ERROR` 422, `SUPPLIER_REQUIRED` 422, `INVALID_JSON` 400, `INVALID_ID` 400, `CANNOT_CHANGE_OWN_ROLE` 400, `CANNOT_CHANGE_OWN_STATUS` 400, `CANNOT_DEACTIVATE_SELF` 400, `INVALID_CURRENT_PASSWORD` 400, `SAME_PASSWORD` 400, `INVALID_CREDENTIALS` 401, `NOT_AUTHENTICATED` 401, `INVALID_TOKEN` 401, `TOKEN_EXPIRED` 401, `SESSION_REVOKED` 401, `USER_NOT_FOUND` 401/404, `ACCOUNT_PENDING` 403, `ACCOUNT_INACTIVE` 403, `FORBIDDEN` 403, `SUPPLIER_NOT_FOUND` 404, `NOT_FOUND` 404, `EMAIL_EXISTS` 409, `DUPLICATE_VALUE` 409, `SERVER_ERROR` 500.

## User Management Rules
- DELETE never removes a user (orders/audit logs reference them) — it sets `INACTIVE`.
- Admins cannot change their own role/status or deactivate themselves → the acting admin always stays an active admin, so the system can never lose its last admin.
- Admins may set status `ACTIVE`/`INACTIVE` only; `PENDING` comes only from self-registration.
- `SUPPLIER` users must link to an existing Supplier; any other role has `supplier: null`.
- **Ending a session (two mechanisms):**
  - `tokenVersion` (User field, copied into the JWT) is increased on password change/reset; `protect` rejects tokens with an old version (`SESSION_REVOKED`). This ends **every** session of that user.
  - **Logout ends only that one session** (E2E finding L1): every login token carries a unique id (`jti`); `POST /api/auth/logout` verifies the cookie's token and writes its id to the `revokedtokens` collection (`models/RevokedToken.js`, removed automatically by a TTL index once the token would have expired anyway); `protect` refuses a token whose id is listed with 401 `SESSION_ENDED`, before loading the user. So a *copied* token stops working at logout, while the same person's other devices (their own tokens) carry on. Logout stays harmless with no token, a garbage or expired token (200, cookie cleared, nothing recorded). Tokens issued before ids existed have no `jti`: they can't be ended one by one and simply expire (at most a day).
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

## Supplier Rules
- Managed by ADMIN and INVENTORY_MANAGER; STAFF and SUPPLIER users can't use `/api/suppliers` (SUPPLIER gets a PO portal in Step 11).
- Email identifies a supplier: unique, stored lowercase (409 `SUPPLIER_EMAIL_EXISTS`). Names may repeat.
- Phone: 7–20 chars of digits, spaces, `+`, `-`, brackets.
- **Deactivating a supplier (DELETE or PUT status INACTIVE) also deactivates its ACTIVE SUPPLIER-role users** (each audited as USER_DEACTIVATED with the reason); the response includes `deactivatedUserCount`. Reactivating the supplier does NOT reactivate users — an admin does that per person.
- SUPPLIER users can only be linked to an ACTIVE supplier (422 `SUPPLIER_INACTIVE`). The link is re-checked only when role/supplier changes or the user is reactivated, so other edits (e.g. name) still work for users of inactive suppliers.

## Purchase Rules
```
DRAFT ─submit─► PENDING ─approve─► APPROVED ─order─► ORDERED ─receive─► PARTIALLY_RECEIVED ─receive─► RECEIVED
  (edit)          │ reject                            ▲ supplier: confirm / delivery update
                  ▼                                   cancel from any open status → CANCELLED
               REJECTED
```
- A "purchase request" = PO in DRAFT/PENDING (one document for the whole life). `PO-000001` numbers from `counterService`.
- Items: 1–50, each product once, product ACTIVE; `unitCost` defaults to product cost price; `totalAmount` calculated by server (`calculateTotal`).
- Supplier + warehouse must be ACTIVE (supplier re-checked at approve and order). Requester cannot approve (`SELF_APPROVAL_NOT_ALLOWED`).
- **Supplier portal:** a SUPPLIER user sees only POs of their own company that have been ordered (`orderedAt` set); anything else → 404 (not 403). Their `?supplier=` filter is overridden.
- **Receiving:** lines checked against outstanding (400 `OVER_RECEIPT`), product must be on the PO (422 `PRODUCT_NOT_IN_PURCHASE`), whole delivery must fit warehouse capacity (409). Status is calculated (`calculateReceiptStatus`). Stock via `addStock` (STOCK_IN, referenceType PURCHASE_ORDER, `requireActiveProduct: false`).
- **Optimistic locking** on receive: update only if `__v` is still what we read, and `$inc __v`. Concurrent receipt → 409 `PURCHASE_CHANGED` (or `OVER_RECEIPT`). Tested: two simultaneous receipts of the last 40 → received once.
- If `addStock` fails part-way, `undoReceiptLines` removes the unstocked lines from the PO so the PO always matches real stock (tested).
- Cancel from PARTIALLY_RECEIVED = "cancel the rest"; received quantities and stock stay. RECEIVED/REJECTED/CANCELLED can't be cancelled.
- Shared `utils/moveStatus.js` (atomic status change) is used by transfers and purchases.
- Notifications: submit → other admins/managers (PURCHASE_UPDATE); approve → requester (PURCHASE_APPROVED); reject/confirm/delivery/cancel → requester; order/cancel-after-order → supplier's portal users; receive → requester (PURCHASE_RECEIVED).
- Audit: PURCHASE_CREATED / UPDATED / SUBMITTED / APPROVED / REJECTED / ORDERED / CONFIRMED_BY_SUPPLIER / DELIVERY_UPDATED / RECEIVED (with lines) / CANCELLED.

## Customer Order Rules (Step 12)
```
PENDING ─confirm (reserve)─► CONFIRMED ─► PROCESSING ─► PACKED ─► SHIPPED ─► DELIVERED   (Step 13)
   └──────── cancel (release if reserved) ────────────────────┘ → CANCELLED
```
- `ORD-000001` numbers. Customer embedded in the order; lines in `orderItems` (separate collection, spec).
- **Prices are never sent by the client.** `unitPrice`/`taxRate` copied from the product when the order is created/edited (snapshot). `calculateLine` / `calculateOrderTotals` (rounded with `utils/roundMoney.js`).
- Rule 2: available is checked on create/edit (early feedback) and enforced atomically on confirm.
- Rule 4: confirm → `inventoryService.reserveStock` per line: atomic `WHERE quantity − reserved ≥ qty → reserved += qty`. Quantity doesn't change.
- **All or nothing without transactions:** claim PENDING→CONFIRMED (`moveStatus`), reserve lines one by one; if one fails, `releaseStock` the lines already reserved, set status back to PENDING and `$pop` the history entry. Tested: second line fails → first released; two orders racing for the last 5 → exactly one wins; double-click → reserved once.
- Reservations lower available, so reserving can trigger LOW_STOCK (Rule 7). Reserved units can't be stocked-out or transferred (they use available).
- Only PENDING orders can be edited. Cancel from PENDING/CONFIRMED/PROCESSING/PACKED; releases reservation if the status was a reserving one (status read and claimed exactly, so release happens once).
- `statusHistory` (who/when/note) is the tracking timeline; `utils/moveStatus.js` can now `$push` to it in the same atomic update.
- Notifications: confirm → admins + other staff (NEW_ORDER); cancel by someone else → creator (ORDER_STATUS_CHANGED).
- Audit: ORDER_CREATED / UPDATED / CONFIRMED (with reserved lines) / CANCELLED.
- Roles: ADMIN + STAFF manage orders; INVENTORY_MANAGER views; SUPPLIER none.
- Error codes: `ORDER_NOT_FOUND` 404, `INVALID_ORDER_STATUS` 409, `ORDER_CHANGED` 409, `INSUFFICIENT_STOCK` 400, `WAREHOUSE_HAS_OPEN_ORDERS` 409.

## Order Fulfillment Rules (Step 13)
- `PUT /api/orders/:id/status`, one step at a time (`PREVIOUS_STATUS` map in orderService): CONFIRMED→PROCESSING→PACKED→SHIPPED→DELIVERED. No skipping, no going back. PENDING/CONFIRMED/CANCELLED are not accepted here (confirm/cancel actions).
- **Rule 5 at SHIPPED** (goods leave the building): `inventoryService.shipReservedStock` per line, atomic `WHERE reserved ≥ qty AND quantity ≥ qty → quantity −= qty, reserved −= qty`; STOCK_OUT transaction, referenceType ORDER. Available is unchanged → no low-stock alert at shipping.
- Why SHIPPED (not PACKED/DELIVERED): inventory must match what is physically on our shelves; packed goods are still here and the order can still be cancelled; after shipping they're gone.
- SHIPPED requires `carrier` + `trackingNumber` (Zod `superRefine`).
- Ship all lines or none: claim PACKED→SHIPPED first (double-click safe), then lines; a failed line → already-shipped lines put back with `undoShippedStock` (recorded as ADJUSTMENT, history never deleted), status back to PACKED, carrier/tracking removed, history entry popped. Error `RESERVATION_MISMATCH` 409 (only possible after manual DB edits).
- Cancel allowed up to PACKED (releases reservation); not after SHIPPED.
- Every step appends to `statusHistory` (who/when/note) = order tracking. Creator notified (ORDER_STATUS_CHANGED) when someone else moves the order; shipping message includes carrier + tracking.
- Audit: ORDER_STATUS_UPDATED, ORDER_SHIPPED.

## Notifications (Step 14)
- **Created** by `notificationService.notifyRoles(roles, {...}, excludeUserId)` / `notifyUser(userId, {...})` (since Step 8). One document per recipient, so each person has their own read state. Creation failures are logged, never break the business action.
- **Read** through `/api/notifications` — only `protect` (every role, incl. SUPPLIER, has an inbox); no `authorize`.
- **Ownership is part of every query:** `{ recipient: req.user._id, ... }` in find / count / findOne / updateMany / deleteOne. Someone else's notification → 404 `NOTIFICATION_NOT_FOUND` (tested, including a mutation check that removed the filter).
- The user id always comes from `req.user` (verified cookie), never from URL/body.
- `isRead` filter: `if (isRead !== undefined)` — not `if (isRead)`, which would ignore `isRead=false` (tested).
- Delete is a real delete (personal messages, not business records); reading/deleting is not audited.
- Index `{ recipient: 1, isRead: 1, createdAt: -1 }` serves list, filter, sort and unread count.
- Types in use: LOW_STOCK, STOCK_TRANSFER, PURCHASE_UPDATE, PURCHASE_APPROVED, PURCHASE_RECEIVED, NEW_ORDER, ORDER_STATUS_CHANGED (SYSTEM_ALERT reserved). Each has a `link` to the frontend page (e.g. `/inventory/<id>`, `/orders/<id>`).

## Reports & Analytics (Step 15)
Read-only; built with MongoDB **aggregation pipelines** (`$match` → `$group` → `$lookup`/`$unwind` → `$project` → `$sort`/`$limit`). Plain JS only for small final touches (zero-filling months, merging lists, percentages).

**Definitions**
| Term | Meaning |
|---|---|
| Sales orders / revenue | status CONFIRMED…DELIVERED (not PENDING, not CANCELLED); revenue = Σ `totalAmount` (incl. tax) |
| Units sold (product performance) | SHIPPED + DELIVERED orders only; name/SKU from the order-line snapshot |
| Pending orders (KPI) | PENDING, CONFIRMED, PROCESSING, PACKED |
| Completed orders | DELIVERED |
| Total orders (KPI) | all except CANCELLED |
| Pending purchases | PENDING, APPROVED, ORDERED, PARTIALLY_RECEIVED |
| Ordered value | POs sent and not cancelled: ORDERED, PARTIALLY_RECEIVED, RECEIVED |
| Received value | Σ quantityReceived × unitCost (incl. POs cancelled after partial receipt) |
| Purchase trend (by month) | POs PENDING…RECEIVED (not DRAFT/REJECTED/CANCELLED) |
| Stock value | quantity × product's **current** cost price |
| Supplier fulfilment rate | units received ÷ units ordered on sent POs; `null` = no POs |
| Low-stock shortage | reorderLevel − available; `onOrderQuantity` = outstanding on pending POs for that product + warehouse |
| Low-stock products (KPI) | distinct products low in at least one warehouse |

**Rules / traps**
- `aggregate()` doesn't cast strings → filters use `new mongoose.Types.ObjectId(id)` (tested by mutation).
- Time zone: `REPORT_UTC_OFFSET` (default `+05:30`). Months use `$dateToString … timezone`; `from`/`to` are `YYYY-MM-DD` days in that zone, `to` = end of day (`utils/reportDates.js`). Tested: 20:00 UTC on 30 Sep counts in October.
- Monthly series are zero-filled (charts need every month). Default range: last 6 months.
- Dashboard: STAFF may view (counts/trends only); detailed reports: ADMIN + INVENTORY_MANAGER.

### Login protection (E2E finding L2)
Password guessing is slowed by two counters kept in the `loginattempts` collection (`models/LoginAttempt.js`; keys `email:<address>` and `ip:<address>`; removed automatically by a TTL index): **5 wrong passwords lock an account for 15 minutes, and 20 failures from one network address lock that address for 15 minutes.** All four numbers are configurable (`LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `LOGIN_IP_MAX_FAILURES`, `LOGIN_IP_WINDOW_MINUTES`; see `.env.example`).
- **How an attempt goes** (`services/loginThrottleService.js`, used by `authService.loginUser`): (1) *claim a slot first*: one atomic increment on both counters. If either key is locked, or the claim is over the limit, answer **429** `TOO_MANY_ATTEMPTS` with a `Retry-After` header *before the password is checked*. A locked account therefore refuses even the right password, and 50 simultaneous guesses can only use the first 5 slots. (2) Check the password. (3) A wrong password keeps its slot and locks the key when it used the last one. A right password clears the account's count and gives the address its slot back, so only *failures* count against an address and many staff logging in properly behind one office address never add up.
- **No account enumeration:** an unknown email gets a counter and a lock exactly like a real one, and the message is the same whether the account or the address is locked.
- **Unlocking:** the lock ends by itself; an admin password reset lifts it at once.
- **Audit log:** `LOGIN_FAILED` (real accounts, with the address) and `ACCOUNT_LOCKED` (the moment it locks). Attempts refused while locked are not logged, so an attack can't flood the log.
- **Deployment:** behind a reverse proxy set `TRUST_PROXY` (number of proxies, usually 1), otherwise every user shares the proxy's address and its limit (`app.js`).
- **Known trade-off:** someone can keep a known account locked by repeatedly guessing it (the usual price of account lockout). The lock is short, the admin can lift it, and the audit log shows where the guesses came from.

## Audit Log (Step 16)
- Written by `auditService.logAction()` from every module since Step 4: `{ user, action, entityType, entityId, oldValue, newValue, metadata, createdAt }`. Updates store only changed fields (`getChanges`). A failed audit write never breaks the business action.
- Record types (`AUDIT_ENTITY_TYPES`): User, Category, Product, Warehouse, Inventory, StockTransfer, Supplier, PurchaseOrder, Order.
- Read API: ADMIN only (spec). Filters: user, action (`[A-Z_]`), entityType, entityId, from/to (YYYY-MM-DD, business time zone, same as reports; no dates = all time), sort newest/oldest, pagination. User populated with name/email/role (never password).
- **Append-only, two layers:** (1) no POST/PUT/DELETE routes (tested → 404); (2) the AuditLog model's middleware throws on every update/delete/replace (query and document) and on re-saving an existing entry — only `create` works (probed: 12 operations blocked; tested).
- Passwords/hashes never enter the audit log (tested by scanning all entries after register, login, change and reset).
- Reading the audit log is not itself audited.

## Frontend (Step 17)
**Design:** a public website (Home, Features, About, Contact, Login, Request access) with a real header/footer, and a staff app with a **top navigation** (no admin sidebar), centred page width, page headers and cards. Custom DaisyUI theme `retailflow` in `src/index.css`. Product name in the UI: "RetailFlow".

**Auth flow**
```
Page load → App → dispatch(fetchCurrentUser) → GET /auth/me → 200 user | 401 → null (not an error)
Login form (RHF + Zod) → dispatch(loginUser) → POST /auth/login → cookie set by backend → user in Redux → navigate(from || home)
Any later 401 (not /auth/me, /auth/login) → Axios interceptor → sessionExpired → ProtectedRoute → /login with message
Password change → backend clears cookie → loggedOutWithMessage → /login
```
- Redux holds **only** `auth` (`user`, `isCheckingSession`, `sessionMessage`); everything else is `useState` in pages.
- `ProtectedRoute`: checking → loader; no user → `/login` (remembers `from`); wrong role → Forbidden page. The backend still enforces every permission.
- `utils/navigation.js` `PAGE_ACCESS` is used by BOTH the links and the routes, so they can't disagree. Links are added only when their page exists.
- Frontend Zod rules (e.g. password) copy the backend's for quick feedback; the backend re-checks.
- A supplier user's home page is `/purchases` (the supplier portal, Part 17.5); `/profile` stays reachable from the user menu.

**Frontend testing:** Vitest + React Testing Library + user-event; API mocked with `vi.mock("../services/api")` (real `getErrorMessage` kept); `renderWithProviders(ui, { preloadedState, route, path })`. Mount the component at its real `path` — mounting it at `*` makes redirecting components loop forever (found and fixed in 17.1). `services/api.test.js` tests the real interceptor with a fake Axios adapter. Run: `cd frontend && npm test`.

**Catalog pages (17.2):** `/products`, `/categories`, `/warehouses` — one list page each, with create/edit forms in pop-ups (`components/catalog/*Form.jsx`).
- Shared pieces: `hooks/useList` (fetch + reload on filter change, empty filters left out of the URL), `hooks/useDebounce` (search waits 400 ms), `Pagination`, `ListToolbar`/`FilterSelect`, `Modal`, `ConfirmModal` (shows the server refusal reason, e.g. warehouse still holds stock), `StatusBadge`, `SelectField`.
- Permissions: `PAGE_ACCESS` = who may open a page; `EDIT_ACCESS` + `canEdit(page, role)` = who sees create/edit/deactivate buttons. Products & categories: admin edits; warehouses: admin + manager edit; staff view only. Backend still enforces.
- Deactivate = confirm pop-up → `DELETE`; inactive rows get a Reactivate button (`PUT { status: "ACTIVE" }`).
- Warehouse manager drop-down is shown to admins only (listing users is admin-only in the backend); for managers the field is hidden and `manager` is not sent, so it stays unchanged.
- Drop-down choices (categories, products, warehouses, suppliers, managers…) are loaded in full: `hooks/useOptions` pages through the API's 100-per-request limit via `services/fetchAllPages.js` (all pages at once, duplicates removed, safety cap 50 pages = 5,000 items). Fixed E2E finding F3 (older items past the 100th could not be chosen).

**Inventory & transfer pages (17.3):** `/inventory`, `/inventory/history`, `/transfers`.
- Inventory: stock per product + warehouse (on hand / reserved / available / reorder level). "Low stock" badge uses the backend rule *available < reorder level*; "Low stock only" filter sends `lowStock=true`. Admin + manager get Stock in, Stock out (reason required) and Edit reorder level; staff view only. Row buttons pre-select the product and warehouse.
- Stock history: read-only movement log (type / warehouse / date filters; the "to" day is sent as 23:59:59 so it covers the whole day). Green + / red − from before → after.
- Transfers (admin + manager only, like the backend): the row shows only the next valid steps — REQUESTED: approve / reject (reason required) / cancel; APPROVED: dispatch / cancel; DISPATCHED: receive. Approve is hidden on your own request (backend blocks self-approval). Dispatch and receive ask for confirmation because they move stock; server refusals (not enough stock, destination full) are shown in the pop-up.
- New shared pieces: `hooks/useOptions` (drop-down choices, max 100), `ReasonModal`, `ConfirmModal` `confirmClass`, forms in `components/inventory/`.
- Not built (backend supports it): per-product stock view (`/inventory/product/:id`).

**Order pages (17.4):** `/orders` (list), `/orders/new`, `/orders/:id` (detail), `/orders/:id/edit`, `/fulfillment`.
- Permissions: admin + staff manage orders; the inventory manager only views (`EDIT_ACCESS.orders` / `fulfillment`; `PAGE_ACCESS.orderForm` guards the create/edit routes).
- `utils/orderStatus.js` is the single source for labels, badge colours and the flow: PENDING →(confirm) CONFIRMED → PROCESSING → PACKED → SHIPPED → DELIVERED; cancel is allowed until the order ships.
- `components/orders/OrderActions` renders the next-step / Edit / Cancel buttons for ONE order and is used by both the detail page and the fulfillment queue, so the rules live in one place. Confirm asks first; ship opens `ShipOrderModal` (carrier + tracking number required); cancel asks for an optional reason (`DELETE` with the reason under axios `data`); other steps run immediately. Server refusals (stock short, wrong status) are shown, never swallowed.
- Order form: customer + warehouse + item lines (`useFieldArray`), duplicate products blocked, live price *estimate* (the server sets the real prices), empty optional email/phone are left out of the payload (the backend rejects ""). "Save as pending" or "Save and confirm" (`confirm: true`). Only PENDING orders can be edited. The form is rebuilt when the product/warehouse options arrive so saved values show in the drop-downs.
- Fulfillment: queue counts per stage (`GET /orders/fulfillment-queue`) as clickable cards, plus the orders of the chosen stage (`GET /orders?status=`); after a step both refresh.
- Limitations: when editing, an order line whose product was deactivated after the order was made shows an empty product drop-down (pick another product).

**Supplier & purchase pages (17.5):** `/suppliers`, `/purchases`, `/purchases/new`, `/purchases/:id`, `/purchases/:id/edit`.
- Suppliers: same list + pop-up form pattern as the catalog pages; admin + manager only. Deactivation is refused by the backend while the supplier has open purchase orders, and otherwise also switches off its portal logins (the success message says how many). An empty phone is not sent (the backend rejects ""), so a phone number can't be cleared once saved.
- `utils/purchaseStatus.js` holds labels/colours: DRAFT →(submit) PENDING →(approve) APPROVED →(order) ORDERED → PARTIALLY_RECEIVED → RECEIVED; PENDING can be REJECTED; any open order can be CANCELLED.
- `components/purchases/PurchaseActions` decides the buttons from the status AND the role. Manager/admin: Submit (draft), Approve / Reject with reason (pending; approve hidden on your own request), Mark as ordered (asks first — the supplier will see it), Receive goods, Cancel (for a partly received order it reads "Cancel the rest" and says received goods stay in stock). Supplier: Confirm order (ordered and not yet confirmed) and Update delivery details.
- `ReceiveGoodsModal` lists only lines with units outstanding; blank = nothing arrived; checks whole numbers and "not more than outstanding" before calling `PUT /purchases/:id/receive`. `SupplierDeliveryModal` is used for both confirm (date/note optional) and delivery update (at least one needed); only filled-in fields are sent.
- Purchase form: supplier, warehouse, optional expected date, item lines with optional unit cost (empty = the product's cost price, so the field is omitted from the payload), estimated total. "Save as draft" or "Save and submit for approval"; when editing a draft, "submit" saves it and then calls `PUT /purchases/:id/submit`.
- Supplier portal = the same `/purchases` pages with a supplier-shaped view: title "My purchase orders", no create button, no supplier column, and no supplier/warehouse filters. Those two lists are forbidden for suppliers (403), so `useOptions` got an `enabled` argument and they are never requested. The backend limits a supplier to its own company's orders that were sent to it (`orderedAt` set).
- Limitations: the detail page has no separate supplier or per-line history view.

**Charts, reports, inbox, users, audit log, navigation, code-splitting (17.6):**
- **Charts** are small hand-written SVG components (no chart library, so no extra dependency): `components/charts/BarChart` (columns for time, horizontal bars for ranked lists), `LineChart`, `ChartCard` (title + "View as table" switch) and `ChartTooltip`; helpers in `utils/chart.js`. Rules followed (from the dataviz method): one measure per chart (never two axes), bars ≤24px with a rounded data end, hairline grid, a legend whenever there are ≥2 series, only the latest/highest bar labelled (tooltip + table carry the rest), every mark focusable and announced by `aria-label`, an empty measure shows "Nothing to show" instead of a flat chart. Colours are two fixed series colours in `index.css` (`--series-1` blue, `--series-2` orange), validated with the dataviz colour checker (colour-blind + contrast); text always uses the theme's text colours. The app has one light theme, so there is no dark set.
- **Dashboard** now has six charts under the KPIs (`DashboardCharts`): revenue by month, purchases by month, stock in/out, order status, stock by warehouse, top products. Missing chart data never crashes the page.
- **Reports (`/reports`, admin + manager):** one tabbed page for the eight backend reports. Each report is one entry in `components/reports/reportConfigs.jsx` (endpoint, which filters, headline tiles, charts, table) — adding a report means adding an entry. Filters: date range (empty = last 6 months), warehouse, category, supplier, rank-by, top-N. Data is stored together with the report it belongs to, so a tab change can never draw the previous report's data (a bug the tests caught).
- **Notifications (`/notifications`, every role):** full inbox with All/Unread, type filter, mark read / all, delete, pagination. Clicking a notification reads it and opens its `link`. The bell now has "View all notifications", opens a notification's link, and refreshes its unread number immediately when the page changes things (window event `notifications-changed` from `useUnreadCount`).
- **Users (`/users`, admin):** list with search/role/status filters; approve pending sign-ups (`PUT status ACTIVE`), create, edit, reset password, deactivate (not yourself), reactivate. SUPPLIER users must pick a supplier company; moving a user away from SUPPLIER sends `supplier: null`. Your own role and status are shown read-only (the backend refuses those changes). `status: "PENDING"` is never sent (the backend only accepts ACTIVE/INACTIVE).
- **Audit log (`/audit-logs`, admin):** read-only, filters (action / record type from `GET /audit-logs/filters`, user, dates, order), expandable row with field-by-field before/after and extra details.
- **Navigation:** `APP_LINKS` have an optional `group`; `getNavItems(role)` turns them into single links and drop-downs (Catalog, Stock, Sales, Purchasing, Admin). A group with one visible link (a supplier's Purchases) is a plain link. Drop-downs open on focus, close on click-away and after every page change. The mobile menu (`PhoneMenu`) stays a flat list and, like the groups, is rebuilt closed after every page change.
- **Code-splitting:** every staff page is `React.lazy`, loaded on first visit behind a `Suspense` spinner in `AppLayout`; `AppRoutes` is one `APP_PAGES` table (path + PAGE_ACCESS key + page). The public website stays in the first download. Main bundle is now 454 kB (142 kB gzip) and the "chunk larger than 500 kB" build warning is gone.
- **Not built (possible later):** CSV/PDF export of reports, a dark theme, per-product stock view, phone-number clearing for suppliers, drill-down from a chart bar to its list.

**Frontend build parts**
| Part | Scope | Status |
|---|---|---|
| 17.1 | Setup, API client, auth store, public site, login/register, protected routes, app layout (nav, bell, user menu), dashboard KPIs, profile | Done (38 tests) |
| 17.2 | Products, categories, warehouses | Done (70 frontend tests in total) |
| 17.3 | Inventory, stock-in/out, low stock, transfers | Done (94 frontend tests in total) |
| 17.4 | Orders + fulfillment | Done (131 frontend tests in total) |
| 17.5 | Suppliers, purchases, supplier portal | Done (178 frontend tests in total) |
| 17.6 | Dashboard charts, reports, notifications page, users, audit log, code-splitting | Done (269 frontend tests in total) |

**Pending checks (add in the step that builds each module):**
- [x] Step 8: stock-in refuses INACTIVE warehouses/products and refuses to exceed capacity. (Transfers must use `addStock`/`removeStock` to inherit this.)
- [x] Step 9: cannot deactivate a warehouse with open transfers (REQUESTED/APPROVED/DISPATCHED) — `warehouseService.ensureCanDeactivate`.
- [x] Step 11: cannot deactivate a warehouse with open purchase orders (`WAREHOUSE_HAS_OPEN_PURCHASES`).
- [x] Step 11: cannot deactivate a supplier with open purchase orders (`SUPPLIER_HAS_OPEN_PURCHASES`).
- [x] Step 12: cannot deactivate a warehouse with open customer orders (`WAREHOUSE_HAS_OPEN_ORDERS`).

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
### End-to-end tests (`e2e/`)
The real React app in Chrome against the real Express API and a real MongoDB, driven by Playwright. Details, the file map and the findings table are in `e2e/README.md`.
- **Isolation:** its own database (`retail_inventory_e2e`, dropped every run; the reset script refuses any other name) and its own ports (API 3100, app 5273). Settings go in as environment variables, so `.env` files are untouched. Both addresses use `localhost` because the login cookie is `SameSite=Strict`.
- **Coverage (phases):** 0 setup · 1 authentication, HttpOnly cookie, sessions, CORS, every page and API endpoint for every role · 2 catalog and warehouses · 3 inventory and transfers · 4 orders and fulfillment · 5 suppliers, purchases, supplier portal · 6 notifications, users, audit log · 7 reports and dashboard against hand-computed numbers · 8 two cross-module journeys · plus security, responsive layout and size limits.
- **Method:** each test creates its own uniquely named data through the API, does the important steps through the real screens, then checks the database (through the API) as well as the screen. Race conditions are tested by firing two requests at once. Expected numbers are worked out by hand from the documented definitions, never read from the code under test.
- **Findings** were recorded as `Fn` tests marked `test.fail` (they pass while the bug exists and fail loudly once it is fixed). See the table in `e2e/README.md`: all findings (F1–F6, L1–L3) are now fixed, so the suite has no expected-failure tests left.
- One-off data fix after F2: `cd backend && npm run db:fix-notification-links` (rewrites old notification links; idempotent).
- Run: `cd e2e && npm test` (about 12 minutes; a single file under a minute).
- **Postman collection (`postman/`):** all endpoints (161 requests, 10 folders, about 500 assertions) as one runnable story, plus an environment file. Cookie login is handled by Postman; test scripts save ids between requests; each run uses a fresh `runId` so it can be repeated. It is generated by `postman/build-collection.js` (edit that, not the JSON). Verified with newman against the isolated E2E stack (two consecutive runs, 513/513 assertions). Usage and the folder table are in `postman/README.md`. It creates data and never cleans up, so run it only against a throw-away database.
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
| 9. Stock transfers | Done |
| 10. Suppliers | Done |
| 11. Purchases (requests, POs, supplier portal, receiving) | Done |
| 12. Customer orders (reserve stock) | Done |
| 13. Order fulfillment (pick, pack, ship, deliver; Rule 5) | Done |
| 14. Notifications API (list, unread count, mark read) | Done |
| 15. Reports & analytics (dashboard KPIs, reports, chart data) | Done |
| 16. Audit log API | Done (450 tests passing) — **backend complete** |
| 17. Frontend (public website + staff app) | Done — all six parts (269 frontend tests) |

## Known Issues
- While a multi-line order confirmation is being rolled back (one line failed), its already-reserved lines are held for a few milliseconds; another order confirming at that exact moment may be refused although stock is about to be released. Safe (it only errs towards "no"), rare, acceptable.
- Tokens issued before the logout-revocation change (E2E finding L1) have no id and can't be ended by logout; they expire on their own (at most a day) and are still ended by a password change/reset. New tokens are fully revocable.

## Future Improvements
- A "your devices" screen and "log out my other devices" (logout revokes single tokens today; a session collection would make sessions listable). Done since this list was written: token revocation on logout (E2E finding L1), rate limiting and lockout on /login and audited failed logins (L2).
- Tamper-proof audit trail: today someone with direct database access (Compass/mongosh) can still edit `auditLogs`. Options: a database user for the app with insert-only rights on that collection, hash-chaining entries, or shipping logs to write-once storage.
- Docker, CI/CD, cloud deployment (explicitly out of scope for now).

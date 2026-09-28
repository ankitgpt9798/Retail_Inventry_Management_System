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
13 collections (spec's 12 + `stockTransfers`). All statuses/roles come from `src/utils/constants.js`.

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
| 6. Products & categories | Done (149 tests passing) |
| 7. Warehouses | Next |

## Known Issues
- A JWT copied before a plain logout stays valid until it expires (max 1 day). Password change/reset does revoke all tokens (tokenVersion). Acceptable for now; see Future Improvements.

## Future Improvements
- Redis token blocklist on logout; rate limiting on /login (brute-force protection).
- Docker, CI/CD, cloud deployment (explicitly out of scope for now).

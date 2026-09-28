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

## Authentication Flow
_Step 4._

## Frontend Pages
_Step 17._

## Testing Strategy
- Every module: Jest unit tests for services, Supertest API tests for routes, Postman collection.
- Run backend tests: `cd backend && npm test`
- `tests/unit`: no database (schema validation via `validateSync()`, later service logic)
- `tests/integration`: real MongoDB, database `retail_inventory_test` (wiped each run, never the dev DB)
- `tests/api`: HTTP requests through Supertest

## Progress
| Step | Status |
|---|---|
| 1. Project setup | Done |
| 2. MongoDB connection | Done |
| 3. Database schemas | Done (13 models, unit + DB tests) |
| 4. Authentication | Next |

## Known Issues
- None yet.

## Future Improvements
- Docker, CI/CD, cloud deployment (explicitly out of scope for now).

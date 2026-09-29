// Builds the Postman collection and environment files.
//   node build-collection.js      →  RetailInventory.postman_collection.json + RetailInventory.postman_environment.json
//
// WHY A GENERATOR: the collection has ~100 requests that all follow the same pattern (URL, body, a few test
// checks, a few saved ids). Writing them as small function calls here is far less error-prone than editing
// thousands of lines of JSON, and the result is regenerated, never hand-edited. The generated files are committed
// so people can import them without running anything.
//
// HOW THE COLLECTION RUNS: top to bottom, as one story (set up users → catalog → stock → transfers → orders →
// purchases → supplier portal → notifications → reports → audit → users → security checks). Postman keeps the
// login cookie for you, so "Login as manager" switches who you are for the requests that follow. Test scripts save
// ids (productId, orderId, ...) into collection variables, so later requests use them automatically.

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------- building blocks

const JSON_HEADER = [{ key: "Content-Type", value: "application/json" }];

// "{{baseUrl}}/products/{{productId}}" + query → Postman's URL object
const buildUrl = (route, query = {}) => {
    const segments = route.split("/").filter(Boolean);
    return {
        raw: `{{baseUrl}}/${segments.join("/")}${Object.keys(query).length ? "?" + Object.entries(query).map(([k, v]) => `${k}=${v}`).join("&") : ""}`,
        host: ["{{baseUrl}}"],
        path: segments,
        query: Object.entries(query).map(([key, value]) => ({ key, value: String(value) }))
    };
};

const script = (listen, lines) => ({ listen, script: { type: "text/javascript", exec: lines } });

// The standard test block. status = expected HTTP status; ok = true when the API should say success: true.
//   saves:  { variableName: "expression using body" }  → stored for later requests (only when present)
//   checks: [["what is checked", "javascript that throws/asserts using body"]]
const testLines = ({ status = 200, saves = {}, checks = [], code, note } = {}) => {
    const lines = [`pm.test("status is ${status}", () => pm.response.to.have.status(${status}));`];
    lines.push("const body = pm.response.json();");
    if (code) {
        lines.push(`pm.test("error code is ${code}", () => pm.expect(body.error).to.equal("${code}"));`);
        lines.push('pm.test("error answer has the standard shape", () => { pm.expect(body.success).to.equal(false); pm.expect(body.message).to.be.a("string"); });');
    }
    else {
        lines.push('pm.test("answer has the standard shape", () => { pm.expect(body.success).to.equal(true); pm.expect(body.message).to.be.a("string"); });');
    }
    for (const [what, assertion] of checks) {
        lines.push(`pm.test(${JSON.stringify(what)}, () => { ${assertion} });`);
    }
    for (const [variable, expression] of Object.entries(saves)) {
        lines.push(`{ const value = ${expression}; if (value !== undefined && value !== null) pm.collectionVariables.set("${variable}", String(value)); }`);
    }
    if (note) lines.push(`// ${note}`);
    return lines;
};

// One request. opts: { body, query, description, pre (pre-request script lines), ...testLines options }
const req = (name, method, route, opts = {}) => {
    const item = {
        name,
        request: {
            method,
            header: opts.body ? JSON_HEADER : [],
            url: buildUrl(route, opts.query),
            description: opts.description || ""
        },
        event: []
    };
    if (opts.body) item.request.body = { mode: "raw", raw: JSON.stringify(opts.body, null, 2), options: { raw: { language: "json" } } };
    if (opts.pre) item.event.push(script("prerequest", opts.pre));
    item.event.push(script("test", testLines(opts)));
    return item;
};

const folder = (name, description, items) => ({ name, description, item: items });

// Log in as one of the roles created in the setup folder (or the admin from the environment)
const login = (role) => {
    const email = role === "admin" ? "{{adminEmail}}" : `{{${role}Email}}`;
    const password = role === "admin" ? "{{adminPassword}}" : `{{${role}Password}}`;
    return req(`Login as ${role}`, "POST", "/auth/login", {
        body: { email, password },
        description: `Logs in as **${role}**. The server sets an HTTP-only \`token\` cookie; Postman keeps it and sends it on every request that follows, so from here on you ARE ${role}.`,
        checks: [
            ["user has the expected role", `pm.expect(body.data.user.role).to.equal(${JSON.stringify(role === "admin" ? "ADMIN" : role.startsWith("manager") ? "INVENTORY_MANAGER" : role === "staff" ? "STAFF" : "SUPPLIER")});`],
            ["the login cookie was set", 'pm.expect(pm.cookies.has("token")).to.equal(true);'],
            ["the password is never sent back", "pm.expect(JSON.stringify(body)).to.not.include(\"password\");"]
        ],
        saves: { [role === "supplier" ? "supplierUserId" : `${role}Id`]: "body.data.user._id" }
    });
};

// ---------------------------------------------------------------- the collection

const RUN = "{{runId}}";

const collection = {
    info: {
        name: "Retail Inventory API",
        description: [
            "The whole Retail Inventory Management System API, as one runnable story.",
            "",
            "**Start here:** import this collection and the environment, make sure the backend is running (`npm run dev` in `backend/`) and that the admin from `backend/.env` exists (`npm run seed:admin`), put that admin's email and password in the environment (`adminEmail`, `adminPassword`), then run the collection top to bottom (Collection Runner) or click through the requests in order.",
            "",
            "**Who you are:** the API uses an HTTP-only login cookie. Postman keeps it automatically, and each *Login as ...* request switches your role. Requests are grouped so each folder runs as the right role.",
            "",
            "**Ids:** test scripts save the ids they need (`productId`, `orderId`, `purchaseId` ...) into collection variables, so later requests work without copy-and-paste.",
            "",
            "**Every response** has the same shape: `{ success, message, data }` on success, `{ success: false, message, error }` on failure (validation errors also carry `errors: [{ field, message }]`). Lists carry `data.pagination = { page, limit, total, totalPages }`; the largest page is 100.",
            "",
            "**Roles:** ADMIN, INVENTORY_MANAGER, STAFF, SUPPLIER. Each request says who may call it."
        ].join("\n"),
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    variable: [
        { key: "baseUrl", value: "http://localhost:3000/api" },
        { key: "runId", value: "" }
    ],
    item: []
};

// ============================================================ 0. Setup and authentication
collection.item.push(
    folder("0. Setup and authentication", "Starts a run, logs in as the admin, creates one user per role, and shows sign-up, login, wrong-password and profile checks.", [
        req("Health check", "GET", "/health", {
            description: "Public. Is the server up? Also starts a NEW RUN: a fresh `runId` is generated, used to make emails, SKUs and codes unique so the collection can be run again and again.",
            pre: [
                'const runId = Date.now().toString(36);',
                'pm.collectionVariables.set("runId", runId);',
                'for (const key of ["managerEmail","manager2Email","staffEmail","supplierEmail","categoryId","productId","productBId","warehouseId","warehouse2Id","supplierId"]) pm.collectionVariables.unset(key);',
                'pm.collectionVariables.set("managerPassword", "Manager123");',
                'pm.collectionVariables.set("manager2Password", "Manager456");',
                'pm.collectionVariables.set("staffPassword", "Staff1234");',
                'pm.collectionVariables.set("supplierPassword", "Supplier123");'
            ],
            checks: [["the server reports success", "pm.expect(body.success).to.equal(true);"]]
        }),
        login("admin"),
        req("Who am I?", "GET", "/auth/me", {
            description: "Any logged-in role. Returns the current user (never the password).",
            checks: [["it is the admin", 'pm.expect(body.data.user.role).to.equal("ADMIN");']]
        }),
        req("Create manager (Ravi)", "POST", "/users", {
            description: "**ADMIN only.** Creates an inventory manager.",
            pre: ['pm.collectionVariables.set("managerEmail", `manager-${pm.collectionVariables.get("runId")}@postman.test`);'],
            body: { name: "Ravi Kumar", email: "{{managerEmail}}", password: "{{managerPassword}}", role: "INVENTORY_MANAGER", phone: "9000000001" },
            status: 201,
            saves: { managerId: "body.data.user._id" },
            checks: [["role and status", 'pm.expect(body.data.user).to.include({ role: "INVENTORY_MANAGER", status: "ACTIVE" });']]
        }),
        req("Create second manager (Neha)", "POST", "/users", {
            description: "**ADMIN only.** A second manager: approvals must come from a DIFFERENT person than the requester.",
            pre: ['pm.collectionVariables.set("manager2Email", `manager2-${pm.collectionVariables.get("runId")}@postman.test`);'],
            body: { name: "Neha Singh", email: "{{manager2Email}}", password: "{{manager2Password}}", role: "INVENTORY_MANAGER" },
            status: 201,
            saves: { manager2Id: "body.data.user._id" }
        }),
        req("Create staff (Sunita)", "POST", "/users", {
            description: "**ADMIN only.** Staff create and process customer orders.",
            pre: ['pm.collectionVariables.set("staffEmail", `staff-${pm.collectionVariables.get("runId")}@postman.test`);'],
            body: { name: "Sunita Rao", email: "{{staffEmail}}", password: "{{staffPassword}}", role: "STAFF" },
            status: 201,
            saves: { staffId: "body.data.user._id" }
        }),
        req("Create supplier company", "POST", "/suppliers", {
            description: "**ADMIN or INVENTORY_MANAGER.**",
            body: { name: `Acme Electronics ${RUN}`, email: `sales-${RUN}@acme.test`, contactPerson: "Suresh Patel", phone: "9876543210", city: "Delhi", address: "12 MG Road" },
            status: 201,
            saves: { supplierId: "body.data.supplier._id" }
        }),
        req("Create supplier portal user", "POST", "/users", {
            description: "**ADMIN only.** A SUPPLIER user must belong to a supplier company (`supplier`).",
            pre: ['pm.collectionVariables.set("supplierEmail", `supplier-${pm.collectionVariables.get("runId")}@postman.test`);'],
            body: { name: "Suresh Patel", email: "{{supplierEmail}}", password: "{{supplierPassword}}", role: "SUPPLIER", supplier: "{{supplierId}}" },
            status: 201,
            saves: { supplierUserId: "body.data.user._id" },
            checks: [["linked to the company", "pm.expect(body.data.user.supplier).to.be.ok;"]]
        }),
        req("Register (public sign-up)", "POST", "/auth/register", {
            description: "Public. Always creates a STAFF user with status PENDING, whatever the request says (here it even asks for ADMIN). An admin must approve it before it can log in; no cookie is set.",
            pre: ['pm.collectionVariables.set("pendingEmail", `pending-${pm.collectionVariables.get("runId")}@postman.test`);'],
            body: { name: "New Joiner", email: "{{pendingEmail}}", password: "Joiner12345", phone: "9000000009", role: "ADMIN" },
            status: 201,
            checks: [
                ["always STAFF and PENDING", 'pm.expect(body.data.user).to.include({ role: "STAFF", status: "PENDING" });'],
                ["no login cookie is issued", 'pm.expect(pm.response.headers.has("Set-Cookie")).to.equal(false);']
            ]
        }),
        req("Find the pending user", "GET", "/users", {
            description: "**ADMIN only.** Searches users. Saves the pending user's id.",
            query: { search: "{{pendingEmail}}", status: "PENDING" },
            saves: { pendingId: "body.data.users[0] && body.data.users[0]._id" },
            checks: [["found exactly the pending user", "pm.expect(body.data.users).to.have.length(1);"]]
        }),
        req("Approve the pending user", "PUT", "/users/{{pendingId}}", {
            description: "**ADMIN only.** Approving = setting the status to ACTIVE (the role can be changed here too).",
            body: { status: "ACTIVE", role: "STAFF" },
            checks: [["now active", 'pm.expect(body.data.user.status).to.equal("ACTIVE");']]
        }),
        req("Wrong password is refused", "POST", "/auth/login", {
            description: "The same message for a wrong password and an unknown email, so nobody can find out which emails have accounts. Five wrong passwords lock an account for 15 minutes (429 TOO_MANY_ATTEMPTS, with a Retry-After header); this collection stops at one so it never locks anyone.",
            body: { email: "{{staffEmail}}", password: "definitely-wrong-1" },
            status: 401,
            code: "INVALID_CREDENTIALS"
        })
    ])
);

// ============================================================ 1. Catalog (admin)
collection.item.push(
    folder("1. Catalog: categories, products, warehouses", "Run as the **admin**. Staff and managers can only VIEW the catalog; managers may also manage warehouses.", [
        login("admin"),
        req("Create category", "POST", "/categories", {
            body: { name: `Electronics ${RUN}`, description: "Gadgets and accessories" },
            status: 201,
            saves: { categoryId: "body.data.category._id" }
        }),
        req("Duplicate category name is refused", "POST", "/categories", {
            body: { name: `Electronics ${RUN}` },
            status: 409,
            code: "CATEGORY_EXISTS"
        }),
        req("List categories", "GET", "/categories", {
            description: "Any staff role. Filters: `search`, `status`, `page`, `limit`.",
            query: { search: `Electronics ${RUN}`, status: "ACTIVE", page: 1, limit: 10 },
            checks: [["one match, with paging info", "pm.expect(body.data.categories).to.have.length(1); pm.expect(body.data.pagination.total).to.equal(1);"]]
        }),
        req("Update category", "PUT", "/categories/{{categoryId}}", {
            body: { description: "Gadgets, accessories and cables" },
            checks: [["changed", 'pm.expect(body.data.category.description).to.include("cables");']]
        }),
        req("Create product A (laptop)", "POST", "/products", {
            description: "**ADMIN only.** SKU is stored in UPPER CASE. Prices are rounded to 2 decimals.",
            body: { name: `Laptop Pro ${RUN}`, sku: `lap-${RUN}`, category: "{{categoryId}}", brand: "Acme", costPrice: 700, sellingPrice: 1000, taxRate: 18, reorderLevel: 10, barcode: `BAR-A-${RUN}` },
            status: 201,
            saves: { productId: "body.data.product._id", productSku: "body.data.product.sku" },
            checks: [["SKU upper-cased", "pm.expect(body.data.product.sku).to.equal(body.data.product.sku.toUpperCase());"]]
        }),
        req("Create product B (mouse)", "POST", "/products", {
            body: { name: `Mouse ${RUN}`, sku: `mou-${RUN}`, category: "{{categoryId}}", costPrice: 150, sellingPrice: 500, taxRate: 0, reorderLevel: 5 },
            status: 201,
            saves: { productBId: "body.data.product._id" }
        }),
        req("Duplicate SKU is refused", "POST", "/products", {
            body: { name: "Another", sku: `lap-${RUN}`, category: "{{categoryId}}", costPrice: 1, sellingPrice: 2 },
            status: 409,
            code: "SKU_EXISTS"
        }),
        req("Invalid product is refused (validation)", "POST", "/products", {
            description: "Bad input gets **422** with a list of field errors, and nothing is created.",
            body: { name: "X", sku: "bad sku!", costPrice: -5 },
            status: 422,
            code: "VALIDATION_ERROR",
            checks: [["field errors are listed", "pm.expect(body.errors).to.be.an('array').that.is.not.empty; pm.expect(body.errors[0]).to.have.keys('field', 'message');"]]
        }),
        req("List products", "GET", "/products", {
            description: "Filters: `search` (name, SKU, brand), `category`, `status`, `brand`, `minPrice`, `maxPrice`, `sort` (newest, oldest, name, price_low, price_high), `page`, `limit`.",
            query: { search: `${RUN}`, sort: "price_high", limit: 10 },
            checks: [["most expensive first", "pm.expect(body.data.products[0].sellingPrice).to.be.at.least(body.data.products[1].sellingPrice);"]]
        }),
        req("Get one product", "GET", "/products/{{productId}}", {
            checks: [["category is included", "pm.expect(body.data.product.category.name).to.be.a('string');"]]
        }),
        req("Update product", "PUT", "/products/{{productId}}", {
            body: { sellingPrice: 1100 },
            checks: [["new price", "pm.expect(body.data.product.sellingPrice).to.equal(1100);"]]
        }),
        req("Create warehouse 1 (with a manager)", "POST", "/warehouses", {
            description: "**ADMIN or INVENTORY_MANAGER.** Code is stored in UPPER CASE; `manager` must be an active manager or admin.",
            body: { name: `Delhi Central ${RUN}`, code: `del-${RUN}`, city: "Delhi", state: "Delhi", address: "Sector 5", capacity: 5000, manager: "{{managerId}}" },
            status: 201,
            saves: { warehouseId: "body.data.warehouse._id", warehouseCode: "body.data.warehouse.code" },
            checks: [["manager attached", "pm.expect(body.data.warehouse.manager._id).to.equal(pm.collectionVariables.get('managerId'));"]]
        }),
        req("Create warehouse 2", "POST", "/warehouses", {
            body: { name: `Noida Hub ${RUN}`, code: `noi-${RUN}`, city: "Noida", capacity: 3000 },
            status: 201,
            saves: { warehouse2Id: "body.data.warehouse._id" }
        }),
        req("List warehouses", "GET", "/warehouses", {
            query: { search: `${RUN}`, status: "ACTIVE" },
            checks: [["both warehouses", "pm.expect(body.data.warehouses).to.have.length(2);"]]
        }),
        req("Get warehouse (with stock summary)", "GET", "/warehouses/{{warehouseId}}", {
            checks: [["stock summary present", "pm.expect(body.data.stockSummary).to.have.property('totalQuantity');"]]
        }),
        req("Update warehouse", "PUT", "/warehouses/{{warehouse2Id}}", {
            body: { capacity: 3500 },
            checks: [["new capacity", "pm.expect(body.data.warehouse.capacity).to.equal(3500);"]]
        })
    ])
);

// ============================================================ 2. Inventory (manager)
collection.item.push(
    folder("2. Inventory: stock in and out", "Run as an **inventory manager**. Staff can view stock; only admins and managers can change it. Stock quantities only ever change through these calls (and transfers, purchases and orders).", [
        login("manager"),
        req("Stock in: 100 laptops to warehouse 1", "POST", "/inventory/stock-in", {
            description: "Adds stock. Refused if the warehouse or product is inactive, or the warehouse would go over capacity.",
            body: { product: "{{productId}}", warehouse: "{{warehouseId}}", quantity: 100, note: "First delivery" },
            saves: { inventoryId: "body.data.inventory._id" },
            checks: [["quantities", "pm.expect(body.data.inventory).to.include({ quantity: 100, reservedQuantity: 0, availableQuantity: 100 });"]]
        }),
        req("Stock in: 40 mice to warehouse 1", "POST", "/inventory/stock-in", {
            body: { product: "{{productBId}}", warehouse: "{{warehouseId}}", quantity: 40 },
            saves: { inventoryBId: "body.data.inventory._id" }
        }),
        req("Stock out needs a reason", "POST", "/inventory/stock-out", {
            body: { product: "{{productId}}", warehouse: "{{warehouseId}}", quantity: 5 },
            status: 422,
            code: "VALIDATION_ERROR"
        }),
        req("Stock out: 10 laptops (damaged)", "POST", "/inventory/stock-out", {
            body: { product: "{{productId}}", warehouse: "{{warehouseId}}", quantity: 10, note: "Damaged in transit" },
            checks: [["100 - 10", "pm.expect(body.data.inventory.quantity).to.equal(90);"]]
        }),
        req("Stock out more than available is refused", "POST", "/inventory/stock-out", {
            body: { product: "{{productId}}", warehouse: "{{warehouseId}}", quantity: 9999, note: "too much" },
            status: 400,
            code: "INSUFFICIENT_STOCK"
        }),
        req("Stock in beyond capacity is refused", "POST", "/inventory/stock-in", {
            body: { product: "{{productId}}", warehouse: "{{warehouse2Id}}", quantity: 999999 },
            status: 409,
            code: "CAPACITY_EXCEEDED",
            checks: [["says how much will fit", "pm.expect(body.message).to.include('will fit');"]]
        }),
        req("Set a reorder level", "PUT", "/inventory/{{inventoryBId}}/reorder-level", {
            description: "Low stock = AVAILABLE quantity below the reorder level. Crossing it sends a LOW_STOCK notification to admins and managers.",
            body: { reorderLevel: 45 },
            checks: [["saved", "pm.expect(body.data.inventory.reorderLevel).to.equal(45);"]]
        }),
        req("List stock", "GET", "/inventory", {
            description: "Filters: `warehouse`, `product`, `search`, `lowStock=true`, `page`, `limit`.",
            query: { warehouse: "{{warehouseId}}" },
            checks: [["both products", "pm.expect(body.data.inventories).to.have.length(2);"]]
        }),
        req("Low-stock list", "GET", "/inventory/low-stock", {
            query: { warehouse: "{{warehouseId}}" },
            checks: [["the mouse (40 available, level 45) is low", "pm.expect(body.data.inventories.map(i => i.product.sku)).to.include(pm.collectionVariables.get('productSku').replace('LAP-','MOU-'));"]]
        }),
        req("Get one stock record", "GET", "/inventory/{{inventoryId}}"),
        req("Stock of one product in every warehouse", "GET", "/inventory/product/{{productId}}", {
            checks: [["totals", "pm.expect(body.data.totals.quantity).to.equal(90);"]]
        }),
        req("Stock movement history", "GET", "/inventory/transactions", {
            description: "Every change of stock, newest first. Filters: `product`, `warehouse`, `type` (STOCK_IN, STOCK_OUT, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT), `from`, `to`, `page`, `limit`.",
            query: { warehouse: "{{warehouseId}}", type: "STOCK_OUT" },
            checks: [["the manual removal is there", "pm.expect(body.data.transactions[0]).to.include({ type: 'STOCK_OUT', quantity: 10 });"]]
        })
    ])
);

// ============================================================ 3. Transfers
collection.item.push(
    folder("3. Transfers between warehouses", "Requested by one manager, approved by ANOTHER (nobody approves their own request). Stock moves out at dispatch and in at receive.", [
        login("manager"),
        req("Request transfer: 30 laptops, warehouse 1 to 2", "POST", "/transfers", {
            description: "**ADMIN or INVENTORY_MANAGER.** Nothing moves yet.",
            body: { product: "{{productId}}", fromWarehouse: "{{warehouseId}}", toWarehouse: "{{warehouse2Id}}", quantity: 30, notes: "Restock Noida" },
            status: 201,
            saves: { transferId: "body.data.transfer._id", transferNumber: "body.data.transfer.transferNumber" },
            checks: [["REQUESTED with a TRF number", "pm.expect(body.data.transfer.status).to.equal('REQUESTED'); pm.expect(body.data.transfer.transferNumber).to.match(/^TRF-\\d{6}$/);"]]
        }),
        req("Request a second transfer (to be rejected)", "POST", "/transfers", {
            body: { product: "{{productId}}", fromWarehouse: "{{warehouseId}}", toWarehouse: "{{warehouse2Id}}", quantity: 5 },
            status: 201,
            saves: { transfer2Id: "body.data.transfer._id" }
        }),
        req("Request a third transfer (to be cancelled)", "POST", "/transfers", {
            body: { product: "{{productBId}}", fromWarehouse: "{{warehouseId}}", toWarehouse: "{{warehouse2Id}}", quantity: 2 },
            status: 201,
            saves: { transfer3Id: "body.data.transfer._id" }
        }),
        req("Same warehouse twice is refused", "POST", "/transfers", {
            body: { product: "{{productId}}", fromWarehouse: "{{warehouseId}}", toWarehouse: "{{warehouseId}}", quantity: 1 },
            status: 422,
            code: "VALIDATION_ERROR"
        }),
        req("More than the source holds is refused", "POST", "/transfers", {
            body: { product: "{{productId}}", fromWarehouse: "{{warehouseId}}", toWarehouse: "{{warehouse2Id}}", quantity: 5000 },
            status: 400,
            code: "INSUFFICIENT_STOCK"
        }),
        req("You cannot approve your own request", "PUT", "/transfers/{{transferId}}/approve", {
            status: 403,
            code: "SELF_APPROVAL_NOT_ALLOWED"
        }),
        login("manager2"),
        req("Approve (by the other manager)", "PUT", "/transfers/{{transferId}}/approve", {
            checks: [["APPROVED", "pm.expect(body.data.transfer.status).to.equal('APPROVED');"]]
        }),
        req("Dispatch: stock leaves warehouse 1", "PUT", "/transfers/{{transferId}}/dispatch", {
            checks: [["DISPATCHED", "pm.expect(body.data.transfer.status).to.equal('DISPATCHED');"]]
        }),
        req("A dispatched transfer cannot be cancelled", "PUT", "/transfers/{{transferId}}/cancel", {
            body: {},
            status: 409,
            code: "INVALID_TRANSFER_STATUS"
        }),
        req("Receive: stock arrives in warehouse 2", "PUT", "/transfers/{{transferId}}/receive", {
            checks: [["RECEIVED", "pm.expect(body.data.transfer.status).to.equal('RECEIVED');"]]
        }),
        req("Reject the second transfer (a reason is required)", "PUT", "/transfers/{{transfer2Id}}/reject", {
            body: { reason: "Destination is overstocked" },
            checks: [["REJECTED with the reason", "pm.expect(body.data.transfer).to.include({ status: 'REJECTED', rejectionReason: 'Destination is overstocked' });"]]
        }),
        req("Cancel the third transfer", "PUT", "/transfers/{{transfer3Id}}/cancel", {
            body: { reason: "Plans changed" },
            checks: [["CANCELLED", "pm.expect(body.data.transfer.status).to.equal('CANCELLED');"]]
        }),
        req("List transfers", "GET", "/transfers", {
            description: "Filters: `status`, `product`, `warehouse`, `fromWarehouse`, `toWarehouse`, `search` (transfer number), `page`, `limit`.",
            query: { warehouse: "{{warehouseId}}" },
            checks: [["all three, newest first", "pm.expect(body.data.transfers).to.have.length(3);"]]
        }),
        req("Get one transfer", "GET", "/transfers/{{transferId}}"),
        req("Stock check: 90 - 30 in warehouse 1, 30 in warehouse 2", "GET", "/inventory/product/{{productId}}", {
            checks: [["nothing lost in transit", "pm.expect(body.data.totals.quantity).to.equal(90);"]]
        })
    ])
);

// ============================================================ 4. Orders
collection.item.push(
    folder("4. Customer orders and fulfillment", "Run as **staff** (or admin). Managers can only VIEW orders. Flow: PENDING → confirm (stock reserved) → PROCESSING → PACKED → SHIPPED (stock leaves) → DELIVERED. Prices always come from the product list.", [
        login("staff"),
        req("Create an order (pending)", "POST", "/orders", {
            description: "**ADMIN or STAFF.** Only product and quantity are sent; prices and tax come from the server. `confirm: true` would reserve the stock straight away.",
            body: {
                customer: { name: "Priya Sharma", email: "priya@example.com", phone: "9876543210", address: "12 MG Road, Delhi" },
                warehouse: "{{warehouseId}}",
                items: [{ product: "{{productId}}", quantity: 2 }, { product: "{{productBId}}", quantity: 3 }],
                notes: "Deliver after 5 pm"
            },
            status: 201,
            saves: { orderId: "body.data.order._id", orderNumber: "body.data.order.orderNumber" },
            checks: [["pricing done by the server: 2 x 1100 + 3 x 500, tax on the laptops", "pm.expect(body.data.order).to.include({ status: 'PENDING', subtotal: 3700, taxAmount: 396, totalAmount: 4096 });"]]
        }),
        req("Tampered prices are ignored", "POST", "/orders", {
            body: { customer: { name: "Cheeky Customer" }, warehouse: "{{warehouseId}}", items: [{ product: "{{productBId}}", quantity: 1, unitPrice: 1, lineTotal: 1 }], totalAmount: 1 },
            status: 201,
            saves: { order2Id: "body.data.order._id" },
            checks: [["the mouse costs 500, not 1", "pm.expect(body.data.order.totalAmount).to.equal(500);"]]
        }),
        req("More than is available is refused", "POST", "/orders", {
            body: { customer: { name: "Too Greedy" }, warehouse: "{{warehouseId}}", items: [{ product: "{{productId}}", quantity: 9999 }] },
            status: 400,
            code: "INSUFFICIENT_STOCK"
        }),
        req("Edit the pending order", "PUT", "/orders/{{orderId}}", {
            description: "Only PENDING orders can be edited. Totals are recalculated.",
            body: { items: [{ product: "{{productId}}", quantity: 2 }, { product: "{{productBId}}", quantity: 4 }] },
            checks: [["recalculated: 2 x 1100 + 4 x 500", "pm.expect(body.data.order.subtotal).to.equal(4200);"]]
        }),
        req("Confirm: stock is reserved", "PUT", "/orders/{{orderId}}/confirm", {
            checks: [["CONFIRMED", "pm.expect(body.data.order.status).to.equal('CONFIRMED');"]]
        }),
        req("Confirmed orders cannot be edited", "PUT", "/orders/{{orderId}}", {
            body: { notes: "too late" },
            status: 409,
            code: "INVALID_ORDER_STATUS"
        }),
        req("Steps cannot be skipped (PACKED before PROCESSING)", "PUT", "/orders/{{orderId}}/status", {
            body: { status: "PACKED" },
            status: 409,
            code: "INVALID_ORDER_STATUS"
        }),
        req("Start processing", "PUT", "/orders/{{orderId}}/status", {
            body: { status: "PROCESSING" },
            checks: [["PROCESSING", "pm.expect(body.data.order.status).to.equal('PROCESSING');"]]
        }),
        req("Mark packed", "PUT", "/orders/{{orderId}}/status", {
            body: { status: "PACKED", note: "Packed in two boxes" }
        }),
        req("Shipping needs a carrier and tracking number", "PUT", "/orders/{{orderId}}/status", {
            body: { status: "SHIPPED" },
            status: 422,
            code: "VALIDATION_ERROR"
        }),
        req("Ship: the reserved stock leaves the warehouse", "PUT", "/orders/{{orderId}}/status", {
            body: { status: "SHIPPED", carrier: "Blue Dart", trackingNumber: "BD123456789" },
            checks: [["tracking saved", "pm.expect(body.data.order).to.include({ status: 'SHIPPED', carrier: 'Blue Dart', trackingNumber: 'BD123456789' });"]]
        }),
        req("A shipped order cannot be cancelled", "DELETE", "/orders/{{orderId}}", {
            body: { reason: "too late" },
            status: 409,
            code: "INVALID_ORDER_STATUS"
        }),
        req("Deliver", "PUT", "/orders/{{orderId}}/status", {
            body: { status: "DELIVERED" },
            checks: [["DELIVERED, with the full history", "pm.expect(body.data.order.status).to.equal('DELIVERED'); pm.expect(body.data.order.statusHistory.length).to.be.at.least(5);"]]
        }),
        req("Confirm the second order, then cancel it", "PUT", "/orders/{{order2Id}}/confirm"),
        req("Cancel: the reservation is released", "DELETE", "/orders/{{order2Id}}", {
            description: "DELETE cancels (the record is kept). The optional `reason` goes in the body. Allowed until the order ships.",
            body: { reason: "Customer changed mind" },
            checks: [["CANCELLED", "pm.expect(body.data.order.status).to.equal('CANCELLED');"]]
        }),
        req("List orders", "GET", "/orders", {
            description: "Filters: `status`, `warehouse`, `search` (number, customer, phone), `from`, `to`, `page`, `limit`.",
            query: { warehouse: "{{warehouseId}}" },
            checks: [["both orders", "pm.expect(body.data.orders).to.have.length(2);"]]
        }),
        req("Get one order (with its lines)", "GET", "/orders/{{orderId}}", {
            checks: [["two lines with snapshot prices", "pm.expect(body.data.items).to.have.length(2); pm.expect(body.data.items[0].unitPrice).to.equal(1100);"]]
        }),
        req("Fulfillment queue: how many orders wait at each stage", "GET", "/orders/fulfillment-queue", {
            checks: [["all stages counted", "pm.expect(body.data.queue).to.have.keys('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED');"]]
        }),
        login("manager"),
        req("A manager can look at orders", "GET", "/orders/{{orderId}}", {
            checks: [["visible", "pm.expect(body.data.order._id).to.equal(pm.collectionVariables.get('orderId'));"]]
        }),
        req("...but cannot change them", "PUT", "/orders/{{order2Id}}/confirm", {
            status: 403,
            code: "FORBIDDEN"
        })
    ])
);

// ============================================================ 5. Purchases and supplier portal
collection.item.push(
    folder("5. Purchase orders and the supplier portal", "DRAFT → submit → approve (by a DIFFERENT manager) → order (sent to the supplier) → supplier confirms → goods received (in parts) → RECEIVED. The supplier user only ever sees their own company's SENT orders.", [
        login("manager"),
        req("Create a purchase order (draft)", "POST", "/purchases", {
            description: "**ADMIN or INVENTORY_MANAGER.** `unitCost` is optional (defaults to the product's cost price). `submit: true` would submit it for approval straight away.",
            body: { supplier: "{{supplierId}}", warehouse: "{{warehouse2Id}}", items: [{ product: "{{productId}}", quantityOrdered: 20, unitCost: 650 }, { product: "{{productBId}}", quantityOrdered: 10 }], expectedDeliveryDate: "2030-01-15", notes: "First order of the year" },
            status: 201,
            saves: { purchaseId: "body.data.purchase._id", poNumber: "body.data.purchase.poNumber" },
            checks: [["DRAFT, total 20 x 650 + 10 x 150 (product cost)", "pm.expect(body.data.purchase).to.include({ status: 'DRAFT', totalAmount: 14500 });"]]
        }),
        req("The supplier cannot see drafts (checked later)", "GET", "/purchases/{{purchaseId}}", {
            checks: [["the buyer sees it", "pm.expect(body.data.purchase.poNumber).to.match(/^PO-\\d{6}$/);"]]
        }),
        req("Edit the draft", "PUT", "/purchases/{{purchaseId}}", {
            body: { items: [{ product: "{{productId}}", quantityOrdered: 20, unitCost: 650 }, { product: "{{productBId}}", quantityOrdered: 10, unitCost: 140 }] },
            checks: [["recalculated", "pm.expect(body.data.purchase.totalAmount).to.equal(14400);"]]
        }),
        req("Submit for approval", "PUT", "/purchases/{{purchaseId}}/submit", {
            checks: [["PENDING", "pm.expect(body.data.purchase.status).to.equal('PENDING');"]]
        }),
        req("You cannot approve your own request", "PUT", "/purchases/{{purchaseId}}/approve", {
            status: 403,
            code: "SELF_APPROVAL_NOT_ALLOWED"
        }),
        login("manager2"),
        req("Approve (by the other manager)", "PUT", "/purchases/{{purchaseId}}/approve", {
            checks: [["APPROVED", "pm.expect(body.data.purchase.status).to.equal('APPROVED');"]]
        }),
        req("Mark as ordered: sent to the supplier", "PUT", "/purchases/{{purchaseId}}/order", {
            checks: [["ORDERED", "pm.expect(body.data.purchase.status).to.equal('ORDERED');"]]
        }),
        login("supplier"),
        req("Supplier: my purchase orders", "GET", "/purchases", {
            description: "**SUPPLIER.** Sees ONLY orders of their own company that were sent to them, whatever filters they send.",
            checks: [["exactly the one sent order", "pm.expect(body.data.purchases).to.have.length(1); pm.expect(body.data.purchases[0].poNumber).to.equal(pm.collectionVariables.get('poNumber'));"]]
        }),
        req("Supplier: open the order", "GET", "/purchases/{{purchaseId}}"),
        req("Supplier: confirm the order", "PUT", "/purchases/{{purchaseId}}/confirm", {
            description: "**SUPPLIER only.** Optional delivery date and note.",
            body: { expectedDeliveryDate: "2030-01-20", deliveryNote: "Ships on Monday" },
            checks: [["confirmed", "pm.expect(body.data.purchase.supplierConfirmedAt).to.be.ok;"]]
        }),
        req("Supplier: confirming twice is refused", "PUT", "/purchases/{{purchaseId}}/confirm", {
            body: {},
            status: 409,
            code: "ALREADY_CONFIRMED"
        }),
        req("Supplier: update delivery details", "PUT", "/purchases/{{purchaseId}}/delivery", {
            body: { deliveryNote: "Split into two trucks" },
            checks: [["note saved", "pm.expect(body.data.purchase.deliveryNote).to.equal('Split into two trucks');"]]
        }),
        req("Supplier: cannot use the buyer's controls", "PUT", "/purchases/{{purchaseId}}/approve", {
            status: 403,
            code: "FORBIDDEN"
        }),
        login("manager2"),
        req("Receive part of the goods (truck 1)", "PUT", "/purchases/{{purchaseId}}/receive", {
            description: "**ADMIN or INVENTORY_MANAGER.** Records what arrived; stock is added to the warehouse. Can be done in parts.",
            body: { items: [{ product: "{{productId}}", quantity: 12 }] },
            checks: [["PARTIALLY_RECEIVED", "pm.expect(body.data.purchase.status).to.equal('PARTIALLY_RECEIVED');"]]
        }),
        req("Receiving more than is outstanding is refused", "PUT", "/purchases/{{purchaseId}}/receive", {
            body: { items: [{ product: "{{productId}}", quantity: 100 }] },
            status: 400,
            code: "OVER_RECEIPT"
        }),
        req("Receive the rest (truck 2)", "PUT", "/purchases/{{purchaseId}}/receive", {
            body: { items: [{ product: "{{productId}}", quantity: 8 }, { product: "{{productBId}}", quantity: 10 }] },
            checks: [["RECEIVED", "pm.expect(body.data.purchase.status).to.equal('RECEIVED');"]]
        }),
        login("manager"),
        req("Another purchase order, rejected", "POST", "/purchases", {
            body: { supplier: "{{supplierId}}", warehouse: "{{warehouse2Id}}", items: [{ product: "{{productBId}}", quantityOrdered: 5 }], submit: true },
            status: 201,
            saves: { purchase2Id: "body.data.purchase._id" }
        }),
        login("manager2"),
        req("Reject it (a reason is required)", "PUT", "/purchases/{{purchase2Id}}/reject", {
            body: { reason: "Over budget this quarter" },
            checks: [["REJECTED", "pm.expect(body.data.purchase).to.include({ status: 'REJECTED', rejectionReason: 'Over budget this quarter' });"]]
        }),
        req("A third one, cancelled", "PUT", "/purchases/{{purchase2Id}}/cancel", {
            description: "Any open order can be cancelled (a rejected one is already final, so this is refused).",
            body: { reason: "no longer needed" },
            status: 409,
            code: "INVALID_PURCHASE_STATUS"
        }),
        req("List purchase orders", "GET", "/purchases", {
            description: "Filters: `status`, `supplier`, `warehouse`, `search` (PO number), `page`, `limit`.",
            query: { supplier: "{{supplierId}}" },
            checks: [["both orders", "pm.expect(body.data.purchases).to.have.length(2);"]]
        })
    ])
);

// ============================================================ 6. Notifications
collection.item.push(
    folder("6. Notifications", "Every user has a private inbox. Nobody can read, change or delete someone else's.", [
        login("manager"),
        req("My notifications", "GET", "/notifications", {
            description: "Filters: `isRead`, `type`, `page`, `limit`. Also returns `unreadCount`.",
            query: { limit: 20 },
            saves: { notificationId: "body.data.notifications[0] && body.data.notifications[0]._id" },
            checks: [["there are some, newest first", "pm.expect(body.data.notifications.length).to.be.above(0); pm.expect(body.data.unreadCount).to.be.a('number');"]]
        }),
        req("Unread count (the bell)", "GET", "/notifications/unread-count", {
            checks: [["a number", "pm.expect(body.data.unreadCount).to.be.a('number');"]]
        }),
        req("Mark one as read", "PUT", "/notifications/{{notificationId}}/read", {
            checks: [["read", "pm.expect(body.data.notification.isRead).to.equal(true);"]]
        }),
        req("Mark all as read", "PUT", "/notifications/read-all", {
            checks: [["count of updated notifications", "pm.expect(body.data.updatedCount).to.be.a('number');"]]
        }),
        req("Unread count is now zero", "GET", "/notifications/unread-count", {
            checks: [["0", "pm.expect(body.data.unreadCount).to.equal(0);"]]
        }),
        login("staff"),
        req("Someone else's notification is not found (privacy)", "PUT", "/notifications/{{notificationId}}/read", {
            status: 404,
            code: "NOTIFICATION_NOT_FOUND"
        }),
        login("manager"),
        req("Delete a notification", "DELETE", "/notifications/{{notificationId}}", {
            checks: [["gone", "pm.expect(body.success).to.equal(true);"]]
        })
    ])
);

// ============================================================ 7. Reports
collection.item.push(
    folder("7. Reports and dashboard", "The dashboard is visible to admin, manager and staff; the eight detailed reports to admin and manager. Dates are `YYYY-MM-DD` days; leave them out for the last 6 months.", [
        login("manager"),
        req("Dashboard: 10 KPIs and 6 chart series", "GET", "/reports/dashboard", {
            checks: [["all KPIs", "pm.expect(body.data.kpis).to.include.keys('totalProducts','totalCategories','totalWarehouses','totalSuppliers','totalInventory','lowStockProducts','totalOrders','pendingOrders','completedOrders','pendingPurchases');"], ["all charts", "pm.expect(body.data.charts).to.include.keys('ordersByMonth','inventoryByWarehouse','topProducts','stockMovement','purchaseTrends','orderStatusDistribution');"]]
        }),
        req("Inventory report", "GET", "/reports/inventory", {
            description: "Per product: quantity, reserved, available, stock value at cost. Filters: `warehouse`, `category`.",
            query: { warehouse: "{{warehouseId}}" },
            checks: [["summary and rows", "pm.expect(body.data.summary.productCount).to.equal(2); pm.expect(body.data.rows).to.have.length(2);"]]
        }),
        req("Warehouse report", "GET", "/reports/warehouses", {
            checks: [["capacity used per warehouse", "pm.expect(body.data.rows[0]).to.include.keys('capacity','totalQuantity','utilizationPercent','stockValue');"]]
        }),
        req("Stock movement report", "GET", "/reports/stock-movement", {
            description: "Filters: `from`, `to`, `warehouse`, `product`.",
            query: { warehouse: "{{warehouseId}}" },
            checks: [["every movement type is present", "pm.expect(body.data.totals).to.have.keys('STOCK_IN','STOCK_OUT','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT');"]]
        }),
        req("Orders report", "GET", "/reports/orders", {
            description: "Filters: `from`, `to`, `warehouse`.",
            query: { warehouse: "{{warehouseId}}" },
            checks: [["revenue counts the delivered order", "pm.expect(body.data.summary.revenue).to.be.at.least(4200); pm.expect(body.data.byStatus).to.be.an('array');"]]
        }),
        req("Purchases report", "GET", "/reports/purchases", {
            description: "Filters: `from`, `to`, `supplier`.",
            query: { supplier: "{{supplierId}}" },
            checks: [["summary", "pm.expect(body.data.summary).to.include.keys('totalPurchaseOrders','openPurchaseOrders','orderedValue','receivedValue');"]]
        }),
        req("Supplier report", "GET", "/reports/suppliers", {
            checks: [["fulfilment rate per supplier", "pm.expect(body.data.rows[0]).to.include.keys('supplierId','name','fulfilmentRatePercent');"]]
        }),
        req("Low-stock report", "GET", "/reports/low-stock", {
            query: { warehouse: "{{warehouseId}}" },
            checks: [["shortage and quantity on order", "pm.expect(body.data.summary).to.include.keys('itemCount','totalShortage');"]]
        }),
        req("Best sellers", "GET", "/reports/product-performance", {
            description: "Only goods that actually shipped count. `sortBy` = `units` or `revenue`; `limit` up to 100.",
            query: { warehouse: "{{warehouseId}}", sortBy: "revenue", limit: 5 },
            checks: [["ranked by revenue", "pm.expect(body.data.rows[0]).to.include.keys('sku','unitsSold','revenue');"]]
        }),
        req("A bad date range is refused", "GET", "/reports/orders", {
            query: { from: "2026-09-30", to: "2026-09-01" },
            status: 422,
            code: "VALIDATION_ERROR"
        }),
        login("staff"),
        req("Staff may see the dashboard...", "GET", "/reports/dashboard"),
        req("...but not the detailed reports", "GET", "/reports/inventory", {
            status: 403,
            code: "FORBIDDEN"
        })
    ])
);

// ============================================================ 8. Users, profile and audit log (admin)
collection.item.push(
    folder("8. Users, profile and audit log", "User management and the audit log are **ADMIN only**. Deleting a user never removes the record; it sets the status to INACTIVE.", [
        login("admin"),
        req("List users", "GET", "/users", {
            description: "Filters: `search`, `role`, `status`, `page`, `limit`.",
            query: { search: `${RUN}` },
            checks: [["the users created in this run", "pm.expect(body.data.users.length).to.be.at.least(5);"], ["no password hashes", "pm.expect(JSON.stringify(body)).to.not.include('$2');"]]
        }),
        req("Get one user", "GET", "/users/{{staffId}}"),
        req("Change a user's role", "PUT", "/users/{{staffId}}", {
            description: "The change takes effect on the person's very next request.",
            body: { role: "INVENTORY_MANAGER" },
            checks: [["promoted", "pm.expect(body.data.user.role).to.equal('INVENTORY_MANAGER');"]]
        }),
        req("...and back", "PUT", "/users/{{staffId}}", {
            body: { role: "STAFF" }
        }),
        req("You cannot change your own role", "PUT", "/users/{{adminId}}", {
            body: { role: "STAFF" },
            status: 400,
            code: "CANNOT_CHANGE_OWN_ROLE"
        }),
        req("You cannot deactivate yourself", "DELETE", "/users/{{adminId}}", {
            status: 400,
            code: "CANNOT_DEACTIVATE_SELF"
        }),
        req("Deactivate the pending user (now active)", "DELETE", "/users/{{pendingId}}", {
            checks: [["INACTIVE, not deleted", "pm.expect(body.data.user.status).to.equal('INACTIVE');"]]
        }),
        req("Reactivate", "PUT", "/users/{{pendingId}}", {
            body: { status: "ACTIVE" }
        }),
        req("Reset someone's password", "PUT", "/users/{{pendingId}}/password", {
            description: "Ends every session of that person, and lifts a login lock.",
            body: { newPassword: "Reset12345" }
        }),
        req("Audit log: everything that happened", "GET", "/audit-logs", {
            description: "Filters: `user`, `action`, `entityType`, `entityId`, `from`, `to`, `sort` (newest/oldest), `page`, `limit`. Read-only: records can never be edited or deleted.",
            query: { entityType: "Order", entityId: "{{orderId}}", sort: "oldest" },
            saves: { auditLogId: "body.data.auditLogs[0] && body.data.auditLogs[0]._id" },
            checks: [["the order's whole story", "pm.expect(body.data.auditLogs.map(a => a.action)).to.include.members(['ORDER_CREATED','ORDER_CONFIRMED','ORDER_SHIPPED']);"], ["who did it", "pm.expect(body.data.auditLogs[0].user).to.include.keys('name','email');"]]
        }),
        req("Audit log: the actions and record types that exist", "GET", "/audit-logs/filters", {
            checks: [["lists", "pm.expect(body.data.actions).to.be.an('array').that.is.not.empty;"]]
        }),
        req("Audit log: one entry", "GET", "/audit-logs/{{auditLogId}}"),
        req("The audit log cannot be edited", "PUT", "/audit-logs/{{auditLogId}}", {
            body: { action: "TAMPERED" },
            status: 404,
            code: "NOT_FOUND"
        }),
        login("staff"),
        req("Update my profile", "PUT", "/users/profile", {
            description: "Any logged-in user. Only name and phone can be changed here (email and role only by an admin).",
            body: { name: "Sunita R. Rao", phone: "9111111111", role: "ADMIN" },
            checks: [["name and phone changed, the smuggled role ignored", "pm.expect(body.data.user).to.include({ name: 'Sunita R. Rao', role: 'STAFF' });"]]
        }),
        req("Wrong current password is refused", "PUT", "/users/profile/password", {
            body: { currentPassword: "not-my-password", newPassword: "Another12345" },
            status: 400,
            code: "INVALID_CURRENT_PASSWORD"
        }),
        req("Change my password (ends all my sessions)", "PUT", "/users/profile/password", {
            body: { currentPassword: "{{staffPassword}}", newPassword: "Changed12345" },
            saves: { staffPassword: "'Changed12345'" },
            checks: [["accepted", "pm.expect(body.success).to.equal(true);"]]
        }),
        req("After a password change, log in again", "GET", "/auth/me", {
            description: "The password change also cleared the login cookie, so there is nothing to send. (A copy of the old token, e.g. on another device, is refused with 401 SESSION_REVOKED.)",
            status: 401,
            code: "NOT_AUTHENTICATED"
        }),
        login("staff"),
        req("Log out", "POST", "/auth/logout", {
            description: "Clears the cookie AND ends this token on the server: a copy of it stops working too.",
            checks: [["cookie cleared", "pm.expect(pm.cookies.has('token')).to.equal(false);"]]
        }),
        req("The ended session is refused", "GET", "/auth/me", {
            status: 401,
            code: "NOT_AUTHENTICATED"
        })
    ])
);

// ============================================================ 9. Security and error checks
collection.item.push(
    folder("9. Security and error checks", "Not logged in from here on. Every protected endpoint answers 401; bad input and unknown addresses get clean errors, never stack traces.", [
        req("Not logged in: 401", "GET", "/products", { status: 401, code: "NOT_AUTHENTICATED" }),
        req("Not logged in: even creating something is refused", "POST", "/orders", { body: {}, status: 401, code: "NOT_AUTHENTICATED" }),
        req("A made-up address: 404", "GET", "/no-such-thing", { status: 404, code: "NOT_FOUND" }),
        login("admin"),
        req("An id that isn't an id: 400", "GET", "/products/not-an-id", { status: 400, code: "INVALID_ID" }),
        req("Malformed JSON: 400", "POST", "/categories", {
            description: "The body is deliberately broken (a pre-request script replaces it with text that is not JSON).",
            body: { name: "placeholder" },
            status: 400,
            code: "INVALID_JSON",
            pre: ['pm.request.body.update("{ this is not json");']
        }),
        req("Injection attempt on login: refused", "POST", "/auth/login", {
            description: "Query operators instead of strings must never be accepted.",
            body: { email: { $ne: null }, password: { $ne: null } },
            status: 422,
            code: "VALIDATION_ERROR"
        }),
        req("Protective headers are on every answer", "GET", "/health", {
            checks: [["no software announcement", "pm.expect(pm.response.headers.has('X-Powered-By')).to.equal(false);"], ["protective headers", "pm.expect(pm.response.headers.get('X-Content-Type-Options')).to.equal('nosniff'); pm.expect(pm.response.headers.get('Cache-Control')).to.equal('no-store');"]]
        })
    ])
);

// ---------------------------------------------------------------- the environment

const environment = {
    id: "retail-inventory-local",
    name: "Retail Inventory: local",
    values: [
        { key: "baseUrl", value: "http://localhost:3000/api", type: "default", enabled: true },
        { key: "adminEmail", value: "admin@retail.local", type: "default", enabled: true },
        { key: "adminPassword", value: "change-this-password", type: "secret", enabled: true }
    ],
    _postman_variable_scope: "environment"
};

// ---------------------------------------------------------------- write

const outDir = __dirname;
fs.writeFileSync(path.join(outDir, "RetailInventory.postman_collection.json"), JSON.stringify(collection, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "RetailInventory.postman_environment.json"), JSON.stringify(environment, null, 2) + "\n");

const count = (items) => items.reduce((sum, item) => sum + (item.item ? count(item.item) : 1), 0);
console.log(`Collection written: ${collection.item.length} folders, ${count(collection.item)} requests.`);

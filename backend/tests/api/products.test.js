const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let adminAgent;
let managerAgent;
let staffAgent;
let supplierAgent;
let electronics;
let grocery;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Category.init(), Product.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@shop.com" });
    adminAgent = await loginAgent("admin@shop.com");
    managerAgent = await loginAgent("manager@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
    supplierAgent = await loginAgent("supplier@shop.com");

    electronics = await Category.create({ name: "Electronics" });
    grocery = await Category.create({ name: "Grocery" });
});

afterAll(async () => {
    await closeTestDB();
});

// A valid request body; tests override single fields to test one rule at a time
const laptopBody = () => ({
    name: "Dell Inspiron 15",
    sku: "lap-001",
    barcode: "8901234567890",
    brand: "Dell",
    category: electronics._id.toString(),
    costPrice: 42000,
    sellingPrice: 49999.999,
    taxRate: 18,
    imageUrl: "https://cdn.example.com/laptop.png",
    reorderLevel: 5
});

describe("Access control", () => {
    test("SUPPLIER cannot view products", async () => {
        expect((await supplierAgent.get("/api/products")).status).toBe(403);
    });

    test("MANAGER and STAFF can view but not create, edit or deactivate", async () => {
        const product = await Product.create({ ...laptopBody(), category: electronics._id });

        expect((await managerAgent.get("/api/products")).status).toBe(200);
        expect((await staffAgent.get(`/api/products/${product._id}`)).status).toBe(200);
        expect((await managerAgent.post("/api/products").send(laptopBody())).status).toBe(403);
        expect((await managerAgent.put(`/api/products/${product._id}`).send({ sellingPrice: 1 })).status).toBe(403);
        expect((await staffAgent.delete(`/api/products/${product._id}`)).status).toBe(403);
    });
});

describe("POST /api/products", () => {
    test("creates a product: SKU uppercased, price rounded, category name included", async () => {
        const response = await adminAgent.post("/api/products").send(laptopBody());
        const product = response.body.data.product;

        expect(response.status).toBe(201);
        expect(product).toMatchObject({
            sku: "LAP-001",
            sellingPrice: 50000,
            taxRate: 18,
            status: RECORD_STATUS.ACTIVE,
            category: { name: "Electronics" }
        });
        expect(await AuditLog.countDocuments({ action: "PRODUCT_CREATED" })).toBe(1);
    });

    test("only name, SKU, category and prices are required", async () => {
        const response = await adminAgent.post("/api/products").send({
            name: "Rice 5kg",
            sku: "RICE-5",
            category: grocery._id.toString(),
            costPrice: 300,
            sellingPrice: 350
        });

        expect(response.status).toBe(201);
        expect(response.body.data.product.reorderLevel).toBe(10);
        expect(response.body.data.product.barcode).toBeUndefined();
    });

    test("duplicate SKU (any letter case) → 409", async () => {
        await adminAgent.post("/api/products").send(laptopBody());
        const response = await adminAgent.post("/api/products").send({ ...laptopBody(), sku: "LAP-001", barcode: "" });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("SKU_EXISTS");
    });

    test("duplicate barcode → 409", async () => {
        await adminAgent.post("/api/products").send(laptopBody());
        const response = await adminAgent.post("/api/products").send({ ...laptopBody(), sku: "LAP-002" });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("BARCODE_EXISTS");
    });

    test("several products with an empty barcode are allowed", async () => {
        const first = await adminAgent.post("/api/products").send({ ...laptopBody(), sku: "A-1", barcode: "" });
        const second = await adminAgent.post("/api/products").send({ ...laptopBody(), sku: "A-2", barcode: "" });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
    });

    test("category that doesn't exist → 404", async () => {
        const response = await adminAgent
            .post("/api/products")
            .send({ ...laptopBody(), category: "000000000000000000000000" });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("CATEGORY_NOT_FOUND");
    });

    test("inactive category → 422", async () => {
        await Category.updateOne({ _id: grocery._id }, { status: RECORD_STATUS.INACTIVE });
        const response = await adminAgent.post("/api/products").send({ ...laptopBody(), category: grocery._id.toString() });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("CATEGORY_INACTIVE");
    });

    test.each([
        ["negative price", { sellingPrice: -1 }, "Selling price cannot be negative"],
        ["price sent as text", { costPrice: "42000" }, "Cost price must be a number"],
        ["tax over 100", { taxRate: 150 }, "Tax rate cannot be more than 100"],
        ["decimal reorder level", { reorderLevel: 2.5 }, "Reorder level must be a whole number"],
        ["SKU with spaces", { sku: "LAP 001" }, "SKU can only contain letters, numbers and dashes"],
        ["javascript: image URL", { imageUrl: "javascript:alert(1)" }, "Image URL must start with http:// or https://"],
        ["malformed category id", { category: "abc" }, "Invalid id"]
    ])("%s → 422", async (label, override, expectedMessage) => {
        const response = await adminAgent.post("/api/products").send({ ...laptopBody(), ...override });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });
});

describe("GET /api/products (search, filter, sort)", () => {
    beforeEach(async () => {
        await Product.create([
            { name: "Dell Inspiron", sku: "LAP-1", brand: "Dell", category: electronics._id, costPrice: 40000, sellingPrice: 50000 },
            { name: "HP Pavilion", sku: "LAP-2", brand: "HP", barcode: "111222", category: electronics._id, costPrice: 50000, sellingPrice: 60000 },
            { name: "Basmati Rice", sku: "RICE-1", brand: "India Gate", category: grocery._id, costPrice: 300, sellingPrice: 400 },
            { name: "Old Phone", sku: "PH-1", brand: "Nokia", category: electronics._id, costPrice: 1000, sellingPrice: 1500, status: RECORD_STATUS.INACTIVE }
        ]);
    });

    const names = (response) => response.body.data.products.map((p) => p.name);

    test("search matches name, SKU, barcode or brand", async () => {
        expect(names(await staffAgent.get("/api/products?search=pavil"))).toEqual(["HP Pavilion"]);
        expect(names(await staffAgent.get("/api/products?search=rice-1"))).toEqual(["Basmati Rice"]);
        expect(names(await staffAgent.get("/api/products?search=111222"))).toEqual(["HP Pavilion"]);
        expect(names(await staffAgent.get("/api/products?search=india"))).toEqual(["Basmati Rice"]);
    });

    test("filter by category and status", async () => {
        const response = await staffAgent.get(`/api/products?category=${electronics._id}&status=ACTIVE&sort=name`);

        expect(names(response)).toEqual(["Dell Inspiron", "HP Pavilion"]);
    });

    test("filter by brand (exact, ignoring case)", async () => {
        expect(names(await staffAgent.get("/api/products?brand=dell"))).toEqual(["Dell Inspiron"]);
    });

    test("filter by price range", async () => {
        const response = await staffAgent.get("/api/products?minPrice=1000&maxPrice=55000&sort=price_low");

        expect(names(response)).toEqual(["Old Phone", "Dell Inspiron"]);
    });

    test("sort by price, high to low", async () => {
        const response = await staffAgent.get("/api/products?sort=price_high&limit=2");

        expect(names(response)).toEqual(["HP Pavilion", "Dell Inspiron"]);
        expect(response.body.data.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    });

    test("category name is included in each product", async () => {
        const response = await staffAgent.get("/api/products?search=rice");

        expect(response.body.data.products[0].category.name).toBe("Grocery");
    });

    test("invalid query values → 422", async () => {
        expect((await staffAgent.get("/api/products?sort=cheapest")).status).toBe(422);
        expect((await staffAgent.get("/api/products?minPrice=500&maxPrice=100")).body.message)
            .toBe("minPrice cannot be greater than maxPrice");
        expect((await staffAgent.get("/api/products?category=abc")).status).toBe(422);
    });
});

describe("PUT /api/products/:id", () => {
    let product;

    beforeEach(async () => {
        product = await Product.create({ ...laptopBody(), category: electronics._id });
    });

    test("price change is audited with only the changed fields", async () => {
        const response = await adminAgent.put(`/api/products/${product._id}`).send({ sellingPrice: 54999 });
        const auditLog = await AuditLog.findOne({ action: "PRODUCT_UPDATED" });

        expect(response.status).toBe(200);
        expect(auditLog.oldValue).toEqual({ sellingPrice: 49999.999 });
        expect(auditLog.newValue).toEqual({ sellingPrice: 54999 });
    });

    test("sending the same values writes no audit record", async () => {
        await adminAgent.put(`/api/products/${product._id}`).send({ name: product.name });

        expect(await AuditLog.countDocuments({ action: "PRODUCT_UPDATED" })).toBe(0);
    });

    test("empty barcode removes it", async () => {
        const response = await adminAgent.put(`/api/products/${product._id}`).send({ barcode: "" });
        const saved = await Product.findById(product._id);

        expect(response.status).toBe(200);
        expect(saved.barcode).toBeUndefined();
    });

    test("keeping its own SKU is fine; taking another product's SKU → 409", async () => {
        await Product.create({ name: "Other", sku: "OTHER-1", category: electronics._id, costPrice: 1, sellingPrice: 1 });

        expect((await adminAgent.put(`/api/products/${product._id}`).send({ sku: "lap-001" })).status).toBe(200);
        expect((await adminAgent.put(`/api/products/${product._id}`).send({ sku: "other-1" })).status).toBe(409);
    });

    test("moving to an inactive category → 422", async () => {
        await Category.updateOne({ _id: grocery._id }, { status: RECORD_STATUS.INACTIVE });
        const response = await adminAgent.put(`/api/products/${product._id}`).send({ category: grocery._id.toString() });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("CATEGORY_INACTIVE");
    });

    test("reactivating a product whose category is inactive → 422", async () => {
        await Product.updateOne({ _id: product._id }, { status: RECORD_STATUS.INACTIVE });
        await Category.updateOne({ _id: electronics._id }, { status: RECORD_STATUS.INACTIVE });

        const response = await adminAgent.put(`/api/products/${product._id}`).send({ status: RECORD_STATUS.ACTIVE });

        expect(response.status).toBe(422);
    });

    test("unknown product → 404", async () => {
        const response = await adminAgent.put("/api/products/000000000000000000000000").send({ name: "X product" });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("PRODUCT_NOT_FOUND");
    });
});

describe("DELETE /api/products/:id", () => {
    test("deactivates, keeps the product, and is audited", async () => {
        const product = await Product.create({ ...laptopBody(), category: electronics._id });

        const response = await adminAgent.delete(`/api/products/${product._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.product.status).toBe(RECORD_STATUS.INACTIVE);
        expect(await Product.countDocuments()).toBe(1);
        expect(await AuditLog.countDocuments({ action: "PRODUCT_DEACTIVATED" })).toBe(1);
    });
});

// These tests use a REAL MongoDB database (separate from development data)
// to check rules that only the database can enforce: unique indexes.
const mongoose = require("mongoose");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Inventory = require("../../src/models/Inventory");
const User = require("../../src/models/User");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");

// MongoDB's error code for "duplicate key" (unique index violation)
const DUPLICATE_KEY_ERROR = 11000;

let category;

beforeAll(async () => {
    await connectTestDB();

    // init() waits until the unique indexes have been created
    await Promise.all([Category.init(), Product.init(), Inventory.init(), User.init()]);
}, 20000); // Longer than Jest's 5s default: connecting + building indexes can take a few seconds

beforeEach(async () => {
    await clearTestDB();
    category = await Category.create({ name: "Electronics" });
});

afterAll(async () => {
    await closeTestDB();
});

const productData = (overrides) => ({
    name: "Laptop",
    sku: "LAP-001",
    category: category._id,
    costPrice: 40000,
    sellingPrice: 50000,
    ...overrides
});

describe("Unique indexes", () => {
    test("duplicate SKU is rejected (even with different letter case)", async () => {
        await Product.create(productData());

        await expect(Product.create(productData({ sku: "lap-001" })))
            .rejects.toMatchObject({ code: DUPLICATE_KEY_ERROR });
    });

    test("many products without a barcode are allowed (sparse index)", async () => {
        await Product.create(productData({ sku: "A-1" }));
        await Product.create(productData({ sku: "A-2" }));

        expect(await Product.countDocuments()).toBe(2);
    });

    test("duplicate barcode is rejected", async () => {
        await Product.create(productData({ sku: "A-1", barcode: "8901234567890" }));

        await expect(Product.create(productData({ sku: "A-2", barcode: "8901234567890" })))
            .rejects.toMatchObject({ code: DUPLICATE_KEY_ERROR });
    });

    test("same product cannot have two inventory records in one warehouse", async () => {
        const product = await Product.create(productData());
        const warehouseId = new mongoose.Types.ObjectId();

        await Inventory.create({ product: product._id, warehouse: warehouseId, quantity: 10 });

        await expect(Inventory.create({ product: product._id, warehouse: warehouseId, quantity: 5 }))
            .rejects.toMatchObject({ code: DUPLICATE_KEY_ERROR });
    });

    test("same product CAN have inventory in different warehouses", async () => {
        const product = await Product.create(productData());

        await Inventory.create({ product: product._id, warehouse: new mongoose.Types.ObjectId(), quantity: 100 });
        await Inventory.create({ product: product._id, warehouse: new mongoose.Types.ObjectId(), quantity: 50 });

        expect(await Inventory.countDocuments({ product: product._id })).toBe(2);
    });

    test("duplicate user email is rejected", async () => {
        await User.create({ name: "A", email: "a@shop.com", password: "hashed" });

        await expect(User.create({ name: "B", email: "A@SHOP.COM", password: "hashed" }))
            .rejects.toMatchObject({ code: DUPLICATE_KEY_ERROR });
    });
});

describe("Password protection", () => {
    test("password is not returned by normal queries", async () => {
        await User.create({ name: "A", email: "a@shop.com", password: "hashed" });

        const user = await User.findOne({ email: "a@shop.com" });
        const userWithPassword = await User.findOne({ email: "a@shop.com" }).select("+password");

        expect(user.password).toBeUndefined();
        expect(userWithPassword.password).toBe("hashed");
    });
});

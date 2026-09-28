// These tests check schema validation rules only.
// validateSync() runs Mongoose validation without touching the database.
const mongoose = require("mongoose");
const User = require("../../src/models/User");
const Product = require("../../src/models/Product");
const Inventory = require("../../src/models/Inventory");
const StockTransfer = require("../../src/models/StockTransfer");
const PurchaseOrder = require("../../src/models/PurchaseOrder");
const OrderItem = require("../../src/models/OrderItem");
const { ROLES, ORDER_STATUS } = require("../../src/utils/constants");
const Order = require("../../src/models/Order");

const newId = () => new mongoose.Types.ObjectId();

describe("User model", () => {
    test("valid user passes and gets default role and status", () => {
        const user = new User({ name: "Asha", email: "ASHA@Shop.com", password: "hashed" });

        expect(user.validateSync()).toBeUndefined();
        expect(user.role).toBe(ROLES.STAFF);
        expect(user.status).toBe("ACTIVE");
        expect(user.email).toBe("asha@shop.com");
    });

    test("invalid email is rejected", () => {
        const user = new User({ name: "Asha", email: "not-an-email", password: "hashed" });
        const error = user.validateSync();

        expect(error.errors.email.message).toBe("Email is not valid");
    });

    test("unknown role is rejected", () => {
        const user = new User({ name: "Asha", email: "a@b.com", password: "hashed", role: "SUPERUSER" });

        expect(user.validateSync().errors.role).toBeDefined();
    });

    test("password is removed when converted to JSON", () => {
        const user = new User({ name: "Asha", email: "a@b.com", password: "hashed" });

        expect(user.toJSON().password).toBeUndefined();
    });
});

describe("Product model", () => {
    const validProduct = {
        name: "Laptop",
        sku: "lap-001",
        category: newId(),
        costPrice: 40000,
        sellingPrice: 50000
    };

    test("valid product passes and SKU becomes uppercase", () => {
        const product = new Product(validProduct);

        expect(product.validateSync()).toBeUndefined();
        expect(product.sku).toBe("LAP-001");
    });

    test("name, SKU, category and prices are required", () => {
        const error = new Product({}).validateSync();

        expect(Object.keys(error.errors).sort()).toEqual(
            ["category", "costPrice", "name", "sellingPrice", "sku"]
        );
    });

    test("negative price is rejected", () => {
        const product = new Product({ ...validProduct, sellingPrice: -1 });

        expect(product.validateSync().errors.sellingPrice.message).toBe("Selling price cannot be negative");
    });

    test("tax rate above 100 is rejected", () => {
        const product = new Product({ ...validProduct, taxRate: 150 });

        expect(product.validateSync().errors.taxRate).toBeDefined();
    });
});

describe("Inventory model", () => {
    test("availableQuantity = quantity - reservedQuantity", () => {
        const inventory = new Inventory({
            product: newId(),
            warehouse: newId(),
            quantity: 100,
            reservedQuantity: 30
        });

        expect(inventory.availableQuantity).toBe(70);
        expect(inventory.toJSON().availableQuantity).toBe(70);
    });

    test("negative quantity is rejected", () => {
        const inventory = new Inventory({ product: newId(), warehouse: newId(), quantity: -5 });

        expect(inventory.validateSync().errors.quantity.message).toBe("Quantity cannot be negative");
    });
});

describe("StockTransfer model", () => {
    test("source and destination warehouse cannot be the same", () => {
        const warehouseId = newId();
        const transfer = new StockTransfer({
            transferNumber: "TRF-000001",
            product: newId(),
            fromWarehouse: warehouseId,
            toWarehouse: warehouseId,
            quantity: 10,
            requestedBy: newId()
        });

        expect(transfer.validateSync().errors.toWarehouse.message)
            .toBe("Source and destination warehouse cannot be the same");
    });

    test("different warehouses pass and status starts as REQUESTED", () => {
        const transfer = new StockTransfer({
            transferNumber: "TRF-000001",
            product: newId(),
            fromWarehouse: newId(),
            toWarehouse: newId(),
            quantity: 10,
            requestedBy: newId()
        });

        expect(transfer.validateSync()).toBeUndefined();
        expect(transfer.status).toBe("REQUESTED");
    });

    test("quantity of 0 is rejected", () => {
        const transfer = new StockTransfer({ quantity: 0 });

        expect(transfer.validateSync().errors.quantity).toBeDefined();
    });
});

describe("Order and OrderItem models", () => {
    test("order starts as PENDING", () => {
        const order = new Order({
            orderNumber: "ORD-000001",
            customer: { name: "Ravi" },
            warehouse: newId(),
            createdBy: newId()
        });

        expect(order.validateSync()).toBeUndefined();
        expect(order.status).toBe(ORDER_STATUS.PENDING);
    });

    test("order item quantity must be at least 1", () => {
        const item = new OrderItem({
            order: newId(),
            product: newId(),
            productName: "Laptop",
            sku: "LAP-001",
            unitPrice: 50000,
            quantity: 0,
            lineSubtotal: 0,
            lineTotal: 0
        });

        expect(item.validateSync().errors.quantity.message).toBe("Quantity must be at least 1");
    });
});

describe("PurchaseOrder model", () => {
    test("purchase order must contain at least one item", () => {
        const purchaseOrder = new PurchaseOrder({
            poNumber: "PO-000001",
            supplier: newId(),
            warehouse: newId(),
            requestedBy: newId(),
            items: []
        });

        expect(purchaseOrder.validateSync().errors.items.message)
            .toBe("Purchase order must contain at least one item");
    });

    test("new purchase order starts as DRAFT with 0 received", () => {
        const purchaseOrder = new PurchaseOrder({
            poNumber: "PO-000001",
            supplier: newId(),
            warehouse: newId(),
            requestedBy: newId(),
            items: [{ product: newId(), quantityOrdered: 50, unitCost: 100 }]
        });

        expect(purchaseOrder.validateSync()).toBeUndefined();
        expect(purchaseOrder.status).toBe("DRAFT");
        expect(purchaseOrder.items[0].quantityReceived).toBe(0);
    });
});

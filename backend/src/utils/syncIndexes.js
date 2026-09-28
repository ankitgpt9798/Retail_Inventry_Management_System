// Run with: npm run db:sync
// Creates every collection and its indexes in the development database,
// so you can see them in MongoDB Compass. Safe to run again after changing a model.
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const models = [
    require("../models/User"),
    require("../models/Category"),
    require("../models/Product"),
    require("../models/Warehouse"),
    require("../models/Inventory"),
    require("../models/StockTransaction"),
    require("../models/StockTransfer"),
    require("../models/Order"),
    require("../models/OrderItem"),
    require("../models/Supplier"),
    require("../models/PurchaseOrder"),
    require("../models/Notification"),
    require("../models/AuditLog"),
    require("../models/Counter")
];

const syncIndexes = async () => {
    try {
        await connectDB();

        for (const model of models) {
            await model.createCollection();
            await model.syncIndexes();
            console.log(`Synced: ${model.collection.collectionName}`);
        }
    }
    catch (error) {
        console.error("Index sync failed:", error.message);
        process.exitCode = 1;
    }
    finally {
        await mongoose.disconnect();
    }
};

syncIndexes();

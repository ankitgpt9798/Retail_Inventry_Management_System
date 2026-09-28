// Shared helpers for tests that need a real MongoDB database.
const os = require("os");
const mongoose = require("mongoose");

const TEST_DB_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/retail_inventory_test";

const connectTestDB = async () => {
    await mongoose.connect(TEST_DB_URI, {
        serverSelectionTimeoutMS: 5000,
        // Jest workaround: the MongoDB driver loads the "os" module with import(),
        // which fails inside Jest. Without it the driver sends an empty handshake
        // and MongoDB rejects it ("Missing required sub-document 'driver'").
        // Giving the driver "os" directly avoids the import. Not needed outside Jest.
        runtimeAdapters: { os }
    });
    await mongoose.connection.dropDatabase();
};

// Empty every collection, so each test starts with a clean database
const clearTestDB = async () => {
    const collections = Object.values(mongoose.connection.collections);
    for (const collection of collections) {
        await collection.deleteMany({});
    }
};

const closeTestDB = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
};

module.exports = { connectTestDB, clearTestDB, closeTestDB };

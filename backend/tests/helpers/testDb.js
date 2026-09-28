// Shared helpers for tests that need a real MongoDB database.
const os = require("os");
const mongoose = require("mongoose");

const BASE_TEST_DB_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/retail_inventory_test";

// Jest can run several test files at the same time, each in its own "worker".
// If they shared one database, one file would wipe data another file is using.
// So each worker gets its own database: retail_inventory_test_1, _2, ...
// (Assumes the URI ends with the database name, with no ?options after it.)
const TEST_DB_URI = `${BASE_TEST_DB_URI}_${process.env.JEST_WORKER_ID || "1"}`;

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

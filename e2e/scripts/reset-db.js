// Empties the E2E database before every test run.
// Started by playwright.config.js just before the backend, with MONGO_URI pointing at the E2E database.
//
// SAFETY: this script REFUSES to run against any database other than the E2E one,
// so a wrong environment variable can never wipe your development data.
const path = require("path");
const { E2E_DB_NAME } = require("../config");

// The backend's own copy of mongoose (the e2e folder has no dependencies of its own besides Playwright)
const mongoose = require(path.join(__dirname, "../../backend/node_modules/mongoose"));

const run = async () => {
    const uri = process.env.MONGO_URI || "";
    const databaseName = uri.split("/").pop().split("?")[0];

    if (databaseName !== E2E_DB_NAME) {
        console.error(`reset-db: refusing to drop "${databaseName}". Only "${E2E_DB_NAME}" may be reset.`);
        process.exit(1);
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log(`reset-db: "${databaseName}" is empty`);
};

run().catch((error) => {
    console.error("reset-db failed:", error.message);
    process.exit(1);
});

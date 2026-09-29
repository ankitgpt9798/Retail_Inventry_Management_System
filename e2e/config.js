// Everything the end-to-end tests agree on, in one place.
// The E2E stack is completely separate from your development setup:
//   - its own MongoDB database (dropped and re-created on every run)
//   - its own ports, so `npm run dev` can keep running
// Both URLs use "localhost" on purpose: the login cookie is SameSite=Strict, and mixing
// "localhost" with "127.0.0.1" would make the browser treat the two as different sites.

const path = require("path");

const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5273;

const E2E_DB_NAME = "retail_inventory_e2e";

module.exports = {
    BACKEND_PORT,
    FRONTEND_PORT,
    FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
    API_URL: `http://localhost:${BACKEND_PORT}/api`,
    E2E_DB_NAME,
    MONGO_URI: `mongodb://127.0.0.1:27017/${E2E_DB_NAME}`,
    AUTH_DIR: path.join(__dirname, ".auth"),

    // The first admin is created by the backend's own `seed:admin` script from these
    ADMIN: { name: "E2E Admin", email: "admin@e2e.test", password: "Admin12345" },

    // Everyone else is created through the real API by tests/setup/global.setup.js
    USERS: {
        manager: { name: "Ravi Kumar", email: "ravi@e2e.test", password: "Manager123", role: "INVENTORY_MANAGER" },
        manager2: { name: "Neha Singh", email: "neha@e2e.test", password: "Manager456", role: "INVENTORY_MANAGER" },
        staff: { name: "Sunita Rao", email: "sunita@e2e.test", password: "Staff1234", role: "STAFF" },
        supplier: { name: "Suresh Patel", email: "suresh@e2e.test", password: "Supplier123", role: "SUPPLIER" }
    },

    SUPPLIER_COMPANY: { name: "Acme Electronics (E2E)", email: "sales@acme-e2e.test", city: "Delhi" }
};

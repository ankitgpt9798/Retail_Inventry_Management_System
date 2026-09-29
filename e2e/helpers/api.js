const path = require("path");
const { request } = require("@playwright/test");
const { API_URL, AUTH_DIR, ADMIN, USERS } = require("../config");

// Every role that has a saved logged-in state (created by tests/setup/global.setup.js)
const ROLE_LOGINS = {
    admin: ADMIN,
    manager: USERS.manager,
    manager2: USERS.manager2,
    staff: USERS.staff,
    supplier: USERS.supplier
};

const statePath = (role) => path.join(AUTH_DIR, `${role}.json`);

// Playwright wants the base URL to end with "/" and the request paths to be relative to it
const baseURL = `${API_URL}/`;

// An API client that is already logged in as the given role (uses the saved cookie).
//   const admin = await apiAs("admin");  const response = await admin.get("products");
const apiAs = (role) => request.newContext({ baseURL, storageState: statePath(role) });

// An API client with NO login
const anonymousApi = () => request.newContext({ baseURL });

// Logs in through the real login endpoint and returns a client holding the cookie
const loginApi = async (email, password) => {
    const client = await request.newContext({ baseURL });
    const response = await client.post("auth/login", { data: { email, password } });
    if (!response.ok()) {
        throw new Error(`Login as ${email} failed: ${response.status()} ${await response.text()}`);
    }
    return client;
};

// Creates a record and returns what the API answered, or explains clearly why it failed.
// The API always wraps its answer as { success, message, data: { … } }.
const createVia = async (client, url, data) => {
    const response = await client.post(url, { data });
    const body = await response.json().catch(() => ({}));
    if (!response.ok()) {
        throw new Error(`POST ${url} failed (${response.status()}): ${body.message || JSON.stringify(body)}`);
    }
    return body.data;
};

module.exports = { ROLE_LOGINS, statePath, apiAs, anonymousApi, loginApi, createVia };

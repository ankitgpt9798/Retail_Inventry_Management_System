const { defineConfig } = require("@playwright/test");
const { ADMIN, API_URL, BACKEND_PORT, FRONTEND_PORT, FRONTEND_URL, MONGO_URI } = require("./config");

// Runs the real React app (Vite) in Chrome against the real Express API and a real, throw-away MongoDB database.
// `npm test` (in this folder) starts both servers itself and stops them afterwards.
module.exports = defineConfig({
    testDir: "./tests",
    timeout: 30_000,
    expect: { timeout: 8_000 },

    // ONE worker, in order: the dashboard and report numbers are global, so tests must not run side by side
    workers: 1,
    fullyParallel: false,
    retries: 0,

    reporter: [["list"], ["html", { open: "never" }]],

    use: {
        baseURL: FRONTEND_URL,
        // Your installed Google Chrome, so no separate browser download is needed
        channel: "chrome",
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    },

    projects: [
        // 1. Creates the users and saves a logged-in browser state per role
        { name: "setup", testMatch: /global\.setup\.js/ },
        // 2. Everything else, after the setup has run
        { name: "e2e", testIgnore: /global\.setup\.js/, dependencies: ["setup"] }
    ],

    webServer: [
        {
            // Empty the E2E database, build its indexes, create the admin, then start the API.
            // Environment variables set here beat backend/.env (dotenv never overrides), so your .env is untouched.
            command: "node ../e2e/scripts/reset-db.js && node src/utils/syncIndexes.js && node src/utils/seedAdmin.js && node src/server.js",
            cwd: "../backend",
            url: `http://localhost:${BACKEND_PORT}/api/health`,
            reuseExistingServer: false,
            timeout: 60_000,
            env: {
                PORT: String(BACKEND_PORT),
                MONGO_URI,
                CLIENT_URL: FRONTEND_URL,
                JWT_SECRET: "e2e-only-secret-not-used-anywhere-else",
                JWT_EXPIRES_IN_DAYS: "1",
                ADMIN_NAME: ADMIN.name,
                ADMIN_EMAIL: ADMIN.email,
                ADMIN_PASSWORD: ADMIN.password,
                REPORT_UTC_OFFSET: "+05:30",
                // Login protection: the per-ACCOUNT rule stays at the real default (5 wrong passwords, 15 minutes) because
                // tests exercise it; the per-ADDRESS limit is raised because the whole suite runs from one machine and
                // deliberately makes many wrong-password logins (the address rule is covered by the backend tests)
                LOGIN_IP_MAX_FAILURES: "100000",
                NODE_ENV: "development"
            }
        },
        {
            command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
            cwd: "../frontend",
            url: FRONTEND_URL,
            reuseExistingServer: false,
            timeout: 60_000,
            env: { VITE_API_URL: API_URL }
        }
    ]
});

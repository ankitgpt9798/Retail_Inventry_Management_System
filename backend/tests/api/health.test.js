const request = require("supertest");
const app = require("../../src/app");

describe("Health check and error handling", () => {
    test("GET /api/health returns success", async () => {
        const response = await request(app).get("/api/health");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    test("unknown route returns 404 in the standard error format", async () => {
        const response = await request(app).get("/api/does-not-exist");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            success: false,
            message: "Route not found: GET /api/does-not-exist",
            error: "NOT_FOUND"
        });
    });
});

describe("Protective response headers (E2E finding L3)", () => {
    test("the server does not announce which software it runs", async () => {
        const response = await request(app).get("/api/health");

        expect(response.headers["x-powered-by"]).toBeUndefined();
    });

    test("responses carry the standard protective headers", async () => {
        const { headers } = await request(app).get("/api/health");

        expect(headers["x-content-type-options"]).toBe("nosniff"); // browsers must not guess content types
        expect(headers["x-frame-options"]).toBeDefined(); // cannot be shown inside another site's frame
        expect(headers["referrer-policy"]).toBeDefined();
        expect(headers["cross-origin-resource-policy"]).toBe("same-site");
        expect(headers["content-security-policy"]).toContain("frame-ancestors");
    });

    test("API answers are never cached (they are personal, logged-in data)", async () => {
        const ok = await request(app).get("/api/health");
        const unauthorized = await request(app).get("/api/users");

        expect(ok.headers["cache-control"]).toBe("no-store");
        expect(unauthorized.status).toBe(401);
        expect(unauthorized.headers["cache-control"]).toBe("no-store");
    });

    test("the headers are on error answers too, not only on success", async () => {
        const notFound = await request(app).get("/api/does-not-exist");
        const badJson = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{ bad json");

        for (const response of [notFound, badJson]) {
            expect(response.headers["x-content-type-options"]).toBe("nosniff");
            expect(response.headers["x-powered-by"]).toBeUndefined();
        }
    });

    test("the browser-side CORS answer for the React app still works, with credentials", async () => {
        const response = await request(app)
            .options("/api/auth/login")
            .set("Origin", process.env.CLIENT_URL || "http://localhost:5173")
            .set("Access-Control-Request-Method", "POST");

        expect(response.headers["access-control-allow-origin"]).toBe(process.env.CLIENT_URL || "http://localhost:5173");
        expect(response.headers["access-control-allow-credentials"]).toBe("true");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    test("HTTPS-only Strict-Transport-Security is sent in production, and not over plain http in development", async () => {
        // Development / test: not sent
        expect((await request(app).get("/api/health")).headers["strict-transport-security"]).toBeUndefined();

        // Production: the app is built fresh with NODE_ENV=production
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        let productionApp;
        jest.isolateModules(() => {
            productionApp = require("../../src/app");
        });
        process.env.NODE_ENV = previous;

        const header = (await request(productionApp).get("/api/health")).headers["strict-transport-security"];
        expect(header).toContain("max-age=");
    });
});

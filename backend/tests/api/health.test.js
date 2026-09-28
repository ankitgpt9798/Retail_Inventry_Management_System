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

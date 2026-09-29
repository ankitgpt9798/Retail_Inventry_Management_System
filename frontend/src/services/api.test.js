import { vi } from "vitest";
import api, { getErrorMessage, setupInterceptors } from "./api";

// Instead of a real network, Axios calls this "adapter", which answers
// every request with the given HTTP status (error statuses become rejections)
const answerWith = (status, data = {}) => {
    api.defaults.adapter = async (config) => {
        const response = { status, data, headers: {}, config, statusText: "" };
        if (status >= 400) {
            const error = new Error(`Request failed with status ${status}`);
            error.config = config;
            error.response = response;
            throw error;
        }
        return response;
    };
};

const onSessionExpired = vi.fn();
setupInterceptors(onSessionExpired);

beforeEach(() => {
    onSessionExpired.mockClear();
});

describe("api instance", () => {
    test("sends cookies and uses the backend URL", () => {
        expect(api.defaults.withCredentials).toBe(true);
        expect(api.defaults.baseURL).toMatch(/\/api$/);
    });
});

describe("401 interceptor", () => {
    test("a 401 on a normal request → the app is told the session ended", async () => {
        answerWith(401, { message: "Your password was changed. Please log in again" });

        await expect(api.get("/products")).rejects.toThrow();
        expect(onSessionExpired).toHaveBeenCalledWith("Your password was changed. Please log in again");
    });

    test("a 401 from /auth/me or /auth/login is normal (not logged in / wrong password)", async () => {
        answerWith(401, { message: "Please log in to continue" });

        await expect(api.get("/auth/me")).rejects.toThrow();
        await expect(api.post("/auth/login", {})).rejects.toThrow();
        expect(onSessionExpired).not.toHaveBeenCalled();
    });

    test("a 403 ACCOUNT_INACTIVE (an admin deactivated the account) also ends the session", async () => {
        answerWith(403, { message: "Your account is not active", error: "ACCOUNT_INACTIVE" });

        await expect(api.get("/products")).rejects.toThrow();
        expect(onSessionExpired).toHaveBeenCalledWith("Your account is not active");
    });

    test("an ordinary 403 (your role can't do this) does NOT log you out", async () => {
        answerWith(403, { message: "You do not have permission to do this", error: "FORBIDDEN" });

        await expect(api.get("/users")).rejects.toThrow();
        expect(onSessionExpired).not.toHaveBeenCalled();
    });

    test("other errors (403, 500) don't log anyone out", async () => {
        answerWith(403, { message: "Forbidden" });
        await expect(api.get("/users")).rejects.toThrow();

        answerWith(500, { message: "Something went wrong" });
        await expect(api.get("/users")).rejects.toThrow();

        expect(onSessionExpired).not.toHaveBeenCalled();
    });
});

describe("getErrorMessage", () => {
    test("uses the backend's message when there is one", () => {
        expect(getErrorMessage({ response: { data: { message: "Insufficient stock" } } })).toBe("Insufficient stock");
    });

    test("no answer at all → explains that the server can't be reached", () => {
        expect(getErrorMessage({ request: {} })).toBe("Cannot reach the server. Please check that the backend is running.");
    });

    test("anything else → the fallback text", () => {
        expect(getErrorMessage(new Error("boom"), "Could not save")).toBe("Could not save");
    });
});

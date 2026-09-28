import { vi } from "vitest";
import { setupStore } from "./store";
import authReducer, { fetchCurrentUser, loginUser, logoutUser, sessionExpired } from "./authSlice";
import api from "../services/api";

// Replace the real Axios instance with fakes; keep getErrorMessage real
vi.mock("../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const ravi = { _id: "u1", name: "Ravi", role: "INVENTORY_MANAGER" };

beforeEach(() => {
    vi.clearAllMocks();
});

describe("authSlice reducers", () => {
    test("starts logged out and 'checking session'", () => {
        expect(authReducer(undefined, { type: "@@init" })).toEqual({
            user: null, isCheckingSession: true, sessionMessage: null
        });
    });

    test("sessionExpired clears the user and leaves a message for the login page", () => {
        const state = authReducer({ user: ravi, isCheckingSession: false, sessionMessage: null }, sessionExpired("Your password was changed"));

        expect(state.user).toBeNull();
        expect(state.sessionMessage).toBe("Your password was changed");
    });

    test("sessionExpired when nobody was logged in adds no message", () => {
        const state = authReducer({ user: null, isCheckingSession: false, sessionMessage: null }, sessionExpired("x"));

        expect(state.sessionMessage).toBeNull();
    });
});

describe("authSlice thunks (with a fake API)", () => {
    test("fetchCurrentUser: a valid cookie → user is set, checking stops", async () => {
        api.get.mockResolvedValue({ data: { data: { user: ravi } } });
        const store = setupStore();

        await store.dispatch(fetchCurrentUser());

        expect(api.get).toHaveBeenCalledWith("/auth/me");
        expect(store.getState().auth).toMatchObject({ user: ravi, isCheckingSession: false });
    });

    test("fetchCurrentUser: 401 simply means logged out (not an error)", async () => {
        api.get.mockRejectedValue({ response: { status: 401, data: { message: "Please log in" } } });
        const store = setupStore();

        await store.dispatch(fetchCurrentUser());

        expect(store.getState().auth).toMatchObject({ user: null, isCheckingSession: false });
    });

    test("loginUser: wrong password → rejected with the backend's message", async () => {
        api.post.mockRejectedValue({ response: { status: 401, data: { message: "Invalid email or password" } } });
        const store = setupStore();

        const result = await store.dispatch(loginUser({ email: "a@b.com", password: "x" }));

        expect(result.payload).toBe("Invalid email or password");
        expect(store.getState().auth.user).toBeNull();
    });

    test("loginUser then logoutUser", async () => {
        api.post.mockResolvedValueOnce({ data: { data: { user: ravi } } }).mockResolvedValueOnce({ data: {} });
        const store = setupStore();

        await store.dispatch(loginUser({ email: "ravi@shop.com", password: "Ravi67890" }));
        expect(store.getState().auth.user).toEqual(ravi);

        await store.dispatch(logoutUser());
        expect(api.post).toHaveBeenLastCalledWith("/auth/logout");
        expect(store.getState().auth.user).toBeNull();
    });
});

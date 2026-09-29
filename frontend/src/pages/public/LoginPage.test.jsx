import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./LoginPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

beforeEach(() => {
    vi.clearAllMocks();
});

// Fill in the form the way a person would
const fillAndSubmit = async (user, email, password) => {
    if (email) await user.type(screen.getByLabelText("Email"), email);
    if (password) await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", { name: /log in/i }));
};

describe("LoginPage", () => {
    test("empty form → field messages, and no request is sent", async () => {
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />, { preloadedState: authState(null), route: "/login", path: "/login" });

        await fillAndSubmit(user);

        expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
        expect(screen.getByText("Enter your password")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("wrong password → the backend's message is shown", async () => {
        api.post.mockRejectedValue({ response: { status: 401, data: { message: "Invalid email or password" } } });
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />, { preloadedState: authState(null), route: "/login", path: "/login" });

        await fillAndSubmit(user, "ravi@shop.com", "wrong");

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
        expect(screen.getByTestId("location")).toHaveTextContent("/login");
    });

    test("locked after too many wrong passwords (429) → the message says when to try again, and the form stays usable", async () => {
        api.post.mockRejectedValue({
            response: { status: 429, data: { message: "Too many failed login attempts. Try again in 15 minutes.", error: "TOO_MANY_ATTEMPTS" } }
        });
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />, { preloadedState: authState(null), route: "/login", path: "/login" });

        await fillAndSubmit(user, "ravi@shop.com", "RightPassword1");

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many failed login attempts. Try again in 15 minutes.");
        expect(screen.getByTestId("location")).toHaveTextContent("/login"); // not logged in, not redirected
        expect(screen.getByRole("button", { name: /log in/i })).toBeEnabled();
    });

    test("success → sends the credentials and goes to the role's home page", async () => {
        api.post.mockResolvedValue({ data: { data: { user: { name: "Ravi", role: "INVENTORY_MANAGER" } } } });
        const user = userEvent.setup();
        const { store } = renderWithProviders(<LoginPage />, { preloadedState: authState(null), route: "/login", path: "/login" });

        await fillAndSubmit(user, "ravi@shop.com", "Ravi67890");

        expect(api.post).toHaveBeenCalledWith("/auth/login", { email: "ravi@shop.com", password: "Ravi67890" });
        expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
        expect(store.getState().auth.user.name).toBe("Ravi");
    });

    test("after login, returns to the page the user originally wanted", async () => {
        api.post.mockResolvedValue({ data: { data: { user: { name: "Ravi", role: "STAFF" } } } });
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />, {
            preloadedState: authState(null),
            route: { pathname: "/login", state: { from: "/profile" } },
            path: "/login"
        });

        await fillAndSubmit(user, "ravi@shop.com", "Ravi67890");

        expect(await screen.findByTestId("location")).toHaveTextContent("/profile");
    });

    test("shows why the user was logged out", () => {
        renderWithProviders(<LoginPage />, {
            preloadedState: { auth: { user: null, isCheckingSession: false, sessionMessage: "Your password was changed. Please log in again" } },
            route: "/login", path: "/login"
        });

        expect(screen.getByRole("status")).toHaveTextContent("Your password was changed");
    });

    test("already logged in → sent straight to the app", () => {
        renderWithProviders(<LoginPage />, { preloadedState: authState("ADMIN"), route: "/login", path: "/login" });

        expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    });
});

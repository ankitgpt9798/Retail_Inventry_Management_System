import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "./RegisterPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

beforeEach(() => {
    vi.clearAllMocks();
});

const fillForm = async (user, { password = "Secret123", confirm = "Secret123", phone = "" } = {}) => {
    await user.type(screen.getByLabelText("Full name"), "Asha Verma");
    await user.type(screen.getByLabelText("Work email"), "asha@shop.com");
    if (phone) await user.type(screen.getByLabelText("Phone (optional)"), phone);
    await user.type(screen.getByLabelText("Password"), password);
    await user.type(screen.getByLabelText("Confirm password"), confirm);
    await user.click(screen.getByRole("button", { name: /send request/i }));
};

describe("RegisterPage", () => {
    test("password rules and 'passwords do not match' are checked before sending", async () => {
        const user = userEvent.setup();
        renderWithProviders(<RegisterPage />, { preloadedState: authState(null) });

        await fillForm(user, { password: "password", confirm: "different" });

        expect(screen.getByText("Password must contain at least one number")).toBeInTheDocument();
        expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("success → shows the backend's 'waiting for approval' message; empty phone is not sent", async () => {
        api.post.mockResolvedValue({
            data: { message: "Registration successful. An admin must approve your account before you can log in." }
        });
        const user = userEvent.setup();
        renderWithProviders(<RegisterPage />, { preloadedState: authState(null) });

        await fillForm(user);

        expect(api.post).toHaveBeenCalledWith("/auth/register", {
            name: "Asha Verma", email: "asha@shop.com", password: "Secret123"
        });
        expect(await screen.findByText("Request sent")).toBeInTheDocument();
        expect(screen.getByText(/An admin must approve your account/)).toBeInTheDocument();
    });

    test("email already used → the backend's message", async () => {
        api.post.mockRejectedValue({ response: { status: 409, data: { message: "An account with this email already exists" } } });
        const user = userEvent.setup();
        renderWithProviders(<RegisterPage />, { preloadedState: authState(null) });

        await fillForm(user, { phone: "9876543210" });

        expect(api.post.mock.calls[0][1].phone).toBe("9876543210");
        expect(await screen.findByRole("alert")).toHaveTextContent("An account with this email already exists");
    });
});

import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactPage from "./ContactPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";
import { SITE_CONTACT } from "../../utils/siteInfo";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

beforeEach(() => {
    vi.clearAllMocks();
});

const renderPage = () => renderWithProviders(<ContactPage />, { preloadedState: authState(null), route: "/contact", path: "/contact" });

const fillForm = async () => {
    await userEvent.type(screen.getByLabelText("Name"), "Meera Pillai");
    await userEvent.type(screen.getByLabelText("Email"), "meera@example.com");
    await userEvent.type(screen.getByLabelText("Subject"), "Demo for 3 stores");
    await userEvent.type(screen.getByLabelText("Message"), "Could you show us how transfers work?");
};

describe("ContactPage", () => {
    test("shows email, phone, location and support hours", () => {
        renderPage();

        for (const value of [SITE_CONTACT.email, SITE_CONTACT.phone, SITE_CONTACT.location, SITE_CONTACT.hours]) {
            expect(screen.getByText(value)).toBeInTheDocument();
        }
    });

    test("checks every field before sending anything", async () => {
        renderPage();

        await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
        await userEvent.type(screen.getByLabelText("Message"), "short");
        await userEvent.click(screen.getByRole("button", { name: "Send Message" }));

        expect(await screen.findByText("Name must be at least 2 characters")).toBeInTheDocument();
        expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
        expect(screen.getByText("Subject must be at least 3 characters")).toBeInTheDocument();
        expect(screen.getByText("Message must be at least 10 characters")).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
        expect(api.post).not.toHaveBeenCalled();
    });

    test("sends the message, shows the success message and empties the form", async () => {
        api.post.mockResolvedValue({ data: { message: "Thank you — your message has been sent." } });
        renderPage();

        await fillForm();
        await userEvent.click(screen.getByRole("button", { name: "Send Message" }));

        expect(api.post).toHaveBeenCalledWith("/contact", {
            name: "Meera Pillai", email: "meera@example.com", subject: "Demo for 3 stores", message: "Could you show us how transfers work?"
        });
        expect(await screen.findByText("Thank you — your message has been sent.")).toBeInTheDocument();
        expect(screen.getByLabelText("Name")).toHaveValue("");
    });

    test("a server error is shown and the text is kept, so it can be sent again", async () => {
        api.post.mockRejectedValue({ request: {} });
        renderPage();

        await fillForm();
        await userEvent.click(screen.getByRole("button", { name: "Send Message" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
        expect(screen.getByLabelText("Subject")).toHaveValue("Demo for 3 stores");
    });
});

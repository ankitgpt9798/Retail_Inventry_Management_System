import { screen } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute";
import { authState, renderWithProviders } from "../test/testUtils";

const SecretPage = () => <p>Secret content</p>;

describe("ProtectedRoute", () => {
    test("while the session is being checked → a loader, not the page", () => {
        renderWithProviders(<ProtectedRoute><SecretPage /></ProtectedRoute>, {
            preloadedState: { auth: { user: null, isCheckingSession: true, sessionMessage: null } }
        });

        expect(screen.getByText("Checking your session…")).toBeInTheDocument();
        expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
    });

    test("not logged in → redirected to /login", () => {
        renderWithProviders(<ProtectedRoute><SecretPage /></ProtectedRoute>, {
            preloadedState: authState(null),
            route: "/dashboard",
            path: "/dashboard"
        });

        expect(screen.getByTestId("location")).toHaveTextContent("/login");
        expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
    });

    test("logged in with an allowed role → the page", () => {
        renderWithProviders(<ProtectedRoute roles={["ADMIN", "STAFF"]}><SecretPage /></ProtectedRoute>, {
            preloadedState: authState("STAFF")
        });

        expect(screen.getByText("Secret content")).toBeInTheDocument();
    });

    test("logged in with the wrong role → 'no access' page", () => {
        renderWithProviders(<ProtectedRoute roles={["ADMIN"]}><SecretPage /></ProtectedRoute>, {
            preloadedState: authState("SUPPLIER")
        });

        expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
        expect(screen.getByText(/Your role \(Supplier\)/)).toBeInTheDocument();
        expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
    });
});

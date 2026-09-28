import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { setupStore } from "../store/store";

// Shows the current URL so tests can check where the app navigated to
const LocationDisplay = () => {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
};

// A logged-in (or logged-out) auth state for tests
export const authState = (role, extra = {}) => ({
    auth: {
        user: role
            ? { _id: "u1", name: "Ravi Kumar", email: "ravi@shop.com", role, status: "ACTIVE", phone: "", ...extra }
            : null,
        isCheckingSession: false,
        sessionMessage: null
    }
});

// Renders a component the way the real app does: with a Redux store and a router.
//   route: the starting URL (a string, or { pathname, state })
//   path:  the URL the component lives at. Every OTHER URL shows a placeholder,
//          like real routes do. (If the component were shown at every URL, a
//          component that redirects would redirect again after arriving — forever.)
export const renderWithProviders = (ui, { preloadedState, route = "/", path = "*" } = {}) => {
    const store = setupStore(preloadedState);

    const result = render(
        <Provider store={store}>
            <MemoryRouter initialEntries={[route]}>
                <Routes>
                    <Route path={path} element={ui} />
                    {path !== "*" && <Route path="*" element={<p>Another page</p>} />}
                </Routes>
                <LocationDisplay />
            </MemoryRouter>
        </Provider>
    );

    return { store, ...result };
};

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import store from "./store/store";
import { setupInterceptors } from "./services/api";
import { sessionExpired } from "./store/authSlice";
import "./index.css";

// If any API request says "401 not logged in", clear the user in Redux.
// ProtectedRoute then sends them to /login automatically.
setupInterceptors((message) => store.dispatch(sessionExpired(message)));

// Provider:      gives every component access to the Redux store
// BrowserRouter: gives every component access to the URL / navigation
createRoot(document.getElementById("root")).render(
    <StrictMode>
        <Provider store={store}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </Provider>
    </StrictMode>
);

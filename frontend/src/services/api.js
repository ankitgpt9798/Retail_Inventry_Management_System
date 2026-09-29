import axios from "axios";

// ONE configured Axios instance for the whole app, so every request:
//  - goes to the same backend (VITE_API_URL in .env)
//  - sends the login cookie (withCredentials: true — the browser attaches the
//    HTTP-only "token" cookie; JavaScript itself can never read it)
// Pages use api.get(...) / api.post(...) instead of creating their own Axios setup.
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
    withCredentials: true,
    headers: { "Content-Type": "application/json" }
});

// Turns any failed request into a sentence we can show to the user.
// The backend always answers errors as { success: false, message, error }.
export const getErrorMessage = (error, fallback = "Something went wrong. Please try again.") => {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }
    // A request was sent but no answer came back at all
    if (error?.request && !error?.response) {
        return "Cannot reach the server. Please check that the backend is running.";
    }
    return fallback;
};

// Called once in main.jsx. If any request shows that the login is over, we tell the app
// so it can clear the user and show the login page. That is:
//   - 401: not logged in any more (session expired, password changed on another device, …)
//   - 403 with the code ACCOUNT_INACTIVE: an admin deactivated this account. The backend
//     answers 403 here (the person IS known, just not allowed in), and without this check they
//     would stay inside the app looking at a dead-end error.
// Every other 403 ("your role can't do this") must NOT log anyone out.
export const setupInterceptors = (onSessionExpired) => {
    api.interceptors.response.use(
        (response) => response,
        (error) => {
            const status = error?.response?.status;
            const url = error?.config?.url || "";
            // These two are ALLOWED to return 401 (that's how "not logged in" /
            // "wrong password" are reported), so they must not trigger a logout
            const isAuthRequest = url.includes("/auth/me") || url.includes("/auth/login");

            const isDeactivated = status === 403 && error.response.data?.error === "ACCOUNT_INACTIVE";

            if ((status === 401 || isDeactivated) && !isAuthRequest) {
                onSessionExpired(error.response.data?.message);
            }
            return Promise.reject(error);
        }
    );
};

export default api;

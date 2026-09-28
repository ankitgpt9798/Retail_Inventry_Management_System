import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { getErrorMessage } from "../services/api";

// The ONLY global state in the app: who is logged in.
//  user:           the logged-in user from the backend, or null
//  isCheckingSession: true while we ask the backend "who am I?" after a page load
//  sessionMessage: a note for the login page, e.g. "Your session has expired"
const initialState = {
    user: null,
    isCheckingSession: true,
    sessionMessage: null
};

// On page load / refresh: the cookie may still be valid, so ask the backend.
// 401 simply means "not logged in" — that's a normal answer, not an error.
export const fetchCurrentUser = createAsyncThunk("auth/fetchCurrentUser", async () => {
    try {
        const response = await api.get("/auth/me");
        return response.data.data.user;
    }
    catch {
        return null;
    }
});

// Login: the backend checks the password and sets the HTTP-only cookie.
// We only keep the user object it sends back.
export const loginUser = createAsyncThunk("auth/loginUser", async ({ email, password }, { rejectWithValue }) => {
    try {
        const response = await api.post("/auth/login", { email, password });
        return response.data.data.user;
    }
    catch (error) {
        return rejectWithValue(getErrorMessage(error, "Login failed"));
    }
});

// Logout: the backend clears the cookie. Even if that request fails,
// we still forget the user on this side.
export const logoutUser = createAsyncThunk("auth/logoutUser", async () => {
    try {
        await api.post("/auth/logout");
    }
    catch {
        // ignore — see comment above
    }
});

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        // Called by the Axios interceptor when any request returns 401
        sessionExpired: (state, action) => {
            if (state.user) {
                state.sessionMessage = action.payload || "Your session has ended. Please log in again.";
            }
            state.user = null;
        },
        // After a password change the backend logs you out everywhere
        loggedOutWithMessage: (state, action) => {
            state.user = null;
            state.sessionMessage = action.payload;
        },
        clearSessionMessage: (state) => {
            state.sessionMessage = null;
        },
        // After editing your own profile
        userUpdated: (state, action) => {
            state.user = action.payload;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchCurrentUser.fulfilled, (state, action) => {
                state.user = action.payload;
                state.isCheckingSession = false;
            })
            .addCase(loginUser.fulfilled, (state, action) => {
                state.user = action.payload;
                state.sessionMessage = null;
            })
            .addCase(logoutUser.fulfilled, (state) => {
                state.user = null;
            });
    }
});

export const { sessionExpired, loggedOutWithMessage, clearSessionMessage, userUpdated } = authSlice.actions;
export default authSlice.reducer;

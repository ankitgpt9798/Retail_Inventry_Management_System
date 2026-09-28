import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";

// A function that builds a store, so tests can create a fresh store
// with any starting state (e.g. "already logged in as STAFF")
export const setupStore = (preloadedState) => {
    return configureStore({
        reducer: {
            auth: authReducer
        },
        preloadedState
    });
};

// The store the real app uses
const store = setupStore();

export default store;

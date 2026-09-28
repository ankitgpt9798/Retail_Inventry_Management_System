import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    // react: JSX + fast refresh; tailwindcss: turns Tailwind/DaisyUI classes into CSS
    plugins: [react(), tailwindcss()],

    // The backend's CORS setting allows exactly this address (CLIENT_URL in backend/.env)
    server: {
        port: 5173,
        strictPort: true
    },

    // Settings for Vitest (frontend tests)
    test: {
        environment: "jsdom",            // a fake browser (document, window) inside Node
        globals: true,                   // describe / test / expect without importing them
        setupFiles: "./src/test/setup.js",
        css: false
    }
});

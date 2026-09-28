// Runs before every frontend test file.
// Adds matchers like expect(element).toBeInTheDocument() and toHaveTextContent().
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Remove whatever the previous test rendered
afterEach(() => {
    cleanup();
});

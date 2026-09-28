import { z } from "zod";

// Same rules as the backend (backend/src/validators/authValidators.js).
// The frontend check is only for quick feedback; the backend checks again.
export const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(64, "Password must be at most 64 characters")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number");

export const PASSWORD_HINT = "At least 8 characters, with a letter and a number";

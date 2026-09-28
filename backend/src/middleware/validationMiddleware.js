const AppError = require("../utils/AppError");

// Usage in a route: router.post("/login", validate(loginSchema), login)
// Checks req.body against a Zod schema before the controller runs.
const validate = (schema) => {
    return (req, res, next) => {
        const result = schema.safeParse(req.body || {});

        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message
            }));

            const error = new AppError(422, "VALIDATION_ERROR", errors[0].message);
            error.errors = errors;
            throw error;
        }

        // Replace the body with the cleaned data (trimmed, unknown fields removed)
        req.body = result.data;
        next();
    };
};

module.exports = validate;

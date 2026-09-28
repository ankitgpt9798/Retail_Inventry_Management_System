const AppError = require("../utils/AppError");

// Checks the request against a Zod schema before the controller runs.
//   validate(loginSchema)                → checks req.body
//   validate(listUsersQuerySchema, "query") → checks the URL query (?page=2&role=STAFF)
const validate = (schema, source = "body") => {
    return (req, res, next) => {
        const input = source === "query" ? req.query : req.body;
        const result = schema.safeParse(input || {});

        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message
            }));

            const error = new AppError(422, "VALIDATION_ERROR", errors[0].message);
            error.errors = errors;
            throw error;
        }

        // Give the controller the cleaned data (trimmed, converted, unknown fields removed)
        if (source === "query") {
            // In Express 5, req.query is read-only, so we store it under a new name
            req.validatedQuery = result.data;
        }
        else {
            req.body = result.data;
        }

        next();
    };
};

module.exports = validate;

// Runs when no route matched the request URL
const notFound = (req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        error: "NOT_FOUND"
    });
};

// Every error thrown in a route/middleware/controller/service ends up here,
// so all error responses have the same shape: { success, message, error }.
const errorHandler = (err, req, res, next) => {
    let statusCode = 500;
    let errorCode = "SERVER_ERROR";
    let message = "Something went wrong on the server";
    let errors;

    if (err.statusCode && err.errorCode) {
        // Our own AppError: already has everything we need
        statusCode = err.statusCode;
        errorCode = err.errorCode;
        message = err.message;
        errors = err.errors;
    }
    else if (err.name === "ValidationError") {
        // Mongoose schema validation failed, e.g. a negative price
        statusCode = 422;
        errorCode = "VALIDATION_ERROR";
        errors = Object.values(err.errors).map((fieldError) => ({
            field: fieldError.path,
            message: fieldError.message
        }));
        message = errors[0].message;
    }
    else if (err.name === "CastError") {
        // An invalid id in the URL, e.g. /api/products/abc
        statusCode = 400;
        errorCode = "INVALID_ID";
        message = `Invalid ${err.path}: ${err.value}`;
    }
    else if (err.code === 11000) {
        // MongoDB unique index violation, e.g. an email that already exists
        const field = Object.keys(err.keyValue || {})[0] || "value";
        statusCode = 409;
        errorCode = "DUPLICATE_VALUE";
        message = `${field} already exists`;
    }
    else if (err.type === "entity.parse.failed") {
        // The request body was not valid JSON
        statusCode = 400;
        errorCode = "INVALID_JSON";
        message = "Request body is not valid JSON";
    }
    else if (err.type === "entity.too.large") {
        // The request body is over the size limit (100 KB by default): the caller's mistake, not a server fault
        statusCode = 413;
        errorCode = "PAYLOAD_TOO_LARGE";
        message = "Request body is too large";
    }

    // Log unexpected errors for the developer; the user only sees a generic message
    if (statusCode === 500) {
        console.error(err);
    }

    // "Try again in N seconds": a standard header that clients and proxies understand (used by the login lock)
    if (err.retryAfterSeconds) {
        res.set("Retry-After", String(err.retryAfterSeconds));
    }

    const response = { success: false, message, error: errorCode };
    if (errors) {
        response.errors = errors;
    }

    res.status(statusCode).json(response);
};

module.exports = { notFound, errorHandler };

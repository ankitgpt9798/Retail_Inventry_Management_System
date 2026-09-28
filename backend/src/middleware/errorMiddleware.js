// Runs when no route matched the request URL
const notFound = (req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        error: "NOT_FOUND"
    });
};

// Every error thrown in a route/controller/service ends up here,
// so all error responses have the same shape.
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    // Log unexpected errors for the developer; don't send internals to the user
    if (statusCode === 500) {
        console.error(err);
    }

    res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? "Something went wrong on the server" : err.message,
        error: err.errorCode || "SERVER_ERROR"
    });
};

module.exports = { notFound, errorHandler };

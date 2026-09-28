// An Error that also carries an HTTP status code and a machine-readable error code.
// Services throw it; errorMiddleware turns it into the JSON response.
//
// Example: throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
class AppError extends Error {
    constructor(statusCode, errorCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
    }
}

module.exports = AppError;

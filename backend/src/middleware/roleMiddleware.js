const AppError = require("../utils/AppError");

// Put this AFTER protect, and list the roles that may use the route:
//   router.get("/", protect, authorize(ROLES.ADMIN), getAllUsers);
//   router.post("/stock-in", protect, authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER), stockIn);
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        // Safety check in case someone forgets to put protect before authorize
        if (!req.user) {
            throw new AppError(401, "NOT_AUTHENTICATED", "Please log in to continue");
        }

        if (!allowedRoles.includes(req.user.role)) {
            throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action");
        }

        next();
    };
};

module.exports = { authorize };

// Same values as the backend (backend/src/utils/constants.js)
export const ROLES = {
    ADMIN: "ADMIN",
    INVENTORY_MANAGER: "INVENTORY_MANAGER",
    STAFF: "STAFF",
    SUPPLIER: "SUPPLIER"
};

// "INVENTORY_MANAGER" → "Inventory Manager"
export const formatRole = (role) => {
    if (!role) return "";
    return role
        .toLowerCase()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};

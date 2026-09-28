const userService = require("../services/userService");
const { clearAuthCookie } = require("../utils/authCookie");

// Controllers only deal with HTTP: read the request, call the service, send JSON.
// All rules (who may change what) live in userService.

// GET /api/users
const getUsers = async (req, res) => {
    const { users, pagination } = await userService.getUsers(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Users fetched successfully",
        data: { users, pagination }
    });
};

// GET /api/users/:id
const getUserById = async (req, res) => {
    const user = await userService.getUserById(req.params.id);

    res.status(200).json({
        success: true,
        message: "User fetched successfully",
        data: { user }
    });
};

// POST /api/users
const createUser = async (req, res) => {
    const user = await userService.createUser(req.body, req.user);

    res.status(201).json({
        success: true,
        message: "User created successfully",
        data: { user }
    });
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
    const user = await userService.updateUser(req.params.id, req.body, req.user);

    res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: { user }
    });
};

// DELETE /api/users/:id
const deactivateUser = async (req, res) => {
    const user = await userService.deactivateUser(req.params.id, req.user);

    res.status(200).json({
        success: true,
        message: "User deactivated successfully",
        data: { user }
    });
};

// PUT /api/users/:id/password
const resetUserPassword = async (req, res) => {
    await userService.resetUserPassword(req.params.id, req.body.newPassword, req.user);

    res.status(200).json({
        success: true,
        message: "Password reset successfully. The user has been logged out of all devices.",
        data: {}
    });
};

// PUT /api/users/profile
const updateProfile = async (req, res) => {
    const user = await userService.updateProfile(req.user, req.body);

    res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: { user }
    });
};

// PUT /api/users/profile/password
const changeOwnPassword = async (req, res) => {
    await userService.changeOwnPassword(req.user._id, req.body.currentPassword, req.body.newPassword);

    // The current token is now invalid too, so remove it and ask the user to log in again
    clearAuthCookie(res);

    res.status(200).json({
        success: true,
        message: "Password changed successfully. Please log in again.",
        data: {}
    });
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deactivateUser,
    resetUserPassword,
    updateProfile,
    changeOwnPassword
};

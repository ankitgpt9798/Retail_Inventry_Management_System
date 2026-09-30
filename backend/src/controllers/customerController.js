const customerService = require("../services/customerService");

// GET /api/customers
const getCustomers = async (req, res) => {
    const { customers, pagination } = await customerService.getCustomers(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Customers fetched successfully",
        data: { customers, pagination }
    });
};

module.exports = { getCustomers };

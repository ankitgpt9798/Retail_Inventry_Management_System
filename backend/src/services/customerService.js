const Order = require("../models/Order");
const escapeRegex = require("../utils/escapeRegex");
const roundMoney = require("../utils/roundMoney");
const { CUSTOMER_SORT } = require("../utils/sortOptions");
const { ORDER_STATUS, OPEN_ORDER_STATUSES } = require("../utils/constants");

// Customers don't log in and have no collection of their own: their details are saved
// inside each order (Order.customer). This service builds the customer list FROM the orders,
// so it is always in step with them and needs no extra data to maintain.
//
// Orders with the same email belong to the same customer; orders without an email are
// grouped by name + phone instead.

// GET /api/customers?search=&sort=&page=&limit=
const getCustomers = async ({ search, sort = "recent", page, limit }) => {
    const match = {};
    if (search) {
        const searchPattern = new RegExp(escapeRegex(search), "i");
        match.$or = [
            { "customer.name": searchPattern },
            { "customer.email": searchPattern },
            { "customer.phone": searchPattern }
        ];
    }

    const result = await Order.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },                                   // newest first, so $first = latest details
        {
            $group: {
                _id: {
                    $ifNull: [
                        "$customer.email",
                        { $concat: ["$customer.name", "|", { $ifNull: ["$customer.phone", ""] }] }
                    ]
                },
                name: { $first: "$customer.name" },
                email: { $first: "$customer.email" },
                phone: { $first: "$customer.phone" },
                address: { $first: "$customer.address" },
                orderCount: { $sum: 1 },
                // Money only counts for orders that were not cancelled
                totalSpent: {
                    $sum: { $cond: [{ $eq: ["$status", ORDER_STATUS.CANCELLED] }, 0, "$totalAmount"] }
                },
                openOrders: {
                    $sum: { $cond: [{ $in: ["$status", OPEN_ORDER_STATUSES] }, 1, 0] }
                },
                firstOrderAt: { $last: "$createdAt" },
                lastOrderAt: { $first: "$createdAt" },
                lastOrderNumber: { $first: "$orderNumber" }
            }
        },
        { $sort: { ...CUSTOMER_SORT[sort], _id: 1 } },
        {
            // One trip to the database for both the page and the total count
            $facet: {
                rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                count: [{ $count: "total" }]
            }
        }
    ]);

    const total = result[0].count.length > 0 ? result[0].count[0].total : 0;
    const customers = result[0].rows.map((row) => ({
        key: row._id,
        name: row.name,
        email: row.email || null,
        phone: row.phone || null,
        address: row.address || null,
        orderCount: row.orderCount,
        openOrders: row.openOrders,
        totalSpent: roundMoney(row.totalSpent),
        firstOrderAt: row.firstOrderAt,
        lastOrderAt: row.lastOrderAt,
        lastOrderNumber: row.lastOrderNumber
    }));

    return {
        customers,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

module.exports = { getCustomers };

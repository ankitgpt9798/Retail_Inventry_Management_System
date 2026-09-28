const { z } = require("zod");
const { NOTIFICATION_TYPE } = require("../utils/constants");
const { paginationSchema, booleanFlagSchema } = require("./commonValidators");

// GET /api/notifications?isRead=&type=&page=&limit=
const listNotificationsQuerySchema = z.object({
    ...paginationSchema,
    isRead: booleanFlagSchema("isRead"),
    type: z.enum(Object.values(NOTIFICATION_TYPE), { error: "Notification type is not valid" }).optional()
});

module.exports = { listNotificationsQuerySchema };

const auditService = require("../services/auditService");

// GET /api/audit-logs
const getAuditLogs = async (req, res) => {
    const { auditLogs, pagination } = await auditService.getAuditLogs(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Audit logs fetched successfully",
        data: { auditLogs, pagination }
    });
};

// GET /api/audit-logs/filters
const getAuditFilters = async (req, res) => {
    const filters = await auditService.getAuditFilters();

    res.status(200).json({
        success: true,
        message: "Audit log filters fetched successfully",
        data: filters
    });
};

// GET /api/audit-logs/:id
const getAuditLogById = async (req, res) => {
    const auditLog = await auditService.getAuditLogById(req.params.id);

    res.status(200).json({
        success: true,
        message: "Audit log entry fetched successfully",
        data: { auditLog }
    });
};

module.exports = { getAuditLogs, getAuditFilters, getAuditLogById };

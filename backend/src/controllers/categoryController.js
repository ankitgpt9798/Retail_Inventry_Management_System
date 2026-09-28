const categoryService = require("../services/categoryService");

// GET /api/categories
const getCategories = async (req, res) => {
    const { categories, pagination } = await categoryService.getCategories(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Categories fetched successfully",
        data: { categories, pagination }
    });
};

// POST /api/categories
const createCategory = async (req, res) => {
    const category = await categoryService.createCategory(req.body, req.user);

    res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: { category }
    });
};

// PUT /api/categories/:id
const updateCategory = async (req, res) => {
    const category = await categoryService.updateCategory(req.params.id, req.body, req.user);

    res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: { category }
    });
};

// DELETE /api/categories/:id
const deactivateCategory = async (req, res) => {
    const category = await categoryService.deactivateCategory(req.params.id, req.user);

    res.status(200).json({
        success: true,
        message: "Category deactivated successfully",
        data: { category }
    });
};

module.exports = { getCategories, createCategory, updateCategory, deactivateCategory };

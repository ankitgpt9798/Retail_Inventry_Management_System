const productService = require("../services/productService");

// GET /api/products
const getProducts = async (req, res) => {
    const { products, pagination } = await productService.getProducts(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Products fetched successfully",
        data: { products, pagination }
    });
};

// GET /api/products/:id
const getProductById = async (req, res) => {
    const product = await productService.getProductById(req.params.id);

    res.status(200).json({
        success: true,
        message: "Product fetched successfully",
        data: { product }
    });
};

// POST /api/products
const createProduct = async (req, res) => {
    const product = await productService.createProduct(req.body, req.user);

    res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: { product }
    });
};

// PUT /api/products/:id
const updateProduct = async (req, res) => {
    const product = await productService.updateProduct(req.params.id, req.body, req.user);

    res.status(200).json({
        success: true,
        message: "Product updated successfully",
        data: { product }
    });
};

// DELETE /api/products/:id
const deactivateProduct = async (req, res) => {
    const product = await productService.deactivateProduct(req.params.id, req.user);

    res.status(200).json({
        success: true,
        message: "Product deactivated successfully",
        data: { product }
    });
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deactivateProduct };

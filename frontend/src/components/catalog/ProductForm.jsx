import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import SelectField from "../common/SelectField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// A number box left empty gives NaN, so every number field gets a friendly message
const numberField = (label) => z.number({ error: `${label} must be a number` });

// Same rules as the backend (validators/productValidators.js) for quick feedback
const productSchema = z.object({
    name: z.string().trim().min(2, "Product name must be at least 2 characters").max(200, "Product name must be at most 200 characters"),
    sku: z
        .string()
        .trim()
        .min(2, "SKU must be at least 2 characters")
        .max(50, "SKU must be at most 50 characters")
        .regex(/^[A-Za-z0-9-]+$/, "SKU can only contain letters, numbers and dashes"),
    barcode: z
        .string()
        .trim()
        .max(50, "Barcode must be at most 50 characters")
        .regex(/^[A-Za-z0-9-]*$/, "Barcode can only contain letters, numbers and dashes"),
    brand: z.string().trim().max(100, "Brand must be at most 100 characters"),
    description: z.string().trim().max(2000, "Description must be at most 2000 characters"),
    category: z.string().min(1, "Choose a category"),
    costPrice: numberField("Cost price").min(0, "Cost price cannot be negative"),
    sellingPrice: numberField("Selling price").min(0, "Selling price cannot be negative"),
    taxRate: numberField("Tax rate").min(0, "Tax rate cannot be negative").max(100, "Tax rate cannot be more than 100"),
    reorderLevel: numberField("Reorder level").int("Reorder level must be a whole number").min(0, "Reorder level cannot be negative"),
    imageUrl: z.union([z.url({ protocol: /^https?$/, error: "Image URL must start with http:// or https://" }), z.literal("")])
});

// Create (product = null) or edit (product = the row being edited).
// `categories` = all categories; only ACTIVE ones can be chosen (the backend refuses inactive ones).
const ProductForm = ({ product, categories, onSaved, onClose }) => {
    const isEdit = Boolean(product);
    const [serverError, setServerError] = useState("");

    // Keep the product's current category in the list even if it was deactivated since
    const categoryOptions = categories.filter(
        (category) => category.status === "ACTIVE" || category._id === product?.category?._id
    );

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(productSchema),
        defaultValues: {
            name: product?.name || "",
            sku: product?.sku || "",
            barcode: product?.barcode || "",
            brand: product?.brand || "",
            description: product?.description || "",
            category: product?.category?._id || "",
            costPrice: product?.costPrice ?? 0,
            sellingPrice: product?.sellingPrice ?? 0,
            taxRate: product?.taxRate ?? 0,
            reorderLevel: product?.reorderLevel ?? 10,
            imageUrl: product?.imageUrl || ""
        }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            if (isEdit) {
                await api.put(`/products/${product._id}`, values);
            }
            else {
                await api.post("/products", values);
            }
            onSaved(isEdit ? "Product updated." : "Product created.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save the product"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <ErrorAlert message={serverError} />
            <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Name" error={errors.name} {...register("name")} />
                <TextField label="SKU" hint="Letters, numbers and dashes, e.g. LAP-001" error={errors.sku} {...register("sku")} />
                <SelectField label="Category" error={errors.category} {...register("category")}>
                    <option value="">Choose a category…</option>
                    {categoryOptions.map((category) => (
                        <option key={category._id} value={category._id}>
                            {category.name}
                        </option>
                    ))}
                </SelectField>
                <TextField label="Brand (optional)" error={errors.brand} {...register("brand")} />
                <TextField label="Cost price (₹)" type="number" step="0.01" error={errors.costPrice} {...register("costPrice", { valueAsNumber: true })} />
                <TextField label="Selling price (₹)" type="number" step="0.01" error={errors.sellingPrice} {...register("sellingPrice", { valueAsNumber: true })} />
                <TextField label="Tax rate (%)" type="number" step="0.01" error={errors.taxRate} {...register("taxRate", { valueAsNumber: true })} />
                <TextField label="Reorder level" type="number" hint="Low-stock alert below this many units" error={errors.reorderLevel} {...register("reorderLevel", { valueAsNumber: true })} />
                <TextField label="Barcode (optional)" error={errors.barcode} {...register("barcode")} />
                <TextField label="Image URL (optional)" error={errors.imageUrl} {...register("imageUrl")} />
            </div>
            <TextField label="Description (optional)" error={errors.description} {...register("description")} />
            <div className="form-actions">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create product"}
                </button>
            </div>
        </form>
    );
};

export default ProductForm;

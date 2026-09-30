import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// Same rules as the backend (validators/categoryValidators.js) for quick feedback
const categorySchema = z.object({
    name: z.string().trim().min(2, "Category name must be at least 2 characters").max(100, "Category name must be at most 100 characters"),
    description: z.string().trim().max(500, "Description must be at most 500 characters")
});

// Create (category = null) or edit (category = the row being edited)
const CategoryForm = ({ category, onSaved, onClose }) => {
    const isEdit = Boolean(category);
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(categorySchema),
        defaultValues: { name: category?.name || "", description: category?.description || "" }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            if (isEdit) {
                await api.put(`/categories/${category._id}`, values);
            }
            else {
                await api.post("/categories", values);
            }
            onSaved(isEdit ? "Category updated." : "Category created.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save the category"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <ErrorAlert message={serverError} />
            <TextField label="Name" error={errors.name} {...register("name")} />
            <TextField label="Description (optional)" error={errors.description} {...register("description")} />
            <div className="form-actions">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create category"}
                </button>
            </div>
        </form>
    );
};

export default CategoryForm;

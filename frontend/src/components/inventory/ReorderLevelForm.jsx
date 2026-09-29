import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

const reorderSchema = z.object({
    reorderLevel: z
        .number({ error: "Reorder level must be a number" })
        .int("Reorder level must be a whole number")
        .min(0, "Reorder level cannot be negative")
        .max(1000000, "Reorder level is too large")
});

// Changes the low-stock threshold of ONE product in ONE warehouse
const ReorderLevelForm = ({ inventory, onSaved, onClose }) => {
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(reorderSchema),
        defaultValues: { reorderLevel: inventory.reorderLevel }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            await api.put(`/inventory/${inventory._id}/reorder-level`, values);
            onSaved("Reorder level updated.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not update the reorder level"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <p className="mb-2 text-sm text-base-content/70">
                {inventory.product.name} in {inventory.warehouse.name}. You get a low-stock alert when available stock falls below this number.
            </p>
            <ErrorAlert message={serverError} />
            <TextField label="Reorder level" type="number" error={errors.reorderLevel} {...register("reorderLevel", { valueAsNumber: true })} />
            <div className="modal-action">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : "Save"}
                </button>
            </div>
        </form>
    );
};

export default ReorderLevelForm;

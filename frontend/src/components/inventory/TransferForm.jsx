import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import SelectField from "../common/SelectField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// Same rules as the backend (validators/transferValidators.js) for quick feedback
const transferSchema = z
    .object({
        product: z.string().min(1, "Choose a product"),
        fromWarehouse: z.string().min(1, "Choose the source warehouse"),
        toWarehouse: z.string().min(1, "Choose the destination warehouse"),
        quantity: z
            .number({ error: "Quantity must be a number" })
            .int("Quantity must be a whole number")
            .min(1, "Quantity must be at least 1")
            .max(1000000, "Quantity is too large"),
        notes: z.string().trim().max(500, "Notes must be at most 500 characters")
    })
    .refine((data) => !data.fromWarehouse || data.fromWarehouse !== data.toWarehouse, {
        message: "Source and destination warehouse cannot be the same",
        path: ["toWarehouse"]
    });

// Requests a transfer of stock between two warehouses. It starts as REQUESTED;
// someone else then approves it (see the Transfers page).
const TransferForm = ({ products, warehouses, onSaved, onClose }) => {
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(transferSchema),
        defaultValues: { product: "", fromWarehouse: "", toWarehouse: "", quantity: 1, notes: "" }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            await api.post("/transfers", values);
            onSaved("Transfer requested.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not create the transfer"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <ErrorAlert message={serverError} />
            <SelectField label="Product" error={errors.product} {...register("product")}>
                <option value="">Choose a product…</option>
                {products.map((product) => (
                    <option key={product._id} value={product._id}>
                        {product.name} ({product.sku})
                    </option>
                ))}
            </SelectField>
            <div className="grid gap-x-4 sm:grid-cols-2">
                <SelectField label="From warehouse" error={errors.fromWarehouse} {...register("fromWarehouse")}>
                    <option value="">Choose…</option>
                    {warehouses.map((warehouse) => (
                        <option key={warehouse._id} value={warehouse._id}>
                            {warehouse.name} ({warehouse.code})
                        </option>
                    ))}
                </SelectField>
                <SelectField label="To warehouse" error={errors.toWarehouse} {...register("toWarehouse")}>
                    <option value="">Choose…</option>
                    {warehouses.map((warehouse) => (
                        <option key={warehouse._id} value={warehouse._id}>
                            {warehouse.name} ({warehouse.code})
                        </option>
                    ))}
                </SelectField>
            </div>
            <TextField label="Quantity" type="number" error={errors.quantity} {...register("quantity", { valueAsNumber: true })} />
            <TextField label="Notes (optional)" error={errors.notes} {...register("notes")} />
            <div className="modal-action">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Requesting…" : "Request transfer"}
                </button>
            </div>
        </form>
    );
};

export default TransferForm;

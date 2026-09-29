import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import SelectField from "../common/SelectField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// Same rules as the backend (validators/inventoryValidators.js) for quick feedback
const quantity = z
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(1000000, "Quantity is too large");

const stockInSchema = z.object({
    product: z.string().min(1, "Choose a product"),
    warehouse: z.string().min(1, "Choose a warehouse"),
    quantity,
    note: z.string().trim().max(500, "Note must be at most 500 characters")
});

// Removing stock always needs a reason (damaged, expired…)
const stockOutSchema = stockInSchema.extend({
    note: z.string().trim().min(3, "Please give a reason for removing stock (e.g. damaged, expired)").max(500, "Note must be at most 500 characters")
});

// Adds stock (mode "in") or removes it (mode "out").
//   preset: an inventory row to start from, so its product and warehouse are already chosen
const StockMovementForm = ({ mode, preset, products, warehouses, onSaved, onClose }) => {
    const isOut = mode === "out";
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(isOut ? stockOutSchema : stockInSchema),
        defaultValues: {
            product: preset?.product?._id || "",
            warehouse: preset?.warehouse?._id || "",
            quantity: 1,
            note: ""
        }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            await api.post(isOut ? "/inventory/stock-out" : "/inventory/stock-in", values);
            onSaved(isOut ? "Stock removed." : "Stock added.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not update the stock"));
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
            <SelectField label="Warehouse" error={errors.warehouse} {...register("warehouse")}>
                <option value="">Choose a warehouse…</option>
                {warehouses.map((warehouse) => (
                    <option key={warehouse._id} value={warehouse._id}>
                        {warehouse.name} ({warehouse.code})
                    </option>
                ))}
            </SelectField>
            <TextField label="Quantity" type="number" error={errors.quantity} {...register("quantity", { valueAsNumber: true })} />
            <TextField
                label={isOut ? "Reason" : "Note (optional)"}
                hint={isOut ? "e.g. damaged, expired, lost" : undefined}
                error={errors.note}
                {...register("note")}
            />
            <div className="modal-action">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className={`btn ${isOut ? "btn-error" : "btn-primary"}`} disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : isOut ? "Remove stock" : "Add stock"}
                </button>
            </div>
        </form>
    );
};

export default StockMovementForm;

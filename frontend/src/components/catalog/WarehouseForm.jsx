import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import SelectField from "../common/SelectField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// Same rules as the backend (validators/warehouseValidators.js) for quick feedback
const warehouseSchema = z.object({
    name: z.string().trim().min(2, "Warehouse name must be at least 2 characters").max(100, "Warehouse name must be at most 100 characters"),
    code: z
        .string()
        .trim()
        .min(2, "Warehouse code must be at least 2 characters")
        .max(20, "Warehouse code must be at most 20 characters")
        .regex(/^[A-Za-z0-9-]+$/, "Warehouse code can only contain letters, numbers and dashes"),
    address: z.string().trim().max(300, "Address must be at most 300 characters"),
    city: z.string().trim().min(2, "City must be at least 2 characters").max(100, "City must be at most 100 characters"),
    state: z.string().trim().max(100, "State must be at most 100 characters"),
    capacity: z
        .number({ error: "Capacity must be a number" })
        .int("Capacity must be a whole number")
        .min(1, "Capacity must be at least 1"),
    manager: z.string()
});

// Create (warehouse = null) or edit (warehouse = the row being edited).
// `managers` = inventory managers to choose from, or null when this user may not list
// users (only admins can) — then the manager field is hidden and left unchanged.
const WarehouseForm = ({ warehouse, managers, onSaved, onClose }) => {
    const isEdit = Boolean(warehouse);
    const [serverError, setServerError] = useState("");

    // Keep the current manager in the list even if they are no longer an active manager
    const currentManager = warehouse?.manager;
    const managerOptions = managers && currentManager && !managers.some((m) => m._id === currentManager._id)
        ? [...managers, currentManager]
        : managers;

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(warehouseSchema),
        defaultValues: {
            name: warehouse?.name || "",
            code: warehouse?.code || "",
            address: warehouse?.address || "",
            city: warehouse?.city || "",
            state: warehouse?.state || "",
            capacity: warehouse?.capacity ?? 1000,
            manager: warehouse?.manager?._id || ""
        }
    });

    const onSubmit = async (values) => {
        setServerError("");
        const { manager, ...rest } = values;
        // "" means "no manager" → the backend wants null. No list = don't touch it.
        const payload = managers ? { ...rest, manager: manager || null } : rest;
        try {
            if (isEdit) {
                await api.put(`/warehouses/${warehouse._id}`, payload);
            }
            else {
                await api.post("/warehouses", payload);
            }
            onSaved(isEdit ? "Warehouse updated." : "Warehouse created.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save the warehouse"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <ErrorAlert message={serverError} />
            <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Name" error={errors.name} {...register("name")} />
                <TextField label="Code" hint="Short code, e.g. DEL-01" error={errors.code} {...register("code")} />
                <TextField label="City" error={errors.city} {...register("city")} />
                <TextField label="State (optional)" error={errors.state} {...register("state")} />
                <TextField label="Capacity (units)" type="number" error={errors.capacity} {...register("capacity", { valueAsNumber: true })} />
                {managerOptions && (
                    <SelectField label="Manager (optional)" error={errors.manager} {...register("manager")}>
                        <option value="">No manager</option>
                        {managerOptions.map((manager) => (
                            <option key={manager._id} value={manager._id}>
                                {manager.name}
                            </option>
                        ))}
                    </SelectField>
                )}
            </div>
            <TextField label="Address (optional)" error={errors.address} {...register("address")} />
            <div className="form-actions">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create warehouse"}
                </button>
            </div>
        </form>
    );
};

export default WarehouseForm;

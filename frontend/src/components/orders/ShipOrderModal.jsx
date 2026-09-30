import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "../common/Modal";
import TextField from "../common/TextField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// Same rules as the backend: shipping needs a carrier and a tracking number
const shipSchema = z.object({
    carrier: z.string().trim().min(2, "Carrier must be at least 2 characters").max(100, "Carrier is too long"),
    trackingNumber: z.string().trim().min(3, "Tracking number must be at least 3 characters").max(100, "Tracking number is too long")
});

// Shipping takes the reserved stock out of the warehouse for good, so it gets its own pop-up
const ShipOrderModal = ({ order, onShipped, onClose }) => {
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(shipSchema),
        defaultValues: { carrier: "", trackingNumber: "" }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            await api.put(`/orders/${order._id}/status`, { status: "SHIPPED", ...values });
            onShipped(`${order.orderNumber} shipped.`);
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not ship the order"));
        }
    };

    return (
        <Modal title={`Ship ${order.orderNumber}`} onClose={onClose}>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                <p className="mb-2 text-sm text-base-content/70">The reserved stock will be taken out of the warehouse.</p>
                <ErrorAlert message={serverError} />
                <TextField label="Carrier" hint="e.g. Blue Dart" error={errors.carrier} {...register("carrier")} />
                <TextField label="Tracking number" error={errors.trackingNumber} {...register("trackingNumber")} />
                <div className="form-actions">
                    <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? "Shipping…" : "Ship order"}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ShipOrderModal;

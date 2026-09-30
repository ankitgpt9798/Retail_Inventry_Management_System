import { useState } from "react";
import Modal from "../common/Modal";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";
import { formatNumber } from "../../utils/format";

// Records a delivery: how many units of each product arrived (may be less than ordered).
// The stock is added to the warehouse by the backend.
const ReceiveGoodsModal = ({ purchase, onReceived, onClose }) => {
    // Only lines that still have units outstanding
    const lines = purchase.items.filter((item) => item.quantityOrdered - item.quantityReceived > 0);

    // What the user typed, by product id (text, so an empty box stays empty)
    const [quantities, setQuantities] = useState({});
    const [error, setError] = useState("");
    const [isWorking, setIsWorking] = useState(false);

    const productId = (item) => item.product?._id || item.product;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");

        const received = [];
        for (const item of lines) {
            const text = quantities[productId(item)];
            if (!text) continue; // nothing arrived for this line
            const quantity = Number(text);
            const outstanding = item.quantityOrdered - item.quantityReceived;
            if (!Number.isInteger(quantity) || quantity < 1) {
                setError(`Enter a whole number of at least 1 for ${item.product?.name}, or leave it empty`);
                return;
            }
            if (quantity > outstanding) {
                setError(`Only ${outstanding} unit(s) of ${item.product?.name} are still expected`);
                return;
            }
            received.push({ product: productId(item), quantity });
        }
        if (received.length === 0) {
            setError("Enter the quantity received for at least one item");
            return;
        }

        setIsWorking(true);
        try {
            await api.put(`/purchases/${purchase._id}/receive`, { items: received });
            onReceived(`Goods received for ${purchase.poNumber}.`);
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not record the delivery"));
            setIsWorking(false);
        }
    };

    return (
        <Modal title={`Receive goods · ${purchase.poNumber}`} onClose={onClose} wide>
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <p className="mb-3 text-sm text-base-content/70">
                    Enter how many units arrived in {purchase.warehouse?.name}. Leave a line empty if nothing arrived for it.
                </p>
                <ErrorAlert message={error} />
                <div className="overflow-x-auto">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th className="text-right">Ordered</th>
                                <th className="text-right">Received so far</th>
                                <th className="text-right">Arrived now</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((item) => (
                                <tr key={productId(item)}>
                                    <td>
                                        <div className="font-medium">{item.product?.name}</div>
                                        <div className="font-mono text-xs text-base-content/60">{item.product?.sku}</div>
                                    </td>
                                    <td className="text-right">{formatNumber(item.quantityOrdered)}</td>
                                    <td className="text-right">{formatNumber(item.quantityReceived)}</td>
                                    <td className="text-right">
                                        <input
                                            type="number"
                                            min="0"
                                            className="input input-sm w-24 text-right"
                                            aria-label={`Received quantity for ${item.product?.name}`}
                                            value={quantities[productId(item)] ?? ""}
                                            onChange={(event) => setQuantities({ ...quantities, [productId(item)]: event.target.value })}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="form-actions">
                    <button type="button" className="btn" onClick={onClose} disabled={isWorking}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isWorking}>
                        {isWorking ? "Saving…" : "Record delivery"}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ReceiveGoodsModal;

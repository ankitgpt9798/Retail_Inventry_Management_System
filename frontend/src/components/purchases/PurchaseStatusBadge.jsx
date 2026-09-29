import { PURCHASE_STATUS_STYLES } from "../../utils/purchaseStatus";

// Coloured label such as "Ordered" or "Partly received"
const PurchaseStatusBadge = ({ status }) => {
    const style = PURCHASE_STATUS_STYLES[status] || { label: status, className: "badge-neutral" };
    return <span className={`badge badge-sm badge-soft ${style.className}`}>{style.label}</span>;
};

export default PurchaseStatusBadge;

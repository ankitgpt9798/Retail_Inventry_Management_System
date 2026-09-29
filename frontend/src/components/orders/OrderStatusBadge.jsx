import { ORDER_STATUS_STYLES } from "../../utils/orderStatus";

// Coloured label such as "Packed" or "Delivered"
const OrderStatusBadge = ({ status }) => {
    const style = ORDER_STATUS_STYLES[status] || { label: status, className: "badge-neutral" };
    return <span className={`badge badge-sm badge-soft ${style.className}`}>{style.label}</span>;
};

export default OrderStatusBadge;

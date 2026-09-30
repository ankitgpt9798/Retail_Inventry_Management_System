import StatusBadge from "../common/StatusBadge";
import { ORDER_STATUS_STYLES } from "../../utils/orderStatus";

// Coloured label such as "Packed" or "Delivered"
const OrderStatusBadge = ({ status }) => <StatusBadge status={status} styles={ORDER_STATUS_STYLES} />;

export default OrderStatusBadge;

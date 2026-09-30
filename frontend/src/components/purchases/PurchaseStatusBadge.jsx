import StatusBadge from "../common/StatusBadge";
import { PURCHASE_STATUS_STYLES } from "../../utils/purchaseStatus";

// Coloured label such as "Ordered" or "Partly received"
const PurchaseStatusBadge = ({ status }) => <StatusBadge status={status} styles={PURCHASE_STATUS_STYLES} />;

export default PurchaseStatusBadge;

import Badge from "./Badge";
import { RECORD_STATUS_STYLES } from "../../utils/statusStyles";

// The status label used on every card and detail page.
//   <StatusBadge status="ACTIVE" />                                   → green "Active"
//   <StatusBadge status={order.status} styles={ORDER_STATUS_STYLES} />  → the order's own label + colour
// `styles` is one of the tables in utils/statusStyles.js (or orderStatus / purchaseStatus).
const StatusBadge = ({ status, styles = RECORD_STATUS_STYLES }) => {
    const style = styles[status] || { label: status, tone: "neutral" };
    return <Badge tone={style.tone}>{style.label}</Badge>;
};

export default StatusBadge;

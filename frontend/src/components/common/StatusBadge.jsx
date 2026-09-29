// Green "Active" / grey "Inactive" label used in every list
const StatusBadge = ({ status }) => {
    const isActive = status === "ACTIVE";
    return (
        <span className={`badge badge-sm badge-soft ${isActive ? "badge-success" : "badge-neutral"}`}>
            {isActive ? "Active" : "Inactive"}
        </span>
    );
};

export default StatusBadge;

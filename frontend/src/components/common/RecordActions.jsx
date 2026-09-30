import { Pencil, Power, RotateCcw } from "lucide-react";

// The Edit + Deactivate / Reactivate buttons of a card (products, categories, warehouses, suppliers).
// Records are never deleted in this app — they are deactivated, and can be reactivated later.
//   <RecordActions name={product.name} isActive={product.status === "ACTIVE"}
//                  onEdit={…} onDeactivate={…} onReactivate={…} />
const RecordActions = ({ name, isActive, onEdit, onDeactivate, onReactivate }) => (
    <>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`Edit ${name}`}>
            <Pencil size={14} aria-hidden="true" /> Edit
        </button>
        {isActive ? (
            <button type="button" className="btn btn-ghost btn-sm text-error" onClick={onDeactivate} aria-label={`Deactivate ${name}`}>
                <Power size={14} aria-hidden="true" /> Deactivate
            </button>
        ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onReactivate} aria-label={`Reactivate ${name}`}>
                <RotateCcw size={14} aria-hidden="true" /> Reactivate
            </button>
        )}
    </>
);

export default RecordActions;

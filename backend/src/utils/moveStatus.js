// Changes a document's status in ONE atomic operation, but only if its current
// status is one of allowedFromStatuses. Used by transfers, purchase orders and orders.
//
// Returns the updated document, or null if the status was not (or no longer) allowed —
// e.g. when two people click "Dispatch" at the same moment, the second one gets null.
// The caller decides which error to show.
const moveStatus = (Model, documentId, allowedFromStatuses, toStatus, extraFields = {}) => {
    return Model.findOneAndUpdate(
        { _id: documentId, status: { $in: allowedFromStatuses } },
        { $set: { status: toStatus, ...extraFields } },
        { returnDocument: "after" }
    );
};

module.exports = moveStatus;

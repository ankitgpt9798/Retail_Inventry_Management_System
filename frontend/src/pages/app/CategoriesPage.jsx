import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Boxes, Plus, Tags } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import RecordActions from "../../components/common/RecordActions";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import CategoryForm from "../../components/catalog/CategoryForm";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";
import { formatDate } from "../../utils/format";

const PAGE_SIZE = 10;

const INITIAL_FILTERS = { search: "", status: "" };

const CategoriesPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("categories", role);

    // Filters. Typing in the search box waits 400 ms before calling the API.
    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    // Which pop-up is open: { type: "form" | "deactivate", category } or null
    const [dialog, setDialog] = useState(null);
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const { items, pagination, isLoading, error, reload } = useList("/categories", "categories", {
        ...filters,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE
    });

    const closeDialog = () => setDialog(null);

    const handleSaved = (message) => {
        closeDialog();
        setNotice(message);
        reload();
    };

    const handleDeactivate = async () => {
        await api.delete(`/categories/${dialog.category._id}`);
        handleSaved("Category deactivated.");
    };

    const handleReactivate = async (category) => {
        setActionError("");
        try {
            await api.put(`/categories/${category._id}`, { status: "ACTIVE" });
            setNotice("Category reactivated.");
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, "Could not reactivate the category"));
        }
    };

    const newCategoryButton = mayEdit && (
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", category: null })}>
            <Plus size={16} aria-hidden="true" /> New category
        </button>
    );

    const renderCategory = (category) => (
        <RecordCard
            key={category._id}
            label={category.name}
            title={category.name}
            subtitle={category.description || "No description"}
            icon={Tags}
            status={<StatusBadge status={category.status} />}
            footer={
                <>
                    <Link to={`/products?category=${category._id}`} className="btn btn-ghost btn-sm" aria-label={`View products in ${category.name}`}>
                        <Boxes size={14} aria-hidden="true" /> Products
                    </Link>
                    {mayEdit && (
                        <RecordActions
                            name={category.name}
                            isActive={category.status === "ACTIVE"}
                            onEdit={() => setDialog({ type: "form", category })}
                            onDeactivate={() => setDialog({ type: "deactivate", category })}
                            onReactivate={() => handleReactivate(category)}
                        />
                    )}
                </>
            }
        >
            <CardFields>
                <CardField label="Created" value={formatDate(category.createdAt)} />
                <CardField label="Last updated" value={formatDate(category.updatedAt)} />
            </CardFields>
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Categories" description="Groups that products belong to.">
                {newCategoryButton}
            </PageHeader>

            <PageAlerts notice={notice} error={actionError} onDismissNotice={() => setNotice("")} />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search categories…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
                    <option value="">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                </FilterSelect>
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="categories"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={Tags}
                emptyMessage="Categories group your products, e.g. Grocery or Electronics."
                renderItem={renderCategory}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="categories" />

            {dialog?.type === "form" && (
                <Modal title={dialog.category ? "Edit category" : "New category"} onClose={closeDialog}>
                    <CategoryForm category={dialog.category} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "deactivate" && (
                <ConfirmModal
                    title="Deactivate category?"
                    message={`"${dialog.category.name}" will be hidden from new products. You can reactivate it later.`}
                    confirmLabel="Deactivate"
                    onConfirm={handleDeactivate}
                    onClose={closeDialog}
                />
            )}
        </>
    );
};

export default CategoriesPage;

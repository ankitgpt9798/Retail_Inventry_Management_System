import { useCallback, useEffect, useState } from "react";
import api, { getErrorMessage } from "../services/api";

// Loads a paginated list from the API and reloads it whenever the filters change.
//   path:    "/products"
//   listKey: the name of the array inside response.data.data, e.g. "products"
//   params:  { search, status, page, limit … }  (empty values are left out of the URL)
// Returns { items, pagination, isLoading, error, reload }
const useList = (path, listKey, params) => {
    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    // `params` is a new object on every render; a string compares by value
    const paramsKey = JSON.stringify(params);

    const load = useCallback(async () => {
        const cleanParams = Object.fromEntries(
            Object.entries(JSON.parse(paramsKey)).filter(([, value]) => value !== "" && value != null)
        );
        setIsLoading(true);
        setError("");
        try {
            const response = await api.get(path, { params: cleanParams });
            setItems(response.data.data[listKey]);
            setPagination(response.data.data.pagination);
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not load the list"));
        }
        finally {
            setIsLoading(false);
        }
    }, [path, listKey, paramsKey]);

    useEffect(() => {
        load();
    }, [load]);

    return { items, pagination, isLoading, error, reload: load };
};

export default useList;

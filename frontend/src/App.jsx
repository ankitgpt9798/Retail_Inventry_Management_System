import { useEffect } from "react";
import { useDispatch } from "react-redux";
import AppRoutes from "./routes/AppRoutes";
import { fetchCurrentUser } from "./store/authSlice";

const App = () => {
    const dispatch = useDispatch();

    // On every page load/refresh: ask the backend whether our cookie is still valid
    useEffect(() => {
        dispatch(fetchCurrentUser());
    }, [dispatch]);

    return <AppRoutes />;
};

export default App;

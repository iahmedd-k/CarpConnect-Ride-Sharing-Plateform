import { Navigate } from "react-router-dom";

type AppRole = "rider" | "driver" | "both";

export const ProtectedRoute = ({
    children,
    allowRoles,
    redirectTo = "/dashboard",
}: {
    children: JSX.Element;
    allowRoles?: AppRole[];
    redirectTo?: string;
}) => {
    const userStr = localStorage.getItem("carpconnect_user");
    const token = localStorage.getItem("carpconnect_token");

    if (!userStr || !token) {
        return <Navigate to="/login" replace />;
    }

    try {
        const user = JSON.parse(userStr);
        if (!user || typeof user !== "object") throw new Error("Invalid user data");

        if (allowRoles && allowRoles.length > 0) {
            const role = user.role as AppRole | undefined;
            const isAllowed = !!role && (
                allowRoles.includes(role) ||
                (role === "both" && (allowRoles.includes("driver") || allowRoles.includes("rider") || allowRoles.includes("both")))
            );

            if (!isAllowed) {
                return <Navigate to={redirectTo} replace />;
            }
        }
    } catch {
        return <Navigate to="/login" replace />;
    }

    return children;
};

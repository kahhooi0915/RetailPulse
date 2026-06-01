import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Bell,
    LogOut,
    RefreshCcw,
    Settings,
} from "lucide-react";
import Sidebar from "../components/Sidebar";

export default function DashboardLayout({
    user,
    title,
    subtitle,
    modelText,
    children,
    onRefresh,
    onOpenSettings,
    onOpenChat,
    onOpenNotifications,
    notificationCount = 0,
    compactMode = false,
}) {
    const navigate = useNavigate();
    const [showUserMenu, setShowUserMenu] = useState(false);

    const logout = () => {
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("user");
        navigate("/");
    };

    return (
        <div className="h-screen w-full overflow-hidden bg-[#eef6fb] text-[#17325c]">
            <div className="flex h-full">
                <Sidebar user={user} onOpenChat={onOpenChat} />

                <main
                    className={`min-w-0 flex-1 overflow-y-auto ${compactMode ? "px-5 py-4" : "px-8 py-6"
                        }`}
                >
                    <header className="mb-8 flex items-center gap-5">
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#07102f]">
                                {title}
                            </h1>

                            {subtitle && (
                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    {subtitle}
                                </p>
                            )}

                            {modelText && (
                                <p className="mt-1 text-xs font-bold text-[#1e4db7]">
                                    {modelText}
                                </p>
                            )}
                        </div>

                        <div className="relative ml-auto flex items-center gap-3">
                            {onRefresh && (
                                <button
                                    onClick={onRefresh}
                                    className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                                >
                                    <RefreshCcw size={18} />
                                </button>
                            )}

                            {onOpenNotifications && (
                                <button
                                    onClick={onOpenNotifications}
                                    className="relative grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                                >
                                    <Bell size={18} />

                                    {notificationCount > 0 && (
                                        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                                            {notificationCount}
                                        </span>
                                    )}
                                </button>
                            )}

                            {onOpenSettings && (
                                <button
                                    onClick={onOpenSettings}
                                    className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                                >
                                    <Settings size={18} />
                                </button>
                            )}

                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-[#0d2d6c] font-bold text-white shadow"
                            >
                                {user?.name?.charAt(0)?.toUpperCase() || "A"}
                            </button>

                            {showUserMenu && (
                                <div className="absolute right-0 top-14 z-50 w-48 rounded-2xl bg-white p-3 shadow-xl">
                                    <button
                                        onClick={() => navigate("/user-profile")}
                                        className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-[#17325c] hover:bg-[#eef6fb]"
                                    >
                                        User Profile
                                    </button>

                                    <button
                                        onClick={logout}
                                        className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-bold text-red-500 hover:bg-red-50"
                                    >
                                        <LogOut size={16} />
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </header>

                    {children}
                </main>
            </div>
        </div>
    );
}

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Boxes, ChevronRight, HelpCircle, Truck } from "lucide-react";

const managerMenuItems = [
    {
        label: "Dashboard",
        icon: BarChart3,
        path: "/manager-dashboard",
    },
    {
        label: "Stock Transfer",
        icon: Truck,
        path: "/manager-stock-transfer",
    },
    {
        label: "Branch Inventory",
        icon: Boxes,
        path: "/manager-inventory",
    },
];

export default function ManagerSidebar({ user, onOpenHelp }) {
    const navigate = useNavigate();
    const location = useLocation();

    const [sidebarPinned, setSidebarPinned] = useState(false);
    const [sidebarHovered, setSidebarHovered] = useState(false);

    const sidebarOpen = sidebarPinned || sidebarHovered;

    return (
        <aside
            onMouseEnter={() => setSidebarHovered(true)}
            onMouseLeave={() => setSidebarHovered(false)}
            className={`relative flex min-h-0 shrink-0 flex-col bg-[#d9edf8] py-6 border-r border-blue-100 transition-all duration-300 ${sidebarOpen ? "w-[250px] px-5" : "w-[86px] px-3"
                }`}
        >
            <div className={`mb-8 flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}>
                {sidebarOpen && (
                    <div className="text-2xl font-extrabold text-[#1e4db7]">
                        RetailPulse
                    </div>
                )}

                <button
                    onClick={() => setSidebarPinned(!sidebarPinned)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#1e4db7] shadow"
                    title={sidebarPinned ? "Collapse sidebar" : "Pin sidebar"}
                >
                    <ChevronRight
                        size={18}
                        className={`transition-transform duration-300 ${sidebarPinned ? "rotate-180" : ""
                            }`}
                    />
                </button>
            </div>

            {sidebarOpen && (
                <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
                    <h4 className="font-extrabold text-[#16325b]">
                        {user?.branch_name || "Branch"}
                    </h4>
                    <p className="mt-1 text-xs text-[#6f85a3]">
                        Manager ID: {user?.user_id}
                    </p>
                </div>
            )}

            <nav className="min-h-0 flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
                    {managerMenuItems.map((item) => (
                        <ManagerSidebarButton
                            key={item.label}
                            sidebarOpen={sidebarOpen}
                            icon={item.icon}
                            label={item.label}
                            active={item.path === location.pathname}
                            onClick={() => navigate(item.path)}
                        />
                    ))}
                </div>

                <div className="pt-4 border-t border-blue-100">
                    <ManagerSidebarButton
                        sidebarOpen={sidebarOpen}
                        icon={HelpCircle}
                        label="Help Support"
                        active={false}
                        onClick={onOpenHelp}
                    />
                </div>
            </nav>
        </aside>
    );
}

function ManagerSidebarButton({
    icon: Icon,
    label,
    active,
    onClick,
    sidebarOpen,
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`flex w-full items-center rounded-2xl text-left transition ${sidebarOpen ? "gap-3 px-4 justify-start" : "justify-center px-0"
                } py-4 ${active
                    ? "bg-white font-bold text-[#1e4db7] shadow"
                    : "bg-white/30 font-semibold text-[#254e7a] hover:bg-white/70"
                }`}
        >
            <Icon size={18} className="shrink-0" />

            {sidebarOpen && (
                <span className="min-w-0 flex-1 truncate text-sm">
                    {label}
                </span>
            )}
        </button>
    );
}

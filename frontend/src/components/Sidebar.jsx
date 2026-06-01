import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { sidebarItems } from "../data/sidebarItems";

export default function Sidebar({ user, onOpenChat }) {
    const navigate = useNavigate();
    const location = useLocation();

    const [sidebarPinned, setSidebarPinned] = useState(false);
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [openGroups, setOpenGroups] = useState({});

    const sidebarOpen = sidebarPinned || sidebarHovered;
    const items = sidebarItems[user?.role] || [];

    const toggleGroup = (label) => {
        setOpenGroups((prev) => ({
            ...prev,
            [label]: !prev[label],
        }));
    };

    return (
        <aside
            onMouseEnter={() => setSidebarHovered(true)}
            onMouseLeave={() => setSidebarHovered(false)}
            className={`relative flex min-h-0 flex-col bg-[#d9edf8] py-6 border-r border-blue-100 transition-all duration-300 ${sidebarOpen ? "w-[250px] px-5" : "w-[86px] px-3"
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
                        {user?.name || "User"}
                    </h4>
                    <p className="mt-1 text-xs text-[#6f85a3]">
                        ID: {user?.user_id || "-"}
                    </p>
                </div>
            )}

            <nav className="min-h-0 flex flex-col flex-1 overflow-hidden">
                {/* Main Menu Items */}
                <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
                    {items
                        .filter((item) => item.action !== "chat")
                        .map((item) => {
                            const hasChildren = Array.isArray(item.children);
                            const groupOpen = openGroups[item.label];

                            const groupActive =
                                hasChildren &&
                                item.children.some(
                                    (child) => child.path === location.pathname
                                );

                            if (hasChildren) {
                                return (
                                    <div key={item.label}>
                                        <SidebarButton
                                            sidebarOpen={sidebarOpen}
                                            icon={item.icon}
                                            label={item.label}
                                            active={groupActive}
                                            isGroup
                                            groupOpen={groupOpen}
                                            onClick={() => {
                                                if (!sidebarOpen) {
                                                    setSidebarHovered(true);
                                                }
                                                toggleGroup(item.label);
                                            }}
                                        />

                                        {sidebarOpen && groupOpen && (
                                            <div className="mt-2 space-y-2 pl-4">
                                                {item.children.map((child) => (
                                                    <SidebarButton
                                                        key={child.label}
                                                        sidebarOpen={sidebarOpen}
                                                        icon={child.icon}
                                                        label={child.label}
                                                        active={
                                                            child.path ===
                                                            location.pathname
                                                        }
                                                        isChild
                                                        onClick={() => {
                                                            if (
                                                                child.action === "chat"
                                                            ) {
                                                                onOpenChat?.();
                                                            } else if (child.path) {
                                                                navigate(child.path);
                                                            }
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <SidebarButton
                                    key={item.label}
                                    sidebarOpen={sidebarOpen}
                                    icon={item.icon}
                                    label={item.label}
                                    active={item.path === location.pathname}
                                    onClick={() => {
                                        if (item.action === "chat") {
                                            onOpenChat?.();
                                        } else if (item.path) {
                                            navigate(item.path);
                                        }
                                    }}
                                />
                            );
                        })}
                </div>

                {/* Help Support at Bottom */}
                <div className="pt-4 border-t border-blue-100">
                    {items
                        .filter((item) => item.action === "chat")
                        .map((item) => (
                            <SidebarButton
                                key={item.label}
                                sidebarOpen={sidebarOpen}
                                icon={item.icon}
                                label={item.label}
                                active={false}
                                onClick={() => onOpenChat?.()}
                            />
                        ))}
                </div>
            </nav>
        </aside>
    );
}

function SidebarButton({
    icon: Icon,
    label,
    active,
    onClick,
    sidebarOpen,
    isGroup = false,
    groupOpen = false,
    isChild = false,
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`flex w-full items-center rounded-2xl text-left transition ${sidebarOpen ? "gap-3 px-4 justify-start" : "justify-center px-0"
                } ${isChild ? "py-3" : "py-4"
                } ${active
                    ? "bg-white font-bold text-[#1e4db7] shadow"
                    : "bg-white/30 font-semibold text-[#254e7a] hover:bg-white/70"
                }`}
        >
            <Icon size={18} className="shrink-0" />

            {sidebarOpen && (
                <>
                    <span className="min-w-0 flex-1 truncate text-sm">
                        {label}
                    </span>

                    {isGroup && (
                        <ChevronDown
                            size={16}
                            className={`shrink-0 transition-transform duration-300 ${groupOpen ? "rotate-180" : ""
                                }`}
                        />
                    )}
                </>
            )}
        </button>
    );
}
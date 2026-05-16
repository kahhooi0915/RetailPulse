import {
    BarChart3,
    Boxes,
    Building2,
    FolderKanban,
    HelpCircle,
    ShoppingCart,
    TrendingUp,
    Users,
} from "lucide-react";

export const sidebarItems = {
    SYSTEM_ADMIN: [
        { label: "Dashboard", icon: BarChart3, path: "/admin" },
        { label: "User Management", icon: Users, path: "/admin/users" },
        { label: "Branch Management", icon: Building2, path: "/admin/branches" },
        { label: "Catalog Management", icon: FolderKanban, path: "/admin/catalog" },
        { label: "Inventory Overview", icon: Boxes, path: "/admin/inventory" },
        { label: "Sales Monitoring", icon: ShoppingCart, path: "/admin/sales" },
        { label: "Reports & Forecasting", icon: TrendingUp, path: "/admin/reports" },
        { label: "Help Support", icon: HelpCircle, path: "/help" },
    ],

    INVENTORY_MANAGER: [
        { label: "Dashboard", icon: BarChart3, path: "/manager/dashboard" },
        { label: "Branch Inventory", icon: Boxes, path: "/manager/inventory" },
        { label: "Stock Transfer", icon: ShoppingCart, path: "/manager/stock-transfer" },
        { label: "Reports", icon: TrendingUp, path: "/manager/reports" },
        { label: "Help Support", icon: HelpCircle, path: "/help" },
    ],

    BRANCH_STAFF: [
        { label: "Dashboard", icon: BarChart3, path: "/staff" },
        { label: "POS", icon: ShoppingCart, path: "/staff" },
        { label: "Analytics", icon: TrendingUp, path: "/staff/analytics" },
        { label: "Stock Request", icon: Boxes, path: "/staff/request-stock" },
        { label: "Help Support", icon: HelpCircle, path: "/help" },
    ],
};
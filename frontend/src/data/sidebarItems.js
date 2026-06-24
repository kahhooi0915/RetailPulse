import {
    BarChart3,
    Boxes,
    Building2,
    FolderKanban,
    DatabaseBackup,
    Package,
    ShoppingCart,
    TrendingUp,
    Users,
    Warehouse,
    ClipboardList,
} from "lucide-react";

export const sidebarItems = {
    SYSTEM_ADMIN: [
        // Standalone item
        {
            label: "Dashboard",
            icon: BarChart3,
            path: "/admin",
        },

        // Group: User & Branch
        {
            label: "User & Branch",
            icon: Users,
            children: [
                {
                    label: "User Management",
                    icon: Users,
                    path: "/admin/users",
                },
                {
                    label: "Branch Management",
                    icon: Building2,
                    path: "/admin/branches",
                },
            ],
        },

        // Group: Catalog
        {
            label: "Catalog",
            icon: FolderKanban,
            children: [
                {
                    label: "Catalog Management",
                    icon: FolderKanban,
                    path: "/admin/catalog",
                },
                {
                    label: "Supplier Management",
                    icon: Package,
                    path: "/admin/suppliers",
                },
            ],
        },

        // Group: Inventory
        {
            label: "Inventory Management",
            icon: Boxes,
            children: [
                {
                    label: "Inventory Overview",
                    icon: Boxes,
                    path: "/admin/inventory",
                },
                {
                    label: "Warehouse Management",
                    icon: Warehouse,
                    path: "/admin/warehouse",
                },
                {
                    label: "Purchase Management",
                    icon: ShoppingCart,
                    path: "/admin/purchases",
                },
            ],
        },

        // Group: Sales
        {
            label: "Sales Management",
            icon: TrendingUp,
            children: [
                {
                    label: "Sales Monitoring",
                    icon: ShoppingCart,
                    path: "/admin/sales",
                },
                {
                    label: "Reports & Forecasting",
                    icon: TrendingUp,
                    path: "/admin/reports",
                },
            ],
        },

        // Standalone item
        {
            label: "Activity Log",
            icon: ClipboardList,
            path: "/admin/activity-log",
        },

        // Standalone item
        {
            label: "Database Backup",
            icon: DatabaseBackup,
            path: "/admin/database-backup",
            placement: "bottom",
        },
    ],

    INVENTORY_MANAGER: [
        {
            label: "Dashboard",
            icon: BarChart3,
            path: "/manager-dashboard",
        },
        {
            label: "Inventory Management",
            icon: Boxes,
            children: [
                {
                    label: "Branch Inventory",
                    icon: Boxes,
                    path: "/manager-inventory",
                },
                {
                    label: "Stock Transfer",
                    icon: ShoppingCart,
                    path: "/manager-stock-transfer",
                },
            ],
        },
    ],

    BRANCH_STAFF: [
        {
            label: "Dashboard",
            icon: BarChart3,
            path: "/staff",
        },
        {
            label: "Operations",
            icon: ShoppingCart,
            children: [
                {
                    label: "POS",
                    icon: ShoppingCart,
                    path: "/staff",
                },
                {
                    label: "Analytics",
                    icon: TrendingUp,
                    path: "/staff/analytics",
                },
                {
                    label: "Stock Request",
                    icon: Boxes,
                    path: "/staff/request-stock",
                },
            ],
        },
    ],
};

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Building2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileDown,
  FolderKanban,
  HelpCircle,
  Package,
  Printer,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import DashboardLayout from "../layouts/DashboardLayout";
import { downloadPDF } from "../utils/downloadPDF";
import { formatCurrency } from "../utils/formatCurrency";

const API_BASE = "http://localhost:5000";

const getDashboardPeriodQuery = (view) => {
  const period = String(view || "Monthly").toLowerCase();
  if (period.includes("year")) return "period=yearly";
  return "period=monthly";
};

const GROSS_PROFIT_TOOLTIP =
  "Gross Profit represents the estimated profit generated from product sales before operating expenses. It is calculated using the difference between selling price and purchase cost multiplied by quantity sold.";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState({
    pending_transfers: 0,
    total_sales: 0,
    gross_profit: 0,
    inventory_value: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  const [showNotifications, setShowNotifications] = useState(false);
  const [settingsData] = useState(() => {
    const savedSettings = sessionStorage.getItem("adminSettings");

    return savedSettings
      ? JSON.parse(savedSettings)
      : {
        lowStockAlert: true,
        salesAlert: true,
        systemNotification: true,
        compactMode: false,
        dashboardView: "Monthly",
      };
  });

  const [notificationRead, setNotificationRead] = useState(() => {
    return sessionStorage.getItem("adminNotificationRead") === "true";
  });

  useEffect(() => {
    const savedUser = JSON.parse(sessionStorage.getItem("user"));

    if (!savedUser) {
      navigate("/");
      return;
    }

    setUser(savedUser);
  }, [navigate]);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [
        usersRes,
        branchesRes,
        productsRes,
        categoriesRes,
        inventoryRes,
        salesRes,
        dashboardSummaryRes,
        recentActivityRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/branches`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/products`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/categories`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/inventory`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/sales`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/dashboard/summary?${getDashboardPeriodQuery(settingsData.dashboardView)}`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/audit-logs?user_id=${user.user_id}&limit=5`, { credentials: "include" }),
      ]);

      const purchasesResult = await fetch(`${API_BASE}/admin/purchases`, {
        credentials: "include",
      })
        .then(async (res) => (res.ok ? res.json() : []))
        .catch(() => []);

      const usersData = await usersRes.json();
      const branchesData = await branchesRes.json();
      const productsData = await productsRes.json();
      const categoriesData = await categoriesRes.json();
      const inventoryData = await inventoryRes.json();
      const salesData = await salesRes.json();
      const dashboardSummaryData = await dashboardSummaryRes.json();
      const recentActivityData = await recentActivityRes.json();

      setUsers(Array.isArray(usersData) ? usersData : []);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);
      setSales(Array.isArray(salesData) ? salesData : []);
      setPurchases(Array.isArray(purchasesResult) ? purchasesResult : []);
      setDashboardSummary(dashboardSummaryData || {
        pending_transfers: 0,
        total_sales: 0,
        gross_profit: 0,
        inventory_value: 0,
      });
      setRecentActivity(Array.isArray(recentActivityData) ? recentActivityData : []);
    } catch (error) {
      console.error(error);
      alert("Failed to load admin dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => loadData();

  const generatedDateTime = new Date().toLocaleString();

  const generatedDateForFile = () => {
    const generatedDate = new Date();
    const year = generatedDate.getFullYear();
    const month = String(generatedDate.getMonth() + 1).padStart(2, "0");
    const day = String(generatedDate.getDate()).padStart(2, "0");
    const hours = String(generatedDate.getHours()).padStart(2, "0");
    const minutes = String(generatedDate.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${minutes}`;
  };

  const handlePrintDashboard = () => {
    window.print();
  };

  const handleExportSummaryPdf = async () => {
    try {
      setIsPdfGenerating(true);
      document.body.classList.add("exporting-admin-dashboard");
      await new Promise((resolve) => setTimeout(resolve, 150));
      await downloadPDF({
        elementId: "admin-dashboard-report-content",
        fileName: `RetailPulse_Admin_Dashboard_${generatedDateForFile()}.pdf`,
      });
    } finally {
      document.body.classList.remove("exporting-admin-dashboard");
      setIsPdfGenerating(false);
    }
  };

  const totalSales = Number(dashboardSummary.total_sales || 0);
  const grossProfit = Number(dashboardSummary.gross_profit || 0);
  const inventoryValue = Number(dashboardSummary.inventory_value || 0);
  const pendingTransfers = Number(dashboardSummary.pending_transfers || 0);

  const lowStockItems = useMemo(() => {
    return inventory.filter((item) => {
      const product = products.find(
        (p) => Number(p.product_id) === Number(item.product_id)
      );
      const branch = branches.find(
        (branchItem) => Number(branchItem.branch_id) === Number(item.branch_id)
      );
      const reorderLevel = Number(
        branch?.branch_type === "WAREHOUSE"
          ? product?.warehouse_reorder_level || product?.reorder_level || 10
          : product?.reorder_level || 10
      );
      return Number(item.quantity_in_stock || 0) <= reorderLevel;
    });
  }, [branches, inventory, products]);

  const notificationCount = notificationRead ? 0 : lowStockItems.length;

  const pendingPurchases = useMemo(() => {
    return purchases.filter((purchase) =>
      ["PENDING", "ORDERED"].includes(purchase.status)
    ).length;
  }, [purchases]);

  useEffect(() => {
    const previousCount = Number(
      sessionStorage.getItem("adminLowStockCount") || 0
    );

    if (lowStockItems.length !== previousCount) {
      setNotificationRead(false);
      sessionStorage.setItem("adminNotificationRead", "false");
      sessionStorage.setItem("adminLowStockCount", String(lowStockItems.length));
    }
  }, [lowStockItems.length]);

  const salesBranches = useMemo(() => {
    return branches.filter((branch) => branch.branch_type === "BRANCH");
  }, [branches]);

  const branchPerformance = useMemo(() => {
    return salesBranches.map((branch) => {
      const branchSales = sales.filter(
        (sale) => Number(sale.branch_id) === Number(branch.branch_id)
      );

      return {
        ...branch,
        revenue: branchSales.reduce(
          (sum, sale) => sum + Number(sale.total_amount || 0),
          0
        ),
        transactions: branchSales.length,
      };
    });
  }, [salesBranches, sales]);

  const branchesWithSales = branchPerformance.filter(
    (branch) => Number(branch.revenue || 0) > 0 || Number(branch.transactions || 0) > 0
  );

  const top5Branches = [...branchesWithSales]
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5);

  const quickActions = [
    {
      title: "Review Low Stock",
      value: lowStockItems.length,
      desc: "Open inventory items that need replenishment.",
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-100",
      hoverBorder: "hover:border-orange-300",
      accent: "bg-orange-500",
      path: "/admin/inventory",
    },
    {
      title: "Process Transfers",
      value: pendingTransfers,
      desc: "Check requests awaiting approval or processing.",
      icon: ArrowLeftRight,
      color: "text-[#1e4db7]",
      bg: "bg-blue-50",
      border: "border-blue-100",
      hoverBorder: "hover:border-blue-300",
      accent: "bg-[#1e4db7]",
      path: "/admin/warehouse",
    },
    {
      title: "Manage Purchases",
      value: pendingPurchases,
      desc: "Follow up pending and ordered purchase orders.",
      icon: ShoppingCart,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-100",
      hoverBorder: "hover:border-green-300",
      accent: "bg-green-500",
      path: "/admin/purchases",
    },
    {
      title: "View Forecasts",
      value: "Ready",
      desc: "Review next-month demand and sales predictions.",
      icon: TrendingUp,
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "border-purple-100",
      hoverBorder: "hover:border-purple-300",
      accent: "bg-purple-500",
      path: "/admin/reports",
    },
    {
      title: "Audit Activity",
      value: recentActivity.length,
      desc: "Inspect the latest system activity records.",
      icon: ClipboardList,
      color: "text-slate-600",
      bg: "bg-slate-100",
      border: "border-slate-200",
      hoverBorder: "hover:border-slate-300",
      accent: "bg-slate-500",
      path: "/admin/activity-log",
    },
  ];

  const priorityAlerts = [
    {
      title: "Low Stock Needs Review",
      desc: `${lowStockItems.length} item(s) are at or below reorder level.`,
      count: lowStockItems.length,
      action: "Open Inventory",
      path: "/admin/inventory",
      tone: "orange",
    },
    {
      title: "Transfers Waiting",
      desc: `${pendingTransfers} transfer request(s) are still open.`,
      count: pendingTransfers,
      action: "Open Warehouse",
      path: "/admin/warehouse",
      tone: "blue",
    },
    {
      title: "Purchases Need Action",
      desc: `${pendingPurchases} purchase order(s) are pending or ordered.`,
      count: pendingPurchases,
      action: "Open Purchases",
      path: "/admin/purchases",
      tone: "green",
    },
  ];

  return (
    <>
      <style>
        {`
          .admin-dashboard-report-cover {
            display: none;
          }

          .exporting-admin-dashboard .admin-dashboard-report-cover {
            display: block;
          }

          .exporting-admin-dashboard .admin-dashboard-actions {
            display: none !important;
          }

          .exporting-admin-dashboard #admin-dashboard-report-content {
            background: #eef6fb;
            padding: 24px;
          }

          @media print {
            @page {
              size: A4;
              margin: 10mm;
            }

            html,
            body,
            #root {
              height: auto !important;
              overflow: visible !important;
              background: #eef6fb !important;
            }

            body * {
              visibility: hidden !important;
            }

            #admin-dashboard-report-content,
            #admin-dashboard-report-content * {
              visibility: visible !important;
            }

            #admin-dashboard-report-content {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              box-sizing: border-box !important;
              background: #eef6fb !important;
              color: #07102f !important;
              padding: 18px !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            .admin-dashboard-report-cover {
              display: none !important;
            }

            .admin-dashboard-print-header {
              display: block !important;
            }

            .admin-dashboard-actions,
            aside,
            nav {
              display: none !important;
            }

            #admin-dashboard-report-content section,
            #admin-dashboard-report-content .report-panel {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            #admin-dashboard-report-content .shadow-sm,
            #admin-dashboard-report-content .shadow-xl {
              box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08) !important;
            }

            #admin-dashboard-report-content .rounded-2xl {
              border-radius: 16px !important;
            }

            #admin-dashboard-report-content .admin-dashboard-chart-card,
            #admin-dashboard-report-content .admin-dashboard-chart {
              max-width: 100% !important;
              overflow: hidden !important;
            }

            #admin-dashboard-report-content .admin-dashboard-screen-chart {
              display: none !important;
            }

            #admin-dashboard-report-content .admin-dashboard-print-chart {
              display: block !important;
            }

            #admin-dashboard-report-content .admin-dashboard-print-chart.hidden {
              display: block !important;
            }

            #admin-dashboard-report-content .recharts-responsive-container,
            #admin-dashboard-report-content .recharts-wrapper,
            #admin-dashboard-report-content .recharts-surface {
              max-width: 100% !important;
            }

            #admin-dashboard-report-content .recharts-surface {
              overflow: hidden !important;
            }

            #admin-dashboard-report-content .bg-white {
              background-color: #ffffff !important;
            }

            #admin-dashboard-report-content .bg-\\[\\#eef6fb\\] {
              background-color: #eef6fb !important;
            }

            #admin-dashboard-report-content .bg-\\[\\#f8fcff\\] {
              background-color: #f8fcff !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid {
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
              gap: 14px !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid > div {
              padding: 16px !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid h2 {
              font-size: 18px !important;
              line-height: 1.25 !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid p {
              letter-spacing: 0.04em !important;
            }

            #admin-dashboard-report-content table {
              font-size: 11px !important;
            }
          }
        `}
      </style>

      <DashboardLayout
        user={user}
        title="Admin Dashboard"
        subtitle="Monitor users, branches, products, inventory, sales, and system performance."
        modelText={`Current View: ${settingsData.dashboardView}`}
        onRefresh={refreshData}
        onOpenNotifications={() => {
          setShowNotifications(true);
          setNotificationRead(true);
          sessionStorage.setItem("adminNotificationRead", "true");
        }}
        notificationCount={notificationCount}
        compactMode={settingsData.compactMode}
        headerActions={
          <div className="admin-dashboard-actions flex flex-wrap items-center justify-end gap-2">
            <DashboardActionButton
              icon={Printer}
              label="Print Dashboard"
              onClick={handlePrintDashboard}
            />
            <DashboardActionButton
              icon={FileDown}
              label={isPdfGenerating ? "Generating PDF..." : "Download as PDF"}
              onClick={handleExportSummaryPdf}
              disabled={isPdfGenerating || loading}
              primary
            />
          </div>
        }
      >
        <div
          id="admin-dashboard-report-content"
          className="admin-dashboard-report-content"
        >
          <div className="admin-dashboard-print-header mb-6 hidden">
            <h1 className="text-3xl font-extrabold text-[#07102f]">
              Admin Dashboard
            </h1>
            <p className="mt-1 text-sm text-[#6f85a3]">
              Monitor users, branches, products, inventory, sales, and system performance.
            </p>
            <p className="mt-1 text-xs font-bold text-[#1e4db7]">
              Current View: {settingsData.dashboardView}
            </p>
          </div>
          <div className="admin-dashboard-report-cover rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-[#1e4db7]">
              RetailPulse
            </p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#07102f]">
              Admin Dashboard Summary
            </h2>
            <p className="mt-1 text-sm text-[#6f85a3]">
              Management snapshot for users, branches, products, inventory, sales,
              and system operations.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-[#17325c]">
              <span>Generated: {generatedDateTime}</span>
              <span>Current View: {settingsData.dashboardView}</span>
            </div>
          </div>
          <div className={settingsData.compactMode ? "space-y-5" : "space-y-6"}>
        {loading ? (
          <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
            <div className="text-center">
              <BarChart3 size={42} className="mx-auto mb-3" />
              <p className="font-semibold">Loading admin dashboard data...</p>
            </div>
          </div>
        ) : (
          <>
            <section className="admin-dashboard-summary-grid grid grid-cols-2 gap-5 xl:grid-cols-4">
              <SummaryCard title="Total Users" value={users.length} icon={Users} color="text-[#1e4db7]" />
              <SummaryCard title="Branches" value={branches.length} icon={Building2} color="text-[#1e4db7]" />
              <SummaryCard title="Products" value={products.length} icon={Package} color="text-green-600" />
              <SummaryCard title="Categories" value={categories.length} icon={FolderKanban} color="text-[#07102f]" />
            </section>

            <section className="admin-dashboard-summary-grid grid grid-cols-2 gap-5 xl:grid-cols-3 2xl:grid-cols-6">
              <SummaryCard title="Total Sales" value={formatCurrency(totalSales)} icon={TrendingUp} color="text-green-600" />
              <SummaryCard
                title="Gross Profit"
                value={formatCurrency(grossProfit)}
                icon={CircleDollarSign}
                color="text-green-600"
                tooltipText={GROSS_PROFIT_TOOLTIP}
              />
              <SummaryCard title="Inventory Value" value={formatCurrency(inventoryValue)} icon={Package} color="text-[#1e4db7]" />
              <SummaryCard title="Sales Records" value={sales.length} icon={ShoppingCart} color="text-[#1e4db7]" />
              <SummaryCard
                title="Pending Transfers"
                value={pendingTransfers}
                icon={ArrowLeftRight}
                color="text-orange-600"
                helperText="Awaiting approval or processing"
              />
              <SummaryCard title="Low Stock Items" value={lowStockItems.length} icon={AlertTriangle} color="text-orange-600" />
            </section>

            <section className="rounded-2xl border border-blue-100 bg-[#f3f9ff] p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-[#07102f]">
                    Quick Actions
                  </h2>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Jump straight to the operational areas that need review.
                  </p>
                </div>
                <span className="w-fit rounded-full bg-[#eef6fb] px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-[#1e4db7]">
                  Action Center
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
                {quickActions.map((action) => (
                  <QuickActionCard
                    key={action.title}
                    {...action}
                    onClick={() => navigate(action.path)}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-[#07102f]">
                    Priority Alerts
                  </h2>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    A compact view of the operational issues most likely to need action.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/admin/activity-log")}
                  className="inline-flex w-fit items-center gap-2 rounded-xl border border-blue-100 px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-[#1e4db7] transition hover:border-[#1e4db7] hover:bg-[#f8fcff]"
                >
                  Activity Log
                  <ChevronRight size={15} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {priorityAlerts.map((alert) => (
                  <PriorityAlertCard
                    key={alert.title}
                    {...alert}
                    onClick={() => navigate(alert.path)}
                  />
                ))}
              </div>
            </section>

            <section className="admin-dashboard-chart-card rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                <h2 className="text-xl font-extrabold text-[#07102f]">
                  Top Performing Sales Branches
                </h2>
                <p className="mt-1 text-sm text-[#6f85a3]">
                  Top 5 sales branches with the highest revenue.
                </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/admin/sales")}
                  className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#eef6fb] px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-[#1e4db7] transition hover:bg-blue-100"
                >
                  Sales Details
                  <ChevronRight size={15} />
                </button>
              </div>

              <BranchRevenueBarChart
                branches={top5Branches}
                formatCurrency={formatCurrency}
                barColor="#1e4db7"
              />
            </section>
          </>
        )}
          </div>
        </div>

      {showNotifications && (
        <div className="fixed inset-0 z-50">
          <div
            onClick={() => setShowNotifications(false)}
            className="absolute inset-0 bg-black/20"
          />

          <div className="absolute right-0 top-0 h-full w-[370px] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-[#07102f]">
                Notifications
              </h2>

              <button
                onClick={() => setShowNotifications(false)}
                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
              >
                X
              </button>
            </div>

            <div className="space-y-4">
              <NotificationCard
                title="Low Stock Alert"
                desc={`${lowStockItems.length} item(s) need attention.`}
                color="orange"
              />
              <NotificationCard
                title="Sales Records"
                desc={`${sales.length} total sale record(s) found.`}
                color="blue"
              />
              <NotificationCard
                title="System Users"
                desc={`${users.length} user account(s) registered.`}
                color="green"
              />
            </div>
          </div>
        </div>
      )}
      </DashboardLayout>
    </>
  );
}

function DashboardActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  primary = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:translate-y-0 disabled:bg-gray-200 disabled:text-gray-500 sm:text-sm ${
        primary
          ? "bg-[#0c2f73] text-white hover:bg-[#103986]"
          : "border border-blue-100 bg-white text-[#17325c] hover:border-[#1e4db7] hover:bg-[#f8fcff] hover:text-[#1e4db7]"
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function SummaryCard({ title, value, icon: Icon, color, helperText, tooltipText }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
            {title}
          </p>
          {tooltipText && (
            <span className="group relative inline-flex">
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded-full text-[#6f85a3] transition hover:bg-[#eef6fb] hover:text-[#1e4db7]"
                aria-label={tooltipText}
              >
                <HelpCircle size={14} />
              </button>
              <span className="pointer-events-none absolute left-0 top-7 z-20 hidden w-72 rounded-lg border border-blue-100 bg-white p-3 text-left text-xs font-semibold normal-case tracking-normal text-[#17325c] shadow-xl group-hover:block">
                {tooltipText}
              </span>
            </span>
          )}
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#eef6fb]">
          <Icon size={18} className={color} />
        </div>
      </div>

      <h2 className={`mt-4 text-2xl font-extrabold ${color}`}>{value}</h2>
      {helperText && (
        <p className="mt-1 text-xs font-semibold text-[#6f85a3]">
          {helperText}
        </p>
      )}
    </div>
  );
}

function QuickActionCard({
  title,
  value,
  desc,
  icon: Icon,
  color,
  bg,
  border,
  hoverBorder,
  accent,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex min-h-[170px] flex-col overflow-hidden rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${border} ${hoverBorder}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${bg} ring-1 ring-inset ring-white/70`}>
          <Icon size={22} className={color} />
        </div>
        <ChevronRight
          size={19}
          className={`mt-1 text-[#6f85a3] transition group-hover:translate-x-1 ${color}`}
        />
      </div>

      <div className="mt-5">
        <p className="text-sm font-extrabold text-[#07102f]">{title}</p>
        <p className={`mt-2 text-3xl font-extrabold ${color}`}>{value}</p>
        <p className="mt-2 text-sm font-semibold leading-5 text-[#6f85a3]">
          {desc}
        </p>
      </div>
    </button>
  );
}

function PriorityAlertCard({ title, desc, count, action, tone, onClick }) {
  const toneClass =
    tone === "orange"
      ? "border-orange-100 bg-orange-50 text-orange-600"
      : tone === "green"
        ? "border-green-100 bg-green-50 text-green-600"
        : "border-blue-100 bg-blue-50 text-[#1e4db7]";

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-extrabold">{title}</p>
          <p className="mt-2 text-sm font-semibold leading-5 text-[#4c6280]">
            {desc}
          </p>
        </div>
        <span className="grid h-10 min-w-10 place-items-center rounded-full bg-white px-3 text-lg font-extrabold shadow-sm">
          {count}
        </span>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-[#17325c] shadow-sm transition hover:translate-x-1"
      >
        {action}
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

function BranchRevenueBarChart({ branches, formatCurrency, barColor }) {
  if (branches.length === 0) {
    return <EmptyBox text="No sales data available." />;
  }

  const maxRevenue = Math.max(
    ...branches.map((branch) => Number(branch.revenue || 0)),
    1
  );

  return (
    <div className="admin-dashboard-chart mt-6">
      <div className="admin-dashboard-screen-chart h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={branches}
            layout="vertical"
            margin={{ top: 8, right: 28, left: 18, bottom: 8 }}
          >
            <CartesianGrid stroke="#eef6fb" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(value) => formatCurrency(value)}
              tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="branch_name"
              width={170}
              tick={{ fill: "#17325c", fontSize: 12, fontWeight: 800 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "#f8fcff" }}
              content={<BranchRevenueTooltip formatCurrency={formatCurrency} />}
            />
            <Bar dataKey="revenue" fill={barColor} radius={[0, 8, 8, 0]} barSize={24}>
              <LabelList
                dataKey="revenue"
                position="right"
                formatter={(value) => formatCurrency(value)}
                fill="#17325c"
                fontSize={12}
                fontWeight={800}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-dashboard-print-chart hidden space-y-4">
        {branches.map((branch) => {
          const revenue = Number(branch.revenue || 0);
          const width = `${Math.max((revenue / maxRevenue) * 100, 2)}%`;

          return (
            <div key={branch.branch_id}>
              <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                <span className="max-w-[55%] font-extrabold text-[#17325c]">
                  {branch.branch_name}
                </span>
                <span className="font-bold text-[#6f85a3]">
                  {formatCurrency(revenue)}
                </span>
              </div>
              <div className="h-5 overflow-hidden rounded-full bg-[#eef6fb]">
                <div
                  className="h-full rounded-full"
                  style={{ width, backgroundColor: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BranchRevenueTooltip({ active, payload, formatCurrency }) {
  if (!active || !payload?.length) return null;

  const branch = payload[0].payload;

  return (
    <div className="rounded-2xl border border-blue-50 bg-white p-4 text-sm shadow-xl">
      <p className="font-extrabold text-[#07102f]">{branch.branch_name}</p>
      <p className="mt-1 text-xs font-bold text-[#6f85a3]">
        {branch.branch_code || "-"}
      </p>
      <p className="mt-3 font-extrabold text-[#1e4db7]">
        {formatCurrency(branch.revenue)}
      </p>
    </div>
  );
}

function EmptyBox({ text }) {
  return (
    <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
      {text}
    </div>
  );
}

function NotificationCard({ title, desc, color }) {
  const colorClass =
    color === "orange"
      ? "bg-orange-50 text-orange-600"
      : color === "green"
        ? "bg-green-50 text-green-600"
        : "bg-blue-50 text-[#1e4db7]";

  return (
    <div className={`rounded-2xl p-4 ${colorClass}`}>
      <p className="font-extrabold">{title}</p>
      <p className="mt-1 text-sm">{desc}</p>
    </div>
  );
}

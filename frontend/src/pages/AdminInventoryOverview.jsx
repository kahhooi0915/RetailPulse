import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";

const API = "http://localhost:5000";

export default function InventoryOverview() {
    const user = JSON.parse(sessionStorage.getItem("user")) || {};
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [branchFilter, setBranchFilter] = useState("ALL");
    const [stockFilter, setStockFilter] = useState("ALL");

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API}/admin/inventory`);
            const data = await res.json();
            setInventory(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Inventory overview error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const branches = useMemo(() => {
        return ["ALL", ...new Set(inventory.map((i) => i.branch_name).filter(Boolean))];
    }, [inventory]);

    const withStatus = useMemo(() => {
        return inventory.map((item) => {
            const qty = Number(item.quantity_in_stock || 0);

            let status = "NORMAL";
            if (qty === 0) status = "OUT_OF_STOCK";
            else if (qty <= 10) status = "LOW_STOCK";

            return { ...item, stock_status: status };
        });
    }, [inventory]);

    const filteredInventory = useMemo(() => {
        return withStatus.filter((item) => {
            const keyword = search.toLowerCase();

            const matchSearch =
                item.product_code?.toLowerCase().includes(keyword) ||
                item.product_name?.toLowerCase().includes(keyword) ||
                item.branch_name?.toLowerCase().includes(keyword);

            const matchBranch =
                branchFilter === "ALL" || item.branch_name === branchFilter;

            const matchStock =
                stockFilter === "ALL" || item.stock_status === stockFilter;

            return matchSearch && matchBranch && matchStock;
        });
    }, [withStatus, search, branchFilter, stockFilter]);

    const totalStock = filteredInventory.reduce(
        (sum, item) => sum + Number(item.quantity_in_stock || 0),
        0
    );

    const totalProducts = new Set(filteredInventory.map((i) => i.product_id)).size;

    const lowStockCount = filteredInventory.filter(
        (item) => item.stock_status === "LOW_STOCK"
    ).length;

    const outOfStockCount = filteredInventory.filter(
        (item) => item.stock_status === "OUT_OF_STOCK"
    ).length;

    const branchSummary = useMemo(() => {
        const map = {};

        filteredInventory.forEach((item) => {
            const branch = item.branch_name || "Unknown Branch";

            if (!map[branch]) {
                map[branch] = {
                    branch,
                    totalStock: 0,
                    lowStock: 0,
                    outOfStock: 0,
                };
            }

            map[branch].totalStock += Number(item.quantity_in_stock || 0);

            if (item.stock_status === "LOW_STOCK") map[branch].lowStock += 1;
            if (item.stock_status === "OUT_OF_STOCK") map[branch].outOfStock += 1;
        });

        return Object.values(map).sort((a, b) => b.totalStock - a.totalStock);
    }, [filteredInventory]);

    const lowestStockItems = useMemo(() => {
        return [...filteredInventory]
            .sort((a, b) => Number(a.quantity_in_stock) - Number(b.quantity_in_stock))
            .slice(0, 5);
    }, [filteredInventory]);

    return (
        <DashboardLayout
            user={user}
            title="Inventory Overview"
            subtitle="Monitor branch stock levels, low-stock items, and inventory availability."
            onRefresh={fetchData}
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                    <SummaryCard title="Total Stock Units" value={totalStock} />
                    <SummaryCard title="Products Tracked" value={totalProducts} />
                    <SummaryCard title="Low Stock Items" value={lowStockCount} />
                    <SummaryCard title="Out of Stock" value={outOfStockCount} />
                </div>

                <div className="rounded-3xl bg-white p-5 shadow">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Inventory Records
                            </h2>
                            <p className="text-sm text-[#6f85a3]">
                                Search and filter stock by product, branch, and stock status.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 md:flex-row">
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search product, code, branch..."
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm outline-none focus:border-[#1e4db7]"
                            />

                            <select
                                value={branchFilter}
                                onChange={(e) => setBranchFilter(e.target.value)}
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm outline-none focus:border-[#1e4db7]"
                            >
                                {branches.map((branch) => (
                                    <option key={branch} value={branch}>
                                        {branch === "ALL" ? "All Branches" : branch}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={stockFilter}
                                onChange={(e) => setStockFilter(e.target.value)}
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm outline-none focus:border-[#1e4db7]"
                            >
                                <option value="ALL">All Stock Status</option>
                                <option value="NORMAL">Normal</option>
                                <option value="LOW_STOCK">Low Stock</option>
                                <option value="OUT_OF_STOCK">Out of Stock</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-sm">
                            <thead>
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="py-3">Product Code</th>
                                    <th>Product Name</th>
                                    <th>Branch</th>
                                    <th className="text-right">Stock Qty</th>
                                    <th>Status</th>
                                    <th>Last Updated</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            Loading inventory data...
                                        </td>
                                    </tr>
                                ) : filteredInventory.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            No inventory records found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredInventory.map((item) => (
                                        <tr
                                            key={`${item.product_id}-${item.branch_id}`}
                                            className="border-b last:border-none"
                                        >
                                            <td className="py-4 font-bold text-[#1e4db7]">
                                                {item.product_code}
                                            </td>
                                            <td className="font-semibold text-[#17325c]">
                                                {item.product_name}
                                            </td>
                                            <td>{item.branch_name}</td>
                                            <td className="text-right font-extrabold">
                                                {item.quantity_in_stock}
                                            </td>
                                            <td>
                                                <StatusBadge status={item.stock_status} />
                                            </td>
                                            <td>
                                                {item.last_updated
                                                    ? new Date(item.last_updated).toLocaleString()
                                                    : "-"}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <InfoPanel title="Branch Stock Summary">
                        {branchSummary.length === 0 ? (
                            <EmptyText />
                        ) : (
                            branchSummary.map((branch) => (
                                <div
                                    key={branch.branch}
                                    className="mb-4 rounded-2xl bg-[#eef6fb] p-4"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-extrabold text-[#17325c]">
                                                {branch.branch}
                                            </p>
                                            <p className="text-xs text-[#6f85a3]">
                                                Low Stock: {branch.lowStock} | Out of Stock:{" "}
                                                {branch.outOfStock}
                                            </p>
                                        </div>

                                        <p className="font-extrabold text-[#1e4db7]">
                                            {branch.totalStock} units
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </InfoPanel>

                    <InfoPanel title="Lowest Stock Items">
                        {lowestStockItems.length === 0 ? (
                            <EmptyText />
                        ) : (
                            lowestStockItems.map((item) => (
                                <div
                                    key={`${item.product_id}-${item.branch_id}`}
                                    className="mb-4 rounded-2xl bg-[#eef6fb] p-4"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-extrabold text-[#17325c]">
                                                {item.product_name}
                                            </p>
                                            <p className="text-xs text-[#6f85a3]">
                                                {item.branch_name} • {item.product_code}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="font-extrabold text-[#1e4db7]">
                                                {item.quantity_in_stock} units
                                            </p>
                                            <StatusBadge status={item.stock_status} />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </InfoPanel>
                </div>
            </div>
        </DashboardLayout>
    );
}

function SummaryCard({ title, value }) {
    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <p className="text-sm font-bold text-[#6f85a3]">{title}</p>
            <h3 className="mt-3 text-2xl font-extrabold text-[#07102f]">
                {value}
            </h3>
        </div>
    );
}

function InfoPanel({ title, children }) {
    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <h2 className="mb-5 text-lg font-extrabold text-[#07102f]">
                {title}
            </h2>
            {children}
        </div>
    );
}

function StatusBadge({ status }) {
    const styles = {
        NORMAL: "bg-green-50 text-green-700",
        LOW_STOCK: "bg-yellow-50 text-yellow-700",
        OUT_OF_STOCK: "bg-red-50 text-red-700",
    };

    const labels = {
        NORMAL: "Normal",
        LOW_STOCK: "Low Stock",
        OUT_OF_STOCK: "Out of Stock",
    };

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${styles[status] || "bg-gray-50 text-gray-600"
                }`}
        >
            {labels[status] || status}
        </span>
    );
}

function EmptyText() {
    return (
        <p className="rounded-2xl bg-[#eef6fb] p-4 text-sm font-semibold text-[#6f85a3]">
            No data available.
        </p>
    );
}
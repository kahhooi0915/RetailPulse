import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";

const API = "http://localhost:5000";

export default function SalesMonitoring() {
    const user = JSON.parse(localStorage.getItem("user")) || {};
    const [sales, setSales] = useState([]);
    const [details, setDetails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [branchFilter, setBranchFilter] = useState("ALL");

    const fetchData = async () => {
        try {
            setLoading(true);

            const [salesRes, detailsRes] = await Promise.all([
                fetch(`${API}/admin/sales`),
                fetch(`${API}/admin/sale-details`),
            ]);

            const salesData = await salesRes.json();
            const detailsData = await detailsRes.json();

            setSales(Array.isArray(salesData) ? salesData : []);
            setDetails(Array.isArray(detailsData) ? detailsData : []);
        } catch (err) {
            console.error("Sales monitoring error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const branches = useMemo(() => {
        return ["ALL", ...new Set(sales.map((s) => s.branch_name).filter(Boolean))];
    }, [sales]);

    const filteredSales = useMemo(() => {
        return sales.filter((sale) => {
            const matchBranch =
                branchFilter === "ALL" || sale.branch_name === branchFilter;

            const keyword = search.toLowerCase();
            const matchSearch =
                sale.sale_code?.toLowerCase().includes(keyword) ||
                sale.user_name?.toLowerCase().includes(keyword) ||
                sale.branch_name?.toLowerCase().includes(keyword) ||
                sale.payment_method?.toLowerCase().includes(keyword);

            return matchBranch && matchSearch;
        });
    }, [sales, search, branchFilter]);

    const totalRevenue = filteredSales.reduce(
        (sum, sale) => sum + Number(sale.total_amount || 0),
        0
    );

    const totalTransactions = filteredSales.length;

    const avgTransaction =
        totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const todaySales = filteredSales.filter((sale) => {
        const saleDate = new Date(sale.sale_date).toDateString();
        const today = new Date().toDateString();
        return saleDate === today;
    });

    const todayRevenue = todaySales.reduce(
        (sum, sale) => sum + Number(sale.total_amount || 0),
        0
    );

    const branchSummary = useMemo(() => {
        const map = {};

        filteredSales.forEach((sale) => {
            const branch = sale.branch_name || "Unknown Branch";

            if (!map[branch]) {
                map[branch] = {
                    branch,
                    transactions: 0,
                    revenue: 0,
                };
            }

            map[branch].transactions += 1;
            map[branch].revenue += Number(sale.total_amount || 0);
        });

        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }, [filteredSales]);

    const paymentSummary = useMemo(() => {
        const map = {};

        filteredSales.forEach((sale) => {
            const method = sale.payment_method || "Unknown";

            if (!map[method]) {
                map[method] = {
                    method,
                    count: 0,
                    revenue: 0,
                };
            }

            map[method].count += 1;
            map[method].revenue += Number(sale.total_amount || 0);
        });

        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }, [filteredSales]);

    const topProducts = useMemo(() => {
        const map = {};

        details.forEach((item) => {
            const name = item.product_name || "Unknown Product";

            if (!map[name]) {
                map[name] = {
                    product_name: name,
                    quantity: 0,
                    revenue: 0,
                };
            }

            map[name].quantity += Number(item.quantity || 0);
            map[name].revenue += Number(item.subtotal || 0);
        });

        return Object.values(map)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);
    }, [details]);

    return (
        <DashboardLayout
            user={user}
            title="Sales Monitoring"
            subtitle="Monitor sales performance, transactions, branches, and top-selling products."
            onRefresh={fetchData}
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                    <SummaryCard title="Total Revenue" value={`RM ${totalRevenue.toFixed(2)}`} />
                    <SummaryCard title="Transactions" value={totalTransactions} />
                    <SummaryCard title="Average Sale" value={`RM ${avgTransaction.toFixed(2)}`} />
                    <SummaryCard title="Today Revenue" value={`RM ${todayRevenue.toFixed(2)}`} />
                </div>

                <div className="rounded-3xl bg-white p-5 shadow">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Sales Records
                            </h2>
                            <p className="text-sm text-[#6f85a3]">
                                Search and filter sales transactions.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 md:flex-row">
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search sale code, staff, branch..."
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
                        </div>
                    </div>

                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[850px] text-left text-sm">
                            <thead>
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="py-3">Sale Code</th>
                                    <th>Branch</th>
                                    <th>Staff</th>
                                    <th>Date</th>
                                    <th>Payment</th>
                                    <th className="text-right">Amount</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            Loading sales data...
                                        </td>
                                    </tr>
                                ) : filteredSales.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            No sales records found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSales.map((sale) => (
                                        <tr key={sale.sale_id} className="border-b last:border-none">
                                            <td className="py-4 font-bold text-[#1e4db7]">
                                                {sale.sale_code}
                                            </td>
                                            <td>{sale.branch_name}</td>
                                            <td>{sale.user_name}</td>
                                            <td>
                                                {sale.sale_date
                                                    ? new Date(sale.sale_date).toLocaleString()
                                                    : "-"}
                                            </td>
                                            <td>
                                                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#1e4db7]">
                                                    {sale.payment_method}
                                                </span>
                                            </td>
                                            <td className="text-right font-extrabold">
                                                RM {Number(sale.total_amount || 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <InfoPanel title="Branch Sales Performance">
                        {branchSummary.length === 0 ? (
                            <EmptyText />
                        ) : (
                            branchSummary.map((branch) => (
                                <ProgressRow
                                    key={branch.branch}
                                    label={branch.branch}
                                    value={`RM ${branch.revenue.toFixed(2)}`}
                                    percent={
                                        totalRevenue > 0
                                            ? (branch.revenue / totalRevenue) * 100
                                            : 0
                                    }
                                />
                            ))
                        )}
                    </InfoPanel>

                    <InfoPanel title="Payment Method Summary">
                        {paymentSummary.length === 0 ? (
                            <EmptyText />
                        ) : (
                            paymentSummary.map((item) => (
                                <ProgressRow
                                    key={item.method}
                                    label={item.method}
                                    value={`RM ${item.revenue.toFixed(2)}`}
                                    percent={
                                        totalRevenue > 0
                                            ? (item.revenue / totalRevenue) * 100
                                            : 0
                                    }
                                />
                            ))
                        )}
                    </InfoPanel>

                    <InfoPanel title="Top Selling Products">
                        {topProducts.length === 0 ? (
                            <EmptyText />
                        ) : (
                            topProducts.map((product) => (
                                <div
                                    key={product.product_name}
                                    className="mb-4 rounded-2xl bg-[#eef6fb] p-4"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-extrabold text-[#17325c]">
                                                {product.product_name}
                                            </p>
                                            <p className="text-xs text-[#6f85a3]">
                                                Sold Quantity: {product.quantity}
                                            </p>
                                        </div>

                                        <p className="font-extrabold text-[#1e4db7]">
                                            RM {product.revenue.toFixed(2)}
                                        </p>
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

function ProgressRow({ label, value, percent }) {
    return (
        <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-bold text-[#17325c]">{label}</p>
                <p className="text-sm font-extrabold text-[#1e4db7]">{value}</p>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-[#e4eef7]">
                <div
                    className="h-full rounded-full bg-[#1e4db7]"
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>
        </div>
    );
}

function EmptyText() {
    return (
        <p className="rounded-2xl bg-[#eef6fb] p-4 text-sm font-semibold text-[#6f85a3]">
            No data available.
        </p>
    );
}
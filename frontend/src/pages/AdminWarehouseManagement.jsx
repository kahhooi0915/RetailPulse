/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    Boxes,
    CheckCircle,
    Eye,
    PackageSearch,
    RefreshCcw,
    Search,
    ShoppingCart,
    Warehouse,
    X,
    XCircle,
} from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";

const API = "http://localhost:5000";
const ROWS_PER_PAGE = 8;

export default function AdminWarehouseManagement() {
    const navigate = useNavigate();
    const user = JSON.parse(sessionStorage.getItem("user")) || {};

    const [summary, setSummary] = useState({
        total_warehouse_stock_units: 0,
        warehouse_low_stock_products: 0,
        warehouse_out_of_stock_products: 0,
        pending_branch_requests: 0,
        purchase_needed_items: 0,
    });
    const [stock, setStock] = useState([]);
    const [branches, setBranches] = useState([]);
    const [warehouseApprovals, setWarehouseApprovals] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [warehouseFilter, setWarehouseFilter] = useState("ALL");
    const [stockFilter, setStockFilter] = useState("ALL");
    const [transferSort, setTransferSort] = useState("UPDATED_DESC");
    const [stockPage, setStockPage] = useState(1);
    const [approvalPage, setApprovalPage] = useState(1);
    const [transferPage, setTransferPage] = useState(1);

    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [rejectTransfer, setRejectTransfer] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [processingTransfer, setProcessingTransfer] = useState(null);
    const [distributionItem, setDistributionItem] = useState(null);
    const [distributionForm, setDistributionForm] = useState({
        mode: "SINGLE",
        to_branch_id: "",
        quantity: "",
    });
    const [distributionError, setDistributionError] = useState("");
    const [distributing, setDistributing] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 2600);
    };

    const fetchJson = async (path, options) => {
        const res = await fetch(`${API}${path}`, {
            headers: { "Content-Type": "application/json" },
            ...options,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const error = new Error(data.message || "Request failed");
            error.data = data;
            throw error;
        }

        return data;
    };

    const fetchData = async () => {
        try {
            setLoading(true);

            const [summaryData, stockData, branchData, approvalData, transferData] = await Promise.all([
                fetchJson("/admin/warehouse/summary"),
                fetchJson("/admin/warehouse/stock"),
                fetchJson("/admin/branches"),
                fetchJson("/admin/warehouse/transfer-approvals"),
                fetchJson("/admin/warehouse/transfers"),
            ]);

            setSummary(summaryData || {});
            setStock(Array.isArray(stockData) ? stockData : []);
            setBranches(Array.isArray(branchData) ? branchData : []);
            setWarehouseApprovals(Array.isArray(approvalData) ? approvalData : []);
            setTransfers(Array.isArray(transferData) ? transferData : []);
        } catch (err) {
            console.error("Warehouse management error:", err);
            showToast(err.message || "Failed to load warehouse data.", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setStockPage(1);
        setApprovalPage(1);
        setTransferPage(1);
    }, [search, warehouseFilter, stockFilter, transferSort]);

    const warehouseOptions = useMemo(() => {
        const names = stock.map((item) => item.warehouse_name).filter(Boolean);
        return ["ALL", ...new Set(names)];
    }, [stock]);

    const filteredStock = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        return stock.filter((item) => {
            const matchesSearch =
                !keyword ||
                item.product_code?.toLowerCase().includes(keyword) ||
                item.product_name?.toLowerCase().includes(keyword) ||
                item.category_name?.toLowerCase().includes(keyword) ||
                item.warehouse_name?.toLowerCase().includes(keyword);
            const matchesWarehouse =
                warehouseFilter === "ALL" || item.warehouse_name === warehouseFilter;
            const matchesStock = stockFilter === "ALL" || item.status === stockFilter;

            return matchesSearch && matchesWarehouse && matchesStock;
        });
    }, [stock, search, warehouseFilter, stockFilter]);

    const filteredTransfers = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        const filtered = transfers.filter((item) => {
            if (!keyword) return true;

            return (
                item.transfer_code?.toLowerCase().includes(keyword) ||
                item.source_warehouse?.toLowerCase().includes(keyword) ||
                item.destination_branch?.toLowerCase().includes(keyword) ||
                item.requested_by?.toLowerCase().includes(keyword) ||
                item.status?.toLowerCase().includes(keyword)
            );
        });

        return sortTransfers(filtered, transferSort);
    }, [transfers, search, transferSort]);

    const filteredWarehouseApprovals = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        return warehouseApprovals.filter((item) => {
            if (!keyword) return true;

            return (
                item.transfer_code?.toLowerCase().includes(keyword) ||
                item.source_warehouse?.toLowerCase().includes(keyword) ||
                item.destination_branch?.toLowerCase().includes(keyword) ||
                item.requested_by?.toLowerCase().includes(keyword) ||
                item.status?.toLowerCase().includes(keyword)
            );
        });
    }, [warehouseApprovals, search]);

    const paginatedStock = paginate(filteredStock, stockPage);
    const pendingApprovals = useMemo(() => {
        return filteredWarehouseApprovals.filter((item) => item.status === "PENDING_SOURCE");
    }, [filteredWarehouseApprovals]);
    const paginatedApprovals = paginate(pendingApprovals, approvalPage);
    const paginatedTransfers = paginate(filteredTransfers, transferPage);

    const openTransferDetails = async (transfer) => {
        try {
            setDetailLoading(true);
            const data = await fetchJson(`/admin/warehouse/transfers/${transfer.transfer_id}`);
            setSelectedTransfer(data);
        } catch (err) {
            showToast(err.message || "Failed to load transfer details.", "error");
        } finally {
            setDetailLoading(false);
        }
    };

    const goToPurchase = (item) => {
        if (item.status === "HEALTHY") return;

        navigate(`/admin/purchases?product_id=${item.product_id}&branch_id=${item.branch_id}`);
    };

    const branchOptions = useMemo(() => {
        return branches.filter((branch) => branch.branch_type === "BRANCH");
    }, [branches]);

    const openDistributionModal = (item) => {
        setDistributionItem(item);
        setDistributionError("");
        setDistributionForm({
            mode: "SINGLE",
            to_branch_id: "",
            quantity: "",
        });
    };

    const submitDistribution = async () => {
        if (!distributionItem) return;

        if (distributionForm.mode !== "ALL" && !distributionForm.to_branch_id) {
            setDistributionError("Select a destination branch before creating the distribution.");
            showToast("Select a destination branch.", "error");
            return;
        }

        const quantity = Number(distributionForm.quantity);
        if (!quantity || quantity <= 0) {
            setDistributionError("Enter a quantity greater than 0.");
            showToast("Quantity must be greater than 0.", "error");
            return;
        }

        const branchCount = distributionForm.mode === "ALL" ? branchOptions.length : 1;
        const totalQuantity = quantity * branchCount;

        if (branchCount <= 0) {
            setDistributionError("No branch is available for distribution.");
            showToast("No branch is available for distribution.", "error");
            return;
        }

        const availableStock = Number(distributionItem.quantity_in_stock || 0);
        if (totalQuantity > availableStock) {
            const stockMessage = `Not enough warehouse stock. Available: ${availableStock}, required: ${totalQuantity}.`;
            setDistributionError(stockMessage);
            showToast(stockMessage, "error");
            return;
        }

        try {
            setDistributionError("");
            setDistributing(true);
            const data = await fetchJson("/admin/warehouse/distribute", {
                method: "POST",
                body: JSON.stringify({
                    from_branch_id: distributionItem.branch_id,
                    to_branch_id: distributionForm.mode === "ALL" ? "ALL" : distributionForm.to_branch_id,
                    product_id: distributionItem.product_id,
                    quantity,
                    approved_by: user.user_id,
                }),
            });

            setDistributionItem(null);
            setDistributionForm({ mode: "SINGLE", to_branch_id: "", quantity: "" });
            showToast(data.message || "Warehouse stock distribution created.");
            fetchData();
        } catch (err) {
            const data = err.data || {};
            const stockMessage = data.available_stock !== undefined && data.requested_quantity !== undefined
                ? `${err.message}. Available: ${data.available_stock}, required: ${data.requested_quantity}.`
                : err.message || "Failed to distribute warehouse stock.";
            setDistributionError(stockMessage);
            showToast(stockMessage, "error");
        } finally {
            setDistributing(false);
        }
    };

    const approveWarehouseTransfer = async (transfer) => {
        try {
            setProcessingTransfer(`approve-${transfer.transfer_id}`);

            const res = await fetch(`${API}/admin/stock-transfer/${transfer.transfer_id}/approve`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    approved_by: user.user_id,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to approve transfer.", "error");
                return;
            }

            showToast("Warehouse transfer approved successfully.");
            fetchData();
        } catch (error) {
            console.error(error);
            showToast("Failed to approve transfer.", "error");
        } finally {
            setProcessingTransfer(null);
        }
    };

    const rejectWarehouseTransfer = async () => {
        if (!rejectReason.trim()) {
            showToast("Reject reason is required.", "error");
            return;
        }

        try {
            setProcessingTransfer(`reject-${rejectTransfer.transfer_id}`);

            const res = await fetch(`${API}/admin/stock-transfer/${rejectTransfer.transfer_id}/reject`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    approved_by: user.user_id,
                    reject_reason: rejectReason.trim(),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to reject transfer.", "error");
                return;
            }

            setRejectTransfer(null);
            setRejectReason("");
            showToast("Warehouse transfer rejected.");
            fetchData();
        } catch (error) {
            console.error(error);
            showToast("Failed to reject transfer.", "error");
        } finally {
            setProcessingTransfer(null);
        }
    };

    return (
        <DashboardLayout
            user={user}
            title="Warehouse Management"
            subtitle="Manage warehouse stock, branch stock requests, and purchase replenishment actions."
            onRefresh={fetchData}
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
                    <SummaryCard
                        title="Total Warehouse Stock"
                        value={summary.total_warehouse_stock_units || 0}
                        icon={<Boxes size={20} />}
                        tone="green"
                    />
                    <SummaryCard
                        title="Low Stock Items"
                        value={summary.warehouse_low_stock_products || 0}
                        icon={<Warehouse size={20} />}
                        tone="orange"
                    />
                    <SummaryCard
                        title="Out of Stock Items"
                        value={summary.warehouse_out_of_stock_products || 0}
                        icon={<AlertTriangle size={20} />}
                        tone="red"
                    />
                    <SummaryCard
                        title="Pending Branch Requests"
                        value={summary.pending_branch_requests || 0}
                        icon={<RefreshCcw size={20} />}
                        tone="blue"
                    />
                    <SummaryCard
                        title="Purchase Needed"
                        value={summary.purchase_needed_items || 0}
                        icon={<ShoppingCart size={20} />}
                        tone="purple"
                    />
                </div>

                <FilterBar
                    search={search}
                    setSearch={setSearch}
                    warehouseFilter={warehouseFilter}
                    setWarehouseFilter={setWarehouseFilter}
                    stockFilter={stockFilter}
                    setStockFilter={setStockFilter}
                    warehouseOptions={warehouseOptions}
                />

                <SectionCard
                    icon={<Warehouse size={21} />}
                    title="Warehouse Stock Overview"
                    desc="All product inventory records stored in warehouse branches."
                    badge={`${filteredStock.length} records`}
                    badgeTone="blue"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="border-b py-3 pr-5 text-xs font-extrabold uppercase">Product Code</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Product Name</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Category</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Warehouse Name</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Supplier Contact</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">Quantity In Stock</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">Reorder Level</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Status</th>
                                    <th className="border-b pl-5 text-right text-xs font-extrabold uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <EmptyRow colSpan={8} text="Loading warehouse stock..." />
                                ) : paginatedStock.length === 0 ? (
                                    <EmptyRow colSpan={8} text="No warehouse stock records found." />
                                ) : (
                                    paginatedStock.map((item) => (
                                        <tr
                                            key={`${item.product_id}-${item.branch_id}`}
                                            className="border-b last:border-none hover:bg-[#f8fcff]"
                                        >
                                            <td className="border-b border-blue-50 py-4 pr-5 text-xs font-extrabold uppercase tracking-wide text-[#6f85a3]">
                                                {item.product_code}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <p className="font-extrabold text-[#07102f]">{item.product_name}</p>
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-semibold text-[#6f85a3]">
                                                {item.category_name || "-"}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-extrabold text-purple-700">
                                                {item.warehouse_name}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <p className="font-extrabold text-[#07102f]">{item.preferred_supplier || "-"}</p>
                                                <p className="mt-1 text-xs font-semibold text-[#6f85a3]">
                                                    {item.supplier_contact_person || "No contact person"}
                                                </p>
                                                <p className="mt-1 break-all text-xs font-semibold text-[#6f85a3]">
                                                    {[item.supplier_phone, item.supplier_email].filter(Boolean).join(" | ") || "No phone/email"}
                                                </p>
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-[#07102f]">
                                                {item.quantity_in_stock}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-[#17325c]">
                                                {item.reorder_level}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <StockStatusBadge status={item.status} />
                                            </td>
                                            <td className="border-b border-blue-50 pl-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => openDistributionModal(item)}
                                                        disabled={Number(item.quantity_in_stock || 0) <= 0}
                                                        className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-xs font-extrabold text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                                                    >
                                                        <RefreshCcw size={15} />
                                                        Distribute
                                                    </button>
                                                    <button
                                                        onClick={() => goToPurchase(item)}
                                                        disabled={item.status === "HEALTHY"}
                                                        className={`inline-flex min-w-[122px] items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold transition ${
                                                            item.status === "HEALTHY"
                                                                ? "cursor-not-allowed bg-gray-100 text-gray-400"
                                                                : "bg-[#0c2f73] text-white shadow-sm hover:bg-[#103986] hover:shadow"
                                                        }`}
                                                    >
                                                        <ShoppingCart size={15} />
                                                        {item.status === "HEALTHY" ? "Enough Stock" : "Add Purchase"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        total={filteredStock.length}
                        page={stockPage}
                        setPage={setStockPage}
                    />
                </SectionCard>

                <SectionCard
                    icon={<Warehouse size={21} />}
                    title="Warehouse Stock Transfer Approvals"
                    desc="Approve or reject branch requests that source stock from a warehouse."
                    badge={`${pendingApprovals.length} pending`}
                    badgeTone="blue"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="border-b py-3 pr-5 text-xs font-extrabold uppercase">Transfer</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Source Warehouse</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Destination Branch</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">Items</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Status</th>
                                    <th className="border-b pl-5 text-right text-xs font-extrabold uppercase">Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <EmptyRow colSpan={6} text="Loading warehouse transfer approvals..." />
                                ) : paginatedApprovals.length === 0 ? (
                                    <EmptyRow colSpan={6} text="No pending warehouse transfer requests." />
                                ) : (
                                    paginatedApprovals.map((transfer) => (
                                        <tr
                                            key={`approval-${transfer.transfer_id}`}
                                            className="border-b last:border-none hover:bg-[#f8fcff]"
                                        >
                                            <td className="border-b border-blue-50 py-4 pr-5">
                                                <p className="font-extrabold text-[#07102f]">
                                                    {transfer.transfer_code}
                                                </p>
                                                <p className="text-xs font-semibold text-[#6f85a3]">
                                                    {formatDateTime(transfer.transfer_date)}
                                                </p>
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-extrabold text-purple-700">
                                                {transfer.source_warehouse}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-bold text-[#17325c]">
                                                {transfer.destination_branch}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-[#07102f]">
                                                {transfer.items_count}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <TransferStatusBadge status={transfer.status} />
                                            </td>
                                            <td className="border-b border-blue-50 pl-5 text-right">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button
                                                        onClick={() => openTransferDetails(transfer)}
                                                        disabled={detailLoading}
                                                        className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7] transition hover:bg-blue-100 disabled:cursor-wait disabled:text-gray-400"
                                                        title="View details"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setRejectTransfer(transfer)}
                                                        disabled={processingTransfer === `reject-${transfer.transfer_id}`}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:bg-gray-100"
                                                    >
                                                        <XCircle size={15} />
                                                        Reject
                                                    </button>
                                                    <button
                                                        onClick={() => approveWarehouseTransfer(transfer)}
                                                        disabled={processingTransfer === `approve-${transfer.transfer_id}`}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-[#0c2f73] px-3 py-2 text-xs font-extrabold text-white transition hover:bg-[#103986] disabled:cursor-wait disabled:bg-gray-300"
                                                    >
                                                        <CheckCircle size={15} />
                                                        Approve
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        total={pendingApprovals.length}
                        page={approvalPage}
                        setPage={setApprovalPage}
                    />
                </SectionCard>

                <SectionCard
                    icon={<RefreshCcw size={21} />}
                    title="Warehouse Branch Transfer Requests"
                    desc="Review warehouse-to-branch transfer requests and check their approval status."
                    badge={`${filteredTransfers.length} requests`}
                    badgeTone="purple"
                >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#6f85a3]">
                            Showing recently updated requests first by default.
                        </p>

                        <label className="flex items-center gap-2 text-sm font-extrabold text-[#17325c]">
                            Sort
                            <select
                                value={transferSort}
                                onChange={(event) => setTransferSort(event.target.value)}
                                className="h-10 rounded-2xl border border-blue-100 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#1e4db7]"
                            >
                                <option value="UPDATED_DESC">Recently updated</option>
                                <option value="UPDATED_ASC">Oldest updated</option>
                                <option value="TRANSFER_DESC">Newest transfer date</option>
                                <option value="TRANSFER_ASC">Oldest transfer date</option>
                                <option value="STATUS">Status</option>
                            </select>
                        </label>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="border-b py-3 pr-5 text-xs font-extrabold uppercase">Transfer Code</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Source Warehouse</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Destination Branch</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Requested By</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Transfer Date</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Last Update</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">Items</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Status</th>
                                    <th className="border-b pl-5 text-right text-xs font-extrabold uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <EmptyRow colSpan={9} text="Loading branch requests..." />
                                ) : paginatedTransfers.length === 0 ? (
                                    <EmptyRow colSpan={9} text="No warehouse branch transfer requests found." />
                                ) : (
                                    paginatedTransfers.map((transfer) => (
                                        <tr
                                            key={transfer.transfer_id}
                                            className="border-b last:border-none hover:bg-[#f8fcff]"
                                        >
                                            <td className="border-b border-blue-50 py-4 pr-5 font-extrabold text-[#07102f]">
                                                {transfer.transfer_code}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-extrabold text-purple-700">
                                                {transfer.source_warehouse}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-bold text-[#17325c]">
                                                {transfer.destination_branch}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-semibold text-[#6f85a3]">
                                                {transfer.requested_by || "-"}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-semibold text-[#6f85a3]">
                                                {formatDateTime(transfer.transfer_date)}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-semibold text-[#6f85a3]">
                                                {formatDateTime(getTransferUpdatedAt(transfer))}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-[#07102f]">
                                                {transfer.items_count}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <TransferStatusBadge status={transfer.status} />
                                            </td>
                                            <td className="border-b border-blue-50 pl-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => openTransferDetails(transfer)}
                                                        disabled={detailLoading}
                                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#eef6fb] px-3 py-2.5 text-xs font-extrabold text-[#1e4db7] transition hover:bg-blue-100 disabled:cursor-wait disabled:text-gray-400"
                                                        title="View details"
                                                    >
                                                        <Eye size={16} />
                                                        View Details
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        total={filteredTransfers.length}
                        page={transferPage}
                        setPage={setTransferPage}
                    />
                </SectionCard>

            </div>

            {selectedTransfer && (
                <TransferDetailsModal
                    transfer={selectedTransfer}
                    onClose={() => setSelectedTransfer(null)}
                />
            )}

            {rejectTransfer && (
                <RejectTransferModal
                    transfer={rejectTransfer}
                    reason={rejectReason}
                    setReason={setRejectReason}
                    onClose={() => {
                        setRejectTransfer(null);
                        setRejectReason("");
                    }}
                    onReject={rejectWarehouseTransfer}
                    loading={processingTransfer === `reject-${rejectTransfer.transfer_id}`}
                />
            )}

            {distributionItem && (
                <DistributionModal
                    item={distributionItem}
                    branches={branchOptions}
                    form={distributionForm}
                    setForm={setDistributionForm}
                    error={distributionError}
                    setError={setDistributionError}
                    onClose={() => {
                        setDistributionItem(null);
                        setDistributionError("");
                    }}
                    onSubmit={submitDistribution}
                    loading={distributing}
                />
            )}

            {toast && (
                <div
                    className={`fixed bottom-6 right-6 z-[60] rounded-2xl px-5 py-4 text-sm font-extrabold shadow-xl ${
                        toast.type === "error"
                            ? "bg-red-500 text-white"
                            : "bg-green-600 text-white"
                    }`}
                >
                    {toast.message}
                </div>
            )}
        </DashboardLayout>
    );
}

function SummaryCard({ title, value, icon, tone }) {
    const tones = {
        blue: "bg-blue-50 text-[#1e4db7]",
        red: "bg-red-50 text-red-700",
        purple: "bg-purple-50 text-purple-700",
        orange: "bg-orange-50 text-orange-700",
        green: "bg-green-50 text-green-700",
    };

    return (
        <div className="flex min-h-[138px] flex-col justify-between rounded-3xl bg-white p-5 shadow">
            <div className="flex items-start justify-between gap-3">
                <p className="max-w-[150px] text-sm font-extrabold leading-snug text-[#6f85a3]">{title}</p>
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}>
                    {icon}
                </div>
            </div>
            <h3 className="mt-5 text-4xl font-black leading-none text-[#07102f]">{value}</h3>
        </div>
    );
}

function FilterBar({
    search,
    setSearch,
    warehouseFilter,
    setWarehouseFilter,
    stockFilter,
    setStockFilter,
    warehouseOptions,
}) {
    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                    <h2 className="text-lg font-extrabold text-[#07102f]">
                        Warehouse Filters
                    </h2>
                    <p className="text-sm text-[#6f85a3]">
                        Search warehouse stock and warehouse transfer records.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-3 md:flex-row xl:w-auto xl:items-center">
                    <div className="relative md:min-w-[280px]">
                        <Search
                            size={16}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6f85a3]"
                        />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search product, code, warehouse..."
                            className="h-11 w-full rounded-2xl border border-blue-100 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-[#1e4db7]"
                        />
                    </div>

                    <select
                        value={warehouseFilter}
                        onChange={(e) => setWarehouseFilter(e.target.value)}
                        className="h-11 rounded-2xl border border-blue-100 px-4 text-sm outline-none transition focus:border-[#1e4db7]"
                    >
                        {warehouseOptions.map((warehouse) => (
                            <option key={warehouse} value={warehouse}>
                                {warehouse === "ALL" ? "All Warehouses" : warehouse}
                            </option>
                        ))}
                    </select>

                    <select
                        value={stockFilter}
                        onChange={(e) => setStockFilter(e.target.value)}
                        className="h-11 rounded-2xl border border-blue-100 px-4 text-sm outline-none transition focus:border-[#1e4db7]"
                    >
                        <option value="ALL">All Stock Status</option>
                        <option value="HEALTHY">Healthy</option>
                        <option value="LOW_STOCK">Low Stock</option>
                        <option value="OUT_OF_STOCK">Out of Stock</option>
                    </select>
                </div>
            </div>
        </div>
    );
}

function SectionCard({ icon, title, desc, badge, badgeTone, children }) {
    const badgeStyles = {
        blue: "bg-blue-50 text-[#1e4db7]",
        red: "bg-red-50 text-red-700",
        purple: "bg-purple-50 text-purple-700",
        orange: "bg-orange-50 text-orange-700",
        green: "bg-green-50 text-green-700",
    };

    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#07102f]">
                        {icon}
                        {title}
                    </h2>
                    <p className="mt-1 text-sm text-[#6f85a3]">{desc}</p>
                </div>

                <span
                    className={`w-fit rounded-full px-4 py-2 text-xs font-extrabold ${
                        badgeStyles[badgeTone] || "bg-gray-50 text-gray-600"
                    }`}
                >
                    {badge}
                </span>
            </div>

            {children}
        </div>
    );
}

function StockStatusBadge({ status }) {
    const styles = {
        HEALTHY: "bg-green-50 text-green-700",
        LOW_STOCK: "bg-yellow-50 text-yellow-700",
        OUT_OF_STOCK: "bg-red-50 text-red-700",
    };
    const labels = {
        HEALTHY: "Healthy",
        LOW_STOCK: "Low Stock",
        OUT_OF_STOCK: "Out of Stock",
    };

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                styles[status] || "bg-gray-50 text-gray-600"
            }`}
        >
            {labels[status] || status}
        </span>
    );
}

function TransferStatusBadge({ status }) {
    const styles = {
        PENDING: "bg-orange-50 text-orange-700",
        PENDING_SOURCE: "bg-purple-50 text-purple-700",
        APPROVED: "bg-blue-50 text-[#1e4db7]",
        REJECTED: "bg-red-50 text-red-700",
        RECEIVED: "bg-green-50 text-green-700",
    };
    const labels = {
        PENDING_SOURCE: "SOURCE REVIEW",
    };

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                styles[status] || "bg-gray-50 text-gray-600"
            }`}
        >
            {labels[status] || status || "-"}
        </span>
    );
}

function TransferDetailsModal({ transfer, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="custom-scrollbar max-h-[92vh] w-full max-w-[1000px] overflow-y-auto rounded-3xl bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 rounded-t-3xl bg-[#e9f7ff] px-7 py-6">
                    <div className="flex items-center gap-4">
                        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#001f55] text-white">
                            <PackageSearch size={25} />
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Transfer Details
                            </h2>
                            <p className="text-sm font-bold text-[#17325c]">
                                {transfer.transfer_code}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="grid h-10 w-10 place-items-center rounded-xl text-[#6f85a3] hover:bg-white"
                    >
                        <X size={22} />
                    </button>
                </div>

                <div className="space-y-6 p-7">
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1.1fr_0.8fr]">
                        <InfoGroup title="Transfer Info">
                            <InfoItem label="Transfer Code" value={transfer.transfer_code} />
                            <InfoItem label="Source Warehouse" value={transfer.source_warehouse} />
                            <InfoItem label="Destination Branch" value={transfer.destination_branch} />
                        </InfoGroup>

                        <InfoGroup title="People">
                            <InfoItem label="Requested By" value={transfer.requested_by || "-"} />
                            <InfoItem label="Approved By" value={transfer.approved_by || "-"} />
                            <InfoItem label="Received By" value={transfer.received_by || "-"} />
                        </InfoGroup>

                        <InfoGroup title="Status">
                            <InfoItem label="Current Status" value={<TransferStatusBadge status={transfer.status} />} />
                            <InfoItem label="Reject Reason" value={transfer.reject_reason || "-"} />
                        </InfoGroup>
                    </div>

                    <div className="rounded-2xl bg-[#f8fcff] p-5">
                        <h3 className="mb-4 text-lg font-extrabold text-[#07102f]">
                            Product Details
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-left text-sm">
                                <thead className="bg-[#f8fcff] text-[#6f85a3]">
                                    <tr>
                                        <th className="border-b py-3 pr-4 text-xs font-extrabold uppercase">Product Code</th>
                                        <th className="border-b px-4 text-xs font-extrabold uppercase">Product Name</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Requested Quantity</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Current Warehouse Stock</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Source Before</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Source After</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Destination Before</th>
                                        <th className="border-b pl-4 text-right text-xs font-extrabold uppercase">Destination After</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transfer.details?.length ? (
                                        transfer.details.map((item) => (
                                            <tr
                                                key={item.transfer_detail_id}
                                                className="bg-white hover:bg-[#f8fcff]"
                                            >
                                                <td className="border-b border-blue-50 py-4 pr-4 text-xs font-extrabold uppercase text-[#6f85a3]">
                                                    {item.product_code}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 font-extrabold text-[#07102f]">
                                                    {item.product_name}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-extrabold">
                                                    {item.quantity}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right">
                                                    <WarehouseStockReminder item={item} />
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-bold">
                                                    {formatStock(item.source_stock_before)}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-bold">
                                                    {formatStock(item.source_stock_after)}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-bold">
                                                    {formatStock(item.destination_stock_before)}
                                                </td>
                                                <td className="border-b border-blue-50 pl-4 text-right font-bold">
                                                    {formatStock(item.destination_stock_after)}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <EmptyRow colSpan={8} text="No transfer detail items found." />
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="rounded-2xl bg-[#0c2f73] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#103986]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoGroup({ title, children }) {
    return (
        <div className="rounded-2xl border border-blue-50 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-extrabold uppercase text-[#6f85a3]">
                {title}
            </h3>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

function InfoItem({ label, value }) {
    return (
        <div className="rounded-2xl bg-[#f8fcff] p-4">
            <p className="text-xs font-extrabold uppercase text-[#6f85a3]">{label}</p>
            <div className="mt-2 text-sm font-extrabold text-[#07102f]">{value}</div>
        </div>
    );
}

function WarehouseStockReminder({ item }) {
    const currentStock = Number(item.current_source_stock || 0);
    const requestedQuantity = Number(item.quantity || 0);
    const hasEnoughStock = currentStock >= requestedQuantity;

    return (
        <div className="inline-flex flex-col items-end gap-1">
            <span className="font-extrabold text-[#07102f]">
                {formatStock(currentStock)}
            </span>
            <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                    hasEnoughStock
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                }`}
            >
                {hasEnoughStock ? "Enough stock" : "Not enough stock"}
            </span>
        </div>
    );
}

function DistributionModal({ item, branches, form, setForm, error, setError, onClose, onSubmit, loading }) {
    const isAllBranches = form.mode === "ALL";
    const selectedBranch = branches.find(
        (branch) => Number(branch.branch_id) === Number(form.to_branch_id)
    );
    const requestedQuantity = Number(form.quantity || 0);
    const warehouseStock = Number(item.quantity_in_stock || 0);
    const branchCount = isAllBranches ? branches.length : 1;
    const maxQuantityPerBranch = isAllBranches && branches.length
        ? Math.floor(warehouseStock / branches.length)
        : warehouseStock;
    const totalQuantity = requestedQuantity * branchCount;
    const remainingStock = Math.max(warehouseStock - totalQuantity, 0);
    const hasQuantity = requestedQuantity > 0;
    const hasInsufficientStock = hasQuantity && totalQuantity > warehouseStock;
    const hasNoStock = warehouseStock <= 0;
    const stockError = hasNoStock
        ? "This warehouse has no stock available for this product."
        : hasInsufficientStock
            ? `Not enough warehouse stock. Available: ${warehouseStock}, required: ${totalQuantity}.`
            : "";
    const displayError = stockError || error;
    const disableSubmit = loading || hasNoStock || hasInsufficientStock;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[560px] rounded-3xl bg-white p-7 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#07102f]">
                            Distribute Warehouse Stock
                        </h2>
                        <p className="mt-1 text-sm text-[#6f85a3]">
                            Create an approved transfer for branch manager receiving.
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fb] text-[#254e7a] hover:bg-blue-100"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-5 rounded-2xl bg-[#f8fcff] p-4">
                    <p className="text-xs font-extrabold uppercase text-[#6f85a3]">Product</p>
                    <p className="mt-1 font-extrabold text-[#07102f]">{item.product_name}</p>
                    <p className="mt-1 text-xs font-bold text-[#6f85a3]">{item.product_code}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <InfoItem label="Source Warehouse" value={item.warehouse_name} />
                        <InfoItem label="Available Stock" value={warehouseStock} />
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            Distribution Mode
                        </span>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setError("");
                                    setForm((current) => ({
                                        ...current,
                                        mode: "SINGLE",
                                        to_branch_id: "",
                                    }));
                                }}
                                onFocus={() => setError("")}
                                disabled={hasNoStock}
                                className={`rounded-2xl border px-4 py-3 text-sm font-extrabold ${
                                    !isAllBranches
                                        ? "border-[#1e4db7] bg-blue-50 text-[#0c2f73]"
                                        : "border-blue-100 text-[#6f85a3] hover:bg-[#f8fcff]"
                                } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400`}
                            >
                                Single Branch
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setError("");
                                    setForm((current) => ({
                                        ...current,
                                        mode: "ALL",
                                        to_branch_id: "",
                                    }));
                                }}
                                onFocus={() => setError("")}
                                disabled={hasNoStock}
                                className={`rounded-2xl border px-4 py-3 text-sm font-extrabold ${
                                    isAllBranches
                                        ? "border-[#1e4db7] bg-blue-50 text-[#0c2f73]"
                                        : "border-blue-100 text-[#6f85a3] hover:bg-[#f8fcff]"
                                } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400`}
                            >
                                All Branches
                            </button>
                        </div>
                    </div>

                    <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            Destination Branch
                        </span>
                        <select
                            value={form.to_branch_id}
                            disabled={isAllBranches}
                            onChange={(event) => {
                                setError("");
                                setForm((current) => ({
                                    ...current,
                                    to_branch_id: event.target.value,
                                }));
                            }}
                            onFocus={() => setError("")}
                            className="h-12 w-full rounded-2xl border border-blue-100 px-4 text-sm font-semibold text-[#17325c] outline-none focus:border-[#1e4db7] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                        >
                            <option value="">{isAllBranches ? `All ${branches.length} branches selected` : "Select branch"}</option>
                            {branches.map((branch) => (
                                <option key={branch.branch_id} value={branch.branch_id}>
                                    {branch.branch_code} - {branch.branch_name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            {isAllBranches ? "Quantity Per Branch" : "Quantity To Distribute"}
                        </span>
                        <input
                            type="number"
                            min="1"
                            max={maxQuantityPerBranch}
                            disabled={hasNoStock}
                            value={form.quantity}
                            onChange={(event) => {
                                setError("");
                                setForm((current) => ({
                                    ...current,
                                    quantity: event.target.value,
                                }));
                            }}
                            onFocus={() => setError("")}
                            placeholder="Enter quantity"
                            className={`h-12 w-full rounded-2xl border px-4 text-sm font-semibold text-[#17325c] outline-none focus:border-[#1e4db7] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${
                                displayError ? "border-red-200 bg-red-50/30" : "border-blue-100"
                            }`}
                        />
                        {displayError && (
                            <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                {displayError}
                            </div>
                        )}
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <InfoItem
                            label="Branch"
                            value={isAllBranches ? `${branches.length} branches` : selectedBranch?.branch_name || "-"}
                        />
                        <InfoItem label="Total Quantity Required" value={requestedQuantity ? totalQuantity : "-"} />
                        <InfoItem label="Quantity Per Branch" value={requestedQuantity ? requestedQuantity : "-"} />
                        <InfoItem label="Warehouse After Transfer" value={requestedQuantity ? remainingStock : "-"} />
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-2xl bg-[#eef6fb] py-4 font-extrabold text-[#17325c] hover:bg-blue-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={disableSubmit}
                        className="rounded-2xl bg-green-600 py-4 font-extrabold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        {loading ? "Distributing..." : "Create Distribution"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function RejectTransferModal({ transfer, reason, setReason, onClose, onReject, loading }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[520px] rounded-3xl bg-white p-7 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#07102f]">
                            Reject Warehouse Request
                        </h2>
                        <p className="mt-1 text-sm text-[#6f85a3]">
                            Transfer {transfer.transfer_code} requires a reject reason.
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fb] text-[#254e7a] hover:bg-blue-100"
                    >
                        <X size={18} />
                    </button>
                </div>

                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                    Reject Reason
                </label>
                <textarea
                    rows={4}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="w-full rounded-2xl border border-blue-100 p-4 text-sm font-semibold outline-none focus:border-[#1e4db7]"
                    placeholder="Explain why the warehouse request is rejected"
                />

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-2xl bg-[#eef6fb] py-4 font-extrabold text-[#17325c] hover:bg-blue-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onReject}
                        disabled={loading}
                        className="rounded-2xl bg-red-600 py-4 font-extrabold text-white hover:bg-red-700 disabled:cursor-wait disabled:bg-gray-300"
                    >
                        Reject Request
                    </button>
                </div>
            </div>
        </div>
    );
}

function Pagination({ total, page, setPage }) {
    const totalPages = Math.ceil(total / ROWS_PER_PAGE);

    if (totalPages <= 1) return null;

    return (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
                disabled={page === 1}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                className="rounded-xl border border-blue-100 px-3 py-2 text-xs font-extrabold text-[#1e4db7] hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
                Previous
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((p) => (
                <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-extrabold ${
                        p === page
                            ? "bg-[#0c2f73] text-white"
                            : "border border-blue-100 text-[#1e4db7] hover:bg-blue-50"
                    }`}
                >
                    {p}
                </button>
            ))}

            <button
                disabled={page === totalPages}
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                className="rounded-xl border border-blue-100 px-3 py-2 text-xs font-extrabold text-[#1e4db7] hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
                Next
            </button>
        </div>
    );
}

function EmptyRow({ colSpan, text }) {
    return (
        <tr>
            <td colSpan={colSpan} className="py-8 text-center text-[#6f85a3]">
                {text}
            </td>
        </tr>
    );
}

function paginate(items, page) {
    const start = (page - 1) * ROWS_PER_PAGE;
    return items.slice(start, start + ROWS_PER_PAGE);
}

function sortTransfers(items, sortMode) {
    const sorted = [...items];

    sorted.sort((a, b) => {
        if (sortMode === "UPDATED_ASC") {
            return compareDateValues(getTransferUpdatedAt(a), getTransferUpdatedAt(b), "ASC");
        }

        if (sortMode === "TRANSFER_DESC") {
            return compareDateValues(a.transfer_date, b.transfer_date, "DESC");
        }

        if (sortMode === "TRANSFER_ASC") {
            return compareDateValues(a.transfer_date, b.transfer_date, "ASC");
        }

        if (sortMode === "STATUS") {
            return `${a.status || ""}`.localeCompare(`${b.status || ""}`) ||
                compareDateValues(getTransferUpdatedAt(a), getTransferUpdatedAt(b), "DESC");
        }

        return compareDateValues(getTransferUpdatedAt(a), getTransferUpdatedAt(b), "DESC");
    });

    return sorted;
}

function getTransferUpdatedAt(transfer) {
    return transfer.approved_at || transfer.transfer_date;
}

function compareDateValues(firstValue, secondValue, direction) {
    const firstTime = getDateTime(firstValue);
    const secondTime = getDateTime(secondValue);
    const multiplier = direction === "ASC" ? 1 : -1;

    if (firstTime === secondTime) return 0;
    if (firstTime === null) return 1;
    if (secondTime === null) return -1;

    return firstTime > secondTime ? multiplier : -multiplier;
}

function getDateTime(value) {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.getTime();
}

function formatDateTime(dateValue) {
    if (!dateValue) return "-";

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString();
}

function formatStock(value) {
    return value === null || value === undefined ? "-" : value;
}

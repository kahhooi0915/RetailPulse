import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Bell,
    CheckCircle,
    PackageCheck,
    PackagePlus,
    RefreshCcw,
    Settings,
    Truck,
    X,
    XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import ManagerSidebar from "../components/ManagerSidebar";

const API_BASE = "http://localhost:5000";

export default function ManagerStockTransfer() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [approvalTransfers, setApprovalTransfers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [products, setProducts] = useState([]);
    const [transferItems, setTransferItems] = useState({});
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    const [form, setForm] = useState({
        from_branch_id: "",
        product_id: "",
        quantity: "",
    });

    const [showNotifications, setShowNotifications] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [toast, setToast] = useState({ show: false, message: "" });

    useEffect(() => {
        const savedUser = JSON.parse(sessionStorage.getItem("user"));

        if (!savedUser) {
            navigate("/");
            return;
        }

        if (savedUser.role !== "INVENTORY_MANAGER") {
            navigate("/");
            return;
        }

        setUser(savedUser);
        fetchData(savedUser);
    }, [navigate]);

    const fetchData = async (currentUser = user) => {
        try {
            setLoading(true);

            const [transferRes, approvalRes, branchRes, productRes] = await Promise.all([
                fetch(`${API_BASE}/stock-transfers`),
                fetch(`${API_BASE}/manager/stock-transfer/approvals?branch_id=${currentUser?.branch_id}`),
                fetch(`${API_BASE}/admin/branches`),
                fetch(`${API_BASE}/admin/products?available=1`),
            ]);

            const transferData = await transferRes.json();
            const approvalData = await approvalRes.json();
            const branchData = await branchRes.json();
            const productData = await productRes.json();

            setTransfers(Array.isArray(transferData) ? transferData : []);
            setApprovalTransfers(Array.isArray(approvalData) ? approvalData : []);
            setBranches(Array.isArray(branchData) ? branchData : []);
            setProducts(Array.isArray(productData) ? productData : []);

            const itemsMap = {};

            await Promise.all(
                (Array.isArray(transferData) ? transferData : []).map(async (transfer) => {
                    const itemRes = await fetch(
                        `${API_BASE}/stock-transfer/${transfer.transfer_id}/items`
                    );
                    const itemData = await itemRes.json();
                    itemsMap[transfer.transfer_id] = Array.isArray(itemData)
                        ? itemData
                        : [];
                })
            );

            setTransferItems(itemsMap);
        } catch (error) {
            console.error(error);
            alert("Failed to load stock transfer data.");
        } finally {
            setLoading(false);
        }
    };

    const getBranch = (branchId) => {
        return branches.find((b) => Number(b.branch_id) === Number(branchId));
    };

    const getBranchName = (branchId) => {
        return getBranch(branchId)?.branch_name || `Branch ${branchId}`;
    };

    const isBranchToBranch = (transfer) => {
        const sourceType = transfer.source_branch_type || getBranch(transfer.from_branch_id)?.branch_type;
        const destinationType = transfer.destination_branch_type || getBranch(transfer.to_branch_id)?.branch_type;

        return sourceType === "BRANCH" && destinationType === "BRANCH";
    };

    const isWarehouseToBranch = (transfer) => {
        const sourceType = transfer.source_branch_type || getBranch(transfer.from_branch_id)?.branch_type;
        const destinationType = transfer.destination_branch_type || getBranch(transfer.to_branch_id)?.branch_type;

        return sourceType === "WAREHOUSE" && destinationType === "BRANCH";
    };

    const sourceOptions = useMemo(() => {
        return branches.filter(
            (branch) => Number(branch.branch_id) !== Number(user?.branch_id)
        );
    }, [branches, user]);

    const approvalRequests = useMemo(() => {
        return approvalTransfers.filter(
            (transfer) =>
                Number(transfer.from_branch_id) === Number(user?.branch_id) &&
                isBranchToBranch(transfer) &&
                transfer.status === "PENDING"
        );
    }, [approvalTransfers, user, branches]);

    const awaitingReceive = useMemo(() => {
        return transfers.filter(
            (transfer) =>
                Number(transfer.to_branch_id) === Number(user?.branch_id) &&
                transfer.status === "APPROVED"
        );
    }, [transfers, user]);

    const relatedHistory = useMemo(() => {
        return transfers.filter(
            (transfer) =>
                Number(transfer.from_branch_id) === Number(user?.branch_id) ||
                Number(transfer.to_branch_id) === Number(user?.branch_id) ||
                Number(transfer.requested_by) === Number(user?.user_id)
        );
    }, [transfers, user]);

    const branchTransferHistory = useMemo(() => {
        return relatedHistory.filter(isBranchToBranch);
    }, [relatedHistory, branches]);

    const warehouseTransferHistory = useMemo(() => {
        return relatedHistory.filter(isWarehouseToBranch);
    }, [relatedHistory, branches]);

    const showToast = (message) => {
        setToast({ show: true, message });
        setTimeout(() => {
            setToast({ show: false, message: "" });
        }, 2500);
    };

    const handleCreateRequest = async (event) => {
        event.preventDefault();

        if (!form.from_branch_id || !form.product_id || Number(form.quantity) <= 0) {
            alert("Select a source, product, and quantity greater than 0.");
            return;
        }

        try {
            setActionLoading(true);

            const transferRes = await fetch(`${API_BASE}/manager/stock-transfer/request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    from_branch_id: Number(form.from_branch_id),
                    to_branch_id: Number(user.branch_id),
                    requested_by: Number(user.user_id),
                }),
            });

            const transferData = await transferRes.json();

            if (!transferRes.ok) {
                throw new Error(transferData.message || "Failed to create transfer request.");
            }

            const itemRes = await fetch(
                `${API_BASE}/stock-transfer/${transferData.transfer_id}/add-item`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        product_id: Number(form.product_id),
                        quantity: Number(form.quantity),
                    }),
                }
            );

            const itemData = await itemRes.json();

            if (!itemRes.ok) {
                throw new Error(itemData.message || "Failed to add transfer item.");
            }

            setForm({ from_branch_id: "", product_id: "", quantity: "" });
            showToast(`Transfer request ${transferData.transfer_code} created`);
            fetchData(user);
        } catch (error) {
            alert(error.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleApprove = async (transferId) => {
        try {
            setActionLoading(true);

            const res = await fetch(
                `${API_BASE}/manager/stock-transfer/${transferId}/approve`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        approved_by: Number(user.user_id),
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "Failed to approve transfer.");
            }

            showToast("Transfer approved successfully");
            fetchData(user);
        } catch (error) {
            alert(error.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) {
            alert("Reject reason is required.");
            return;
        }

        try {
            setActionLoading(true);

            const res = await fetch(
                `${API_BASE}/manager/stock-transfer/${rejectTarget.transfer_id}/reject`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        approved_by: Number(user.user_id),
                        reject_reason: rejectReason.trim(),
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "Failed to reject transfer.");
            }

            setRejectTarget(null);
            setRejectReason("");
            showToast("Transfer rejected");
            fetchData(user);
        } catch (error) {
            alert(error.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReceive = async (transferId) => {
        try {
            setActionLoading(true);

            const res = await fetch(
                `${API_BASE}/manager/stock-transfer/${transferId}/receive`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        received_by: Number(user.user_id),
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "Failed to receive stock.");
            }

            showToast("Stock received successfully");
            fetchData(user);
        } catch (error) {
            alert(error.message);
        } finally {
            setActionLoading(false);
        }
    };

    const logout = () => {
        sessionStorage.removeItem("user");
        navigate("/");
    };

    if (loading) {
        return (
            <div className="min-h-screen grid place-items-center bg-[#eef6fb] text-[#6f85a3]">
                <div className="text-center">
                    <Truck size={42} className="mx-auto mb-3" />
                    <p className="font-semibold">Loading Stock Transfers...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full overflow-x-hidden bg-[#eef6fb] text-[#17325c]">
            <div className="flex h-screen w-full overflow-x-hidden">
                <ManagerSidebar user={user} onOpenHelp={() => setShowHelp(true)} />

                <motion.main
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                    className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-8 py-6"
                >
                    <header className="mb-8 flex flex-wrap items-center gap-5">
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#07102f]">
                                Stock Transfer Management
                            </h1>
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                Request stock, approve branch requests, track status, and confirm received stock.
                            </p>
                        </div>

                        <div className="relative ml-auto flex items-center gap-3">
                            <button
                                onClick={() => fetchData(user)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                            >
                                <RefreshCcw size={18} />
                            </button>

                            <button
                                onClick={() => setShowNotifications(true)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                            >
                                <Bell size={18} />
                            </button>

                            <button className="grid h-11 w-11 place-items-center rounded-full bg-white shadow">
                                <Settings size={18} />
                            </button>

                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-[#0d2d6c] font-bold text-white shadow"
                            >
                                {user?.name?.charAt(0)?.toUpperCase() || "M"}
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
                                        className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-red-500 hover:bg-red-50"
                                    >
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </header>

                    <section className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
                        <SummaryBox title="Pending Approval" value={approvalRequests.length} tone="orange" />
                        <SummaryBox title="Awaiting Receive" value={awaitingReceive.length} tone="blue" />
                        <SummaryBox title="Related Transfers" value={relatedHistory.length} tone="dark" />
                    </section>

                    <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-[#07102f]">
                                    Request Stock Transfer
                                </h2>
                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    Request stock for {user?.branch_name} from a warehouse or another branch.
                                </p>
                            </div>

                            <PackagePlus className="text-[#1e4db7]" size={22} />
                        </div>

                        <form onSubmit={handleCreateRequest} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_160px_auto]">
                            <SelectInput
                                label="Source"
                                value={form.from_branch_id}
                                onChange={(value) => setForm((prev) => ({ ...prev, from_branch_id: value }))}
                            >
                                <option value="">Select source</option>
                                {sourceOptions.map((branch) => (
                                    <option key={branch.branch_id} value={branch.branch_id}>
                                        {branch.branch_name} ({branch.branch_type === "WAREHOUSE" ? "Warehouse" : "Branch"})
                                    </option>
                                ))}
                            </SelectInput>

                            <SelectInput
                                label="Product"
                                value={form.product_id}
                                onChange={(value) => setForm((prev) => ({ ...prev, product_id: value }))}
                            >
                                <option value="">Select product</option>
                                {products.map((product) => (
                                    <option key={product.product_id} value={product.product_id}>
                                        {product.product_name}
                                    </option>
                                ))}
                            </SelectInput>

                            <div>
                                <label className="mb-2 block text-xs font-bold uppercase text-[#6f85a3]">
                                    Quantity
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={form.quantity}
                                    onChange={(event) =>
                                        setForm((prev) => ({ ...prev, quantity: event.target.value }))
                                    }
                                    className="h-12 w-full rounded-xl border border-blue-100 px-4 font-bold outline-none focus:border-[#1e4db7]"
                                />
                            </div>

                            <button
                                disabled={actionLoading}
                                className="self-end rounded-xl bg-[#0c2f73] px-5 py-3 font-extrabold text-white hover:bg-[#103986] disabled:bg-gray-300"
                            >
                                Request
                            </button>
                        </form>
                    </section>

                    <TransferSection
                        title="Requests Waiting Your Approval"
                        desc="Branch-to-branch requests where your branch is the source."
                        badge={`${approvalRequests.length} request(s)`}
                        empty="No pending approval requests."
                    >
                        {approvalRequests.map((transfer) => (
                            <TransferCard
                                key={transfer.transfer_id}
                                transfer={transfer}
                                items={transferItems[transfer.transfer_id] || []}
                                getBranchName={getBranchName}
                                actions={
                                    <div className="mt-5 grid grid-cols-2 gap-3">
                                        <button
                                            disabled={actionLoading}
                                            onClick={() => setRejectTarget(transfer)}
                                            className="flex items-center justify-center gap-2 rounded-full border border-red-400 bg-white py-3 font-extrabold text-red-500 disabled:bg-gray-200"
                                        >
                                            <XCircle size={17} />
                                            Reject
                                        </button>

                                        <button
                                            disabled={actionLoading}
                                            onClick={() => handleApprove(transfer.transfer_id)}
                                            className="flex items-center justify-center gap-2 rounded-full bg-[#0c2f73] py-3 font-extrabold text-white disabled:bg-gray-400"
                                        >
                                            <CheckCircle size={17} />
                                            Approve
                                        </button>
                                    </div>
                                }
                            />
                        ))}
                    </TransferSection>

                    <TransferSection
                        title="Approved Transfers Awaiting Receive"
                        desc="Approved stock waiting for your confirmation."
                        badge={`${awaitingReceive.length} transfer(s)`}
                        empty="No approved transfers waiting to receive."
                    >
                        {awaitingReceive.map((transfer) => (
                            <TransferCard
                                key={transfer.transfer_id}
                                transfer={transfer}
                                items={transferItems[transfer.transfer_id] || []}
                                getBranchName={getBranchName}
                                actions={
                                    <button
                                        disabled={actionLoading}
                                        onClick={() => handleReceive(transfer.transfer_id)}
                                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-green-600 py-3 font-extrabold text-white disabled:bg-gray-400"
                                    >
                                        <PackageCheck size={17} />
                                        Confirm Received
                                    </button>
                                }
                            />
                        ))}
                    </TransferSection>

                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                            Transfer History
                        </h2>

                        <HistoryTable
                            title="Branch-to-Branch Transfers"
                            transfers={branchTransferHistory}
                            getBranchName={getBranchName}
                            empty="No branch-to-branch transfer history found."
                        />

                        <HistoryTable
                            title="Warehouse-to-Branch Transfers"
                            transfers={warehouseTransferHistory}
                            getBranchName={getBranchName}
                            empty="No warehouse-to-branch transfer history found."
                        />
                    </section>
                </motion.main>
            </div>

            {toast.show && (
                <div className="fixed left-1/2 top-6 z-[1000] -translate-x-1/2 pointer-events-none">
                    <div className="flex items-center gap-3 rounded-xl bg-green-600 px-6 py-4 text-white shadow-xl">
                        <CheckCircle size={18} />
                        {toast.message}
                    </div>
                </div>
            )}

            {rejectTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-[460px] rounded-3xl bg-white p-7 shadow-2xl">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-extrabold text-[#07102f]">
                                    Reject Transfer
                                </h2>
                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    A reason is required and will be visible to the requesting branch.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setRejectTarget(null);
                                    setRejectReason("");
                                }}
                                className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fb] text-[#254e7a]"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <textarea
                            value={rejectReason}
                            onChange={(event) => setRejectReason(event.target.value)}
                            rows={4}
                            className="w-full rounded-2xl border border-blue-100 p-4 text-sm font-semibold outline-none focus:border-[#1e4db7]"
                            placeholder="Enter reject reason"
                        />

                        <button
                            onClick={handleReject}
                            disabled={actionLoading}
                            className="mt-5 w-full rounded-2xl bg-red-600 py-4 font-extrabold text-white disabled:bg-gray-300"
                        >
                            {actionLoading ? "Rejecting..." : "Reject Transfer"}
                        </button>
                    </div>
                </div>
            )}

            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="w-[420px] rounded-3xl bg-white p-7 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-2xl font-extrabold text-[#07102f]">
                                Help Support
                            </h2>

                            <button
                                onClick={() => setShowHelp(false)}
                                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
                            >
                                Close
                            </button>
                        </div>

                        <div className="space-y-4 text-sm text-[#17325c]">
                            <p>Request stock for your branch from a warehouse or another branch.</p>
                            <p>Approve or reject requests only when your branch is the source branch.</p>
                            <p>Confirm received when approved stock arrives at your branch.</p>
                        </div>
                    </div>
                </div>
            )}

            {showNotifications && (
                <div className="fixed inset-0 z-50">
                    <div
                        onClick={() => setShowNotifications(false)}
                        className="absolute inset-0 bg-black/20"
                    />

                    <div className="absolute right-0 top-0 h-full w-[360px] bg-white p-6 shadow-2xl">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Notifications
                            </h2>

                            <button
                                onClick={() => setShowNotifications(false)}
                                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
                            >
                                Close
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl bg-orange-50 p-4">
                                <p className="font-extrabold text-orange-600">
                                    Pending Approval
                                </p>
                                <p className="mt-1 text-sm text-[#6f84a1]">
                                    {approvalRequests.length} branch request(s) need your decision.
                                </p>
                            </div>

                            <div className="rounded-2xl bg-blue-50 p-4">
                                <p className="font-extrabold text-[#1e4db7]">
                                    Awaiting Receive
                                </p>
                                <p className="mt-1 text-sm text-[#6f84a1]">
                                    {awaitingReceive.length} transfer(s) waiting to be received.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryBox({ title, value, tone }) {
    const colors = {
        orange: "text-orange-600",
        blue: "text-[#1e4db7]",
        dark: "text-[#07102f]",
    };

    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                {title}
            </p>
            <h2 className={`mt-4 text-3xl font-extrabold ${colors[tone]}`}>
                {value}
            </h2>
        </div>
    );
}

function SelectInput({ label, value, onChange, children }) {
    return (
        <div>
            <label className="mb-2 block text-xs font-bold uppercase text-[#6f85a3]">
                {label}
            </label>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-12 w-full rounded-xl border border-blue-100 bg-white px-4 font-bold outline-none focus:border-[#1e4db7]"
            >
                {children}
            </select>
        </div>
    );
}

function TransferSection({ title, desc, badge, empty, children }) {
    const childArray = React.Children.toArray(children);

    return (
        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-extrabold text-[#07102f]">
                        {title}
                    </h2>
                    <p className="mt-1 text-sm text-[#6f85a3]">{desc}</p>
                </div>

                <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-[#1e4db7]">
                    {badge}
                </span>
            </div>

            {childArray.length === 0 ? (
                <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
                    {empty}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{childArray}</div>
            )}
        </section>
    );
}

function TransferCard({ transfer, items, getBranchName, actions }) {
    return (
        <div className="rounded-2xl border border-blue-50 bg-[#f8fcff] p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase text-[#6f85a3]">
                        {transfer.transfer_code}
                    </p>
                    <h3 className="mt-1 text-lg font-extrabold text-[#07102f]">
                        {getBranchName(transfer.from_branch_id)} to{" "}
                        {getBranchName(transfer.to_branch_id)}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-[#6f85a3]">
                        Decision: {formatDateTime(transfer.approved_at)}
                    </p>
                </div>

                <StatusBadge status={transfer.status} />
            </div>

            <div className="mt-4 rounded-xl bg-white p-4">
                <p className="mb-3 text-xs font-bold uppercase text-[#6f85a3]">
                    Transfer Items
                </p>

                {items.length === 0 ? (
                    <p className="text-sm font-semibold text-[#6f85a3]">
                        No items found.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {items.map((item) => (
                            <div
                                key={item.transfer_detail_id}
                                className="flex items-center justify-between gap-4 text-sm"
                            >
                                <span className="font-bold text-[#17325c]">
                                    {item.product_name}
                                </span>
                                <span className="rounded-full bg-[#eef6fb] px-3 py-1 text-xs font-bold text-[#1e4db7]">
                                    Qty: {item.quantity}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {transfer.status === "REJECTED" && (
                <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">
                    Reject reason: {transfer.reject_reason || "-"}
                </div>
            )}

            {actions}
        </div>
    );
}

function HistoryTable({ title, transfers, getBranchName, empty }) {
    return (
        <div className="mb-6 last:mb-0">
            <h3 className="mb-3 text-sm font-extrabold uppercase text-[#6f85a3]">
                {title}
            </h3>

            <div className="overflow-x-auto rounded-2xl border border-blue-50">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                        <tr>
                            <th className="px-4 py-3">Code</th>
                            <th className="px-4 py-3">From</th>
                            <th className="px-4 py-3">To</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Decision Time</th>
                            <th className="px-4 py-3">Reject Reason</th>
                        </tr>
                    </thead>

                    <tbody>
                        {transfers.map((transfer) => (
                            <tr key={transfer.transfer_id} className="border-t">
                                <td className="px-4 py-4 font-bold">
                                    {transfer.transfer_code}
                                </td>
                                <td className="px-4 py-4">
                                    {getBranchName(transfer.from_branch_id)}
                                </td>
                                <td className="px-4 py-4">
                                    {getBranchName(transfer.to_branch_id)}
                                </td>
                                <td className="px-4 py-4">
                                    <StatusBadge status={transfer.status} />
                                </td>
                                <td className="px-4 py-4 text-xs font-semibold text-[#6f85a3]">
                                    {formatDateTime(transfer.approved_at)}
                                </td>
                                <td className="px-4 py-4 text-sm font-semibold text-red-600">
                                    {transfer.status === "REJECTED" ? transfer.reject_reason || "-" : "-"}
                                </td>
                            </tr>
                        ))}

                        {transfers.length === 0 && (
                            <tr>
                                <td
                                    colSpan="6"
                                    className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                                >
                                    {empty}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StatusBadge({ status }) {
    const style =
        status === "PENDING"
            ? "bg-orange-100 text-orange-600"
            : status === "APPROVED"
                ? "bg-blue-100 text-[#1e4db7]"
                : status === "RECEIVED"
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600";

    return (
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${style}`}>
            {status}
        </span>
    );
}

function formatDateTime(value) {
    if (!value) return "-";

    return new Date(value).toLocaleString("en-MY", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

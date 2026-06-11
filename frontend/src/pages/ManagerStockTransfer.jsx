import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Bell,
    CheckCircle,
    Eye,
    PackageCheck,
    PackagePlus,
    Plus,
    RefreshCcw,
    Settings,
    Trash2,
    Truck,
    X,
    XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import ManagerSidebar from "../components/ManagerSidebar";

const API_BASE = "http://localhost:5000";
const REQUEST_TIMEOUT_MS = 10000;

async function fetchJsonWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw new Error(data?.message || `Request failed with status ${res.status}`);
        }

        return data;
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Backend request timed out. Check that the Flask server and database are responding.");
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export default function ManagerStockTransfer() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [approvalTransfers, setApprovalTransfers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [products, setProducts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [transferItems, setTransferItems] = useState({});
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [viewTarget, setViewTarget] = useState(null);

    const [form, setForm] = useState({
        from_branch_id: "",
        items: [{ product_id: "", quantity: "" }],
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

            const [transferData, approvalData, branchData, productData, inventoryData] = await Promise.all([
                fetchJsonWithTimeout(`${API_BASE}/stock-transfers`),
                fetchJsonWithTimeout(`${API_BASE}/manager/stock-transfer/approvals?branch_id=${currentUser?.branch_id}`),
                fetchJsonWithTimeout(`${API_BASE}/admin/branches`),
                fetchJsonWithTimeout(`${API_BASE}/admin/products?available=1`),
                fetchJsonWithTimeout(`${API_BASE}/admin/inventory`),
            ]);

            setTransfers(Array.isArray(transferData) ? transferData : []);
            setApprovalTransfers(Array.isArray(approvalData) ? approvalData : []);
            setBranches(Array.isArray(branchData) ? branchData : []);
            setProducts(Array.isArray(productData) ? productData : []);
            setInventory(Array.isArray(inventoryData) ? inventoryData : []);

            const itemsMap = {};

            await Promise.all(
                (Array.isArray(transferData) ? transferData : []).map(async (transfer) => {
                    try {
                        const itemData = await fetchJsonWithTimeout(
                            `${API_BASE}/stock-transfer/${transfer.transfer_id}/items`
                        );
                        itemsMap[transfer.transfer_id] = Array.isArray(itemData)
                            ? itemData
                            : [];
                    } catch (error) {
                        console.error(`Failed to load transfer items for ${transfer.transfer_id}`, error);
                        itemsMap[transfer.transfer_id] = [];
                    }
                })
            );

            setTransferItems(itemsMap);
        } catch (error) {
            console.error(error);
            alert(error.message || "Failed to load stock transfer data.");
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

    const getCurrentBranchStock = (productId) => {
        if (!user?.branch_id || !productId) return null;

        const stockRecord = inventory.find(
            (item) =>
                Number(item.product_id) === Number(productId) &&
                Number(item.branch_id) === Number(user.branch_id)
        );

        return stockRecord ? Number(stockRecord.quantity_in_stock) : 0;
    };

    const isBranchToBranch = useCallback((transfer) => {
        const sourceType = transfer.source_branch_type || getBranch(transfer.from_branch_id)?.branch_type;
        const destinationType = transfer.destination_branch_type || getBranch(transfer.to_branch_id)?.branch_type;

        return sourceType === "BRANCH" && destinationType === "BRANCH";
    }, [branches]);

    const sourceOptions = useMemo(() => {
        return branches.filter(
            (branch) => Number(branch.branch_id) !== Number(user?.branch_id)
        );
    }, [branches, user]);

    const myTransferRequests = useMemo(() => {
        const trackedStatuses = ["PENDING", "APPROVED", "AWAITING_RECEIVE", "RECEIVED", "COMPLETED", "REJECTED"];

        return transfers.filter(
            (transfer) =>
                Number(transfer.to_branch_id) === Number(user?.branch_id) &&
                trackedStatuses.includes(transfer.status)
        );
    }, [transfers, user]);

    const approvalRequests = useMemo(() => {
        return approvalTransfers.filter(
            (transfer) =>
                Number(transfer.from_branch_id) === Number(user?.branch_id) &&
                Number(transfer.to_branch_id) !== Number(user?.branch_id) &&
                isBranchToBranch(transfer) &&
                transfer.status === "PENDING"
        );
    }, [approvalTransfers, user, isBranchToBranch]);

    const awaitingReceive = useMemo(() => {
        return myTransferRequests.filter(isAwaitingReceiveStatus);
    }, [myTransferRequests]);

    const relatedHistory = useMemo(() => {
        return transfers.filter(
            (transfer) =>
                (isCompletedStatus(transfer) || transfer.status === "REJECTED") &&
                (
                    Number(transfer.from_branch_id) === Number(user?.branch_id) ||
                    Number(transfer.to_branch_id) === Number(user?.branch_id) ||
                    Number(transfer.requested_by) === Number(user?.user_id)
                )
        );
    }, [transfers, user]);

    const myPendingRequests = useMemo(() => {
        return myTransferRequests.filter((transfer) => transfer.status === "PENDING");
    }, [myTransferRequests]);

    const showToast = (message) => {
        setToast({ show: true, message });
        setTimeout(() => {
            setToast({ show: false, message: "" });
        }, 2500);
    };

    const handleCreateRequest = async (event) => {
        event.preventDefault();

        const items = form.items.map((item) => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity),
        }));

        if (!form.from_branch_id) {
            alert("Select a source branch.");
            return;
        }

        if (
            items.length === 0 ||
            items.some((item) => !item.product_id || item.quantity <= 0)
        ) {
            alert("Select a product and quantity greater than 0 for every row.");
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
                    items,
                }),
            });

            const transferData = await transferRes.json();

            if (!transferRes.ok) {
                throw new Error(transferData.message || "Failed to create transfer request.");
            }

            setForm({
                from_branch_id: "",
                items: [{ product_id: "", quantity: "" }],
            });
            showToast(`Transfer request ${transferData.transfer_code} created`);
            fetchData(user);
        } catch (error) {
            alert(error.message);
        } finally {
            setActionLoading(false);
        }
    };

    const updateTransferItemRow = (index, field, value) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((item, itemIndex) =>
                itemIndex === index ? { ...item, [field]: value } : item
            ),
        }));
    };

    const addTransferItemRow = () => {
        setForm((prev) => ({
            ...prev,
            items: [...prev.items, { product_id: "", quantity: "" }],
        }));
    };

    const removeTransferItemRow = (index) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.length === 1
                ? prev.items
                : prev.items.filter((_, itemIndex) => itemIndex !== index),
        }));
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

                    <section className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryBox
                            title="My Pending Requests"
                            value={myPendingRequests.length}
                            tone="orange"
                            tooltip="Requests submitted by your branch that are waiting for approval."
                        />
                        <SummaryBox
                            title="Waiting Receive"
                            value={awaitingReceive.length}
                            tone="blue"
                            tooltip="Approved transfers waiting for your branch to confirm received stock."
                        />
                        <SummaryBox
                            title="Other Branch Requests"
                            value={approvalRequests.length}
                            tone="purple"
                            tooltip="Requests from other branches that need your branch to approve or reject."
                        />
                        <SummaryBox
                            title="Transfer History"
                            value={relatedHistory.length}
                            tone="dark"
                            tooltip="Completed or rejected transfer records related to your branch."
                        />
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

                        <form onSubmit={handleCreateRequest} className="space-y-5">
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

                            <div className="space-y-3">
                                {form.items.map((item, index) => (
                                    <div
                                        key={index}
                                        className="grid grid-cols-1 gap-3 rounded-2xl border border-blue-50 bg-[#f8fcff] p-4 lg:grid-cols-[minmax(0,1fr)_160px_44px]"
                                    >
                                        <SelectInput
                                            label={`Product ${index + 1}`}
                                            value={item.product_id}
                                            onChange={(value) => updateTransferItemRow(index, "product_id", value)}
                                        >
                                            <option value="">Select product</option>
                                            {products.map((product) => (
                                                <option key={product.product_id} value={product.product_id}>
                                                    {formatProductOption(
                                                        product,
                                                        getCurrentBranchStock(product.product_id)
                                                    )}
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
                                                value={item.quantity}
                                                onChange={(event) =>
                                                    updateTransferItemRow(index, "quantity", event.target.value)
                                                }
                                                className="h-12 w-full rounded-xl border border-blue-100 px-4 font-bold outline-none focus:border-[#1e4db7]"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            title="Remove item"
                                            disabled={form.items.length === 1}
                                            onClick={() => removeTransferItemRow(index)}
                                            className="self-end grid h-12 w-11 place-items-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={addTransferItemRow}
                                    className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-5 py-3 font-extrabold text-[#1e4db7] hover:bg-[#eef6fb]"
                                >
                                    <Plus size={17} />
                                    Add Product
                                </button>

                                <button
                                    disabled={actionLoading}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0c2f73] px-6 py-3 font-extrabold text-white hover:bg-[#103986] disabled:bg-gray-300"
                                >
                                    <PackagePlus size={17} />
                                    Request Transfer
                                </button>
                            </div>
                        </form>
                    </section>

                    <TransferSection
                        title="My Transfer Requests"
                        desc="Track requests created by your branch, including pending, approved, rejected, and completed transfers."
                        badge={`${myTransferRequests.length} request(s)`}
                        empty="No transfer requests created by your branch."
                    >
                        <MyTransferTable
                            transfers={myTransferRequests}
                            transferItems={transferItems}
                            getBranchName={getBranchName}
                            onView={setViewTarget}
                            onReceive={handleReceive}
                            actionLoading={actionLoading}
                        />
                    </TransferSection>

                    <TransferSection
                        title="Other Branch Requests"
                        desc="Requests from other branches where your branch is the source."
                        badge={`${approvalRequests.length} request(s)`}
                        empty="No pending requests from other branches."
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

                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-5">
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Transfer History
                            </h2>
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                Completed or rejected transfer records related to your branch.
                            </p>
                        </div>

                        <HistoryTable
                            transfers={relatedHistory}
                            transferItems={transferItems}
                            getBranchName={getBranchName}
                            empty="No completed or rejected transfer history found."
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

            {viewTarget && (
                <TransferDetailsModal
                    transfer={viewTarget}
                    items={transferItems[viewTarget.transfer_id] || []}
                    getBranchName={getBranchName}
                    onClose={() => setViewTarget(null)}
                />
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
                                    My Pending Requests
                                </p>
                                <p className="mt-1 text-sm text-[#6f84a1]">
                                    {myPendingRequests.length} request(s) from your branch are waiting for approval.
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

                            <div className="rounded-2xl bg-violet-50 p-4">
                                <p className="font-extrabold text-violet-600">
                                    Other Branch Requests
                                </p>
                                <p className="mt-1 text-sm text-[#6f84a1]">
                                    {approvalRequests.length} request(s) need your branch decision.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryBox({ title, value, tone, tooltip }) {
    const colors = {
        orange: "text-orange-600",
        blue: "text-[#1e4db7]",
        purple: "text-violet-600",
        dark: "text-[#07102f]",
    };

    return (
        <div title={tooltip} className="rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
            ) : childArray.length === 1 ? (
                childArray[0]
            ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{childArray}</div>
            )}
        </section>
    );
}

function MyTransferTable({ transfers, transferItems, getBranchName, onView, onReceive, actionLoading }) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-blue-50">
            <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[20%]" />
                    <col className="w-[24%]" />
                    <col className="w-[12%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                </colgroup>
                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">From</th>
                        <th className="px-4 py-3">To</th>
                        <th className="px-4 py-3">Items</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                </thead>

                <tbody>
                    {transfers.map((transfer) => {
                        const items = transferItems[transfer.transfer_id] || [];
                        const awaitingReceive = isAwaitingReceiveStatus(transfer);
                        const rejected = transfer.status === "REJECTED";

                        return (
                            <tr key={transfer.transfer_id} className="border-t bg-white">
                                <td className="px-4 py-4 font-bold text-[#07102f]">
                                    {transfer.transfer_code}
                                </td>
                                <td className="px-4 py-4">
                                    {getBranchName(transfer.from_branch_id)}
                                </td>
                                <td className="px-4 py-4">
                                    {getBranchName(transfer.to_branch_id)}
                                </td>
                                <td className="px-4 py-4 text-xs font-semibold text-[#6f85a3]">
                                    {items.length ? `${items.length} item(s)` : "-"}
                                </td>
                                <td className="px-4 py-4">
                                    <StatusBadge status={transfer.status} />
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex justify-end">
                                        {awaitingReceive ? (
                                            <button
                                                disabled={actionLoading}
                                                onClick={() => onReceive(transfer.transfer_id)}
                                                className="flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-4 py-2 font-extrabold text-white disabled:bg-gray-400"
                                            >
                                                <PackageCheck size={16} />
                                                Receive
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => onView(transfer)}
                                                className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 font-extrabold ${
                                                    rejected
                                                        ? "border border-red-300 bg-red-50 text-red-600"
                                                        : "bg-[#eef6fb] text-[#1e4db7]"
                                                }`}
                                            >
                                                <Eye size={16} />
                                                {rejected ? "View Reason" : "View"}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}

                    {transfers.length === 0 && (
                        <tr>
                            <td
                                colSpan="6"
                                className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                            >
                                No transfer requests created by your branch.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
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

function TransferDetailsModal({ transfer, items, getBranchName, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[640px] rounded-3xl bg-white p-7 shadow-2xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            {transfer.transfer_code}
                        </p>
                        <h2 className="mt-1 text-xl font-extrabold text-[#07102f]">
                            {getBranchName(transfer.from_branch_id)} to {getBranchName(transfer.to_branch_id)}
                        </h2>
                    </div>

                    <button
                        onClick={onClose}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fb] text-[#254e7a]"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <InfoBlock label="Status" value={<StatusBadge status={transfer.status} />} />
                    <InfoBlock label="Requested Time" value={formatDateTime(transfer.transfer_date)} />
                    <InfoBlock label="Decision Time" value={formatDateTime(transfer.approved_at)} />
                    <InfoBlock label="Reject Reason" value={transfer.status === "REJECTED" ? transfer.reject_reason || "-" : "-"} />
                </div>

                <div className="mt-5 rounded-2xl bg-[#f8fcff] p-4">
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
                                <TransferItemStockRow
                                    key={item.transfer_detail_id}
                                    item={item}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InfoBlock({ label, value }) {
    return (
        <div className="rounded-2xl bg-[#f8fcff] p-4">
            <p className="text-xs font-bold uppercase text-[#6f85a3]">{label}</p>
            <div className="mt-2 text-sm font-extrabold text-[#07102f]">{value}</div>
        </div>
    );
}

function TransferItemStockRow({ item }) {
    const showSourceStock =
        hasStockValue(item.source_stock_before) || hasStockValue(item.source_stock_after);
    const showDestinationStock =
        hasStockValue(item.destination_stock_before) || hasStockValue(item.destination_stock_after);

    return (
        <div className="rounded-xl bg-white px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-bold text-[#17325c]">
                    {item.product_name}
                </span>
                <span className="rounded-full bg-[#eef6fb] px-3 py-1 text-xs font-bold text-[#1e4db7]">
                    Qty: {item.quantity}
                </span>
            </div>

            {(showSourceStock || showDestinationStock) && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {showSourceStock && (
                        <StockChange label="Source Stock" before={item.source_stock_before} after={item.source_stock_after} />
                    )}
                    {showDestinationStock && (
                        <StockChange label="Destination Stock" before={item.destination_stock_before} after={item.destination_stock_after} />
                    )}
                </div>
            )}
        </div>
    );
}

function StockChange({ label, before, after }) {
    return (
        <div className="rounded-xl bg-[#f4fbff] px-3 py-2">
            <p className="text-[11px] font-bold uppercase text-[#6f85a3]">{label}</p>
            <p className="mt-1 font-extrabold text-[#07102f]">
                {formatStockValue(before)} <span className="text-[#6f85a3]">to</span> {formatStockValue(after)}
            </p>
        </div>
    );
}

function HistoryTable({ transfers, transferItems, getBranchName, empty }) {
    return (
        <div className="mb-6 last:mb-0">
            <div className="overflow-x-auto rounded-2xl border border-blue-50">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                        <tr>
                            <th className="px-4 py-3">Code</th>
                            <th className="px-4 py-3">From</th>
                            <th className="px-4 py-3">To</th>
                            <th className="px-4 py-3">Products</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Decision Time</th>
                            <th className="px-4 py-3">Reject Reason</th>
                        </tr>
                    </thead>

                    <tbody>
                        {transfers.map((transfer) => {
                            const items = transferItems[transfer.transfer_id] || [];

                            return (
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
                                    <td className="px-4 py-4 text-xs font-semibold text-[#6f85a3]">
                                        {formatTransferItems(items)}
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
                            );
                        })}

                        {transfers.length === 0 && (
                            <tr>
                                <td
                                    colSpan="7"
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
    const displayStatus = getDisplayStatus(status);
    const style =
        displayStatus === "PENDING"
            ? "bg-orange-100 text-orange-600"
            : displayStatus === "AWAITING_RECEIVE"
                ? "bg-blue-100 text-[#1e4db7]"
                : displayStatus === "COMPLETED"
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600";

    return (
        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold ${style}`}>
            {displayStatus}
        </span>
    );
}

function getDisplayStatus(status) {
    if (status === "APPROVED") return "AWAITING_RECEIVE";
    if (status === "RECEIVED") return "COMPLETED";
    return status;
}

function isAwaitingReceiveStatus(transfer) {
    return transfer.status === "APPROVED" || transfer.status === "AWAITING_RECEIVE";
}

function isCompletedStatus(transfer) {
    return transfer.status === "RECEIVED" || transfer.status === "COMPLETED";
}

function hasStockValue(value) {
    return value !== null && value !== undefined;
}

function formatStockValue(value) {
    return hasStockValue(value) ? value : "-";
}

function formatTransferItems(items) {
    if (!items.length) return "-";

    return items
        .map((item) => `${item.product_name || `Product ${item.product_id}`} x${item.quantity}`)
        .join(", ");
}

function formatProductOption(product, stock) {
    return `${product.product_name} (Stock: ${stock ?? 0})`;
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

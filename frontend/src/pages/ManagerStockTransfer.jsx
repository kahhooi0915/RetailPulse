import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BarChart3,
    Bell,
    Boxes,
    CheckCircle,
    HelpCircle,
    PackageCheck,
    RefreshCcw,
    Settings,
    Truck,
    XCircle,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

export default function ManagerStockTransfer() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [transferItems, setTransferItems] = useState({});
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const [showNotifications, setShowNotifications] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [toast, setToast] = useState({ show: false, message: "" });

    useEffect(() => {
        const savedUser =
            JSON.parse(localStorage.getItem("user")) ||
            JSON.parse(sessionStorage.getItem("user"));

        if (!savedUser) {
            navigate("/");
            return;
        }

        setUser(savedUser);
        fetchData(savedUser);
    }, [navigate]);

    const fetchData = async () => {
        try {
            setLoading(true);

            const [transferRes, branchRes] = await Promise.all([
                fetch(`${API_BASE}/stock-transfers`),
                fetch(`${API_BASE}/admin/branches`),
            ]);

            const transferData = await transferRes.json();
            const branchData = await branchRes.json();

            setTransfers(Array.isArray(transferData) ? transferData : []);
            setBranches(Array.isArray(branchData) ? branchData : []);

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

    const getBranchName = (branchId) => {
        const branch = branches.find(
            (b) => Number(b.branch_id) === Number(branchId)
        );
        return branch?.branch_name || `Branch ${branchId}`;
    };

    const approvalRequests = useMemo(() => {
        return transfers.filter(
            (transfer) =>
                Number(transfer.from_branch_id) === Number(user?.branch_id) &&
                transfer.status === "PENDING"
        );
    }, [transfers, user]);

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
                Number(transfer.to_branch_id) === Number(user?.branch_id)
        );
    }, [transfers, user]);

    const showToast = (message) => {
        setToast({ show: true, message });
        setTimeout(() => {
            setToast({ show: false, message: "" });
        }, 2500);
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

    const handleReject = async (transferId) => {
        try {
            setActionLoading(true);

            const res = await fetch(
                `${API_BASE}/manager/stock-transfer/${transferId}/reject`,
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
                throw new Error(data.message || "Failed to reject transfer.");
            }

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
        localStorage.removeItem("user");
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
        <div className="h-screen w-full overflow-hidden bg-[#eef6fb] text-[#17325c]">
            <div className="grid h-full grid-cols-[230px_minmax(0,1fr)]">
                {/* SIDEBAR */}
                <aside className="flex flex-col bg-[#d9edf8] px-5 py-6 border-r border-blue-100">
                    <div className="mb-8 text-2xl font-extrabold text-[#1e4db7]">
                        RetailPulse
                    </div>

                    <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
                        <h4 className="font-extrabold text-[#16325b]">
                            {user?.branch_name || "Branch"}
                        </h4>
                        <p className="mt-1 text-xs text-[#6f85a3]">
                            Manager ID: {user?.user_id}
                        </p>
                    </div>

                    <nav className="space-y-3">
                        <button
                            onClick={() => navigate("/manager-dashboard")}
                            className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                        >
                            <BarChart3 size={18} />
                            <span>Dashboard</span>
                        </button>

                        <button className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 font-bold text-[#1e4db7] shadow">
                            <Truck size={18} />
                            <span>Stock Transfer</span>
                        </button>

                        <button
                            onClick={() => navigate("/manager-inventory")}
                            className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                        >
                            <Boxes size={18} />
                            <span>Branch Inventory</span>
                        </button>
                    </nav>

                    <div className="mt-auto space-y-3">
                        <button
                            onClick={() => setShowHelp(true)}
                            className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 text-sm font-semibold text-[#254e7a]"
                        >
                            <HelpCircle size={17} />
                            <span>Help Support</span>
                        </button>
                    </div>
                </aside>

                {/* MAIN */}
                <motion.main
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                    className="min-w-0 overflow-y-auto px-8 py-6"
                >
                    <header className="mb-8 flex items-center gap-5">
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#07102f]">
                                Stock Transfer Management
                            </h1>
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                Approve stock requests, reject unavailable requests, and confirm received stock.
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

                    {/* SUMMARY */}
                    <section className="mb-6 grid grid-cols-3 gap-5">
                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                                Pending Approval
                            </p>
                            <h2 className="mt-4 text-3xl font-extrabold text-orange-600">
                                {approvalRequests.length}
                            </h2>
                        </div>

                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                                Awaiting Receive
                            </p>
                            <h2 className="mt-4 text-3xl font-extrabold text-[#1e4db7]">
                                {awaitingReceive.length}
                            </h2>
                        </div>

                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                                Related Transfers
                            </p>
                            <h2 className="mt-4 text-3xl font-extrabold">
                                {relatedHistory.length}
                            </h2>
                        </div>
                    </section>

                    {/* APPROVAL REQUESTS */}
                    <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-[#07102f]">
                                    Requests Waiting Your Approval
                                </h2>
                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    Other branches requesting stock from your branch.
                                </p>
                            </div>

                            <span className="rounded-full bg-orange-100 px-4 py-2 text-sm font-bold text-orange-600">
                                {approvalRequests.length} request(s)
                            </span>
                        </div>

                        {approvalRequests.length === 0 ? (
                            <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
                                No pending approval requests.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {approvalRequests.map((transfer) => (
                                    <TransferCard
                                        key={transfer.transfer_id}
                                        transfer={transfer}
                                        items={transferItems[transfer.transfer_id] || []}
                                        getBranchName={getBranchName}
                                        actionLoading={actionLoading}
                                        actions={
                                            <div className="mt-5 grid grid-cols-2 gap-3">
                                                <button
                                                    disabled={actionLoading}
                                                    onClick={() => handleReject(transfer.transfer_id)}
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
                            </div>
                        )}
                    </section>

                    {/* RECEIVE */}
                    <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-[#07102f]">
                                    Approved Transfers Awaiting Receive
                                </h2>
                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    Stock approved by source branch and waiting for your confirmation.
                                </p>
                            </div>

                            <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-[#1e4db7]">
                                {awaitingReceive.length} transfer(s)
                            </span>
                        </div>

                        {awaitingReceive.length === 0 ? (
                            <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
                                No approved transfers waiting to receive.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {awaitingReceive.map((transfer) => (
                                    <TransferCard
                                        key={transfer.transfer_id}
                                        transfer={transfer}
                                        items={transferItems[transfer.transfer_id] || []}
                                        getBranchName={getBranchName}
                                        actionLoading={actionLoading}
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
                            </div>
                        )}
                    </section>

                    {/* HISTORY */}
                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                            Transfer History
                        </h2>

                        <div className="overflow-hidden rounded-2xl border border-blue-50">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                    <tr>
                                        <th className="px-4 py-3">Code</th>
                                        <th className="px-4 py-3">From</th>
                                        <th className="px-4 py-3">To</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {relatedHistory.map((transfer) => (
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
                                        </tr>
                                    ))}

                                    {relatedHistory.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan="4"
                                                className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                                            >
                                                No transfer history found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </motion.main>
            </div>

            {toast.show && (
                <div className="fixed top-6 left-1/2 z-[1000] -translate-x-1/2 pointer-events-none">
                    <div className="flex items-center gap-3 bg-green-600 text-white px-6 py-4 rounded-xl shadow-xl">
                        <CheckCircle size={18} />
                        {toast.message}
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
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 text-sm text-[#17325c]">
                            <p>• Approve requests when another branch requests stock from your branch.</p>
                            <p>• Confirm received when approved stock arrives at your branch.</p>
                            <p>• Check transfer history for audit tracking.</p>
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
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl bg-orange-50 p-4">
                                <p className="font-extrabold text-orange-600">
                                    Pending Approval
                                </p>
                                <p className="mt-1 text-sm text-[#6f84a1]">
                                    {approvalRequests.length} request(s) need your decision.
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

function TransferCard({ transfer, items, getBranchName, actions }) {
    return (
        <div className="rounded-2xl border border-blue-50 bg-[#f8fcff] p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase text-[#6f85a3]">
                        {transfer.transfer_code}
                    </p>
                    <h3 className="mt-1 text-lg font-extrabold text-[#07102f]">
                        {getBranchName(transfer.from_branch_id)} →{" "}
                        {getBranchName(transfer.to_branch_id)}
                    </h3>
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
                                className="flex items-center justify-between text-sm"
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

            {actions}
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
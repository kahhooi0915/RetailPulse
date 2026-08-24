import { CheckCircle, Circle, Clock, XCircle } from "lucide-react";

const STATUS_LABELS = {
    PENDING: "Pending Review",
    PENDING_SOURCE: "Source Review",
    APPROVED: "Awaiting Receive",
    RECEIVED: "Completed",
    REJECTED: "Rejected",
};

function getDecisionLabel(status) {
    if (status === "PENDING_SOURCE") return "Source Review";
    if (status === "REJECTED") return "Review Rejected";
    return "Pending Approval / Review";
}

function getTimelineStages(transfer) {
    const status = transfer?.status;
    const requestDate = transfer?.request_date || transfer?.created_at || transfer?.transfer_date;
    const approvalDate = transfer?.approval_date || transfer?.approved_at;

    const stages = [
        {
            key: "request",
            label: "Request Created",
            date: requestDate,
            person: transfer?.requested_by,
        },
        {
            key: "review",
            label: getDecisionLabel(status),
            date: status === "REJECTED" ? approvalDate : null,
            person: status === "REJECTED" ? transfer?.approved_by : null,
        },
        {
            key: "approved",
            label: "Approved",
            date: status === "REJECTED" ? null : approvalDate,
            person: status === "REJECTED" ? null : transfer?.approved_by,
        },
        {
            key: "received",
            label: "Received",
            date: transfer?.received_at || transfer?.received_date,
            person: transfer?.received_by,
        },
    ];

    if (status === "REJECTED") {
        return stages.map((stage, index) => ({
            ...stage,
            state: index === 0 ? "completed" : index === 1 ? "rejected" : "pending",
        }));
    }

    const currentIndexByStatus = {
        PENDING: 1,
        PENDING_SOURCE: 1,
        APPROVED: 2,
        RECEIVED: 3,
    };
    const currentIndex = currentIndexByStatus[status] ?? 0;

    return stages.map((stage, index) => ({
        ...stage,
        state:
            status === "RECEIVED" || index < currentIndex
                ? "completed"
                : index === currentIndex
                    ? "current"
                    : "pending",
    }));
}

export default function StockTransferTimeline({ transfer, formatDateTime }) {
    const stages = getTimelineStages(transfer);
    const statusLabel = STATUS_LABELS[transfer?.status] || transfer?.status || "-";
    const formatDate = formatDateTime || defaultFormatDateTime;

    return (
        <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-widest text-[#6f85a3]">
                        Status Timeline
                    </h3>
                    <p className="mt-1 text-sm font-bold text-[#17325c]">
                        Current status: {statusLabel}
                    </p>
                </div>
            </div>

            <div className="space-y-0">
                {stages.map((stage, index) => (
                    <TimelineStage
                        key={stage.key}
                        stage={stage}
                        isLast={index === stages.length - 1}
                        formatDate={formatDate}
                    />
                ))}
            </div>
        </div>
    );
}

function TimelineStage({ stage, isLast, formatDate }) {
    const styles = {
        completed: {
            icon: "bg-green-600 text-white",
            line: "bg-green-200",
            title: "text-[#07102f]",
            meta: "text-green-700",
            Icon: CheckCircle,
        },
        current: {
            icon: "bg-[#1e4db7] text-white",
            line: "bg-blue-200",
            title: "text-[#07102f]",
            meta: "text-[#1e4db7]",
            Icon: Clock,
        },
        rejected: {
            icon: "bg-red-600 text-white",
            line: "bg-red-200",
            title: "text-red-700",
            meta: "text-red-700",
            Icon: XCircle,
        },
        pending: {
            icon: "bg-[#eef6fb] text-[#8aa0bb]",
            line: "bg-blue-50",
            title: "text-[#6f85a3]",
            meta: "text-[#8aa0bb]",
            Icon: Circle,
        },
    };
    const style = styles[stage.state] || styles.pending;
    const Icon = style.Icon;
    const date = formatDate(stage.date);
    const person = stage.person || "-";

    return (
        <div className="grid grid-cols-[32px_1fr] gap-4">
            <div className="flex flex-col items-center">
                <div className={`grid h-8 w-8 place-items-center rounded-full ${style.icon}`}>
                    <Icon size={17} />
                </div>
                {!isLast && <div className={`h-10 w-0.5 ${style.line}`} />}
            </div>

            <div className={`${isLast ? "pb-0" : "pb-4"}`}>
                <p className={`text-sm font-extrabold ${style.title}`}>{stage.label}</p>
                <div className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold ${style.meta}`}>
                    <span>{date}</span>
                    {person !== "-" && <span>By {person}</span>}
                </div>
            </div>
        </div>
    );
}

function defaultFormatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString();
}

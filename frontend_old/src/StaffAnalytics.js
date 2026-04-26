import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

const chartData = [
  { day: "MON", actual: 65, forecast: 78 },
  { day: "TUE", actual: 76, forecast: 55 },
  { day: "WED", actual: 48, forecast: 66 },
  { day: "THU", actual: 73, forecast: 78 },
  { day: "FRI", actual: 78, forecast: 73 },
  { day: "SAT", actual: 28, forecast: 35 },
  { day: "SUN", actual: 20, forecast: 26 },
];

const recentWins = [
  { name: "Wireless Mouse", order: "#8821", amount: "+RM 35.90" },
  { name: "Milo Ais", order: "#8819", amount: "+RM 3.50" },
  { name: "Chicken Rice", order: "#8815", amount: "+RM 8.50" },
];

const transactions = [
  {
    id: "TRX-009421",
    client: "Walk-in Customer",
    product: "Wireless Mouse",
    status: "COMPLETED",
    amount: "RM 35.90",
  },
  {
    id: "TRX-009418",
    client: "Walk-in Customer",
    product: "Milo Ais",
    status: "COMPLETED",
    amount: "RM 3.50",
  },
  {
    id: "TRX-009415",
    client: "Walk-in Customer",
    product: "Chicken Rice",
    status: "PENDING",
    amount: "RM 8.50",
  },
];

export default function StaffAnalytics() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: "🛒", label: "POS Terminal", path: "/staff-pos" },
    { icon: "📊", label: "Analytics", path: "/staff-analytics" },
    { icon: "👤", label: "User Profile", path: "/profile" },
  ];

  return (
    <div className="min-h-screen bg-[#eef6fb] text-[#17325c] grid grid-cols-[230px_minmax(0,1fr)]">
      {/* SIDEBAR */}
      <aside className="bg-[#d9edf8] px-[18px] py-6 flex flex-col border-r border-[#14376414]">
        <div className="text-[22px] font-extrabold text-[#1c49b7] mb-8 tracking-[-0.3px]">
          Retail Pulse
        </div>

        <div className="bg-white/50 rounded-2xl px-4 py-3 mb-7">
          <h3 className="m-0 text-[15px] font-extrabold text-[#16325b] leading-tight">
            Main Branch
          </h3>
          <p className="mt-1 text-xs text-[#6f85a3]">STAFF ID: 4429</p>
        </div>

        <nav className="flex flex-col gap-[10px]">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-[14px] rounded-2xl text-[15px] font-bold transition text-left ${
                location.pathname === item.path
                  ? "bg-white text-[#1e4db7] shadow-[0_8px_24px_rgba(14,42,90,0.08)]"
                  : "bg-white/30 text-[#254e7a] hover:bg-white/70 hover:-translate-y-[1px]"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto bg-white/30 text-[#254e7a] rounded-2xl px-4 py-[14px] text-sm font-bold">
          ❓ Help Support
        </div>
      </aside>

      {/* MAIN */}
      <main className="min-w-0 px-6 pb-7">
        {/* TOP BAR */}
        <header className="h-[104px] flex items-center justify-between">
          <div className="flex gap-4">
            <button className="bg-white text-[#1e4db7] px-7 py-3 rounded-full font-extrabold shadow-[inset_0_-2px_0_#1e4db7,0_8px_24px_rgba(14,42,90,0.08)]">
              Dashboard
            </button>
            <button
              onClick={() => navigate("/staff-pos")}
              className="bg-white text-[#4e6e8c] px-7 py-3 rounded-full font-extrabold shadow-[0_8px_24px_rgba(14,42,90,0.08)]"
            >
              Inventory
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button className="w-11 h-11 rounded-full bg-white shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
              🔔
            </button>
            <button className="w-11 h-11 rounded-full bg-white shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
              ⚙️
            </button>
            <div className="w-11 h-11 rounded-full bg-[#0c2f73] text-white grid place-items-center font-black">
              U
            </div>
          </div>
        </header>

        {/* TITLE */}
        <section className="flex justify-between items-start gap-6 mb-6">
          <div>
            <h1 className="text-[42px] leading-tight font-black text-[#07152f] tracking-[-1px]">
              Weekly Sales Report
            </h1>
            <p className="mt-2 text-[15px] text-[#526a84]">
              Performance auditing for the period Oct 23 – Oct 29, 2023
            </p>
          </div>

          <div className="flex gap-3">
            <button className="bg-white text-[#07152f] px-6 h-[50px] rounded-full font-extrabold shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
              ⬇ Export PDF
            </button>
            <button className="bg-[#0c2f73] text-white px-6 h-[50px] rounded-full font-extrabold shadow-[0_8px_20px_rgba(12,47,115,0.2)]">
              Refresh Data
            </button>
          </div>
        </section>

        {/* KPI CARDS */}
        <section className="grid grid-cols-[2fr_1fr_1fr] gap-5 mb-6">
          <div className="bg-white rounded-[20px] p-6 min-h-[165px] shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
            <p className="uppercase tracking-[2px] text-xs text-[#8ca0bc] font-black mb-4">
              Personal Sales Total
            </p>
            <h2 className="text-[48px] font-black text-[#07152f]">
              RM 42,904.50
            </h2>
            <p className="mt-3 text-[#d56e24] font-black">
              ↗ +12.4% vs last week
            </p>
          </div>

          <div className="bg-white rounded-[20px] p-6 min-h-[165px] shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
            <p className="uppercase tracking-[2px] text-xs text-[#8ca0bc] font-black mb-4">
              Avg. Order Value
            </p>
            <h2 className="text-[38px] font-black text-[#07152f]">
              RM 842.12
            </h2>
            <div className="mt-5 h-[7px] bg-[#eef3fa] rounded-full overflow-hidden">
              <div className="h-full w-[84%] bg-[#d56e24] rounded-full" />
            </div>
            <p className="mt-2 text-sm text-[#8ca0bc]">Target: RM 1,000.00</p>
          </div>

          <div className="bg-white rounded-[20px] p-6 min-h-[165px] shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
            <p className="uppercase tracking-[2px] text-xs text-[#8ca0bc] font-black mb-4">
              Weekly Goal
            </p>
            <h2 className="text-[42px] font-black text-[#07152f]">85%</h2>
            <p className="mt-2 text-sm text-[#8ca0bc]">12 sales to go</p>
            <div className="flex gap-2 mt-4">
              <span className="w-8 h-8 rounded-full bg-[#0c2f73] text-white grid place-items-center text-xs font-black">
                MK
              </span>
              <span className="w-8 h-8 rounded-full bg-[#17a6a6] text-white grid place-items-center text-xs font-black">
                JS
              </span>
              <span className="w-8 h-8 rounded-full bg-[#d56e24] text-white grid place-items-center text-xs font-black">
                +3
              </span>
            </div>
          </div>
        </section>

        {/* CHART + RECENT WINS */}
        <section className="grid grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-5 mb-6">
          <div className="bg-white rounded-[20px] p-6 shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-[#07152f]">
                Daily Performance Audit
              </h3>

              <div className="flex gap-5 text-xs font-black text-[#8ca0bc]">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#d56e24] rounded-sm" />
                  ACTUAL
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#bcd3ee] rounded-sm" />
                  FORECAST
                </div>
              </div>
            </div>

            <div className="h-[230px] flex justify-around items-end border-b border-[#dde6f2] pb-8">
              {chartData.map((item) => (
                <div key={item.day} className="h-full flex flex-col items-center">
                  <div className="h-[180px] flex items-end gap-2">
                    <div
                      className="w-6 rounded-t-md bg-[#d56e24]"
                      style={{ height: `${item.actual}%` }}
                    />
                    <div
                      className="w-6 rounded-t-md bg-[#bcd3ee]"
                      style={{ height: `${item.forecast}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs font-black text-[#8ca0bc]">
                    {item.day}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0f1e3a] text-white rounded-[20px] p-6 shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
            <h3 className="text-[21px] font-black mb-5">Recent Wins</h3>

            {recentWins.map((item) => (
              <div
                key={item.order}
                className="bg-[#162544] rounded-2xl p-4 mb-4 flex justify-between gap-3"
              >
                <div>
                  <p className="font-black">{item.name}</p>
                  <p className="mt-1 text-sm text-[#17a6a6]">
                    Order {item.order}
                  </p>
                </div>
                <p className="text-[#f59e0b] font-black">{item.amount}</p>
              </div>
            ))}

            <button className="w-full mt-2 h-[48px] rounded-full border border-white/25 font-extrabold">
              View All Recent Activity
            </button>
          </div>
        </section>

        {/* TABLE */}
        <section className="bg-white rounded-[20px] p-6 shadow-[0_8px_24px_rgba(14,42,90,0.08)]">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-xl font-black text-[#07152f]">
              Transaction Log
            </h3>
            <span className="bg-[#f0f5fb] text-[#7b8da8] rounded-full px-4 py-2 text-xs font-black">
              LIVE UPDATES
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="text-left text-xs uppercase text-[#8ca0bc] border-b border-[#dde6f2]">
                  <th className="pb-4">ID</th>
                  <th className="pb-4">Client</th>
                  <th className="pb-4">Product</th>
                  <th className="pb-4">Status</th>
                  <th className="pb-4 text-right">Amount</th>
                </tr>
              </thead>

              <tbody>
                {transactions.map((trx) => (
                  <tr key={trx.id} className="border-b border-[#edf2f6]">
                    <td className="py-4 font-extrabold text-[#0c2f73]">
                      {trx.id}
                    </td>
                    <td className="py-4">{trx.client}</td>
                    <td className="py-4">{trx.product}</td>
                    <td className="py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-black ${
                          trx.status === "COMPLETED"
                            ? "bg-[#dcfce7] text-[#166534]"
                            : "bg-[#fef3c7] text-[#92400e]"
                        }`}
                      >
                        {trx.status}
                      </span>
                    </td>
                    <td className="py-4 text-right font-black">
                      {trx.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="w-full pt-4 font-black text-[#41536d]">
            Show 20 more entries
          </button>
        </section>
      </main>
    </div>
  );
}
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, ShieldCheck } from "lucide-react";
import api from "../api/axios";
import setFavicon from "../utils/setFavicon";
import retailBg from "../assets/retail-bg.jpg";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await api.post("/login", { email, password });
      const user = res.data;

      sessionStorage.setItem("user", JSON.stringify(user));

      setFavicon(user.role);

      setSuccess(true);

      setTimeout(() => {
        if (user.role === "SYSTEM_ADMIN") {
          navigate("/admin");
        } else if (user.role === "BRANCH_STAFF") {
          navigate("/staff");
        } else if (user.role === "INVENTORY_MANAGER") {
          navigate("/manager-dashboard");
        }
      }, 700);
    } catch (err) {
      setError("Invalid email or password");
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-slate-100 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${retailBg})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/45 via-blue-950/30 to-slate-100/25" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.26),transparent_34%)]" />

      {success && (
        <div className="fixed left-1/2 top-6 z-50 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-emerald-200 bg-white/95 px-6 py-3.5 text-center text-base font-semibold text-emerald-700 shadow-xl shadow-slate-900/15 backdrop-blur-md animate-[toastSlideDown_450ms_ease-out_both]">
          Welcome Back!
        </div>
      )}

      <style>
        {`
          @keyframes toastSlideDown {
            from {
              opacity: 0;
              transform: translate(-50%, -16px);
            }
            to {
              opacity: 1;
              transform: translate(-50%, 0);
            }
          }
        `}
      </style>

      <main className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10 sm:px-6 lg:px-8">
        <section className="w-full max-w-md rounded-xl border border-white/60 bg-white/85 p-6 text-slate-900 shadow-2xl shadow-slate-900/20 backdrop-blur-xl transition duration-300 hover:bg-white/90 sm:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 shadow-sm">
              <ShieldCheck size={28} className="text-blue-700" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              RetailPulse
            </h1>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              Multi-Branch Inventory & Sales Analytics System
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">
                Email
              </label>

              <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition duration-300 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <Mail size={18} className="text-blue-500" />
                <input
                  type="email"
                  className="ml-3 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="cursor-pointer text-xs font-semibold text-blue-700 transition duration-300 hover:text-blue-900"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition duration-300 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <Lock size={18} className="text-blue-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  className="ml-3 w-full bg-transparent pr-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowPassword(true);
                  }}
                  onMouseUp={() => setShowPassword(false)}
                  onMouseLeave={() => setShowPassword(false)}
                  onTouchStart={() => setShowPassword(true)}
                  onTouchEnd={() => setShowPassword(false)}
                  className="flex items-center justify-center text-slate-400 transition duration-300 hover:text-blue-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="flex cursor-pointer items-center gap-3 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 accent-blue-600 focus:ring-blue-200"
                />
                Remember this device
              </label>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button className="group mt-2 w-full rounded-lg bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-blue-900/20 transition duration-300 hover:-translate-y-0.5 hover:from-blue-800 hover:to-blue-700 hover:shadow-blue-900/30 focus:outline-none focus:ring-4 focus:ring-blue-200">
              <span className="inline-flex items-center justify-center gap-2">
                Log In
                <span className="transition duration-300 group-hover:translate-x-1">
                  -&gt;
                </span>
              </span>
            </button>
          </form>

          <p className="mt-7 text-center text-xs font-medium text-slate-500">
            Need an account? Contact your administrator
          </p>
        </section>
      </main>
    </div>
  );
}

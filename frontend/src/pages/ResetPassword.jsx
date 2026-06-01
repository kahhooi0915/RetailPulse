import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import api from "../api/axios";
import retailBg from "../assets/retail-bg.jpg";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const passwordRequirementText = "Password must be at least 6 characters and include one special character.";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Reset token is missing. Please request a new reset link.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    if (newPassword.length < 6 || !/[^\w\s]/.test(newPassword)) {
      setError(passwordRequirementText);
      return;
    }

    setLoading(true);

    try {
      const res = await api.post("/forgot-password/reset-password", {
        token,
        new_password: newPassword,
      });

      setSuccess(res.data.message || "Password reset successfully. You can now log in.");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        navigate("/");
      }, 1400);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-slate-100 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${retailBg})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/35 via-blue-950/25 to-slate-100/35" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.58),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.22),transparent_34%)]" />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10 sm:px-6 lg:px-8">
        <section className="w-full max-w-md rounded-xl border border-white/60 bg-white/85 p-6 text-slate-900 shadow-2xl shadow-slate-900/20 backdrop-blur-xl transition duration-300 hover:bg-white/90 sm:p-8">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition duration-300 hover:text-blue-700"
          >
            <ArrowLeft size={17} />
            Back to login
          </Link>

          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 shadow-sm">
              <ShieldCheck size={28} className="text-blue-700" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Reset Password
            </h1>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              Create a new password for your RetailPulse account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">
                New Password
              </label>
              <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition duration-300 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <Lock size={18} className="text-blue-500" />
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  minLength={6}
                  className="ml-3 w-full bg-transparent pr-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowNewPassword(true);
                  }}
                  onMouseUp={() => setShowNewPassword(false)}
                  onMouseLeave={() => setShowNewPassword(false)}
                  onTouchStart={() => setShowNewPassword(true)}
                  onTouchEnd={() => setShowNewPassword(false)}
                  className="flex items-center justify-center text-slate-400 transition duration-300 hover:text-blue-600"
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="mt-2 text-xs font-bold text-red-600">
                {passwordRequirementText}
              </p>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">
                Confirm Password
              </label>
              <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition duration-300 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <CheckCircle2 size={18} className="text-blue-500" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={6}
                  className="ml-3 w-full bg-transparent pr-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowConfirmPassword(true);
                  }}
                  onMouseUp={() => setShowConfirmPassword(false)}
                  onMouseLeave={() => setShowConfirmPassword(false)}
                  onTouchStart={() => setShowConfirmPassword(true)}
                  onTouchEnd={() => setShowConfirmPassword(false)}
                  className="flex items-center justify-center text-slate-400 transition duration-300 hover:text-blue-600"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {success && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {success}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group mt-2 w-full rounded-lg bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-blue-900/20 transition duration-300 hover:-translate-y-0.5 hover:from-blue-800 hover:to-blue-700 hover:shadow-blue-900/30 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

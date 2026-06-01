import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Send, ShieldCheck } from "lucide-react";
import api from "../api/axios";
import retailBg from "../assets/retail-bg.jpg";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await api.post("/forgot-password/send-reset-link", { email });
      setSuccess(res.data.message || "Password reset link sent. Please check your email.");
      setEmail("");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to send reset link. Please try again.");
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
              Forgot Password
            </h1>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              Enter your registered email to receive a secure reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">
                Registered Email
              </label>
              <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition duration-300 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <Mail size={18} className="text-blue-500" />
                <input
                  type="email"
                  required
                  className="ml-3 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
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
              <span className="inline-flex items-center justify-center gap-2">
                {loading ? "Sending..." : "Send Reset Link"}
                <Send size={17} className="transition duration-300 group-hover:translate-x-1" />
              </span>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

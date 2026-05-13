import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, ShieldCheck } from "lucide-react";
import api from "../api/axios";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await api.post("/login", { email, password });
      const user = res.data;

      localStorage.setItem("user", JSON.stringify(user));

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
    <div className="flex min-h-screen">

      {/* LEFT PANEL */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#061b3a] via-[#062b54] to-[#081326] text-white p-12 flex-col justify-between">
        
        <div>
          <h1 className="text-2xl font-bold">RetailPulse</h1>

          <div className="mt-20">
            <h2 className="text-5xl font-extrabold leading-tight">
              Precision in every
              <span className="block text-cyan-400">pixel.</span>
            </h2>

            <p className="mt-6 text-sm text-gray-300 max-w-sm">
              Access the master dashboard for high-stakes inventory auditing and real-time logistics analytics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-3 rounded">
            <ShieldCheck className="text-cyan-300" />
          </div>
          <div>
            <p className="font-semibold text-sm">Enterprise Security</p>
            <p className="text-xs text-gray-300">
              End-to-end encrypted data handling.
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-md">

          {success && (
            <div className="fixed top-5 right-5 bg-green-600 text-white px-4 py-2 rounded-xl shadow animate-slide-in">
              Welcome Back!
            </div>
          )}

          <h2 className="text-3xl font-bold text-gray-800">Welcome Back</h2>
          <p className="text-sm text-gray-500 mt-2">
            Please enter your credentials to access the portal.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">

            {/* EMAIL */}
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase">
                Email
              </label>

              <div className="flex items-center bg-blue-100 mt-2 px-3 py-2 rounded-xl">
                <Mail size={16} className="text-gray-400" />
                <input
                  type="email"
                  className="bg-transparent outline-none ml-2 w-full text-sm"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <div className="flex justify-between">
                <label className="text-xs font-bold text-gray-600 uppercase">
                  Password
                </label>
                <span className="text-xs text-orange-500 cursor-pointer">
                  Forgot password?
                </span>
              </div>

              <div className="flex items-center bg-blue-100 mt-2 px-3 py-2 rounded-xl">
                <Lock size={16} className="text-gray-400" />
                <input
                  type="password"
                  className="bg-transparent outline-none ml-2 w-full text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* REMEMBER */}
            <label className="flex items-center text-xs text-gray-500 gap-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember this device
            </label>

            {/* ERROR */}
            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}

            {/* BUTTON */}
            <button className="w-full bg-[#062b63] text-white py-3 rounded font-semibold hover:bg-[#041f49]">
              Log In →
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-6">
           Need an account? Contact your administrator{" "}
          </p>

        </div>
      </div>
    </div>
  );
}
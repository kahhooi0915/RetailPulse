import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("BRANCH_STAFF");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchBranches();
  }, []);

  const showToast = (type, message) => {
    setToast({ type, message });

    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/branches");
      const data = await res.json();

      if (res.ok) {
        setBranches(data);
      } else {
        showToast("error", data.message || "Failed to load branches");
      }
    } catch (error) {
      showToast("error", "Cannot connect to backend for branches.");
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!name || !email || !phone || !password || !confirmPassword || !role || !branchId) {
      showToast("error", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      showToast("error", "Password and confirm password do not match.");
      return;
    }

    try {
      const res = await fetch("http://127.0.0.1:5000/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          role,
          branch_id: parseInt(branchId)
        })
      });

      const data = await res.json();

      if (res.ok) {
        showToast("success", "Account created successfully. You can sign in now.");
        setTimeout(() => {
          navigate("/");
        }, 1500);
      } else {
        showToast("error", data.message || "Registration failed.");
      }
    } catch (error) {
      showToast("error", "Unable to connect to the server.");
    }
  };

  return (
    <div className="split-auth-page">
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="split-left-panel">
        <div className="brand-box">
          <div className="brand-icon">📊</div>
          <h1>RETAILPULSE</h1>
        </div>

        <div className="hero-content">
          <h2>
            Manage every branch.
            <br />
            <span>Track every sale.</span>
          </h2>

          <p>
            Real-time inventory tracking and sales analytics across all your
            retail locations in one powerful dashboard.
          </p>

          <div className="stats-row">
            <div>
              <h3>50+</h3>
              <span>Branches</span>
            </div>
            <div>
              <h3>100K+</h3>
              <span>Products Tracked</span>
            </div>
            <div>
              <h3>99.9%</h3>
              <span>Uptime</span>
            </div>
          </div>
        </div>

        <div className="copyright">© 2026 RetailPulse. All rights reserved.</div>
      </div>

      <div className="split-right-panel">
        <div className="login-card">
          <h2>Create your account</h2>
          <p>Get started with RetailPulse in seconds</p>

          <form onSubmit={handleRegister}>
            <label>Full name</label>
            <input
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <label>Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label>Phone</label>
            <input
              type="text"
              placeholder="0123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

            <label>Role</label>
            <select
              className="register-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="BRANCH_STAFF">Branch Staff</option>
              <option value="INVENTORY_MANAGER">Inventory Manager</option>
            </select>

            <label>Branch</label>
            <select
              className="register-select"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              required
              disabled={loadingBranches}
            >
              <option value="">
                {loadingBranches ? "Loading branches..." : "Select branch"}
              </option>
              {branches.map((branch) => (
                <option key={branch.branch_id} value={branch.branch_id}>
                  {branch.branch_name}
                </option>
              ))}
            </select>

            <label>Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>

            <label>Confirm password</label>
            <div className="password-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? "🙈" : "👁"}
              </button>
            </div>

            <button type="submit" className="signin-btn">
              Create account
            </button>
          </form>

          <p className="bottom-switch">
            Already have an account? <Link to="/">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
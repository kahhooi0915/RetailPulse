import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
  e.preventDefault();

  try {
    const response = await fetch("http://localhost:5000/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email,
        password: password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Invalid email or password");
      return;
    }

    localStorage.setItem("user", JSON.stringify(data));

    if (data.role === "SYSTEM_ADMIN") {
      navigate("/admin");
    } else if (data.role === "BRANCH_STAFF") {
      navigate("/staff-pos");
    } else if (data.role === "INVENTORY_MANAGER") {
      navigate("/manager");
    } else {
      alert("Unknown user role.");
    }

  } catch (error) {
    console.error("Login error:", error);
    alert("Cannot connect to backend server. Please make sure Flask is running.");
  }
};

  return (
    <div className="login-page">
      <section className="login-left">
        <div className="brand">
          <div className="brand-icon">▥</div>
          <span>RETAILPULSE</span>
        </div>

        <div className="hero-content">
          <h1>
            Manage every branch.
            <br />
            <span>Track every sale.</span>
          </h1>

          <p>
            Real-time inventory tracking and sales analytics across
            <br />
            all your retail locations in one powerful dashboard.
          </p>

          <div className="stats">
            <div>
              <strong>50+</strong>
              <span>Branches</span>
            </div>
            <div>
              <strong>100K+</strong>
              <span>Products Tracked</span>
            </div>
            <div>
              <strong>99.9%</strong>
              <span>Uptime</span>
            </div>
          </div>
        </div>

        <p className="copyright">© 2026 RetailPulse. All rights reserved.</p>
      </section>

      <section className="login-right">
        <div className="login-form-wrap">
          <h2>Welcome back</h2>
          <p className="subtitle">
            Enter your credentials to access your dashboard
          </p>

          <form onSubmit={handleLogin}>
            <label>Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="password-label">
              <label>Password</label>
              <a href="/">Forgot password?</a>
            </div>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button type="submit">Sign in</button>
          </form>

          <p className="access-note">
            Accounts are created by your administrator. Contact them if you need
            access.
          </p>
        </div>
      </section>
    </div>
  );
}
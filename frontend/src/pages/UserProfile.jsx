import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  BarChart3,
  User,
  LogOut,
  HelpCircle,
  Bell,
  Settings,
  Save,
  ShieldCheck,
  Mail,
  Phone,
  BadgeCheck,
  Building2,
  KeyRound,
  IdCard,
  Truck,
  Boxes,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

export default function UserProfile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
  name: "",
  phone: "",
  country_code: "+60",
  email: "",
  role: "",
  user_code: "",
  branch_id: "",
  branch_name: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const savedUser =
      JSON.parse(sessionStorage.getItem("user")) ||
      JSON.parse(sessionStorage.getItem("user"));

    if (!savedUser) {
      navigate("/");
      return;
    }

    setUser(savedUser);
    fetchUser(savedUser.user_id);
  }, [navigate]);

  const fetchUser = async (userId) => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`);
      const data = await res.json();

      setForm({
        name: data.name || "",
        phone: data.phone || "",
        country_code: data.country_code || "+60",
        email: data.email || "",
        role: data.role || "",
        user_code: data.user_code || "",
        branch_id: data.branch_id || "",
        branch_name: data.branch_name || "",
      });
    } catch (err) {
      console.error(err);
      alert("Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    let { name, value } = e.target;

    if (name === "phone") {
        value = value.replace(/\D/g, "");

        if (form.country_code === "+60") {
        value = value.slice(0, 10);

        if (value.length > 3) {
            value = value.slice(0, 3) + "-" + value.slice(3);
        }
        } else {
        value = value.slice(0, 12);
        }
    }

    setForm({
        ...form,
        [name]: value,
    });
    };

  const saveProfile = async () => {
    if (!form.name.trim()) {
      alert("Name is required.");
      return;
    }

    if (!form.phone.trim()) {
      alert("Phone is required.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: form.name,
        phone: `${form.country_code}${form.phone.replace(/\D/g, "")}`,
        email: form.email,
        role: form.role,
        branch_id: form.branch_id || null,
        };

      const validatePhone = () => {
        if (form.country_code === "+60") {
            return /^01\d-\d{7}$/.test(form.phone);
        }

        return /^\d{6,12}$/.test(form.phone);
        };

        if (!validatePhone()) {
        alert(
            form.country_code === "+60"
            ? "Phone number must follow Malaysia format: 019-9999999"
            : "Phone number must contain 6 to 12 digits."
        );
        return;
        }

      const res = await fetch(`${API_BASE}/admin/users/${user.user_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Failed to update profile.");
        return;
      }

      const updatedUser = {
        ...user,
        name: form.name,
        phone: form.phone,
      };

      sessionStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);

      alert("Profile updated successfully.");
    } catch (err) {
      console.error(err);
      alert("Server error while updating profile.");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("user");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#eef6fb] text-[#6f85a3]">
        <p className="font-semibold">Loading profile...</p>
      </div>
    );
  }

  const isManager = form.role === "INVENTORY_MANAGER";
  const profileTitle = isManager ? "Manager Profile" : "Staff Profile";
  const roleIdLabel = isManager ? "Manager ID" : "Staff ID";

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
              {form.branch_name || "Branch"}
            </h4>
            <p className="mt-1 text-xs text-[#6f85a3]">
              {roleIdLabel}: {user?.user_id}
            </p>
          </div>

          <nav className="space-y-3">
            {isManager ? (
              <>
                <button
                  onClick={() => navigate("/manager-dashboard")}
                  className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                >
                  <BarChart3 size={18} />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={() => navigate("/manager-stock-transfer")}
                  className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                >
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
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate("/staff")}
                  className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                >
                  <ShoppingCart size={18} />
                  <span>POS Terminal</span>
                </button>

                <button
                  onClick={() => navigate("/staff-analytics")}
                  className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                >
                  <BarChart3 size={18} />
                  <span>Analytics</span>
                </button>
              </>
            )}
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

          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-[#07102f]">
                {profileTitle}  
              </h1>
              <p className="mt-1 text-sm text-[#6f85a3]">
                Manage your personal information. Email, role, user code and password are controlled by admin.
              </p>
            </div>

            <div className="relative flex items-center gap-3">
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
                {form.name?.charAt(0)?.toUpperCase() || "U"}
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

                    {/* INFO CARDS */}
          <section className="mb-6 grid grid-cols-3 gap-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                Account Status
              </p>
              <h3 className="mt-3 text-2xl font-extrabold text-green-600">
                Active
              </h3>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                Branch
              </p>
              <h3 className="mt-3 truncate text-2xl font-extrabold">
                {form.branch_name || "-"}
              </h3>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                Role
              </p>
              <h3 className="mt-3 truncate text-2xl font-extrabold">
                {form.role}
              </h3>
            </div>
          </section>
      
          <section className="grid grid-cols-[1.5fr_0.8fr] gap-6">
            {/* PERSONAL INFO */}
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="text-orange-700" size={24} />
                  <h2 className="text-2xl font-extrabold text-[#07102f]">
                    Personal Information
                  </h2>
                </div>

                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-[#0c2f73] px-6 py-3 font-bold text-white shadow hover:bg-[#103986] disabled:opacity-60"
                >
                  <Save size={17} />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <ProfileInput
                  label="User ID"
                  icon={<IdCard size={15} />}
                  value={user?.user_id}
                  disabled
                />

                <ProfileInput
                  label="User Code"
                  icon={<BadgeCheck size={15} />}
                  value={form.user_code}
                  disabled
                />

                <ProfileInput
                  label="Name"
                  icon={<User size={15} />}
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                />

                <ProfileInput
                  label="Email"
                  icon={<Mail size={15} />}
                  value={form.email}
                  disabled
                />

              <div>
                <label className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#4c5f7a]">
                    <Phone size={15} />
                    Phone
                </label>

                <div className="flex gap-3">
                    {/* Country Code */}
                    <select
                    name="country_code"
                    value={form.country_code}
                    onChange={(e) =>
                        setForm({
                        ...form,
                        country_code: e.target.value,
                        phone: "", // reset phone when change country
                        })
                    }
                    className="w-28 rounded-lg bg-[#d8eef9] px-3 py-4 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#0c2f73]"
                    >
                    <option value="+60">MY +60</option>
                    <option value="+65">SG +65</option>
                    <option value="+62">ID +62</option>
                    <option value="+66">TH +66</option>
                    <option value="+86">CN +86</option>
                    </select>

                    {/* Phone Input */}
                    <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    inputMode="numeric"
                    placeholder={
                        form.country_code === "+60" ? "019-9999999" : "Phone number"
                    }
                    className="h-13 w-full rounded-lg bg-[#d8eef9] px-4 py-4 text-sm font-semibold text-[#07102f] outline-none focus:ring-2 focus:ring-[#0c2f73]"
                    />
                </div>
                </div>

                <ProfileInput
                  label="Password"
                  icon={<KeyRound size={15} />}
                  value="••••••••"
                  disabled
                />

                <ProfileInput
                  label="Role"
                  icon={<ShieldCheck size={15} />}
                  value={form.role}
                  disabled
                />

                <ProfileInput
                  label="Branch"
                  icon={<Building2 size={15} />}
                  value={form.branch_name || `Branch ID: ${form.branch_id}`}
                  disabled
                />
              </div>
            </div>

            {/* SECURITY PANEL */}
            <div className="rounded-3xl bg-[#dff3fc] p-8 shadow-sm border-l-4 border-[#0c2f73]">
              <div className="mb-7 flex items-center gap-3">
                <ShieldCheck className="text-orange-700" size={24} />
                <h2 className="text-2xl font-extrabold text-[#07102f]">
                  Account Security
                </h2>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl bg-white p-5">
                  <p className="font-extrabold text-[#07102f]">Password</p>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Password cannot be changed here. Please contact admin.
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-5">
                  <p className="font-extrabold text-[#07102f]">Role Access</p>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Your role is assigned by system admin only.
                  </p>
                </div>

                <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                  <p className="font-extrabold text-red-600">
                    Restricted Fields
                  </p>
                  <p className="mt-1 text-sm text-red-500">
                    Email, role, user code and password are locked.
                  </p>
                </div>
              </div>
            </div>
          </section>
          </motion.main>

             {/* HELP SUPPORT MODAL */}
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

            <div className="space-y-5 text-sm text-[#17325c]">
                <div>
                <h3 className="mb-2 font-extrabold">Quick Help</h3>
                <p>• Update your profile information</p>
                <p>• Check your branch and role</p>
                <p>• Contact admin for password change</p>
                </div>

                <div className="border-t pt-4">
                <h3 className="mb-2 font-extrabold">Contact Support</h3>
                <p>WhatsApp: 017-7032568</p>
                <p>Email: support@retailpulse.com</p>
                </div>

                <div className="rounded-2xl bg-[#eef6fb] p-4">
                <h3 className="mb-1 font-extrabold">System Status</h3>
                <p className="font-bold text-green-600">● Active</p>
                </div>
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
                    className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold"
                    >
                    ✕
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl bg-[#eef6fb] p-4">
                    <p className="font-extrabold text-[#17325c]">Profile Updated</p>
                    <p className="mt-1 text-sm text-[#6f84a1]">
                        Your account information is up to date.
                    </p>
                    </div>

                    <div className="rounded-2xl bg-[#eef6fb] p-4">
                    <p className="font-extrabold text-[#17325c]">Reminder</p>
                    <p className="mt-1 text-sm text-[#6f84a1]">
                        Contact admin if you need password changes.
                    </p>
                    </div>
                </div>
                </div>
            </div>
            )}            
      </div>
    </div>
    
  );
}

function ProfileInput({ label, icon, disabled, ...props }) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#4c5f7a]">
        {icon}
        {label}
      </label>

      <input
        {...props}
        disabled={disabled}
        className={`h-13 w-full rounded-lg px-4 py-4 text-sm font-semibold outline-none ${
          disabled
            ? "cursor-not-allowed bg-[#d8eef9] text-[#5b718d]"
            : "bg-[#d8eef9] text-[#07102f] focus:ring-2 focus:ring-[#0c2f73]"
        }`}
      />
    </div>
  );
}
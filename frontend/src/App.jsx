import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Staff from "./pages/Staff";
import Manager from "./pages/Manager";
import StaffAnalytics from "./pages/StaffAnalytics";
import UserProfile from "./pages/UserProfile";
import ManagerStockTransfer from "./pages/ManagerStockTransfer";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagerBranchInventory from "./pages/ManagerBranchInventory";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/staff-analytics" element={<StaffAnalytics />} />
        <Route path="/user-profile" element={<UserProfile />} />
        <Route path="/manager-stock-transfer" element={<ManagerStockTransfer />} />
        <Route path="/manager-dashboard" element={<ManagerDashboard />} />
        <Route path="/manager-inventory" element={<ManagerBranchInventory />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
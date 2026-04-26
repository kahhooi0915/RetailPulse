import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Staff from "./pages/Staff";
import Manager from "./pages/Manager";
import StaffAnalytics from "./pages/StaffAnalytics";
import UserProfile from "./pages/UserProfile";

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
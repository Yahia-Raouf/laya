import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          <span className="mark">◆</span> Laya
        </div>
        <nav className="tabs">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/keys">API Keys</NavLink>
          <NavLink to="/playground">Playground</NavLink>
          <NavLink to="/logs">Request Logs</NavLink>
          <NavLink to="/audit">Audit Log</NavLink>
        </nav>
        <div className="userchip">
          <span className="muted small">{username}</span>
          <button className="btn ghost small" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

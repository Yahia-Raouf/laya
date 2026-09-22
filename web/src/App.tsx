import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Keys from "./pages/Keys";
import Playground from "./pages/Playground";
import Logs from "./pages/Logs";
import Audit from "./pages/Audit";

function Protected({ children }: { children: JSX.Element }) {
  const { loading, authenticated } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  return authenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="keys" element={<Keys />} />
            <Route path="playground" element={<Playground />} />
            <Route path="logs" element={<Logs />} />
            <Route path="audit" element={<Audit />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import React, { useState, useEffect } from "react";
import Login from "./pages/Login";
import DashboardGerente from "./pages/DashboardGerente";
import DashboardCoordenador from "./pages/DashboardCoordenador";
import DashboardSupervisor from "./pages/DashboardSupervisor";

function App() {
  const [user, setUser] = useState(null);

  // Forca novo login em cada acesso: limpa sessao ao montar
  useEffect(() => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch {}
    setUser(null);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
  };

  // Se nao estiver logado, vai direto pro login
  if (!user) return <Login onLogin={setUser} />;

  // Redireciona automaticamente para o painel correto
  if (user.role === "gerente") {
    return <DashboardGerente user={user} onLogout={handleLogout} />;
  }

  if (user.role === "coordenador") {
    return <DashboardCoordenador user={user} onLogout={handleLogout} />;
  }

  if (user.role === "supervisor") {
    return <DashboardSupervisor user={user} onLogout={handleLogout} />;
  }

  // Caso role ainda nao implementado
  return (
    <div
      style={{
        color: "white",
        backgroundColor: "#0f1e33",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <h2>Painel em construcao</h2>
      <p>Este nivel de usuario ainda nao foi implementado.</p>
      <button
        style={{
          marginTop: "20px",
          background: "#1e4d8a",
          color: "white",
          border: "none",
          padding: "10px 20px",
          borderRadius: "6px",
          cursor: "pointer",
        }}
        onClick={handleLogout}
      >
        Voltar ao Login
      </button>
    </div>
  );
}

export default App;

import React, { useState } from "react";
import { login } from "../utils/api";
import "./styles/login.css";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    try {
      const data = await login(username, password);
      if (data && data.token) {
        onLogin(data.user);
      } else {
        setErro("Usuario ou senha invalidos");
      }
    } catch (err) {
      setErro("Falha ao conectar ao servidor");
    }
  };

  return (
    <div className="login-container">
      <h2>Sistema de Metas</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Usuário"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Entrar</button>
        {erro && <p className="erro">{erro}</p>}
      </form>
    </div>
  );
}

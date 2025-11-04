const API_URL = "http://192.168.1.82:5000";
const IS_DEV = process.env.NODE_ENV !== "production";

async function request(endpoint, method = "GET", body = null, token = true) {
  const base = process.env.REACT_APP_API_URL || API_URL;

  const headers = { "Content-Type": "application/json" };
  const userToken = localStorage.getItem("token");
  if (token && userToken) {
    headers["Authorization"] = `Bearer ${userToken}`;
    if (IS_DEV) console.log(`Token incluido na requisicao: ${userToken.slice(0, 25)}...`);
  } else if (token) {
    if (IS_DEV) console.warn(`Nenhum token encontrado ao chamar ${endpoint}`);
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  if (IS_DEV) console.log(`Enviando requisicao para ${base}${endpoint}`, options);

  try {
    const resp = await fetch(`${base}${endpoint}`, options);
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`Erro na requisicao (${endpoint}):`, text);
      throw new Error(text);
    }
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error(`Falha de conexao com o servidor (${endpoint}):`, err);
    return null;
  }
}

export async function login(username, password) {
  const resp = await request("/api/auth/login", "POST", { username, password }, false);
  if (resp?.token) {
    localStorage.setItem("token", resp.token);
    localStorage.setItem("user", JSON.stringify(resp.user));
    if (IS_DEV) console.log("OK. Login bem-sucedido:", resp.user.username);
  } else {
    console.error("Falha no login:", resp);
  }
  return resp;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (IS_DEV) console.log("Logout realizado. Limpando dados locais.");
  window.location.reload();
}

export async function getSubordinados() {
  const resp = await request("/api/subordinados", "GET");
  return resp || [];
}

export async function getMinhasMetas() {
  const resp = await request("/api/metas/minhas", "GET");
  return resp || [];
}

export async function getMetasEquipe() {
  const resp = await request("/api/metas/equipe", "GET");
  return resp || [];
}

export async function criarMeta(meta) {
  const resp = await request("/api/metas", "POST", meta);
  return resp;
}

export async function criarMetasLote(usuario_id, metas) {
  const body = { usuario_id, metas };
  const resp = await request("/api/metas/lote", "POST", body);
  return resp;
}

export function getUser() {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
}

export function getToken() {
  return localStorage.getItem("token");
}

export { API_URL };


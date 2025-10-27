import os
from flask import Flask, request, jsonify
from flask_cors import cross_origin
import psycopg2
import psycopg2.extras
from werkzeug.security import check_password_hash
import jwt
from functools import wraps
from datetime import datetime, timedelta, timezone
from calendar import monthrange

# =========================================================
# 🔹 Configurações Flask e CORS (compatível com Railway)
# =========================================================
app = Flask(__name__)

# 🔹 Adiciona headers CORS manualmente após cada resposta
@app.after_request
def aplicar_cors(response):
    allowed_origin = os.getenv("CORS_ORIGINS", "https://incredible-nature-production.up.railway.app")
    response.headers.add("Access-Control-Allow-Origin", allowed_origin)
    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    response.headers.add("Access-Control-Allow-Credentials", "true")
    return response

# 🔹 Rota genérica para interceptar preflight (OPTIONS)
@app.before_request
def handle_options():
    if request.method == "OPTIONS":
        resp = app.make_default_options_response()
        headers = resp.headers

        allowed_origin = os.getenv("CORS_ORIGINS", "https://incredible-nature-production.up.railway.app")
        headers["Access-Control-Allow-Origin"] = allowed_origin
        headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
        headers["Access-Control-Allow-Credentials"] = "true"

        return resp

@app.route("/api/<path:path>", methods=["OPTIONS"])
@cross_origin()
def preflight(path):
    response = jsonify({"status": "ok"})
    response.headers.add("Access-Control-Allow-Origin", os.getenv("CORS_ORIGINS", "*"))
    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    response.headers.add("Access-Control-Allow-Credentials", "true")
    return response

# =========================================================
# 🔹 Configurações gerais
# =========================================================
JWT_SECRET = os.getenv("JWT_SECRET", "chave-super-secreta")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", 8))

# =========================================================
# 🔹 Conexão com o Supabase (Session Pooler IPv4)
# =========================================================
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com"),
    "port": int(os.getenv("DB_PORT", 5432)),
    "dbname": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres.lwuerkloihjqwhkzogtd"),
    "password": os.getenv("DB_PASSWORD", "Omega12#@"),
    "sslmode": os.getenv("DB_SSLMODE", "require"),
}

def get_conn():
    return psycopg2.connect(**DB_CONFIG)

# =========================================================
# 🔹 JWT Helpers
# =========================================================
def gerar_token(user_id, role):
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def autenticar(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = request.headers.get("Authorization")
        if not token:
            return jsonify({"error": "Token não fornecido"}), 401
        try:
            token = token.replace("Bearer ", "")
            data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG], leeway=60)
            request.user = data
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expirado"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Token inválido"}), 401
        except Exception as e:
            return jsonify({"error": f"Erro no token: {str(e)}"}), 401
        return f(*args, **kwargs)
    return wrapper

# =========================================================
# 🔹 Mapeamento de meses
# =========================================================
MESES_MAP = {
    1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
}
MESES_INV = {v: k for k, v in MESES_MAP.items()}

# =========================================================
# 🔹 Rotas
# =========================================================
@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Usuário ou senha inválidos"}), 401

    token = gerar_token(user["id"], user["role"])
    return jsonify({
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    })


@app.route("/api/subordinados", methods=["GET"])
@autenticar
def listar_subordinados():
    user_id = request.user["user_id"]
    role = request.user["role"]

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    if role == "gerente":
        cur.execute("SELECT id, username FROM users WHERE gerente_id = %s", (user_id,))
    elif role == "coordenador":
        cur.execute("SELECT id, username FROM users WHERE coordenador_id = %s", (user_id,))
    elif role == "supervisor":
        cur.execute("SELECT id, username FROM users WHERE supervisor_id = %s", (user_id,))
    else:
        conn.close()
        return jsonify([])

    subordinados = [dict(x) for x in cur.fetchall()]
    conn.close()
    return jsonify(subordinados)

# =========================================================
# 🔹 Criar uma única meta
# =========================================================
@app.route("/api/metas", methods=["POST"])
@autenticar
def criar_meta():
    data = request.get_json()
    usuario_id = data.get("usuario_id")
    codfornec = data.get("codfornec")
    industria = data.get("industria")
    valor_financeiro = data.get("valor_financeiro", 0)
    valor_positivacao = data.get("valor_positivacao", 0)
    mes = data.get("mes")
    ano = int(data.get("ano"))

    if isinstance(mes, int):
        mes_texto = MESES_MAP.get(mes, "Out")
        mes_num = mes
    else:
        mes_texto = mes
        mes_num = MESES_INV.get(mes, 10)

    _, ultimo_dia = monthrange(ano, mes_num)
    data_inicio = f"{ano}-{mes_num:02d}-01"
    data_fim = f"{ano}-{mes_num:02d}-{ultimo_dia:02d}"

    try:
        if industria and str(industria).strip().lower() == "meta geral":
            codfornec = 1
    except Exception:
        pass

    conn = get_conn()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO metas 
            (usuario_id, codfornec, industria, valor_financeiro, valor_positivacao,
             mes, ano, data_inicio, data_fim, criado_por)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (usuario_id, codfornec, industria, mes, ano)
            DO UPDATE SET
                valor_financeiro = EXCLUDED.valor_financeiro,
                valor_positivacao = EXCLUDED.valor_positivacao,
                atualizado_em = CURRENT_TIMESTAMP
        """, (usuario_id, codfornec, industria, valor_financeiro, valor_positivacao,
              mes_texto, ano, data_inicio, data_fim, request.user["user_id"]))
        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

    return jsonify({"success": True, "message": "Meta salva com sucesso"})


# =========================================================
# 🔹 Criar metas em lote
# =========================================================
@app.route("/api/metas/lote", methods=["POST"])
@autenticar
def criar_metas_lote():
    data = request.get_json()
    usuario_id = data.get("usuario_id")
    metas = data.get("metas", [])
    criador = request.user["user_id"]

    if not usuario_id or not metas:
        return jsonify({"error": "Dados incompletos"}), 400

    conn = get_conn()
    cur = conn.cursor()

    try:
        for m in metas:
            codfornec = m.get("codfornec")
            industria = m.get("industria")
            valor_financeiro = m.get("valor_financeiro", 0)
            valor_positivacao = m.get("valor_positivacao", 0)
            mes = m.get("mes")
            ano = int(m.get("ano"))

            if isinstance(mes, int):
                mes_texto = MESES_MAP.get(mes, "Out")
                mes_num = mes
            else:
                mes_texto = mes
                mes_num = MESES_INV.get(mes, 10)

            _, ultimo_dia = monthrange(ano, mes_num)
            data_inicio = f"{ano}-{mes_num:02d}-01"
            data_fim = f"{ano}-{mes_num:02d}-{ultimo_dia:02d}"

            try:
                if industria and str(industria).strip().lower() == "meta geral":
                    codfornec = 1
            except Exception:
                pass

            cur.execute("""
                INSERT INTO metas 
                (usuario_id, codfornec, industria, valor_financeiro, valor_positivacao,
                 mes, ano, data_inicio, data_fim, criado_por)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (usuario_id, codfornec, industria, mes, ano)
                DO UPDATE SET
                    valor_financeiro = EXCLUDED.valor_financeiro,
                    valor_positivacao = EXCLUDED.valor_positivacao,
                    atualizado_em = CURRENT_TIMESTAMP
            """, (usuario_id, codfornec, industria, valor_financeiro, valor_positivacao,
                  mes_texto, ano, data_inicio, data_fim, criador))

        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

    return jsonify({"success": True, "message": "Metas salvas com sucesso"})


# =========================================================
# 🔹 Consultar metas do usuário
# =========================================================
@app.route("/api/metas/minhas", methods=["GET"])
@autenticar
def minhas_metas():
    user_id = request.user["user_id"]
    role = request.user["role"]

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    if role in ("coordenador", "supervisor", "rca"):
        cur.execute("""
            SELECT industria, codfornec, valor_financeiro, valor_positivacao, mes, ano, data_inicio, data_fim
            FROM metas
            WHERE usuario_id = %s
            ORDER BY ano DESC, mes DESC, industria
        """, (user_id,))
    elif role == "gerente":
        cur.execute("""
            SELECT u.username AS usuario_nome, m.industria, m.codfornec,
                   m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
            FROM metas m
            JOIN users u ON u.id = m.usuario_id
            WHERE u.gerente_id = %s
            ORDER BY u.username, m.ano DESC, m.mes DESC
        """, (user_id,))
    else:
        conn.close()
        return jsonify([])

    metas = [dict(x) for x in cur.fetchall()]
    conn.close()
    return jsonify(metas)

# =========================================================
# 🔹 Consultar metas da equipe
# =========================================================
@app.route("/api/metas/equipe", methods=["GET"])
@autenticar
def metas_equipe():
    user_id = request.user["user_id"]
    role = request.user["role"]

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    if role == "gerente":
        cur.execute("""
            SELECT u.username AS usuario_nome, m.industria, m.codfornec,
                   m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
            FROM metas m
            JOIN users u ON u.id = m.usuario_id
            WHERE u.gerente_id = %s
            ORDER BY u.username, m.ano DESC, m.mes DESC
        """, (user_id,))
    elif role == "coordenador":
        cur.execute("""
            SELECT u.username AS usuario_nome, m.industria, m.codfornec,
                   m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
            FROM metas m
            JOIN users u ON u.id = m.usuario_id
            WHERE u.coordenador_id = %s
            ORDER BY u.username, m.ano DESC, m.mes DESC
        """, (user_id,))
    elif role == "supervisor":
        cur.execute("""
            SELECT u.username AS usuario_nome, m.industria, m.codfornec,
                   m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
            FROM metas m
            JOIN users u ON u.id = m.usuario_id
            WHERE u.supervisor_id = %s
            ORDER BY u.username, m.ano DESC, m.mes DESC
        """, (user_id,))
    else:
        conn.close()
        return jsonify([])

    metas = [dict(x) for x in cur.fetchall()]
    conn.close()
    return jsonify(metas)


# =========================================================
# 🔹 Execução no Railway
# =========================================================
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import psycopg2.extras
from werkzeug.security import check_password_hash
import jwt
from functools import wraps
from datetime import datetime, timedelta, timezone
from calendar import monthrange

# =========================================================
# 🔹 1. CONFIGURAÇÃO DE AMBIENTE E CONEXÕES
# =========================================================

# Chave secreta para JWT (pode ser lida do ambiente)
JWT_SECRET = os.getenv("JWT_SECRET", "chave-super-secreta")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", 8))

# Configuração do banco de dados (lê variáveis de ambiente, com defaults para teste)
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com"),
    "port": int(os.getenv("DB_PORT", 5432)),
    "dbname": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres.lwuerkloihjqwhkzogtd"),
    "password": os.getenv("DB_PASSWORD", "Omega12#@"),
    "sslmode": os.getenv("DB_SSLMODE", "require"),
}

# Constante de fornecedores para filtro (usada no Coordenador Atacado)
CODIGOS_FORNECEDOR = {
    "Atacado": [
        "Bombril", "Marata", "JDE", "Bom Principio", "Stela D'Oro", "Realeza",
        "Panasonic", "Mili", "Q-Odor", "Assim", "Albany", "Mat Inset",
        "Florence", "CCM", "Gallo", "Elgin"
    ],
}
FORNECEDORES_ATACADO_LOWER = tuple(f.lower() for f in CODIGOS_FORNECEDOR.get('Atacado', []))


# Mapeamento de meses
MESES_MAP = {
    1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
}
MESES_INV = {v: k for k, v in MESES_MAP.items()}


def get_conn():
    """Cria e retorna uma conexão com o banco de dados."""
    return psycopg2.connect(**DB_CONFIG)

# =========================================================
# 🔹 2. Configurações Flask e CORS (CORRIGIDO)
# =========================================================
app = Flask(__name__)
app.config['SECRET_KEY'] = JWT_SECRET

# ATENÇÃO: Configuração de CORS ajustada para desenvolvimento
CORS_ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(',') 
if os.getenv("FLASK_ENV") == "development" or os.getenv("FLASK_ENV") == None:
    CORS_ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://192.168.1.82:3000", "http://192.168.1.82:5000"])
    
CORS_FINAL_ORIGINS = [o.strip() for o in set(CORS_ALLOWED_ORIGINS) if o.strip()]

CORS(app, resources={r"/*": {"origins": CORS_FINAL_ORIGINS}}, supports_credentials=True)

# =========================================================
# 🔹 3. Funções Auxiliares de Autenticação e Autorização
# =========================================================

def gerar_token(user_id, role):
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def autenticar(f):
    """Decorator para validar o token JWT e passar o objeto request.user."""
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
# 🔹 4. ROTAS
# =========================================================

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT id, username, password_hash, role, nome_completo FROM users WHERE username = %s", (username,))
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
            "role": user["role"],
            "display_name": user.get("nome_completo") or user["username"] 
        }
    })

# =========================================================
# 🔹 Listar Subordinados (AJUSTADO PARA A ROTA ERRADA DO FRONTEND)
# =========================================================
@app.route("/api/subordinados", methods=["GET"])
@autenticar
def listar_subordinados():
    # Usamos o ID do usuário do token (request.user["user_id"])
    user_id = request.user["user_id"] 
    role = request.user["role"]

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    # Busca a role novamente para garantir que a consulta está correta
    cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
    role_check = cur.fetchone()
    if not role_check:
         conn.close()
         return jsonify({"error": "Usuário não encontrado."}), 404
    
    role = role_check['role']
    
    # Lógica de consulta usando o ID do token
    if role == "gerente":
        cur.execute("""
            SELECT id, username, nome_completo, role
            FROM users 
            WHERE gerente_id = %s AND role = 'coordenador' 
            ORDER BY nome_completo
        """, (user_id,))
        
    elif role == "coordenador":
        cur.execute("""
            SELECT id, username, nome_completo, role 
            FROM users 
            WHERE coordenador_id = %s AND role = 'supervisor'
            ORDER BY nome_completo
        """, (user_id,))
        
    elif role == "supervisor":
        cur.execute("""
            SELECT id, username, nome_completo, role 
            FROM users 
            WHERE supervisor_id = %s AND role = 'rca'
            ORDER BY nome_completo
        """, (user_id,))
        
    else:
        conn.close()
        return jsonify([])

    subordinados = [dict(x) for x in cur.fetchall()]
    conn.close()
    return jsonify(subordinados)

# =========================================================
# 🔹 Criar metas em lote (CORRIGIDO: Adiciona usuario_codigo)
# =========================================================
@app.route("/api/metas/lote", methods=["POST"])
@autenticar
def criar_metas_lote():
    data = request.get_json()
    usuario_id_alvo = data.get("usuario_id")
    metas = data.get("metas", [])
    criador = request.user["user_id"]

    if not usuario_id_alvo or not metas:
        return jsonify({"error": "Dados incompletos"}), 400

    conn = get_conn()
    cur = conn.cursor()

    try:
        # 1. BUSCAR O CÓDIGO (USERNAME) A SER SALVO
        cur.execute("SELECT username FROM users WHERE id = %s", (usuario_id_alvo,))
        user_code = cur.fetchone()
        if not user_code:
            raise Exception(f"ID do usuário alvo {usuario_id_alvo} não encontrado na tabela users. Sincronize os usuários.")
        usuario_codigo = user_code[0] 
        
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

            # 2. INCLUIR O NOVO CAMPO NA CONSULTA SQL
            cur.execute("""
                INSERT INTO metas 
                (usuario_id, usuario_codigo, codfornec, industria, valor_financeiro, valor_positivacao,
                 mes, ano, data_inicio, data_fim, criado_por)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (usuario_id, codfornec, industria, mes, ano)
                DO UPDATE SET
                    valor_financeiro = EXCLUDED.valor_financeiro,
                    valor_positivacao = EXCLUDED.valor_positivacao,
                    usuario_codigo = EXCLUDED.usuario_codigo, 
                    atualizado_em = CURRENT_TIMESTAMP
            """, (usuario_id_alvo, usuario_codigo, codfornec, industria, valor_financeiro, valor_positivacao,
                  mes_texto, ano, data_inicio, data_fim, criador))

        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": f"Erro ao salvar metas: {str(e)}"}), 500
    finally:
        conn.close()

    return jsonify({"success": True, "message": "Metas salvas com sucesso"})

# =========================================================
# 🔹 Metas Pessoais (/api/metas/minhas)
# =========================================================
@app.route("/api/metas/minhas", methods=["GET"])
@autenticar
def minhas_metas():
    user_id = request.user["user_id"]
    
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("""
        SELECT industria, codfornec, valor_financeiro, valor_positivacao, mes, ano, data_inicio, data_fim, usuario_codigo
        FROM metas
        WHERE usuario_id = %s
        ORDER BY ano DESC, mes DESC, industria
    """, (user_id,))

    metas = [dict(x) for x in cur.fetchall()]
    conn.close()
    return jsonify(metas)


# =========================================================
# 🔹 Metas da Equipe (/api/metas/equipe)
# =========================================================
@app.route("/api/metas/equipe", methods=["GET"])
@autenticar
def metas_equipe():
    user_id = request.user["user_id"]
    
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("SELECT role, username FROM users WHERE id = %s", (user_id,))
    user_data = cur.fetchone()
    if not user_data:
        conn.close()
        return jsonify({"error": "Usuário não encontrado."})
    
    role = user_data['role']
    user_username = user_data['username'] 

    if role == "gerente":
        cur.execute("""
            SELECT u.nome_completo AS usuario_nome, m.usuario_codigo,
                   m.industria, m.codfornec, m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
            FROM metas m
            JOIN users u ON u.id = m.usuario_id
            WHERE u.gerente_id = %s
            ORDER BY u.nome_completo, m.ano DESC, m.mes DESC
        """, (user_id,))

    elif role == "coordenador":
        
        # Filtro Atacado usando o código de usuário (Chave de Negócio)
        if user_username == '2' and FORNECEDORES_ATACADO_LOWER:
            placeholders = ','.join(['%s'] * len(FORNECEDORES_ATACADO_LOWER))

            query = f"""
                SELECT u.nome_completo AS usuario_nome, m.usuario_codigo,
                       m.industria, m.codfornec, m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
                FROM metas m
                JOIN users u ON u.id = m.usuario_id
                WHERE u.coordenador_id = %s
                  AND LOWER(m.industria) IN ({placeholders})
                ORDER BY u.nome_completo, m.ano DESC, m.mes DESC
            """
            params = (user_id,) + FORNECEDORES_ATACADO_LOWER
            cur.execute(query, params)
        else:
             cur.execute("""
                SELECT u.nome_completo AS usuario_nome, m.usuario_codigo,
                       m.industria, m.codfornec, m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
                FROM metas m
                JOIN users u ON u.id = m.usuario_id
                WHERE u.coordenador_id = %s
                ORDER BY u.nome_completo, m.ano DESC, m.mes DESC
            """, (user_id,))


    elif role == "supervisor":
        cur.execute("""
            SELECT u.nome_completo AS usuario_nome, m.usuario_codigo, 
                   m.industria, m.codfornec, m.valor_financeiro, m.valor_positivacao, m.mes, m.ano, m.data_inicio, m.data_fim
            FROM metas m
            JOIN users u ON u.id = m.usuario_id
            WHERE u.supervisor_id = %s
            ORDER BY u.nome_completo, m.ano DESC, m.mes DESC
        """, (user_id,))
    else:
        conn.close()
        return jsonify({"error": "Acesso negado ou role inválida."})

    metas = [dict(x) for x in cur.fetchall()]
    conn.close()
    return jsonify(metas)

# =========================================================
# 🔹 Bloco de Execução (Modo de Desenvolvimento)
# =========================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get("FLASK_ENV") == "development")
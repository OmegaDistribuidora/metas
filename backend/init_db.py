# Arquivo: init_db.py (FINAL PARA PREPARAR O ESQUEMA)
import psycopg2
from werkzeug.security import generate_password_hash
import os

# [Configurações e get_conn() omitidas por brevidade]
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com"),
    "port": int(os.getenv("DB_PORT", 5432)),
    "dbname": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres.lwuerkloihjqwhkzogtd"),
    "password": os.getenv("DB_PASSWORD", "Omega12#@"),
    "sslmode": os.getenv("DB_SSLMODE", "require")
}


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # =====================================================
    # 🔹 Criação da tabela de usuários
    # =====================================================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nome_completo TEXT,
            role TEXT NOT NULL CHECK(role IN ('gerente', 'coordenador', 'supervisor')),
            gerente_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            coordenador_id INTEGER REFERENCES users(id) ON DELETE SET NULL
        );
    """)

    # Evolucao do schema: Adiciona supervisor_id e garante a role 'rca'
    cur.execute("""
        DO $$
        BEGIN
            -- 1. ADICIONA supervisor_id
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'supervisor_id'
            ) THEN
                ALTER TABLE users ADD COLUMN supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            END IF;
            
            -- 2. ADICIONA nome_completo (Se não existir, embora já esteja no CREATE TABLE acima, é redundância segura)
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'nome_completo'
            ) THEN
                ALTER TABLE users ADD COLUMN nome_completo TEXT;
            END IF;

        END$$;
    """)
    
    # Atualiza a constraint de role para incluir 'rca'
    try:
        cur.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;")
    except Exception:
        pass
    cur.execute("""
        ALTER TABLE users
        ADD CONSTRAINT users_role_check CHECK (role IN ('gerente','coordenador','supervisor','rca'))
    """)

    # =====================================================
    # 🔹 CRIAÇÃO DAS 3 TABELAS DE ORIGEM (Para staging)
    # =====================================================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS gerentes_winthor (
            codgerente TEXT PRIMARY KEY,
            nomegerente TEXT
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS supervisores_winthor (
            codsupervisor TEXT PRIMARY KEY,
            nome TEXT,
            posicao TEXT,
            codgerente TEXT
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS rcas_winthor (
            codusur TEXT PRIMARY KEY,
            nome TEXT,
            codsup_perf TEXT,
            codsup_orig TEXT
        );
    """)

    # =====================================================
    # 🔹 Criação da tabela de metas (AGORA COM usuario_codigo)
    # =====================================================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS metas (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            usuario_codigo TEXT NOT NULL, -- <--- NOVO CAMPO: CÓDIGO DO WINTHOR
            codfornec INTEGER,
            industria TEXT NOT NULL,
            valor_financeiro NUMERIC(14,2) DEFAULT 0,
            valor_positivacao NUMERIC(14,2) DEFAULT 0,
            mes TEXT CHECK (
                mes IN ('Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez')
            ),
            ano INTEGER NOT NULL,
            data_inicio DATE NOT NULL,
            data_fim DATE NOT NULL,
            criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (usuario_id, codfornec, industria, mes, ano)
        );
    """)

    # =====================================================
    # 🔹 Inserção do Gerente Supremo "Diego"
    # =====================================================
    def add_user(username, role, nome_completo, gerente_id=None, coordenador_id=None, supervisor_id=None):
        senha = generate_password_hash("123")
        cur.execute("""
            INSERT INTO users (username, password_hash, nome_completo, role, gerente_id, coordenador_id, supervisor_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (username) DO UPDATE SET
                nome_completo = EXCLUDED.nome_completo,
                role = EXCLUDED.role;
        """, (username, senha, nome_completo, role, gerente_id, coordenador_id, supervisor_id))

    # Garante que 'Diego' é o gerente principal.
    add_user("Diego", "gerente", "Diego - Gerente Supremo")
    conn.commit()
    conn.close()

    print("🟢 Banco recriado com sucesso — Estrutura final pronta para sincronização!")


if __name__ == "__main__":
    init_db()

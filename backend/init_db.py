import psycopg2
from werkzeug.security import generate_password_hash

DB_CONFIG = {
    "host": "aws-1-sa-east-1.pooler.supabase.com",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres.lwuerkloihjqwhkzogtd",
    "password": "Omega12#@",
    "sslmode": "require"
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
            role TEXT NOT NULL CHECK(role IN ('gerente', 'coordenador', 'supervisor')),
            gerente_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            coordenador_id INTEGER REFERENCES users(id) ON DELETE SET NULL
        );
    """)

    # Evolucao do schema: supervisor_id e role 'rca'
    cur.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'supervisor_id'
            ) THEN
                ALTER TABLE users ADD COLUMN supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
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
    # 🔹 Criação da tabela de metas (nova versão)
    # =====================================================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS metas (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    conn.commit()

    # =====================================================
    # 🔹 Inserção de usuários iniciais
    # =====================================================
    def add_user(username, role, gerente_id=None, coordenador_id=None, supervisor_id=None):
        senha = generate_password_hash("123")
        cur.execute("""
            INSERT INTO users (username, password_hash, role, gerente_id, coordenador_id, supervisor_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (username) DO NOTHING;
        """, (username, senha, role, gerente_id, coordenador_id, supervisor_id))

    # Gerente principal
    add_user("Diego", "gerente")
    conn.commit()

    # Captura o ID do gerente para vincular coordenadores
    cur.execute("SELECT id FROM users WHERE username = 'Diego'")
    gerente_id = cur.fetchone()[0]

    # Coordenadores
    coords = ["Genildo", "Marlon", "Arleilson", "Atacado", "Televendas"]
    for nome in coords:
        add_user(nome, "coordenador", gerente_id=gerente_id)
    conn.commit()

    # Pega IDs dos coordenadores
    cur.execute("SELECT username, id FROM users WHERE role = 'coordenador'")
    coord_ids = {nome: uid for nome, uid in cur.fetchall()}

    # Supervisores vinculados
    supervisores = {
        "Arleilson": ["James", "Junior", "Felipe", "Odizio", "Arleilson"],
        "Marlon": ["Eliandro", "Fábio", "Willam"],
        "Genildo": ["Anderson", "Marcos", "Edmundo", "Genildo"],
        "Atacado": [],
        "Televendas": []
    }

    for coord_nome, sups in supervisores.items():
        coord_id = coord_ids.get(coord_nome)
        for sup_nome in sups:
            add_user(sup_nome, "supervisor", gerente_id=gerente_id, coordenador_id=coord_id)

    conn.commit()

    # ====== Criacao de RCAs (subordinados aos supervisores) ======
    cur = conn.cursor()
    cur.execute("SELECT id, username, coordenador_id FROM users WHERE role = 'supervisor'")
    sups = cur.fetchall()  # [(id, username, coord_id), ...]
    # cria 2 RCAs por supervisor caso nao existam
    for sup_id, sup_nome, coord_id in sups:
        rca1 = f"{sup_nome}-RCA1"
        rca2 = f"{sup_nome}-RCA2"
        add_user(rca1, "rca", gerente_id=gerente_id, coordenador_id=coord_id, supervisor_id=sup_id)
        add_user(rca2, "rca", gerente_id=gerente_id, coordenador_id=coord_id, supervisor_id=sup_id)

    conn.commit()
    conn.close()

    print("🟢 Banco recriado com sucesso — estrutura atualizada!")


if __name__ == "__main__":
    init_db()

# Arquivo: sync_users.py (CÓDIGO FINAL INTEGRADO COM RESTRIÇÕES DO GABARITO)
import os
import psycopg2
import psycopg2.extras
import pyodbc
from werkzeug.security import generate_password_hash
from typing import Dict, List, Tuple, Any

# =========================================================
# 🔹 1. CONFIGURAÇÃO DE AMBIENTE E CONEXÕES
# =========================================================

DB_CONFIG_DESTINO = {
    "host": os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com"),
    "port": int(os.getenv("DB_PORT", 5432)),
    "dbname": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres.lwuerkloihjqwhkzogtd"),
    "password": os.getenv("DB_PASSWORD", "Omega12#@"),
    "sslmode": os.getenv("DB_SSLMODE", "require"),
}

def get_oracle_driver():
    drivers = [d for d in pyodbc.drivers() if "Oracle" in d]
    if not drivers: return "Oracle in OraClient19Home"
    return drivers[-1]

try: DRIVER = get_oracle_driver()
except RuntimeError: DRIVER = "{Oracle Driver Fictício}" 

CONN_STR_ORIGEM = (
    f"DRIVER={{{DRIVER}}};"
    "DBQ=10.85.113.10/wint;" 
    "UID=omega;"            
    "PWD=omega;"            
)

# Constantes
DEFAULT_PASSWORD_HASH = generate_password_hash("123")
TABELA_DESTINO_USERS = "users"
GERENTE_SUPREMO_USERNAME = "Diego"

def get_conn():
    return psycopg2.connect(**DB_CONFIG_DESTINO)

# =========================================================
# 🔹 2. ETL: EXTRAÇÃO DO ORACLE (USANDO RESTRIÇÕES DO GABARITO)
# =========================================================

def execute_oracle_query(sql):
    """Executa a query e retorna a lista de dicionários."""
    conn_origem = None
    try:
        conn_origem = pyodbc.connect(CONN_STR_ORIGEM)
        cur = conn_origem.cursor()
        cur.execute(sql)
        
        columns = [column[0].lower() for column in cur.description]
        data = []
        for row in cur.fetchall():
            row_dict = {col: str(v).strip().upper() if v else '' for col, v in zip(columns, row)}
            data.append(row_dict)
        return data
    except pyodbc.Error as e:
        raise Exception(f"Falha na Extração Oracle: {e}")
    finally:
        if conn_origem: conn_origem.close()


def extract_all_hierarchy() -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """Executa as três extrações validadas (Gerentes, Supervisores, RCAs)."""
    
    # 1. GERENTES (PCGERENTE) - SEM RESTRIÇÕES DE BLOQUEIO/POSICAO, APENAS FILTRO DE NOME
    SQL_GERENTES = "SELECT CODGERENTE, NOMEGERENTE FROM PCGERENTE WHERE NOMEGERENTE NOT IN ('NILTON', 'FRANCISCO AGUIAR')"
    gerentes = execute_oracle_query(SQL_GERENTES)

    # 2. SUPERVISORES (PCSUPERV) - FILTROS DE ATIVO E NOME DO GABARITO
    SQL_SUPERVISORES = """
        SELECT CODSUPERVISOR, NOME, CODGERENTE FROM PCSUPERV 
        WHERE POSICAO = 'A' AND NOME NOT LIKE 'FRANCISCO AGUIAR%' AND NOME NOT LIKE 'NILTON%'
        AND NOME NOT LIKE 'WESLEY%' AND NOME <> 'SUP/JUAZEIRO' AND NOME NOT LIKE 'DIEGO%' AND NOME <> 'E-COMMERCE'
    """
    supervisores = execute_oracle_query(SQL_SUPERVISORES)
    
    # 3. RCAS (SELECT GRANDE) - RESTRIÇÃO 'TIME = OMEGA' E ATIVO
    SQL_RCA = """
        WITH perfom_data AS (
            SELECT 
                TO_CHAR(pcusuari.codusur) AS codusur, pcusuari.nome, TO_CHAR(pcsuperv.codsupervisor) AS codsup_orig,
                CASE WHEN pcusuari.codusur IN (2546,582,2527,1496,1595) THEN (SELECT TO_CHAR(codsupervisor) FROM pcusuari WHERE codusur = 2546)
                     ELSE TO_CHAR(pcusuari.codsupervisor) END AS codsup_perf,
                pcusuari.bloqueio
            FROM pcusuari JOIN pcsuperv ON pcusuari.codsupervisor = pcsuperv.codsupervisor
        )
        SELECT 
            pd.codusur, INITCAP(pd.nome) AS rca_nome_limpo, pd.codsup_perf
        FROM perfom_data pd
        JOIN pcsuperv ON TO_CHAR(pd.codsup_perf) = TO_CHAR(pcsuperv.codsupervisor)
        WHERE pd.bloqueio = 'N' AND pcsuperv.posicao = 'A' AND 
        -- RESTRIÇÃO CRÍTICA DO GABARITO: APENAS TIME OMEGA
        (CASE WHEN pd.codusur IN (712, 758, 2738, 647, 654, 686, 582, 1496, 2527, 530, 649, 1595,651,1790,1901) THEN 'Apoio'
              WHEN pd.codusur IN (1809, 1479, 2581, 2546, 1264) THEN 'Televendas'
              WHEN pd.codusur IN (195, 670, 656, 311, 2130, 2249, 2630, 2641, 2658, 2724, 1000, 1018, 898, 945, 1717, 1739, 2136, 2140, 2725, 2728, 
              2737, 2808, 2809, 3093, 3088, 3087, 3086, 3085, 3084, 3083, 3082, 3081, 2136, 578) THEN 'Outros' ELSE 'Omega' END) = 'Omega'
        AND pd.codusur IS NOT NULL
    """
    rcas = execute_oracle_query(SQL_RCA)
    
    return gerentes, supervisores, rcas

# [Restante do Código (Mapeamento e Two-Pass) — Mantido Igual]
# ...
# =========================================================
# 🔹 3. TRANSFORMAÇÃO: MAPEAMENTO E LIGAÇÃO DE HIERARQUIA
# =========================================================

def map_users_for_upsert(
    gerentes: List[Dict], supervisores: List[Dict], rcas: List[Dict], existing_flask_ids: Dict[str, int]
) -> List[Dict]:
    """Cria a lista de usuários bruta pronta para a Passagem 1, resolvendo a hierarquia e o nome completo."""
    
    users_to_upsert: List[Dict] = []
    diego_id = existing_flask_ids.get(GERENTE_SUPREMO_USERNAME)

    # 1. MAPEAMENTO DE GERENTES (Serão Coordenadores e reportarão a Diego)
    for g in gerentes:
        cod = g['codgerente']
        nome = g.get('nomegerente', 'COORDENADOR') 
        
        users_to_upsert.append({
            "username": cod, "role": 'coordenador', "password_hash": DEFAULT_PASSWORD_HASH,
            "nome_completo": nome, "gerente_id": diego_id, "coordenador_id": None, "supervisor_id": None,
            "cod_chefe": None, "hierarquia_campo": None
        })

    # 2. MAPEAMENTO DE SUPERVISORES (Role Supervisor no Flask)
    for s in supervisores:
        cod = s['codsupervisor']
        cod_gerente_oracle = s['codgerente']
        nome = s.get('nome', 'SUPERVISOR')
        
        coordenador_id_flask = existing_flask_ids.get(cod_gerente_oracle)
        
        users_to_upsert.append({
            "username": cod, "role": 'supervisor', "password_hash": DEFAULT_PASSWORD_HASH,
            "nome_completo": nome, "gerente_id": diego_id, 
            "coordenador_id": coordenador_id_flask, "supervisor_id": None, 
            "cod_chefe": cod_gerente_oracle, "hierarquia_campo": "coordenador_id"
        })

    # 3. MAPEAMENTO DE RCAS (Role RCA no Flask)
    for r in rcas:
        cod = r['codusur']
        cod_supervisor_oracle = r['codsup_perf']
        nome = r.get('rca_nome_limpo', 'RCA')
        
        users_to_upsert.append({
            "username": cod, "role": 'rca', "password_hash": DEFAULT_PASSWORD_HASH,
            "nome_completo": nome, "gerente_id": None, "coordenador_id": None,
            "supervisor_id": None,
            "cod_chefe": cod_supervisor_oracle, "hierarquia_campo": "supervisor_id"
        })
        
    return users_to_upsert

# =========================================================
# 🔹 4. CARGA: UPSERT EM DUAS PASSAGENS
# =========================================================

def sync_users_to_postgres(users_to_sync: List[Dict]):
    
    conn_destino = None
    
    try:
        conn_destino = get_conn()
        cur = conn_destino.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # --- PASSAGEM 1: INSERÇÃO INICIAL (Criação de IDs/Usuários com Nome) ---
        print("\n--- PASSAGEM 1/2: INSERINDO/ATUALIZANDO USUÁRIOS (Criação de IDs) ---")
        
        insert_base_query = f"""
            INSERT INTO {TABELA_DESTINO_USERS} (username, role, password_hash, nome_completo)
            VALUES (%(username)s, %(role)s, %(password_hash)s, %(nome_completo)s)
            ON CONFLICT (username) DO UPDATE SET
                role = EXCLUDED.role,
                nome_completo = EXCLUDED.nome_completo,
                password_hash = COALESCE(
                    (SELECT password_hash FROM users WHERE username = EXCLUDED.username),
                    EXCLUDED.password_hash
                );
        """
        
        base_users = [{
            "username": u['username'], "role": u['role'], "password_hash": u['password_hash'], 
            "nome_completo": u['nome_completo']
        } for u in users_to_sync if u['username'] != GERENTE_SUPREMO_USERNAME]

        psycopg2.extras.execute_batch(cur, insert_base_query, base_users)
        conn_destino.commit()
        print(f"✅ Passagem 1 concluída: {len(base_users)} usuários base criados/atualizados.")
        
        
        # --- PASSAGEM 2: LIGAÇÃO DE HIERARQUIA (Fazendo UPDATE) ---
        print("--- PASSAGEM 2/2: RESOLVENDO E LIGANDO HIERARQUIA ---")
        
        # 1. OBTER MAPEAMENTO ATUAL (cod_oracle -> id interno)
        cur.execute("SELECT id, username FROM users")
        oracle_code_to_flask_id: Dict[str, int] = {r['username']: r['id'] for r in cur.fetchall()} 
        
        # 2. CONSTRUIR UPDATES DE HIERARQUIA
        update_statements = []
        for user in users_to_sync:
            if user['cod_chefe'] and user['hierarquia_campo']:
                
                chefe_id_flask = oracle_code_to_flask_id.get(user['cod_chefe'])
                user_id_flask = oracle_code_to_flask_id.get(user['username'])
                
                if chefe_id_flask and user_id_flask:
                    update_statements.append({
                        "user_id": user_id_flask,
                        "chefe_id": chefe_id_flask,
                        "campo_hierarquia": user['hierarquia_campo']
                    })
            
            # 2b. Ligação ADICIONAL: Gerente Supremo (Diego)
            if user['username'] != GERENTE_SUPREMO_USERNAME and user['gerente_id']:
                update_statements.append({
                    "user_id": oracle_code_to_flask_id.get(user['username']),
                    "chefe_id": user['gerente_id'], 
                    "campo_hierarquia": "gerente_id"
                })


        # 3. EXECUTAR UPDATES INDIVIDUAIS (em batch)
        updated_count = 0
        for stmt in update_statements:
            update_query = f"""
                UPDATE users SET {stmt['campo_hierarquia']} = %(chefe_id)s
                WHERE id = %(user_id)s;
            """
            cur.execute(update_query, stmt)
            updated_count += 1

        conn_destino.commit()
        print(f"✅ Passagem 2 concluída: {updated_count} ligações hierárquicas estabelecidas.")
        
    except psycopg2.Error as e:
        print(f"❌ ERRO NO POSTGRESQL: {e}")
        if conn_destino: conn_destino.rollback()
    except Exception as e:
        print(f"❌ ERRO GERAL: {e}")
    finally:
        if conn_destino: conn_destino.close()

# =========================================================
# 🏃 EXECUÇÃO PRINCIPAL
# =========================================================

if __name__ == "__main__":
    
    print("--- INICIANDO SINCRONIZAÇÃO DE HIERARQUIA ---")
    
    # 1. Extrair dados do Oracle
    try:
        gerentes, supervisores, rcas = extract_all_hierarchy()
    except Exception as e:
        print(f"❌ ERRO FATAL NA EXTRAÇÃO DO ORACLE: {e}")
        exit()
    
    if not gerentes and not supervisores and not rcas:
        print("Não há dados ativos ou relevantes do Oracle para sincronizar.")
        exit()
        
    # 2. Obter IDs existentes (para mapear a hierarquia)
    conn_temp = None
    try:
        conn_temp = get_conn()
        cur_temp = conn_temp.cursor()
        cur_temp.execute("SELECT username, id FROM users")
        existing_flask_ids: Dict[str, int] = {username: flask_id for username, flask_id in cur_temp.fetchall()}
        conn_temp.close()
    except psycopg2.Error as e:
        print(f"❌ ERRO: Não foi possível conectar ao Supabase para obter IDs existentes: {e}")
        exit()

    # 3. Mapear e resolver a hierarquia
    users_to_sync = map_users_for_upsert(gerentes, supervisores, rcas, existing_flask_ids)
    
    # 4. Sincroniza e Carrega no PostgreSQL
    print("\n--- INICIANDO CARGA NO POSTGRESQL/SUPABASE ---")
    sync_users_to_postgres(users_to_sync)
# Arquivo: teste_interacao_hierarquia.py (CÓDIGO COMPLETO FINAL COM LISTAGEM DE AMOSTRAS)
import sqlite3
import random
from typing import Dict, List, Any, Optional, Tuple

# =========================================================
# 🔹 CONFIGURAÇÃO DE ENTRADA
# =========================================================

DB_DESTINO_FILE = "dados_etl_teste.db" 
TABELA_USERS = "users_simulada" 
TABELA_RCA = "rca_performance_data" 
TABELA_SUPERVISOR = "supervisores_data"
TABELA_GERENTE = "gerentes_data"

# Simulação: Gerador de ID único para o Flask/Supabase
CURRENT_FLASK_ID = 1000 
def get_next_flask_id():
    """Simula a geração de ID interno sequencial (garantindo unicidade)."""
    global CURRENT_FLASK_ID
    CURRENT_FLASK_ID += 1
    return CURRENT_FLASK_ID 

ORACLE_ID_TO_FLASK_ID: Dict[str, int] = {} 
ALL_USERS_FOR_UPSERT: List[Dict] = []


# =========================================================
# 💡 LÓGICA DE MAPEAMENTO (Importada e Integrada)
# =========================================================

def fetch_data_from_sqlite(table_name: str) -> List[Dict]:
    """Lê os dados de uma tabela no SQLite e retorna como lista de dicionários."""
    conn_sqlite = sqlite3.connect(DB_DESTINO_FILE)
    conn_sqlite.row_factory = sqlite3.Row
    cur = conn_sqlite.cursor()
    
    cur.execute(f"SELECT * FROM {table_name}")
    dados = [dict(row) for row in cur.fetchall()]
    conn_sqlite.close()
    return dados


def map_and_sync_hierarchy() -> List[Dict]:
    """
    Executa o mapeamento completo: Gerente -> Supervisor -> RCA.
    """
    global ORACLE_ID_TO_FLASK_ID, ALL_USERS_FOR_UPSERT, CURRENT_FLASK_ID
    ORACLE_ID_TO_FLASK_ID = {}
    ALL_USERS_FOR_UPSERT = []
    CURRENT_FLASK_ID = 1000 

    # --- 1. EXTRAÇÃO DE DADOS BRUTOS DO SQLITE ---
    try:
        gerentes_data = fetch_data_from_sqlite(TABELA_GERENTE)
        supervisores_data = fetch_data_from_sqlite(TABELA_SUPERVISOR)
        rcas_data = fetch_data_from_sqlite(TABELA_RCA)
    except Exception as e:
        raise Exception(f"Falha ao carregar dados de origem do SQLite. Erro: {e}")

    # --- 2. FASE: MAPEAMENTO DE GERENTES ---
    for record in gerentes_data:
        cod_oracle = record['codgerente']
        
        if cod_oracle not in ORACLE_ID_TO_FLASK_ID:
            flask_id = get_next_flask_id()
            ORACLE_ID_TO_FLASK_ID[cod_oracle] = flask_id
            
            ALL_USERS_FOR_UPSERT.append({
                'id': flask_id, 'username': cod_oracle, 'role': 'gerente', 
                'nome': record['nomegerente'], 'gerente_id': None, 'coordenador_id': None, 'supervisor_id': None
            })

    # --- 3. FASE: MAPEAMENTO DE SUPERVISORES (Role Supervisor no Flask) ---
    for record in supervisores_data:
        cod_oracle = record['codsupervisor']
        cod_gerente_oracle = record['codgerente'] 

        if cod_oracle not in ORACLE_ID_TO_FLASK_ID:
            flask_id = get_next_flask_id()
            ORACLE_ID_TO_FLASK_ID[cod_oracle] = flask_id
            
            gerente_flask_id = ORACLE_ID_TO_FLASK_ID.get(cod_gerente_oracle)
            
            ALL_USERS_FOR_UPSERT.append({
                'id': flask_id, 'username': cod_oracle, 'role': 'supervisor', 
                'nome': record['nome'], 'gerente_id': gerente_flask_id, 
                'coordenador_id': None, 'supervisor_id': None
            })
    
    
    # --- 4. FASE: MAPEAMENTO DE RCAS (Role RCA no Flask) ---
    users_with_hierarchy = []
    
    for record in rcas_data:
        cod_oracle = record['codusur']
        cod_supervisor_oracle = record['codsup_perf']
        
        flask_id = get_next_flask_id() 
        ORACLE_ID_TO_FLASK_ID[cod_oracle] = flask_id
        
        supervisor_flask_id = ORACLE_ID_TO_FLASK_ID.get(cod_supervisor_oracle)
        
        users_with_hierarchy.append({
            'id': flask_id, 'username': cod_oracle, 'role': 'rca', 
            'nome': record['rca'], 'supervisor_id': supervisor_flask_id, 
            'coordenador_id': None, 'gerente_id': None,
        })
    
    return ALL_USERS_FOR_UPSERT + users_with_hierarchy


# =========================================================
# 🛠️ SETUP: CRIAR TABELA SIMULADA 'users'
# =========================================================

def setup_simulated_users_table(final_users: List[Dict]):
    """Cria a tabela 'users_simulada' no SQLite e insere todos os dados mapeados."""
    conn_sqlite = None
    try:
        conn_sqlite = sqlite3.connect(DB_DESTINO_FILE)
        cur = conn_sqlite.cursor()
        
        cur.execute(f"DROP TABLE IF EXISTS {TABELA_USERS}")
        cur.execute(f"""
            CREATE TABLE {TABELA_USERS} (
                id INTEGER PRIMARY KEY,
                username TEXT,
                role TEXT,
                gerente_id INTEGER,
                coordenador_id INTEGER,
                supervisor_id INTEGER
            );
        """)

        insert_sql = f"""
            INSERT INTO {TABELA_USERS} (id, username, role, gerente_id, coordenador_id, supervisor_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """
        
        data_to_insert = []
        for user in final_users:
            data_to_insert.append((
                user['id'],
                user['username'],
                user['role'],
                user.get('gerente_id'),
                user.get('coordenador_id'),
                user.get('supervisor_id')
            ))

        cur.executemany(insert_sql, data_to_insert)
        conn_sqlite.commit()
        print(f"\n🔗 Tabela '{TABELA_USERS}' criada e preenchida com {len(final_users)} usuários hierárquicos.")
    finally:
        if conn_sqlite: conn_sqlite.close()

# =========================================================
# 💡 SIMULAÇÃO DA FUNÇÃO DO FLASK (app.py)
# =========================================================

def listar_subordinados_simulada(user_id: int, role: str) -> List[Dict]:
    """
    Simula a função listar_subordinados do app.py, consultando a tabela simulada.
    """
    conn = sqlite3.connect(DB_DESTINO_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    query_map = {
        "gerente": "gerente_id",
        "coordenador": "coordenador_id", 
        "supervisor": "supervisor_id"    
    }

    if role not in query_map: 
        return [] 

    hierarchy_col = query_map[role]
    
    cur.execute(f"SELECT id, username, role, {hierarchy_col} FROM {TABELA_USERS} WHERE {hierarchy_col} = ?", (user_id,))
    
    subordinados = [dict(row) for row in cur.fetchall()]
    conn.close()
    return subordinados

# =========================================================
# 🔎 FUNÇÃO DE AUDITORIA E AMOSTRAGEM
# =========================================================

def audit_hierarchy_samples(final_users: List[Dict]):
    """Imprime a cadeia de comando para amostras de RCA e Supervisor."""
    
    users_by_id = {u['id']: u for u in final_users}
    
    def get_user_info(user_id: Optional[int]) -> str:
        """Formata o nome e o código Oracle para exibição."""
        if user_id is None:
            return "N/A"
        user = users_by_id.get(user_id)
        if user:
            return f"{user.get('nome', user['username'])} ({user['username']}) [ID:{user_id}]"
        return f"ID Desconhecido: {user_id}"

    # Encontrar todos os Supervisores que têm ligações de Gerente
    supervisores_com_ligacao = [u for u in final_users if u['role'] == 'supervisor' and u['gerente_id'] is not None]
    
    # Encontrar todos os RCAs que têm ligações de Supervisor
    rcas_com_ligacao = [u for u in final_users if u['role'] == 'rca' and u['supervisor_id'] is not None]

    # Selecionar até 3 amostras aleatórias de cada grupo (se existirem)
    supervisores_amostra = random.sample(supervisores_com_ligacao, min(3, len(supervisores_com_ligacao)))
    rcas_amostra = random.sample(rcas_com_ligacao, min(3, len(rcas_com_ligacao)))
    
    print("\n\n=============== AUDITORIA DE HIERARQUIA POR AMOSTRA ===============")

    # --- AMOSTRAS SUPERVISOR -> GERENTE ---
    if supervisores_amostra:
        print("\n--- AMOSTRA 1: SUPERVISOR REPORTANDO AO GERENTE ---")
        for sup in supervisores_amostra:
            gerente_info = get_user_info(sup['gerente_id'])
            print(f"🔹 Supervisor: {get_user_info(sup['id'])}")
            print(f"    └─ Reporta para Gerente: {gerente_info}")
    
    # --- AMOSTRAS RCA -> SUPERVISOR ---
    if rcas_amostra:
        print("\n--- AMOSTRA 2: RCA REPORTANDO AO SUPERVISOR ---")
        for rca in rcas_amostra:
            supervisor_info = get_user_info(rca['supervisor_id'])
            print(f"🔹 RCA: {get_user_info(rca['id'])}")
            print(f"    └─ Reporta para Supervisor: {supervisor_info}")
        
    print("==================================================================")


# =========================================================
# 🏃 EXECUÇÃO PRINCIPAL
# =========================================================

if __name__ == "__main__":
    
    # 1. Executa a lógica de mapeamento para obter a lista final de usuários com IDs internos
    try:
        final_users = map_and_sync_hierarchy()
    except Exception as e:
        print(f"\nERRO CRÍTICO NA FASE DE LEITURA/MAPEAMENTO: {e}")
        print("Atenção: Execute o ETL anterior (teste_etl_sqlite.py) para criar as tabelas de origem (Gerente, Supervisor, RCA).")
        exit()
        
    # 2. Cria e popula a tabela de simulação
    setup_simulated_users_table(final_users)
    
    # --- AUDITORIA DE HIERARQUIA ---
    audit_hierarchy_samples(final_users)
    
    # --- TESTES DE INTERAÇÃO (COBERTURA) ---
    print("\n\n=============== TESTE DE COBERTURA ===============")
    
    total_failures = 0
    
    # TESTE 1: Gerente -> Supervisor
    gerente_teste = next((u for u in final_users if u['role'] == 'gerente' and any(sub['gerente_id'] == u['id'] for sub in final_users)), None)
    if gerente_teste:
        subordinados = listar_subordinados_simulada(gerente_teste['id'], 'gerente')
        print(f"\nTeste 1: Gerente {gerente_teste['username']} listou {len(subordinados)} Supervisores.")
        if len(subordinados) == 0: total_failures += 1
    
    # TESTE 2: Supervisor -> RCA
    supervisor_teste = next((u for u in final_users if u['role'] == 'supervisor' and any(sub['supervisor_id'] == u['id'] for sub in final_users)), None)
    if supervisor_teste:
        subordinados = listar_subordinados_simulada(supervisor_teste['id'], 'supervisor')
        print(f"Teste 2: Supervisor {supervisor_teste['username']} listou {len(subordinados)} RCAs.")
        if len(subordinados) == 0: total_failures += 1

    # TESTE 3: RCA (Final)
    rca_teste = next((u for u in final_users if u['role'] == 'rca'), None)
    if rca_teste:
        subordinados_rca = listar_subordinados_simulada(rca_teste['id'], 'rca')
        if len(subordinados_rca) != 0: total_failures += 1

    print("\n==================================================================")
    if total_failures == 0:
        print("✅ SUCESSO: A lógica de mapeamento de hierarquia passou em todos os testes.")
        print("A lógica está pronta para ser implementada no PostgreSQL/Supabase.")
    else:
        print(f"❌ FALHA: Foram encontradas {total_failures} falhas no mapeamento hierárquico. Revise o ETL.")
    print("==================================================================")
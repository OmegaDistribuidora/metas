import pyodbc
import sqlite3
from datetime import datetime
from typing import List, Tuple

# =========================================================
# 🔹 CONFIGURAÇÃO DE BANCO DE ORIGEM (ORACLE - pyodbc)
# =========================================================

def get_oracle_driver():
    """Identifica o nome exato do driver Oracle ODBC instalado."""
    drivers = [d for d in pyodbc.drivers() if "Oracle" in d]
    if not drivers:
        print("Aviso: Tentando usar driver genérico, ajuste se houver erro.")
        return "Oracle in OraClient19Home" 
    return drivers[-1]

try:
    DRIVER = get_oracle_driver()
except RuntimeError:
    DRIVER = "{Oracle Driver Fictício}" 

# Configuração de conexão do Winthor (WINT)
CONN_STR_ORIGEM = (
    f"DRIVER={{{DRIVER}}};"
    "DBQ=10.85.113.10/wint;" # Endereço/Serviço
    "UID=omega;"            # Usuário
    "PWD=omega;"            # Senha
)

# =========================================================
# 🔹 CONFIGURAÇÃO DE BANCO DE DESTINO (SQLITE - nativo)
# =========================================================
DB_DESTINO_FILE = "dados_etl_teste.db" 

# Tabela de Destino do SELECT GRANDE (RCA Performance)
TABELA_RCA_PERFORMANCE = "rca_performance_data"
COLUNAS_RCA_PERFORMANCE = [
    "codsup_orig", "codsup_perf", "codusur_perf", "rca_perf", 
    "codusur", "rca", "tipo", "time", "rota", 
    "sup_perf", "dtinicio", "bloqueio"
]
# Colunas e nomes das tabelas para Supervisor/Gerente
TABELA_SUPERVISOR = "supervisores_data"
TABELA_GERENTE = "gerentes_data"


# =========================================================
# 🛠️ SETUP: CRIAÇÃO DE TODAS AS TABELAS NO SQLITE
# =========================================================

def setup_sqlite_db():
    conn_sqlite = None
    try:
        conn_sqlite = sqlite3.connect(DB_DESTINO_FILE)
        cur = conn_sqlite.cursor()
        
        # 1. Tabela RCA (Select Complexo)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {TABELA_RCA_PERFORMANCE} (
                codsup_orig TEXT, codsup_perf TEXT, codusur_perf TEXT, rca_perf TEXT, 
                codusur TEXT PRIMARY KEY, rca TEXT, tipo TEXT, time TEXT, rota TEXT, 
                sup_perf TEXT, dtinicio TEXT, bloqueio TEXT
            );
        """)
        
        # 2. Tabela Supervisor (PCSUPERV)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {TABELA_SUPERVISOR} (
                codsupervisor TEXT PRIMARY KEY, nome TEXT, posicao TEXT, codgerente TEXT
            );
        """)
        
        # 3. Tabela Gerente (PCGERENTE)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {TABELA_GERENTE} (
                codgerente TEXT PRIMARY KEY, nomegerente TEXT
            );
        """)

        conn_sqlite.commit()
        print(f"🔗 Três tabelas no SQLite criadas: RCA, Supervisores e Gerentes.")
    except sqlite3.Error as e:
        print(f"❌ Erro ao configurar o SQLite: {e}")
    finally:
        if conn_sqlite: conn_sqlite.close()


# =========================================================
# 🔄 ETL 1: EXTRAÇÃO DE GERENTES (PCGERENTE - COM EXCLUSÕES)
# =========================================================

def etl_gerentes() -> List[Tuple]:
    conn_origem, conn_destino = None, None
    try:
        print(f"\n--- ETL GERENTES ---")
        conn_origem = pyodbc.connect(CONN_STR_ORIGEM)
        cur_origem = conn_origem.cursor()
        
        # SQL COM EXCLUSÕES: Removendo Nilton e Francisco Aguiar (usando o nome já em MAIÚSCULAS)
        SQL = f"""
            SELECT CODGERENTE, NOMEGERENTE FROM PCGERENTE
            WHERE NOMEGERENTE NOT IN ('NILTON', 'FRANCISCO AGUIAR')
        """
        cur_origem.execute(SQL)
        dados = cur_origem.fetchall()
        
        conn_destino = sqlite3.connect(DB_DESTINO_FILE)
        cur_destino = conn_destino.cursor()
        
        # TRATAMENTO: Converte ID para String e NOME para MAIÚSCULAS/strip
        registros_limpos = [
            (str(linha[0]).strip(), str(linha[1]).strip().upper() if linha[1] else '') 
            for linha in dados
        ]
        
        SQL_UPSERT = f"REPLACE INTO {TABELA_GERENTE} (CODGERENTE, NOMEGERENTE) VALUES (?, ?)"
        cur_destino.executemany(SQL_UPSERT, registros_limpos)
        conn_destino.commit()
        
        print(f"✅ GERENTES: {cur_destino.rowcount} registros carregados (Filtrados).")
        return registros_limpos

    except pyodbc.Error as e:
        print(f"❌ Erro ETL GERENTES: {e}")
        return []
    finally:
        if conn_origem: conn_origem.close()
        if conn_destino: conn_destino.close()

# =========================================================
# 🔄 ETL 2: EXTRAÇÃO DE SUPERVISORES (PCSUPERV - COM EXCLUSÕES)
# =========================================================

def etl_supervisores() -> List[Tuple]:
    conn_origem, conn_destino = None, None
    try:
        print(f"\n--- ETL SUPERVISORES ---")
        conn_origem = pyodbc.connect(CONN_STR_ORIGEM)
        cur_origem = conn_origem.cursor()
        
        # SQL COM EXCLUSÕES: POSICAO = 'A' (Ativo) E EXCLUINDO NOMES
        SQL = f"""
            SELECT CODSUPERVISOR, NOME, POSICAO, CODGERENTE FROM PCSUPERV 
            WHERE POSICAO = 'A'
            AND NOME NOT LIKE 'FRANCISCO AGUIAR%' 
            AND NOME NOT LIKE 'NILTON%'
            AND NOME NOT LIKE 'WESLEY%'
            AND NOME <> 'SUP/JUAZEIRO'
            AND NOME NOT LIKE 'DIEGO%'
            AND NOME <> 'E-COMMERCE'
        """
        cur_origem.execute(SQL)
        dados = cur_origem.fetchall()
        
        conn_destino = sqlite3.connect(DB_DESTINO_FILE)
        cur_destino = conn_destino.cursor()
        
        # TRATAMENTO: Converte IDs para String e NOME para MAIÚSCULAS/strip
        registros_limpos = [
            (
                str(linha[0]).strip(),                 # CODSUPERVISOR (ID)
                str(linha[1]).strip().upper() if linha[1] else '', # NOME (Tratado)
                linha[2],                              # POSICAO
                str(linha[3]).strip()                  # CODGERENTE (ID)
            ) 
            for linha in dados
        ]
        
        SQL_UPSERT = f"REPLACE INTO {TABELA_SUPERVISOR} (CODSUPERVISOR, NOME, POSICAO, CODGERENTE) VALUES (?, ?, ?, ?)"
        cur_destino.executemany(SQL_UPSERT, registros_limpos)
        conn_destino.commit()
        
        print(f"✅ SUPERVISORES: {cur_destino.rowcount} registros carregados (Ativos e Filtrados).")
        return registros_limpos

    except pyodbc.Error as e:
        print(f"❌ Erro ETL SUPERVISORES: {e}")
        return []
    finally:
        if conn_origem: conn_origem.close()
        if conn_destino: conn_destino.close()

# =========================================================
# 🔄 ETL 3: EXTRAÇÃO RCA (SELECT GRANDE - TIME OMEGA)
# =========================================================

def etl_rca_performance() -> List[Tuple]:
    conn_origem = None
    conn_destino = None
    
    try:
        print(f"\n--- ETL RCA PERFORMANCE ---")
        conn_origem = pyodbc.connect(CONN_STR_ORIGEM)
        cur_origem = conn_origem.cursor()

        # SEU SELECT SQL COMPLEXO
        SQL_PERFORMANCE = """
            WITH perfom_data AS (
                SELECT 
                    TO_CHAR(pcusuari.codusur) AS codusur,
                    pcusuari.nome,
                    TO_CHAR(pcusuari.dtinicio, 'YYYY-MM-DD') AS dtinicio,
                    TO_CHAR(pcsuperv.codsupervisor) AS codsup_orig,
                    CASE
                        WHEN pcusuari.codusur IN (2546,582,2527,1496,1595) THEN (SELECT TO_CHAR(codsupervisor) FROM pcusuari WHERE codusur = 2546)
                        WHEN pcusuari.codusur IN (1264,530,649,651,686) THEN (SELECT TO_CHAR(codsupervisor) FROM pcusuari WHERE codusur = 1264)
                        WHEN pcusuari.codusur IN (2574) THEN (SELECT TO_CHAR(codsupervisor) FROM pcusuari WHERE codusur = 2574)
                        WHEN pcusuari.codusur IN (2581,712,758,2738,654,647,1790,1901) THEN (SELECT TO_CHAR(codsupervisor) FROM pcusuari WHERE codusur = 2581)
                        ELSE TO_CHAR(pcusuari.codsupervisor)
                    END AS codsup_perf,
                    CASE
                        WHEN pcusuari.codusur IN (2546,582,2527,1496,1595) THEN '2546'
                        WHEN pcusuari.codusur IN (1264,530,649,651,686) THEN '1264'
                        WHEN pcusuari.codusur IN (2574) THEN '2574'
                        WHEN pcusuari.codusur IN (2581,712,758,2738,654,647,1790,1901) THEN '2581'
                        ELSE TO_CHAR(pcusuari.codusur)
                    END AS codusur_perf,
                    CASE
                        WHEN pcusuari.codusur IN (2546,582,2527,1496,1595) THEN 'Marli de Freitas'
                        WHEN pcusuari.codusur IN (1264,530,649,651,686) THEN 'Maria do Socorro'
                        WHEN pcusuari.codusur IN (2574) THEN 'Karen Campos Bezerra'
                        WHEN pcusuari.codusur IN (2581,712,758,2738,654,647,1790,1901) THEN 'Rachel Araújo'
                        ELSE INITCAP(pcusuari.nome)
                    END AS rca_perf,
                    CASE
                        WHEN pcusuari.codusur IN (1161, 1242, 1321, 1381, 1396, 1401, 1436, 1468, 1507, 1517, 1569, 1594, 1606, 1631, 1676, 1680, 1681, 1682, 1684, 2076, 2717, 2736, 2974, 3048, 3059, 3060, 3076, 2666, 3048, 3045, 2681, 2154, 3067, 2946, 2515) THEN 'Mista'
                        ELSE 'Normal'
                    END AS rota,
                    CASE
                        WHEN pcusuari.codusur IN (1595, 2738, 654, 647, 2581, 712, 758, 1809, 1479, 2546, 582, 2527, 1264, 530, 649, 651,686,1496,1790,1901) THEN 'TLV'
                        WHEN pcusuari.codusur IN (2629, 1572, 2144, 3017, 3057, 3018, 2908, 2983, 3023) THEN 'RDS RCA'
                        WHEN pcusuari.codusur IN (2798, 2966, 3044, 2814, 2915) THEN 'RDS CLT'
                        WHEN pcusuari.codusur IN (2792, 2835, 3028, 3053, 3067, 3022) THEN 'CLT'
                        ELSE 'RCA'
                    END AS tipo,
                    CASE
                        WHEN pcusuari.codusur IN (712, 758, 2738, 647, 654, 686, 582, 1496, 2527, 530, 649, 1595,651,1790,1901) THEN 'Apoio'
                        WHEN pcusuari.codusur IN (1809, 1479, 2581, 2546, 1264) THEN 'Televendas'
                        WHEN pcusuari.codusur IN (195, 670, 656, 311, 2130, 2249, 2630, 2641, 2658, 2724, 1000, 1018, 898, 945, 1717, 1739, 2136, 2140, 2725, 2728, 
                        2737, 2808, 2809, 3093, 3088, 3087, 3086, 3085, 3084, 3083, 3082, 3081, 2136, 578) THEN 'Outros'
                        ELSE 'Omega'
                    END AS time,
                    pcusuari.bloqueio
                FROM 
                    pcusuari
                JOIN pcsuperv ON pcusuari.codsupervisor = pcsuperv.codsupervisor
            )
            SELECT 
                pd.codsup_orig, pd.codsup_perf, pd.codusur_perf, pd.rca_perf, 
                pd.codusur, INITCAP(pd.nome) AS rca, pd.tipo, pd.time, 
                pd.rota,
                CASE
                    WHEN pd.codsup_perf = '22' THEN 'Elizangela'
                    WHEN pd.codsup_perf = '34' THEN 'Atacado'
                    ELSE INITCAP(REGEXP_SUBSTR(pcsuperv.nome, '^[^/]+'))
                END AS sup_perf,
                pd.dtinicio,
                pd.bloqueio 
            FROM 
                perfom_data pd
            JOIN pcsuperv ON TO_CHAR(pd.codsup_perf) = TO_CHAR(pcsuperv.codsupervisor)
            -- FILTROS DE ATIVIDADE E TIME = 'Omega'
            WHERE
                pd.bloqueio = 'N'  
                AND pcsuperv.posicao = 'A'
                AND pd.time = 'Omega'
            ORDER BY 
                pd.codusur
        """
        
        cur_origem.execute(SQL_PERFORMANCE)
        dados_extraidos = cur_origem.fetchall()
        
        if not dados_extraidos:
            print("Nenhum dado encontrado para o TIME: OMEGA.")
            return []

        conn_destino = sqlite3.connect(DB_DESTINO_FILE)
        cur_destino = conn_destino.cursor()
        
        # TRATAMENTO
        registros_convertidos = []
        for linha in dados_extraidos:
            registro_limpo = tuple(
                str(valor).strip() if valor is not None else '' 
                for valor in linha
            )
            registros_convertidos.append(registro_limpo)
        
        colunas_str = ", ".join(COLUNAS_RCA_PERFORMANCE)
        placeholders = ", ".join(["?"] * len(COLUNAS_RCA_PERFORMANCE)) 
        
        SQL_UPSERT = f"REPLACE INTO {TABELA_RCA_PERFORMANCE} ({colunas_str}) VALUES ({placeholders})"
        
        cur_destino.executemany(SQL_UPSERT, registros_convertidos)
        conn_destino.commit()
        print(f"✅ RCA PERFORMANCE: {cur_destino.rowcount} registros carregados.")
        
        return registros_convertidos

    except pyodbc.Error as e:
        print(f"❌ Erro ETL RCA PERFORMANCE: {e}")
        return []
    finally:
        if conn_origem: conn_origem.close()
        if conn_destino: conn_destino.close()

# =========================================================
# 🏃 EXECUÇÃO PRINCIPAL
# =========================================================
if __name__ == "__main__":
    setup_sqlite_db()
    
    # 1. Executa Gerentes (COM FILTRO DE EXCLUSÃO)
    etl_gerentes_res = etl_gerentes()
    
    # 2. Executa Supervisores (COM FILTROS DE EXCLUSÃO)
    etl_supervisores_res = etl_supervisores() 
    
    # 3. Executa RCA Performance (Seu SELECT Grande)
    etl_rca_res = etl_rca_performance()
    
    print("\n--- RESUMO DA EXTRAÇÃO (DADOS BRUTOS) ---")
    print(f"Total de Gerentes (Filtrados): {len(etl_gerentes_res)}")
    print(f"Total de Supervisores Ativos e Filtrados: {len(etl_supervisores_res)}")
    print(f"Total de RCAs (Time Omega): {len(etl_rca_res)}")
    print("\nO arquivo 'dados_etl_teste.db' contém todas as 3 tabelas e está pronto para o mapeamento.")
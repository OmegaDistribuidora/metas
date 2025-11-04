import React, { useEffect, useState } from "react";
// 👇 getMetasEquipe foi adicionado aqui
import { getMinhasMetas, getSubordinados, criarMetasLote, getMetasEquipe } from "../utils/api";
// Importações de constantes centralizadas
import { CODIGOS_FORNECEDOR } from "../constants/fornecedores";
import { MESES_ORDEM, MESES_MAP } from "../constants/periodo";
import CurrencyInput from "../components/CurrencyInput.jsx";
import NumericInput from "../components/NumericInput.jsx";
import "./styles/DashboardCoordenador.css"; 

// ==========================================================
//           👇 INÍCIO DAS DEFINIÇÕES DE INDÚSTRIA 👇
// ==========================================================
// (Necessário para este componente saber qual lista de indústrias mostrar)

const industriasPorCoordenador = {
  Arleilson: [
    "Bombril", "Marata", "JDE", "Bom Principio", "Stela D'Oro", "Realeza",
    "Panasonic", "Mili", "Q-Odor", "Assim", "Albany", "Mat Inset",
    "Florence", "CCM", "Gallo", "Elgin"
  ],
  Marlon: [
    "Bombril", "Marata", "JDE", "Bom Principio", "Stela D'Oro", "Realeza",
    "Panasonic", "Mili", "Q-Odor", "Assim", "Albany", "Mat Inset",
    "Florence", "CCM", "Gallo", "Elgin"
  ],
  Genildo: [
    "Bombril", "Marata", "JDE", "Bom Principio", "Stela D'Oro", "Realeza",
    "Panasonic", "Mili", "Q-Odor", "Assim", "Albany", "Mat Inset",
    "Florence", "CCM", "Gallo", "Elgin"
  ],
  Televendas: [
    "Bombril", "Marata", "JDE", "Bom Principio", "Stela D'Oro", "Realeza",
    "Panasonic", "Mili", "Q-Odor", "Assim", "Albany", "Mat Inset",
    "Florence", "CCM", "Gallo", "Elgin"
  ],
  Atacado: ["Bombril", "Realeza", "Panasonic", "Mili"],
  "COORDENADOR INTERIOR": [ 
    "Bombril", "Marata", "JDE", "Bom Principio", "Stela D'Oro", "Realeza",
    "Panasonic", "Mili", "Q-Odor", "Assim", "Albany", "Mat Inset",
    "Florence", "CCM", "Gallo", "Elgin"
  ],
};

// Lista de fallback
const fallbackIndustrias = industriasPorCoordenador["Arleilson"] || []; 

// Helper para calcular totais
const calcularTotaisParaView = (metas) => {
  const totalFin = metas.reduce(
    (sum, m) => sum + parseFloat(m.financeira || 0),
    0
  );
  const totalPos = metas.reduce(
    (sum, m) => sum + parseInt(m.positivacao || 0),
    0
  );
  return { financeira: totalFin, positivacao: totalPos };
};
// ==========================================================
//           👆 FIM DAS DEFINIÇÕES DE INDÚSTRIA 👆
// ==========================================================


export default function DashboardSupervisor({ user, onLogout }) {
  // Metas recebidas do coordenador
  const [metasCoordenadorAll, setMetasCoordenadorAll] = useState([]);
  const [metasCoordenador, setMetasCoordenador] = useState([]);
  const [metaGeralSupervisor, setMetaGeralSupervisor] = useState(null);
  const [totaisRecebidos, setTotaisRecebidos] = useState({ financeira: 0, positivacao: 0 });
  const [comparativo, setComparativo] = useState(null);

  // RCAs e tabelas por RCA
  const [rcas, setRcas] = useState([]);
  // 👇 NOVO ESTADO para guardar dados do banco
  const [metasEquipeSalvas, setMetasEquipeSalvas] = useState([]);

  // Rascunhos
  const [rcaTabelas, setRcaTabelas] = useState({}); 
  const [rcaMetaGeral, setRcaMetaGeral] = useState({}); 
  const [rcaTotais, setRcaTotais] = useState({}); 
  const [toast, setToast] = useState(null);

  // Período (usa constantes importadas)
  const [mesSelecionado, setMesSelecionado] = useState(MESES_ORDEM[new Date().getMonth()]);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });


  // ==========================================================
  //           👇 LÓGICA DE CARREGAMENTO (Hooks) 👇
  // ==========================================================

  // Hook 1: Carrega RCAs, Metas Recebidas e Metas Salvas (APENAS UMA VEZ)
  useEffect(() => {
    async function carregarDadosIniciais() {
      // Busca tudo em paralelo
      const [subs, metasMinhas, metasEquipe] = await Promise.all([
        getSubordinados(),    // Meus RCAs
        getMinhasMetas(),     // Minhas metas (do Coordenador)
        getMetasEquipe()      // Metas que eu já salvei (para meus RCAs)
      ]);
      setRcas(Array.isArray(subs) ? subs : []);
      setMetasCoordenadorAll(Array.isArray(metasMinhas) ? metasMinhas : []);
      setMetasEquipeSalvas(Array.isArray(metasEquipe) ? metasEquipe : []);
    }
    carregarDadosIniciais();
  }, []); // Dependência vazia: roda SÓ UMA VEZ no "mount"


  // Hook 2: Reage a mudanças de Período ou ao término do carregamento de dados
  useEffect(() => {
    // 1. Atualiza as datas de Início/Fim do período
    const mesNum = MESES_MAP[mesSelecionado];
    const inicio = new Date(anoSelecionado, mesNum - 1, 1);
    const fim = new Date(anoSelecionado, mesNum, 0);
    setPeriodo({
      inicio: inicio.toISOString().split("T")[0],
      fim: fim.toISOString().split("T")[0],
    });

    // 2. Filtra as metas recebidas (do Coordenador)
    const filtradas = metasCoordenadorAll.filter(
      (m) => parseInt(m.ano) === parseInt(anoSelecionado) && m.mes === mesSelecionado
    );
    const geral = filtradas.find((m) => (m.industria || "").trim().toLowerCase() === "meta geral");
    const indus = filtradas.filter((m) => (m.industria || "").trim().toLowerCase() !== "meta geral");
    setMetaGeralSupervisor(geral || null);
    setMetasCoordenador(indus);
    const totalFin = indus.reduce((s, m) => s + parseFloat(m.valor_financeiro || 0), 0);
    const totalPos = indus.reduce((s, m) => s + parseInt(m.valor_positivacao || 0), 0);
    setTotaisRecebidos({ financeira: totalFin, positivacao: totalPos });
    setComparativo(geral ? parseFloat(geral.valor_financeiro || 0) - totalFin : null);

    // 3. Inicializa os rascunhos (para os RCAs)
    if (rcas.length > 0) {
      inicializarRascunhos(rcas, mesSelecionado, anoSelecionado, metasEquipeSalvas);
    }
    
  }, [mesSelecionado, anoSelecionado, rcas, metasCoordenadorAll, metasEquipeSalvas]); // Roda quando o período muda OU quando os dados carregam

  // ==========================================================
  //           👇 LÓGICA DE RASCUNHO (MODIFICADA) 👇
  // ==========================================================

  const inicializarRascunhos = (listaRcas, mes, ano, metasSalvas) => {
    setRcaTabelas(prevTabelas => {
      const newTabelas = { ...prevTabelas }; 

      setRcaMetaGeral(prevMetasGerais => {
        const newMetasGerais = { ...prevMetasGerais };
        const newRcaTotais = {}; 
        
        // 1. Define a lista de indústrias que este supervisor (logado) usará
        let industriasParaEsteSupervisor = fallbackIndustrias;
        const nomeSupervisorLogado = (user.nome_completo || user.username || '').toLowerCase(); 
        
        if (nomeSupervisorLogado.includes('atacado')) {
             industriasParaEsteSupervisor = industriasPorCoordenador["Atacado"];
        }
        
        // 2. Itera sobre cada RCA
        listaRcas.forEach(rca => { 
            const chave = `${rca.id}-${ano}-${mes}`; 
            const industrias = industriasParaEsteSupervisor; // Lista definida acima
            
            // 3. Verifica se há dados JÁ SALVOS no banco para este RCA
            const metasDoRCA = metasSalvas.filter(
              m => m.usuario_id === rca.id &&
                   m.mes === mes &&
                   parseInt(m.ano) === parseInt(ano)
            );
            const metaGeralSalva = metasDoRCA.find(m => (m.industria || "").trim().toLowerCase() === "meta geral");
            const metasIndustriaSalvas = metasDoRCA.filter(m => (m.industria || "").trim().toLowerCase() !== "meta geral");

            // 4. Popula a Meta Geral
            if (!newMetasGerais[chave]) { 
                if (metaGeralSalva) {
                    newMetasGerais[chave] = {
                        financeira: String(metaGeralSalva.valor_financeiro || ""),
                        positivacao: String(metaGeralSalva.valor_positivacao || "")
                    };
                } else {
                    newMetasGerais[chave] = { financeira: "", positivacao: "" };
                }
            } 

            // 5. Popula a Tabela de Indústrias
            let tabelaFinal;
            if (newTabelas[chave] && newTabelas[chave].length === industrias.length) {
                tabelaFinal = newTabelas[chave];
            } else if (metasIndustriaSalvas.length > 0) {
                tabelaFinal = industrias.map(ind => {
                    const metaSalva = metasIndustriaSalvas.find(m => m.industria === ind);
                    return {
                      industria: ind,
                      financeira: metaSalva ? String(metaSalva.valor_financeiro || "") : "",
                      positivacao: metaSalva ? String(metaSalva.valor_positivacao || "") : ""
                    };
                });
            } else {
                tabelaFinal = industrias.map(ind => ({
                    industria: ind, financeira: "", positivacao: ""
                }));
            }
            
            newTabelas[chave] = tabelaFinal;
            newRcaTotais[rca.id] = calcularTotaisParaView(tabelaFinal);
        });
        
        setRcaTotais(newRcaTotais);
        return newMetasGerais;
      });
      return newTabelas; 
    });
  };

  // --- Handlers de mudança (sem alteração) ---
  const recomputeRcaTotais = (rcaId, lista) => {
    const { financeira, positivacao } = calcularTotaisParaView(lista);
    setRcaTotais(prev => ({ ...prev, [rcaId]: { financeira, positivacao } }));
  };

  const handleChangeRca = (rcaId, index, campo, valor) => {
    setRcaTabelas(prevRcaTabelas => {
      const chave = `${rcaId}-${anoSelecionado}-${mesSelecionado}`;
      const tabela = prevRcaTabelas[chave] ? [...prevRcaTabelas[chave]] : [];
      
      const v = Math.max(0, Number(valor || 0));
      tabela[index][campo] = isNaN(v) ? "" : String(v);

      recomputeRcaTotais(rcaId, tabela);

      return { ...prevRcaTabelas, [chave]: tabela };
    });
  };

  // --- Função de Salvar (Lógica do Toast já existe) ---
  const salvarMetasRCA = async (rcaId) => {
    const chave = `${rcaId}-${anoSelecionado}-${mesSelecionado}`;
    const tabela = rcaTabelas[chave] || [];
    const totalAtual = rcaTotais[rcaId] || { financeira: 0, positivacao: 0 };
    const mg = rcaMetaGeral[chave] || { financeira: 0, positivacao: 0 };
    const faltaFin = Math.max(0, parseFloat(mg.financeira || 0) - parseFloat(totalAtual.financeira || 0));
    const faltaPos = Math.max(0, parseInt(mg.positivacao || 0) - parseInt(totalAtual.positivacao || 0));
    if (faltaFin > 0 || faltaPos > 0) {
      const partes = [];
      if (faltaFin > 0) partes.push(`R$ ${faltaFin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      if (faltaPos > 0) partes.push(`${faltaPos.toLocaleString('pt-BR')} un.`);
      setToast({ type: 'error', msg: `Falta ${partes.join(' e ')} para bater a Meta Geral do RCA.` });
      return;
    }

    const mesNum = MESES_MAP[mesSelecionado];
    const metasFormatadas = tabela.map(l => ({
      codfornec: CODIGOS_FORNECEDOR[l.industria] || null,
      industria: l.industria,
      valor_financeiro: parseFloat(l.financeira || 0),
      valor_positivacao: parseInt(l.positivacao || 0),
      mes: mesNum,
      ano: anoSelecionado,
      data_inicio: periodo.inicio,
      data_fim: periodo.fim,
    }));

    const mg2 = rcaMetaGeral[chave] || { financeira: 0, positivacao: 0 };
    metasFormatadas.push({
      codfornec: 1,
      industria: "Meta Geral",
      valor_financeiro: parseFloat(mg2.financeira || 0),
      valor_positivacao: parseInt(mg2.positivacao || 0),
      mes: mesNum,
      ano: anoSelecionado,
      data_inicio: periodo.inicio,
      data_fim: periodo.fim,
    });

    const resp = await criarMetasLote(rcaId, metasFormatadas);
    if (resp?.success) {
      setToast({ type: 'success', msg: `Metas do RCA ${rcaId} salvas com sucesso!` });
      // 👇 ATUALIZA OS DADOS SALVOS NO ESTADO para refletir a mudança
      const novasMetasSalvas = [
        ...metasEquipeSalvas.filter(m => 
            m.usuario_id !== rcaId || m.mes !== mesSelecionado || parseInt(m.ano) !== parseInt(anoSelecionado)
        ), 
        ...metasFormatadas.map(m => ({...m, usuario_id: rcaId}))
      ];
      setMetasEquipeSalvas(novasMetasSalvas);
    } else {
      setToast({ type: 'error', msg: 'Erro ao salvar metas do RCA' });
    }
  };

  // JSX (Renderização)
  return (
    <div className="coordenador-container">
      {/* ========================================================== */}
      {/* 👇 BLITZ DE TOAST ATUALIZADO 👇                  */}
      {/* ========================================================== */}
      {toast && (
        <div 
          className={`toast ${toast.type === 'error' ? 'error' : ''}`} 
          onClick={() => setToast(null)}
        >
          {toast.msg}
          <span style={{ cursor: 'pointer', float: 'right', marginLeft: '20px', fontWeight: 'bold' }}>
            &times;
          </span>
        </div>
      )}
      {/* ========================================================== */}

      <header className="topo">
        <h2>Painel do Supervisor</h2>
        <div className="usuario-info">
          <span>{user.username}</span>
          <button className="btn-sair" onClick={onLogout}>Sair</button>
        </div>
      </header>

      <section className="seletor-mes-section">
        <h3>Selecionar Periodo</h3>
        <div className="seletor-linha">
          <div className="campo">
            <label>Mes</label>
            <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)}>
              {MESES_ORDEM.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Ano</label>
            <input type="number" min="2023" max="2100" value={anoSelecionado} onChange={(e) => setAnoSelecionado(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Seção de Metas Recebidas */}
      {metaGeralSupervisor && (
        <section className="meta-geral-section">
          <h3>Meta Geral do Supervisor</h3>
          <div className="meta-geral-box">
            <p><b>Meta Financeira:</b> R${parseFloat(metaGeralSupervisor.valor_financeiro||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p><b>Meta de Positivacao:</b> {parseInt(metaGeralSupervisor.valor_positivacao||0).toLocaleString('pt-BR')}</p>
          </div>
        </section>
      )}
      <section className="tabela-section">
        <h3>Metas Recebidas do Coordenador</h3>
        {metasCoordenador.length === 0 && metasCoordenadorAll.length > 0 ? (
          <p>Nenhuma meta recebida para o periodo atual.</p>
        ) : metasCoordenadorAll.length === 0 ? (
           <p>Carregando metas recebidas...</p>
        ) : (
          <div className="tabela-wrapper">
            <table className="planilha">
              <thead>
                <tr>
                  <th>Fornecedor / Industria</th>
                  <th className="num">Meta Financeira (R$)</th>
                  <th className="num">Meta de Positivacao</th>
                </tr>
              </thead>
              <tbody>
                {metasCoordenador.map((m, i) => (
                  <tr key={i}>
                    <td>{m.industria}</td>
                    <td className="num">R${parseFloat(m.valor_financeiro||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="num">{parseInt(m.valor_positivacao||0).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="linha-total">
                  <td><b>Total das Industrias</b></td>
                  <td className="num">R${totaisRecebidos.financeira.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="num">{parseInt(totaisRecebidos.positivacao||0).toLocaleString('pt-BR')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {metaGeralSupervisor && (
          <div className="comparativo-box">
            {comparativo === 0 ? (
              <p className="comparativo-ok">As metas das industrias batem exatamente com a Meta Geral.</p>
            ) : comparativo > 0 ? (
              <p className="comparativo-menor">As metas das industrias estao R${comparativo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} abaixo da Meta Geral.</p>
            ) : (
              <p className="comparativo-maior">As metas das industrias ultrapassam a Meta Geral em R${Math.abs(comparativo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.</p>
            )}
          </div>
        )}
      </section>

      {/* Seção de Lançamento de Metas (agora lê do rascunho corretamente) */}
      <section className="tabela-section bloco-separado">
        <h3>Lançar Metas dos RCAs</h3>
        {rcas.length === 0 ? (
          <p>Carregando RCAs...</p>
        ) : (
          rcas.map((r) => {
            const chave = `${r.id}-${anoSelecionado}-${mesSelecionado}`;
            const tabelaRCA = rcaTabelas[chave] || []; 
            const metaGeralRCA = rcaMetaGeral[chave] || { financeira: "", positivacao: "" };
            const totaisRCA = rcaTotais[r.id] || { financeira: 0, positivacao: 0 };
            
            return (
              <div key={r.id} style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '10px 0' }}>{r.nome_completo || r.username}</h4>
                <div className="meta-geral">
                  <h4>Meta Geral do RCA</h4>
                  <div className="meta-geral-inputs">
                    <div>
                      <label>Meta Financeira (R$)</label>
                      <input type="number" value={metaGeralRCA.financeira} onChange={(e)=> setRcaMetaGeral({ ...rcaMetaGeral, [chave]: { ...metaGeralRCA, financeira: e.target.value } }) } />
                    </div>
                    <div>
                      <label>Meta de Positivacao (Qtd)</label>
                      <input type="number" value={metaGeralRCA.positivacao} onChange={(e)=> setRcaMetaGeral({ ...rcaMetaGeral, [chave]: { ...metaGeralRCA, positivacao: e.target.value } }) } />
                    </div>
                  </div>
                </div>

                <div className="tabela-wrapper">
                <table className="planilha">
                  <thead>
                    <tr>
                      <th>Fornecedor / Industria</th>
                      <th className="num">Meta Financeira (R$)</th>
                      <th className="num">Meta de Positivacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelaRCA.map((linha, i) => ( 
                      <tr key={i}>
                        <td>{linha.industria}</td>
                        <td className="num">
                          <CurrencyInput
                            value={parseFloat(linha.financeira || 0)}
                            onChange={(val)=> handleChangeRca(r.id, i, 'financeira', val)}
                          />
                        </td>
                        <td className="num">
                          <NumericInput
                            value={parseInt(linha.positivacao || 0)}
                            onChange={(val)=> handleChangeRca(r.id, i, 'positivacao', val)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="linha-total">
                      <td><b>Total</b></td>
                      <td className="num">R${(totaisRCA.financeira).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="num">{parseInt(totaisRCA.positivacao).toLocaleString('pt-BR')}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>

                <div style={{ textAlign: 'center', marginTop: 15 }}>
                  <button className="btn-salvar" onClick={() => salvarMetasRCA(r.id)}>Salvar Metas de {r.nome_completo || r.username}</button>
                </div>
              </div>
            )
          })
        )}
      </section>
    </div>
  );
}
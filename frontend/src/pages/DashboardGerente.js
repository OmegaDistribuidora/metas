import React, { useEffect, useState } from "react";
// 👇 getMetasEquipe foi adicionado aqui
import { getSubordinados, criarMetasLote, logout, getMetasEquipe } from "../utils/api";
import CurrencyInput from "../components/CurrencyInput.jsx";
import NumericInput from "../components/NumericInput.jsx";
import "./styles/DashboardGerente.css";

// --- Constantes Centralizadas ---
import { CODIGOS_FORNECEDOR } from "../constants/fornecedores";
import { MESES_MAP } from "../constants/periodo"; 

// ==========================================================
//           👇 INÍCIO DAS DEFINIÇÕES DE INDÚSTRIA 👇
// ==========================================================
// (Lógica do "Atacado" mantida)
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

const fallbackIndustrias = industriasPorCoordenador["Arleilson"] || []; 

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


export default function DashboardGerente({ user, onLogout }) {
  // --- Estados ---
  const [coordenadores, setCoordenadores] = useState([]);
  
  // 👇 NOVO ESTADO para guardar dados do banco
  const [metasEquipeSalvas, setMetasEquipeSalvas] = useState([]);

  const [total, setTotal] = useState({ financeira: 0, positivacao: 0 });
  const [toast, setToast] = useState(null); 

  // Período
  const [mesSelecionado, setMesSelecionado] = useState(Object.keys(MESES_MAP)[new Date().getMonth()]); // Padrão "Out" ou "Nov"
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });

  // Rascunhos
  const [tabelasSalvas, setTabelasSalvas] = useState({}); 
  const [metasGeraisSalvas, setMetasGeraisSalvas] = useState({}); 

  // ==========================================================
  //           👇 LÓGICA DE CARREGAMENTO (Hooks) 👇
  // ==========================================================

  // Hook 1: Carrega Coordenadores e Metas Salvas (APENAS UMA VEZ)
  useEffect(() => {
    async function carregarDadosIniciais() {
      // Busca coordenadores e metas da equipe em paralelo
      const [subs, metas] = await Promise.all([
        getSubordinados(),
        getMetasEquipe() // <-- NOVO: Busca metas já salvas
      ]);
      setCoordenadores(Array.isArray(subs) ? subs : []);
      setMetasEquipeSalvas(Array.isArray(metas) ? metas : []);
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

    // 2. Inicializa os rascunhos (só roda se 'coordenadores' já tiver carregado)
    if (coordenadores.length > 0) {
      inicializarRascunhos(coordenadores, mesSelecionado, anoSelecionado, metasEquipeSalvas);
    }
    
  }, [mesSelecionado, anoSelecionado, coordenadores, metasEquipeSalvas]); // Roda quando o período muda OU quando os dados carregam

  // ==========================================================
  //           👇 LÓGICA DE RASCUNHO (MODIFICADA) 👇
  // ==========================================================
  
  const inicializarRascunhos = (coords, mes, ano, metasSalvas) => {
    const newTabelas = { ...tabelasSalvas };
    const newMetasGerais = { ...metasGeraisSalvas };
    const newRcaTotais = {}; 
    
    const mapaBuscaNormalizada = Object.keys(industriasPorCoordenador).reduce((acc, key) => {
        const buscaKey = key.toLowerCase().replace(/\s/g, ''); 
        acc[buscaKey] = key;
        return acc;
    }, {});

    coords.forEach(coord => {
        const chave = `${coord.id}-${ano}-${mes}`;
        
        // 1. Define a lista correta de indústrias (lógica do Atacado)
        let industrias = fallbackIndustrias; 
        const nomeNormalizado = (coord.nome_completo || coord.username || '').toLowerCase();
        if (nomeNormalizado.includes('atacado')) {
            industrias = industriasPorCoordenador["Atacado"];
        } else {
            const chaveReal = mapaBuscaNormalizada[nomeNormalizado.replace(/\s/g, '')];
            if (chaveReal) industrias = industriasPorCoordenador[chaveReal];
            else {
                const nomeBruto = (coord.nome_completo || coord.username);
                if (nomeBruto && industriasPorCoordenador[nomeBruto]) {
                     industrias = industriasPorCoordenador[nomeBruto];
                }
            }
        }
        
        // 2. Verifica se há dados JÁ SALVOS no banco para este período/coordenador
        const metasDoCoord = metasSalvas.filter(
          m => m.usuario_id === coord.id &&
               m.mes === mes &&
               parseInt(m.ano) === parseInt(ano)
        );
        const metaGeralSalva = metasDoCoord.find(m => (m.industria || "").trim().toLowerCase() === "meta geral");
        const metasIndustriaSalvas = metasDoCoord.filter(m => (m.industria || "").trim().toLowerCase() !== "meta geral");

        // 3. Popula a Meta Geral
        // Prioriza Rascunho > Dados Salvos > Vazio
        if (!newMetasGerais[chave]) { // Se não houver rascunho...
            if (metaGeralSalva) {
                // ... usa o dado salvo
                newMetasGerais[chave] = {
                    financeira: String(metaGeralSalva.valor_financeiro || ""),
                    positivacao: String(metaGeralSalva.valor_positivacao || "")
                };
            } else {
                // ... cria um vazio
                newMetasGerais[chave] = { financeira: "", positivacao: "" };
            }
        } // else: mantém o rascunho existente

        // 4. Popula a Tabela de Indústrias
        let tabelaFinal;
        if (newTabelas[chave] && newTabelas[chave].length === industrias.length) {
            // Prioridade 1: Manter Rascunho existente
            tabelaFinal = newTabelas[chave];
        } else if (metasIndustriaSalvas.length > 0) {
            // Prioridade 2: Preencher com Dados Salvos
            tabelaFinal = industrias.map(ind => {
                const metaSalva = metasIndustriaSalvas.find(m => m.industria === ind);
                return {
                  industria: ind,
                  financeira: metaSalva ? String(metaSalva.valor_financeiro || "") : "",
                  positivacao: metaSalva ? String(metaSalva.valor_positivacao || "") : ""
                };
            });
        } else {
            // Prioridade 3: Criar tabela vazia
            tabelaFinal = industrias.map(ind => ({
                industria: ind, financeira: "", positivacao: ""
            }));
        }
        
        newTabelas[chave] = tabelaFinal;
        newRcaTotais[coord.id] = calcularTotaisParaView(tabelaFinal);
    });
    
    setTabelasSalvas(newTabelas);
    setMetasGeraisSalvas(newMetasGerais);
    setTotal(newRcaTotais);
  };

  // --- Handlers de mudança (sem alteração) ---
  const handleChange = (coordId, index, campo, valor) => {
    const chave = `${coordId}-${anoSelecionado}-${mesSelecionado}`;
    const tabela = tabelasSalvas[chave] ? [...tabelasSalvas[chave]] : [];
    
    const parsedValue = campo === 'financeira' ? parseFloat(valor || 0) : parseInt(valor || 0);
    tabela[index][campo] = String(parsedValue); 

    setTabelasSalvas(prev => ({ ...prev, [chave]: tabela }));
    
    const novosTotais = calcularTotaisParaView(tabela);
    setTotal(prev => ({ ...prev, [coordId]: novosTotais }));
  };

  const handleMetaGeralChange = (coordId, campo, valor) => {
    const chave = `${coordId}-${anoSelecionado}-${mesSelecionado}`;
    const novaMeta = { ...(metasGeraisSalvas[chave] || {}), [campo]: valor };
    
    setMetasGeraisSalvas(prev => ({ ...prev, [chave]: novaMeta }));
  };

  // --- Função de Salvar (Lógica do Toast já existe) ---
  const salvarMetas = async (coordId) => {
    const chave = `${coordId}-${anoSelecionado}-${mesSelecionado}`;
    const tabela = tabelasSalvas[chave] || [];
    const totaisCoord = total[coordId] || { financeira: 0, positivacao: 0 };
    const metaGeralCoord = metasGeraisSalvas[chave] || { financeira: "", positivacao: "" };
    
    const totalIndustriasFin = totaisCoord.financeira;
    const metaGeralFin = parseFloat(metaGeralCoord.financeira || 0);
    const faltaFin = Math.max(0, metaGeralFin - totalIndustriasFin);
    
    const totalIndustriasPos = totaisCoord.positivacao;
    const metaGeralPos = parseInt(metaGeralCoord.positivacao || 0);
    const faltaPos = Math.max(0, metaGeralPos - totalIndustriasPos);
    
    const coordInfo = coordenadores.find(c => c.id === coordId);
    const coordNome = coordInfo ? (coordInfo.nome_completo || coordInfo.username) : coordId;

    if (faltaFin > 0 || faltaPos > 0) {
      const partes = [];
      if (faltaFin > 0) partes.push(`R$ ${faltaFin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      if (faltaPos > 0) partes.push(`${faltaPos.toLocaleString('pt-BR')} un.`);
      setToast({ type: 'error', msg: `ERRO: Falta ${partes.join(' e ')} nas metas das indústrias para cobrir a Meta Geral de ${coordNome}.` });
      return;
    }

    const mesNum = MESES_MAP[mesSelecionado];

    const metasFormatadas = tabela.map((linha) => ({
      codfornec: CODIGOS_FORNECEDOR[linha.industria] || null,
      industria: linha.industria,
      valor_financeiro: parseFloat(linha.financeira || 0),
      valor_positivacao: parseInt(linha.positivacao || 0),
      mes: mesNum,
      ano: anoSelecionado,
      data_inicio: periodo.inicio,
      data_fim: periodo.fim,
    }));

    metasFormatadas.push({
      codfornec: 1,
      industria: "Meta Geral",
      valor_financeiro: metaGeralFin,
      valor_positivacao: metaGeralPos,
      mes: mesNum,
      ano: anoSelecionado,
      data_inicio: periodo.inicio,
      data_fim: periodo.fim,
    });

    const resp = await criarMetasLote(coordId, metasFormatadas);
    if (resp?.success) {
      setToast({ type: 'success', msg: `OK. Metas de ${coordNome} salvas com sucesso!` });
      // 👇 ATUALIZA OS DADOS SALVOS NO ESTADO para refletir a mudança
      const novasMetasSalvas = [...metasEquipeSalvas.filter(m => m.usuario_id !== coordId || m.mes !== mesSelecionado || m.ano !== anoSelecionado), ...metasFormatadas.map(m => ({...m, usuario_id: coordId}))];
      setMetasEquipeSalvas(novasMetasSalvas);
    } else {
      setToast({ type: 'error', msg: "Erro ao salvar metas!" });
    }
  };

  // --- JSX (Renderização) ---
  return (
    <div className="gerente-container">
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
        <h2>Painel do Gerente</h2>
        <div className="usuario-info">
          <span>{user.username}</span>
          <button className="btn-sair" onClick={onLogout || logout}>
            Sair
          </button>
        </div>
      </header>

      <section className="seletor-mes-section">
        <h3>Selecionar Periodo</h3>
        <div className="seletor-linha">
          <div className="campo">
            <label>Mes</label>
            <select
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
            >
              {Object.keys(MESES_MAP).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Ano</label>
            <input
              type="number"
              min="2023"
              max="2100"
              value={anoSelecionado}
              onChange={(e) => setAnoSelecionado(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="tabela-section bloco-separado">
        <h3>Lançar Metas para Coordenadores</h3>
        {coordenadores.length === 0 ? (
          <p>Carregando coordenadores...</p>
        ) : (
          coordenadores.map((c) => {
            const chave = `${c.id}-${anoSelecionado}-${mesSelecionado}`;
            const metaGeralCoord = metasGeraisSalvas[chave] || { financeira: "", positivacao: "" };
            const dadosMetasCoord = tabelasSalvas[chave] || [];
            const totaisCoord = total[c.id] || { financeira: 0, positivacao: 0 };
            
            const metaGeralFin = parseFloat(metaGeralCoord.financeira || 0);
            const comparativo = metaGeralFin - (totaisCoord.financeira || 0);

            return (
              <div key={c.id} style={{ marginBottom: 40, borderBottom: '1px solid #333', paddingBottom: 20 }}>
                <h4 style={{ margin: '10px 0', fontSize: '1.25rem', color: '#88aaff' }}>
                    {c.nome_completo || c.username}
                </h4>

                <div className="meta-geral">
                  <h4>Meta Geral do Coordenador</h4>
                  <div className="meta-geral-inputs">
                    <div className="campo">
                      <label>Meta Financeira (R$)</label>
                      <CurrencyInput
                        value={parseFloat(metaGeralCoord.financeira || 0)}
                        onChange={(val) => handleMetaGeralChange(c.id, "financeira", val)}
                      />
                    </div>
                    <div className="campo">
                      <label>Meta de Positivacao (Qtd)</label>
                      <NumericInput
                        value={parseInt(metaGeralCoord.positivacao || 0)}
                        onChange={(val) => handleMetaGeralChange(c.id, "positivacao", val)}
                      />
                    </div>
                  </div>
                </div>

                <div className="tabela-wrapper">
                  <table className="planilha">
                    <thead>
                      <tr>
                        <th>Fornecedor | Industria</th>
                        <th className="num">Meta Financeira (R$)</th>
                        <th className="num">Meta de Positivacao (Qtd)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dadosMetasCoord.map((linha, i) => (
                        <tr key={i}>
                          <td>{linha.industria}</td>
                          <td>
                            <CurrencyInput
                              value={parseFloat(linha.financeira || 0)}
                              onChange={(val) => handleChange(c.id, i, "financeira", val)}
                            />
                          </td>
                          <td>
                            <NumericInput
                              value={parseInt(linha.positivacao || 0)}
                              onChange={(val) => handleChange(c.id, i, "positivacao", val)}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="linha-total">
                        <td><b>Total</b></td>
                        <td><b>R${(totaisCoord.financeira || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></td>
                        <td><b>{parseInt(totaisCoord.positivacao || 0)}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div className="comparativo-box">
                    {metaGeralFin > 0 && comparativo === 0 ? (
                      <p className="comparativo-ok">As metas das indústrias batem exatamente com a Meta Geral.</p>
                    ) : metaGeralFin > 0 && comparativo > 0 ? (
                      <p className="comparativo-menor">As metas das indústrias estão R${comparativo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} abaixo da Meta Geral.</p>
                    ) : metaGeralFin > 0 && comparativo < 0 ? (
                      <p className="comparativo-maior">As metas das indústrias ultrapassam a Meta Geral em R${Math.abs(comparativo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.</p>
                    ) : (
                        <p>Defina a Meta Geral para ver a comparação com o total das indústrias.</p>
                    )}
                </div>

                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <button className="btn-salvar" onClick={() => salvarMetas(c.id)}>
                    Salvar Metas de {c.nome_completo || c.username}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
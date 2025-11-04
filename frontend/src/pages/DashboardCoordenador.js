import React, { useEffect, useState } from "react";
// 👇 getMetasEquipe foi adicionado aqui
import { getMinhasMetas, getSubordinados, criarMetasLote, getMetasEquipe } from "../utils/api";
import { CODIGOS_FORNECEDOR } from "../constants/fornecedores";
import { MESES_ORDEM, MESES_MAP } from "../constants/periodo";
import CurrencyInput from "../components/CurrencyInput.jsx";
import NumericInput from "../components/NumericInput.jsx";
import "./styles/DashboardCoordenador.css";

// ==========================================================
//           👇 INÍCIO DAS DEFINIÇÕES DE INDÚSTRIA 👇
// ==========================================================
// (Lógica do "Atacado" mantida para os Supervisores)

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


export default function DashboardCoordenador({ user, onLogout }) {
  // Metas recebidas do gerente
  const [metasGerenteAll, setMetasGerenteAll] = useState([]);
  const [metasGerente, setMetasGerente] = useState([]);
  const [metaGeralGerente, setMetaGeralGerente] = useState(null);
  const [totaisGerente, setTotaisGerente] = useState({ financeira: 0, positivacao: 0 });
  const [comparativo, setComparativo] = useState(null);

  // Supervisores e tabelas de lancamento
  const [supervisores, setSupervisores] = useState([]);
  // 👇 NOVO ESTADO para guardar dados do banco
  const [metasEquipeSalvas, setMetasEquipeSalvas] = useState([]);

  // Rascunhos
  const [supTabelas, setSupTabelas] = useState({}); 
  const [supMetaGeral, setSupMetaGeral] = useState({}); 
  const [supTotais, setSupTotais] = useState({}); 
  const [toast, setToast] = useState(null); 

  // Período
  const [mesSelecionado, setMesSelecionado] = useState(MESES_ORDEM[new Date().getMonth()]);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });


  // ==========================================================
  //           👇 LÓGICA DE CARREGAMENTO (Hooks) 👇
  // ==========================================================

  // Hook 1: Carrega Supervisores, Metas Recebidas e Metas Salvas (APENAS UMA VEZ)
  useEffect(() => {
    async function carregarDadosIniciais() {
      // Busca tudo em paralelo
      const [subs, metasMinhas, metasEquipe] = await Promise.all([
        getSubordinados(),    // Meus supervisores
        getMinhasMetas(),     // Minhas metas (do Gerente)
        getMetasEquipe()      // Metas que eu já salvei (para meus Supervisores)
      ]);
      setSupervisores(Array.isArray(subs) ? subs : []);
      setMetasGerenteAll(Array.isArray(metasMinhas) ? metasMinhas : []);
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

    // 2. Filtra as metas recebidas (do Gerente)
    const filtradas = metasGerenteAll.filter(
      (m) => parseInt(m.ano) === parseInt(anoSelecionado) && m.mes === mesSelecionado
    );
    const geral = filtradas.find((m) => (m.industria || "").trim().toLowerCase() === "meta geral");
    const indus = filtradas.filter((m) => (m.industria || "").trim().toLowerCase() !== "meta geral");
    setMetaGeralGerente(geral || null);
    setMetasGerente(indus);
    const totalFin = indus.reduce((s, m) => s + parseFloat(m.valor_financeiro || 0), 0);
    const totalPos = indus.reduce((s, m) => s + parseInt(m.valor_positivacao || 0), 0);
    setTotaisGerente({ financeira: totalFin, positivacao: totalPos });
    setComparativo(geral ? parseFloat(geral.valor_financeiro || 0) - totalFin : null);
    
    // 3. Inicializa os rascunhos (para os Supervisores)
    if (supervisores.length > 0) {
      inicializarRascunhos(supervisores, mesSelecionado, anoSelecionado, metasEquipeSalvas);
    }
    
  }, [mesSelecionado, anoSelecionado, supervisores, metasGerenteAll, metasEquipeSalvas]); // Roda quando o período muda OU quando os dados carregam

  // ==========================================================
  //           👇 LÓGICA DE RASCUNHO (MODIFICADA) 👇
  // ==========================================================
  
  const inicializarRascunhos = (sups, mes, ano, metasSalvas) => {
    setSupTabelas(prevTabelas => {
      const newTabelas = { ...prevTabelas }; 
      setSupMetaGeral(prevMetasGerais => {
        const newMetasGerais = { ...prevMetasGerais };
        const newSupTotais = {}; 
        
        const mapaBuscaNormalizada = Object.keys(industriasPorCoordenador).reduce((acc, key) => {
            const buscaKey = key.toLowerCase().replace(/\s/g, ''); 
            acc[buscaKey] = key;
            return acc;
        }, {});

        sups.forEach(s => { // 's' para supervisor
            const chave = `${s.id}-${ano}-${mes}`;
            
            // 1. Define a lista correta de indústrias (lógica do Atacado)
            let industrias = fallbackIndustrias; 
            const nomeNormalizado = (s.nome_completo || s.username || '').toLowerCase();
            if (nomeNormalizado.includes('atacado')) {
                industrias = industriasPorCoordenador["Atacado"];
            } else {
                const chaveReal = mapaBuscaNormalizada[nomeNormalizado.replace(/\s/g, '')];
                if (chaveReal) industrias = industriasPorCoordenador[chaveReal];
                else {
                    const nomeBruto = (s.nome_completo || s.username);
                    if (nomeBruto && industriasPorCoordenador[nomeBruto]) {
                         industrias = industriasPorCoordenador[nomeBruto];
                    }
                }
            }
            
            // 2. Verifica se há dados JÁ SALVOS no banco para este supervisor
            const metasDoSup = metasSalvas.filter(
              m => m.usuario_id === s.id &&
                   m.mes === mes &&
                   parseInt(m.ano) === parseInt(ano)
            );
            const metaGeralSalva = metasDoSup.find(m => (m.industria || "").trim().toLowerCase() === "meta geral");
            const metasIndustriaSalvas = metasDoSup.filter(m => (m.industria || "").trim().toLowerCase() !== "meta geral");

            // 3. Popula a Meta Geral
            // Prioriza Rascunho > Dados Salvos > Vazio
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

            // 4. Popula a Tabela de Indústrias
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
            newSupTotais[s.id] = calcularTotaisParaView(tabelaFinal);
        });
        
        setSupTotais(newSupTotais);
        return newMetasGerais;
      });
      return newTabelas; 
    });
  };

  // --- Handlers de mudança (sem alteração) ---
  const handleChangeSup = (supId, index, campo, valor) => {
    setSupTabelas(prevSupTabelas => {
      const chave = `${supId}-${anoSelecionado}-${mesSelecionado}`;
      const tabela = prevSupTabelas[chave] ? [...prevSupTabelas[chave]] : [];
      
      const v = Math.max(0, Number(valor || 0));
      tabela[index][campo] = isNaN(v) ? "" : String(v);

      recomputeSupTotais(supId, tabela);

      return { ...prevSupTabelas, [chave]: tabela };
    });
  };

  const recomputeSupTotais = (supId, lista) => {
    const { financeira, positivacao } = calcularTotaisParaView(lista);
    setSupTotais(prev => ({ ...prev, [supId]: { financeira, positivacao } }));
  };

  // --- Função de Salvar (Lógica do Toast já existe) ---
  const salvarMetasSupervisor = async (supId) => {
    const chave = `${supId}-${anoSelecionado}-${mesSelecionado}`;
    const tabela = supTabelas[chave] || [];
    const totalAtual = supTotais[supId] || { financeira: 0, positivacao: 0 };
    const mg = supMetaGeral[chave] || { financeira: 0, positivacao: 0 };
    const faltaFin = Math.max(0, parseFloat(mg.financeira || 0) - parseFloat(totalAtual.financeira || 0));
    const faltaPos = Math.max(0, parseInt(mg.positivacao || 0) - parseInt(totalAtual.positivacao || 0));
    
    if (faltaFin > 0 || faltaPos > 0) {
      const partes = [];
      if (faltaFin > 0) partes.push(`R$ ${faltaFin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      if (faltaPos > 0) partes.push(`${faltaPos.toLocaleString('pt-BR')} un.`);
      setToast({ type: 'error', msg: `Falta ${partes.join(' e ')} para bater a Meta Geral do supervisor.` });
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

    const mg2 = supMetaGeral[chave] || { financeira: 0, positivacao: 0 };
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

    const resp = await criarMetasLote(supId, metasFormatadas);
    if (resp?.success) {
      setToast({ type: 'success', msg: `Metas de ${supId} salvas com sucesso!` });
      // 👇 ATUALIZA OS DADOS SALVOS NO ESTADO para refletir a mudança
      const novasMetasSalvas = [
        ...metasEquipeSalvas.filter(m => 
            m.usuario_id !== supId || m.mes !== mesSelecionado || parseInt(m.ano) !== parseInt(anoSelecionado)
        ), 
        ...metasFormatadas.map(m => ({...m, usuario_id: supId}))
      ];
      setMetasEquipeSalvas(novasMetasSalvas);
    } else {
      setToast({ type: 'error', msg: 'Erro ao salvar metas do supervisor' });
    }
  };

  
  // ==========================================================
  //           👇 LINHA 'return (' ADICIONADA AQUI 👇
  // ==========================================================
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
        <h2>Painel do Coordenador</h2>
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

      {/* Meta Geral do Coordenador */}
      {metaGeralGerente && (
        <section className="meta-geral-section">
          <h3>Meta Geral do Coordenador</h3>
          <div className="meta-geral-box">
            <p><b>Meta Financeira:</b> R${parseFloat(metaGeralGerente.valor_financeiro||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p><b>Meta de Positivacao:</b> {parseInt(metaGeralGerente.valor_positivacao||0).toLocaleString('pt-BR')}</p>
          </div>
        </section>
      )}

      
      <section className="tabela-section">
        <h3>Metas Recebidas do Gerente</h3>
        {metasGerente.length === 0 && metasGerenteAll.length > 0 ? (
          <p>Nenhuma meta recebida para o periodo atual.</p>
        ) : metasGerenteAll.length === 0 ? (
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
                {metasGerente.map((m, i) => (
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
                  <td className="num">R${totaisGerente.financeira.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="num">{parseInt(totaisGerente.positivacao||0).toLocaleString('pt-BR')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {metaGeralGerente && (
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
      
      <section className="tabela-section bloco-separado">
        <h3>Lançar Metas dos Supervisores</h3>
        {supervisores.length === 0 ? (
          <p>Nenhum supervisor vinculado a voce.</p>
        ) : (
          supervisores.map((s) => {
            const chave = `${s.id}-${anoSelecionado}-${mesSelecionado}`;
            const tabelaSupervisor = supTabelas[chave] || []; 
            const metaGeralSupervisor = supMetaGeral[chave] || { financeira: "", positivacao: "" };
            const totaisSupervisor = supTotais[s.id] || { financeira: 0, positivacao: 0 };
            
            return (
              <div key={s.id} style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '10px 0' }}>{s.nome_completo || s.username}</h4>
                <div className="meta-geral">
                  <h4>Meta Geral do Supervisor</h4>
                  <div className="meta-geral-inputs">
                    <div>
                      <label>Meta Financeira (R$)</label>
                      <input type="number" value={metaGeralSupervisor.financeira} onChange={(e)=> setSupMetaGeral({ ...supMetaGeral, [chave]: { ...metaGeralSupervisor, financeira: e.target.value } }) } />
                    </div>
                    <div>
                      <label>Meta de Positivacao (Qtd)</label>
                      <input type="number" value={metaGeralSupervisor.positivacao} onChange={(e)=> setSupMetaGeral({ ...supMetaGeral, [chave]: { ...metaGeralSupervisor, positivacao: e.target.value } }) } />
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
                    {tabelaSupervisor.map((linha, i) => ( 
                      <tr key={i}>
                        <td>{linha.industria}</td>
                        <td className="num">
                          <CurrencyInput
                            value={parseFloat(linha.financeira || 0)}
                            onChange={(val)=> handleChangeSup(s.id, i, 'financeira', val)}
                          />
                        </td>
                        <td className="num">
                          <NumericInput
                            value={parseInt(linha.positivacao || 0)}
                            onChange={(val)=> handleChangeSup(s.id, i, 'positivacao', val)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="linha-total">
                      <td><b>Total</b></td>
                      <td className="num">R${(totaisSupervisor.financeira).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="num">{parseInt(totaisSupervisor.positivacao).toLocaleString('pt-BR')}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>

                <div style={{ textAlign: 'center', marginTop: 15 }}>
                  <button className="btn-salvar" onClick={() => salvarMetasSupervisor(s.id)}>Salvar Metas de {s.nome_completo || s.username}</button>
                </div>
              </div>
            )
          })
        )}
      </section>
    </div>
  );
}
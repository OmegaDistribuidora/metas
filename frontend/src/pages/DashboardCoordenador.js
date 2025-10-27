import React, { useEffect, useState } from "react";
import { getMinhasMetas, getSubordinados, criarMetasLote } from "../utils/api";
import { INDUSTRIAS, CODIGOS_FORNECEDOR } from "../constants/fornecedores";
import CurrencyInput from "../components/CurrencyInput.jsx";
import NumericInput from "../components/NumericInput.jsx";
import "./styles/DashboardCoordenador.css";

export default function DashboardCoordenador({ user, onLogout }) {
  // Metas recebidas do gerente (para o coordenador)
  const [metasGerente, setMetasGerente] = useState([]);
  const [metaGeralGerente, setMetaGeralGerente] = useState(null);
  const [totaisGerente, setTotaisGerente] = useState({ financeira: 0, positivacao: 0 });
  const [comparativo, setComparativo] = useState(null);

  // Supervisores e tabelas de lancamento por supervisor
  const [supervisores, setSupervisores] = useState([]);
  const [supTabelas, setSupTabelas] = useState({}); // { [supId]: [{ industria, financeira, positivacao }] }
  const [supMetaGeral, setSupMetaGeral] = useState({}); // { [supId]: {financeira, positivacao} }
  const [supTotais, setSupTotais] = useState({}); // { [supId]: {financeira, positivacao} }
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', msg: string }

  // Minhas metas (coordenador) removido: coordenador não lança por indústria

  // Período com seletor global
  const MESES_ORDEM = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const MESES_MAP = { Jan:1, Fev:2, Mar:3, Abr:4, Mai:5, Jun:6, Jul:7, Ago:8, Set:9, Out:10, Nov:11, Dez:12 };
  const [mesSelecionado, setMesSelecionado] = useState(MESES_ORDEM[new Date().getMonth()]);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });

  const industrias = INDUSTRIAS;

  // Atualiza período sempre que mês/ano mudarem
  useEffect(() => {
    const mesNum = MESES_MAP[mesSelecionado];
    const inicio = new Date(anoSelecionado, mesNum - 1, 1);
    const fim = new Date(anoSelecionado, mesNum, 0);
    setPeriodo({
      inicio: inicio.toISOString().split("T")[0],
      fim: fim.toISOString().split("T")[0],
    });
  }, [mesSelecionado, anoSelecionado]);

  // Carrega metas recebidas do gerente (todas) e mantém crú para refiltrar
  const [metasGerenteAll, setMetasGerenteAll] = useState([]);
  useEffect(() => {
    async function carregarGerente() {
      const data = await getMinhasMetas();
      setMetasGerenteAll(Array.isArray(data) ? data : []);
    }
    carregarGerente();
  }, []);

  // Refiltra metas do gerente pelo período selecionado
  useEffect(() => {
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
  }, [metasGerenteAll, mesSelecionado, anoSelecionado]);

  // Carrega supervisores e inicializa tabelas por supervisor
  useEffect(() => {
    async function carregarSup() {
      const subs = await getSubordinados();
      const lista = Array.isArray(subs) ? subs : [];
      setSupervisores(lista);
      const tab = {}; const mg = {}; const tt = {};
      lista.forEach(s => {
        tab[s.id] = industrias.map(ind => ({ industria: ind, financeira: "", positivacao: "" }));
        mg[s.id] = { financeira: "", positivacao: "" };
        tt[s.id] = { financeira: 0, positivacao: 0 };
      });
      setSupTabelas(tab); setSupMetaGeral(mg); setSupTotais(tt);
    }
    carregarSup();
  }, []);

  // Removido: planilha de metas do próprio coordenador

  // Recalculo de totais
  const recomputeSupTotais = (supId, lista) => {
    const fin = lista.reduce((s,m)=> s + parseFloat(m.financeira||0), 0);
    const pos = lista.reduce((s,m)=> s + parseInt(m.positivacao||0), 0);
    setSupTotais(prev => ({ ...prev, [supId]: { financeira: fin, positivacao: pos } }));
  };

  const handleChangeSup = (supId, index, campo, valor) => {
    const tabela = supTabelas[supId] ? [...supTabelas[supId]] : [];
    const v = Math.max(0, Number(valor || 0));
    tabela[index][campo] = isNaN(v) ? "" : String(v);
    setSupTabelas(prev => ({ ...prev, [supId]: tabela }));
    recomputeSupTotais(supId, tabela);
  };

  // Removido: handlers e totais das metas próprias

  // Salvar metas por supervisor (periodo atual)
  const salvarMetasSupervisor = async (supId) => {
    const tabela = supTabelas[supId] || [];
    // Validação: total das indústrias deve bater (>=) a Meta Geral do supervisor
    const totalAtual = supTotais[supId] || { financeira: 0, positivacao: 0 };
    const mg = supMetaGeral[supId] || { financeira: 0, positivacao: 0 };
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

    // adiciona Meta Geral do supervisor
    const mg2 = supMetaGeral[supId] || { financeira: 0, positivacao: 0 };
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
    if (resp?.success) setToast({ type: 'success', msg: `Metas de ${supId} salvas com sucesso!` });
    else setToast({ type: 'error', msg: 'Erro ao salvar metas do supervisor' });
  };

  // Removido: salvar metas próprias do coordenador

  return (
    <div className="coordenador-container">
      {toast && (
        <div className="toast">{toast.msg}</div>
      )}
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
        {metasGerente.length === 0 ? (
          <p>Nenhuma meta recebida para o periodo atual.</p>
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

      {/* Removido: Minhas Metas por Fornecedor */}

      
      <section className="tabela-section bloco-separado">
        <h3>Lançar Metas dos Supervisores</h3>
        {supervisores.length === 0 ? (
          <p>Nenhum supervisor vinculado a voce.</p>
        ) : (
          supervisores.map((s) => (
            <div key={s.id} style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '10px 0' }}>{s.username}</h4>
              <div className="meta-geral">
                <h4>Meta Geral do Supervisor</h4>
                <div className="meta-geral-inputs">
                  <div>
                    <label>Meta Financeira (R$)</label>
                    <input type="number" value={supMetaGeral[s.id]?.financeira || ""} onChange={(e)=> setSupMetaGeral({ ...supMetaGeral, [s.id]: { ...(supMetaGeral[s.id]||{}), financeira: e.target.value } }) } />
                  </div>
                  <div>
                    <label>Meta de Positivacao (Qtd)</label>
                    <input type="number" value={supMetaGeral[s.id]?.positivacao || ""} onChange={(e)=> setSupMetaGeral({ ...supMetaGeral, [s.id]: { ...(supMetaGeral[s.id]||{}), positivacao: e.target.value } }) } />
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
                  {(supTabelas[s.id] || industrias.map(ind => ({ industria: ind, financeira: "", positivacao: "" })) ).map((linha, i) => (
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
                    <td className="num">R${(supTotais[s.id]?.financeira || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="num">{parseInt(supTotais[s.id]?.positivacao || 0).toLocaleString('pt-BR')}</td>
                  </tr>
                </tfoot>
              </table>
              </div>

              <div style={{ textAlign: 'center', marginTop: 15 }}>
                <button className="btn-salvar" onClick={() => salvarMetasSupervisor(s.id)}>Salvar Metas de {s.username}</button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

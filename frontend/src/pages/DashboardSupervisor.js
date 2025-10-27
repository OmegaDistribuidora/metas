import React, { useEffect, useState } from "react";
import { getMinhasMetas, getSubordinados, criarMetasLote } from "../utils/api";
import { INDUSTRIAS, CODIGOS_FORNECEDOR } from "../constants/fornecedores";
import CurrencyInput from "../components/CurrencyInput.jsx";
import NumericInput from "../components/NumericInput.jsx";
import "./styles/DashboardCoordenador.css";

export default function DashboardSupervisor({ user, onLogout }) {
  // Metas recebidas do coordenador (para o supervisor)
  const [metasCoordenadorAll, setMetasCoordenadorAll] = useState([]);
  const [metasCoordenador, setMetasCoordenador] = useState([]);
  const [metaGeralSupervisor, setMetaGeralSupervisor] = useState(null);
  const [totaisRecebidos, setTotaisRecebidos] = useState({ financeira: 0, positivacao: 0 });
  const [comparativo, setComparativo] = useState(null);

  // RCAs e tabelas por RCA
  const [rcas, setRcas] = useState([]);
  const [rcaTabelas, setRcaTabelas] = useState({}); // { [rcaId]: [{ industria, financeira, positivacao }] }
  const [rcaMetaGeral, setRcaMetaGeral] = useState({}); // { [rcaId]: {financeira, positivacao} }
  const [rcaTotais, setRcaTotais] = useState({}); // { [rcaId]: {financeira, positivacao} }
  const [toast, setToast] = useState(null);

  // Periodo
  const MESES_ORDEM = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const MESES_MAP = { Jan:1, Fev:2, Mar:3, Abr:4, Mai:5, Jun:6, Jul:7, Ago:8, Set:9, Out:10, Nov:11, Dez:12 };
  const [mesSelecionado, setMesSelecionado] = useState(MESES_ORDEM[new Date().getMonth()]);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });

  const industrias = INDUSTRIAS;

  useEffect(() => {
    const mesNum = MESES_MAP[mesSelecionado];
    const inicio = new Date(anoSelecionado, mesNum - 1, 1);
    const fim = new Date(anoSelecionado, mesNum, 0);
    setPeriodo({
      inicio: inicio.toISOString().split("T")[0],
      fim: fim.toISOString().split("T")[0],
    });
  }, [mesSelecionado, anoSelecionado]);

  // Carrega minhas metas (supervisor) para exibir recebidas do coordenador
  useEffect(() => {
    async function carregar() {
      const data = await getMinhasMetas();
      setMetasCoordenadorAll(Array.isArray(data) ? data : []);
    }
    carregar();
  }, []);

  useEffect(() => {
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
  }, [metasCoordenadorAll, mesSelecionado, anoSelecionado]);

  // Carrega RCAs subordinados e inicializa tabelas
  useEffect(() => {
    async function carregarRcas() {
      const subs = await getSubordinados();
      const lista = Array.isArray(subs) ? subs : [];
      setRcas(lista);
      const tab = {}; const mg = {}; const tt = {};
      lista.forEach(rca => {
        tab[rca.id] = industrias.map(ind => ({ industria: ind, financeira: "", positivacao: "" }));
        mg[rca.id] = { financeira: "", positivacao: "" };
        tt[rca.id] = { financeira: 0, positivacao: 0 };
      });
      setRcaTabelas(tab); setRcaMetaGeral(mg); setRcaTotais(tt);
    }
    carregarRcas();
  }, []);

  const recomputeRcaTotais = (rcaId, lista) => {
    const fin = lista.reduce((s,m)=> s + parseFloat(m.financeira||0), 0);
    const pos = lista.reduce((s,m)=> s + parseInt(m.positivacao||0), 0);
    setRcaTotais(prev => ({ ...prev, [rcaId]: { financeira: fin, positivacao: pos } }));
  };

  const handleChangeRca = (rcaId, index, campo, valor) => {
    const tabela = rcaTabelas[rcaId] ? [...rcaTabelas[rcaId]] : [];
    const v = Math.max(0, Number(valor || 0));
    tabela[index][campo] = isNaN(v) ? "" : String(v);
    setRcaTabelas(prev => ({ ...prev, [rcaId]: tabela }));
    recomputeRcaTotais(rcaId, tabela);
  };

  const salvarMetasRCA = async (rcaId) => {
    const tabela = rcaTabelas[rcaId] || [];
    const totalAtual = rcaTotais[rcaId] || { financeira: 0, positivacao: 0 };
    const mg = rcaMetaGeral[rcaId] || { financeira: 0, positivacao: 0 };
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

    const mg2 = rcaMetaGeral[rcaId] || { financeira: 0, positivacao: 0 };
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
    if (resp?.success) setToast({ type: 'success', msg: `Metas do RCA ${rcaId} salvas com sucesso!` });
    else setToast({ type: 'error', msg: 'Erro ao salvar metas do RCA' });
  };

  return (
    <div className="coordenador-container">
      {toast && (
        <div className="toast">{toast.msg}</div>
      )}
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
        {metasCoordenador.length === 0 ? (
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

      <section className="tabela-section bloco-separado">
        <h3>Lançar Metas dos RCAs</h3>
        {rcas.length === 0 ? (
          <p>Nenhum RCA vinculado a voce.</p>
        ) : (
          rcas.map((r) => (
            <div key={r.id} style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '10px 0' }}>{r.username}</h4>
              <div className="meta-geral">
                <h4>Meta Geral do RCA</h4>
                <div className="meta-geral-inputs">
                  <div>
                    <label>Meta Financeira (R$)</label>
                    <input type="number" value={rcaMetaGeral[r.id]?.financeira || ""} onChange={(e)=> setRcaMetaGeral({ ...rcaMetaGeral, [r.id]: { ...(rcaMetaGeral[r.id]||{}), financeira: e.target.value } }) } />
                  </div>
                  <div>
                    <label>Meta de Positivacao (Qtd)</label>
                    <input type="number" value={rcaMetaGeral[r.id]?.positivacao || ""} onChange={(e)=> setRcaMetaGeral({ ...rcaMetaGeral, [r.id]: { ...(rcaMetaGeral[r.id]||{}), positivacao: e.target.value } }) } />
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
                  {(rcaTabelas[r.id] || industrias.map(ind => ({ industria: ind, financeira: "", positivacao: "" })) ).map((linha, i) => (
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
                    <td className="num">R${(rcaTotais[r.id]?.financeira || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="num">{parseInt(rcaTotais[r.id]?.positivacao || 0).toLocaleString('pt-BR')}</td>
                  </tr>
                </tfoot>
              </table>
              </div>

              <div style={{ textAlign: 'center', marginTop: 15 }}>
                <button className="btn-salvar" onClick={() => salvarMetasRCA(r.id)}>Salvar Metas de {r.username}</button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}


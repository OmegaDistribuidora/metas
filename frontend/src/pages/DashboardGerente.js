import React, { useEffect, useState } from "react";
import { getSubordinados, criarMetasLote, logout } from "../utils/api";
import CurrencyInput from "../components/CurrencyInput.jsx";
import NumericInput from "../components/NumericInput.jsx";
import "./styles/DashboardGerente.css";

export default function DashboardGerente({ user, onLogout }) {
  const [coordenadores, setCoordenadores] = useState([]);
  const [coordenadorSelecionado, setCoordenadorSelecionado] = useState("");

  // Estados da view atual (o que está na tela)
  const [dadosMetas, setDadosMetas] = useState([]);
  const [total, setTotal] = useState({ financeira: 0, positivacao: 0 });
  const [metaGeral, setMetaGeral] = useState({ financeira: "", positivacao: "" });

  // Estados do período
  const [mesSelecionado, setMesSelecionado] = useState("Out");
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });

  // --- NOVO: Estados de "Rascunho" ---
  // Armazena os dados de rascunho para todas as combinações de coord/mês/ano
  const [tabelasSalvas, setTabelasSalvas] = useState({}); // { [chave]: [...] }
  const [metasGeraisSalvas, setMetasGeraisSalvas] = useState({}); // { [chave]: { ... } }
  const [chaveRascunho, setChaveRascunho] = useState(""); // Ex: "12-2024-Out"

  const MESES_MAP = {
    Jan: 1, Fev: 2, Mar: 3, Abr: 4, Mai: 5, Jun: 6,
    Jul: 7, Ago: 8, Set: 9, Out: 10, Nov: 11, Dez: 12,
  };

  // Atualiza o período (datas de início e fim)
  useEffect(() => {
    const mesNum = MESES_MAP[mesSelecionado];
    const inicio = new Date(anoSelecionado, mesNum - 1, 1);
    const fim = new Date(anoSelecionado, mesNum, 0);

    setPeriodo({
      inicio: inicio.toISOString().split("T")[0],
      fim: fim.toISOString().split("T")[0],
    });
  }, [mesSelecionado, anoSelecionado]);

  // --- NOVO: Cria a chave única para o rascunho ---
  // Atualiza a chave sempre que o período ou o coordenador mudar
  useEffect(() => {
    if (coordenadorSelecionado && mesSelecionado && anoSelecionado) {
      setChaveRascunho(`${coordenadorSelecionado}-${anoSelecionado}-${mesSelecionado}`);
    } else {
      setChaveRascunho(""); // Limpa a chave se algo estiver faltando
    }
  }, [coordenadorSelecionado, mesSelecionado, anoSelecionado]);

  // Lista de indústrias (sem alteração)
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
  };

  // Carrega a lista de coordenadores (sem alteração)
  useEffect(() => {
    async function carregarCoordenadores() {
      const subs = await getSubordinados();
      if (subs && Array.isArray(subs)) {
        const coords = subs.filter((u) =>
          ["Genildo", "Marlon", "Arleilson", "Atacado", "Televendas"].includes(u.username)
        );
        setCoordenadores(coords);
      }
    }
    carregarCoordenadores();
  }, []);

  // --- MODIFICADO: useEffect de Seleção de Coordenador ---
  // Agora depende da 'chaveRascunho' e 'coordenadores'
  useEffect(() => {
    // Só executa se tivermos uma chave válida e a lista de coordenadores carregada
    if (chaveRascunho && coordenadores.length > 0) {
      
      // 1. Verifica se já existe um rascunho para esta chave
      if (tabelasSalvas[chaveRascunho]) {
        // Se sim, carrega o rascunho para a view
        const tabela = tabelasSalvas[chaveRascunho];
        setDadosMetas(tabela);
        setMetaGeral(metasGeraisSalvas[chaveRascunho]);
        calcularTotais(tabela); // Recalcula o total
      } else {
        // 2. Se não, cria uma tabela vazia (primeira vez vendo)
        const nomeCoord = coordenadores.find(
          (c) => c.id == coordenadorSelecionado // coordenadorSelecionado vem da chave
        )?.username;

        const industrias = industriasPorCoordenador[nomeCoord] || [];
        const tabela = industrias.map((ind) => ({
          industria: ind,
          financeira: "",
          positivacao: "",
        }));
        const mg = { financeira: "", positivacao: "" };

        // Define a view atual
        setDadosMetas(tabela);
        setMetaGeral(mg);
        setTotal({ financeira: 0, positivacao: 0 });

        // 3. Salva essa estrutura vazia no estado de "rascunho"
        setTabelasSalvas(prev => ({ ...prev, [chaveRascunho]: tabela }));
        setMetasGeraisSalvas(prev => ({ ...prev, [chaveRascunho]: mg }));
      }
    } else {
      // Se nenhuma chave (coord/mês/ano) estiver selecionada, limpa a tela
      setDadosMetas([]);
      setMetaGeral({ financeira: "", positivacao: "" });
      setTotal({ financeira: 0, positivacao: 0 });
    }
  }, [chaveRascunho, coordenadores]); // Dispara quando a chave (coord/mês/ano) ou a lista de coords muda

  // --- MODIFICADO: Handlers de mudança ---
  const handleChange = (index, campo, valor) => {
    const novos = [...dadosMetas];
    novos[index][campo] = valor;
    setDadosMetas(novos); // Atualiza a view
    calcularTotais(novos);
    
    // Salva a mudança no rascunho
    if(chaveRascunho) {
      setTabelasSalvas(prev => ({ ...prev, [chaveRascunho]: novos }));
    }
  };

  // --- NOVO: Handler dedicado para Meta Geral ---
  const handleMetaGeralChange = (campo, valor) => {
    const novaMeta = { ...metaGeral, [campo]: valor };
    setMetaGeral(novaMeta); // Atualiza a view

    // Salva a mudança no rascunho
    if(chaveRascunho) {
      setMetasGeraisSalvas(prev => ({ ...prev, [chaveRascunho]: novaMeta }));
    }
  };

  // Função para calcular totais (sem alteração)
  const calcularTotais = (metas) => {
    const totalFin = metas.reduce(
      (sum, m) => sum + parseFloat(m.financeira || 0),
      0
    );
    const totalPos = metas.reduce(
      (sum, m) => sum + parseFloat(m.positivacao || 0),
      0
    );
    setTotal({ financeira: totalFin, positivacao: totalPos });
  };

  // Função de salvar (sem alteração)
  // Ela já lê de 'dadosMetas' e 'metaGeral', que estão sempre corretos
  const salvarMetas = async () => {
    if (!coordenadorSelecionado) {
      alert("Selecione um coordenador!");
      return;
    }

    const codigos = {
      Bombril: 117, Marata: 967, "Bom Princpio": 6212, "Stela D'Oro": 6154,
      Realeza: 2340, Panasonic: 4201, Mili: 3157, "Q-Odor": 5088, Assim: 2170,
      Albany: 1281, "Mat Inset": 2269, Florence: 3209, CCM: 5110, Gallo: 5514, Elgin: 4698,
    };

    const mesNum = MESES_MAP[mesSelecionado];

    const metasFormatadas = dadosMetas.map((linha) => ({
      codfornec: codigos[linha.industria] || null,
      industria: linha.industria,
      valor_financeiro: parseFloat(linha.financeira || 0),
      valor_positivacao: parseFloat(linha.positivacao || 0),
      mes: mesNum,
      ano: anoSelecionado,
      data_inicio: periodo.inicio,
      data_fim: periodo.fim,
    }));

    metasFormatadas.push({
      codfornec: 1,
      industria: "Meta Geral",
      valor_financeiro: parseFloat(metaGeral.financeira || 0),
      valor_positivacao: parseFloat(metaGeral.positivacao || 0),
      mes: mesNum,
      ano: anoSelecionado,
      data_inicio: periodo.inicio,
      data_fim: periodo.fim,
    });

    const resp = await criarMetasLote(coordenadorSelecionado, metasFormatadas);
    if (resp?.success) {
      alert(`OK. Metas de ${mesSelecionado}/${anoSelecionado} salvas com sucesso!`);
    } else {
      alert("Erro ao salvar metas!");
    }
  };

  // Interface (JSX)
  return (
    <div className="gerente-container">
      <header className="topo">
        <h2>Painel do Gerente</h2>
        <div className="usuario-info">
          <span>{user.username}</span>
          <button className="btn-sair" onClick={onLogout || logout}>
            Sair
          </button>
        </div>
      </header>

      {/* Seletor de Período (sem alteração) */}
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

      {/* Seletor de Coordenador (sem alteração) */}
      <section className="tabela-section">
        <h3>Lançar Metas para Coordenadores</h3>
        {coordenadores.length > 0 ? (
          <select
            className="seletor"
            value={coordenadorSelecionado}
            onChange={(e) => setCoordenadorSelecionado(e.target.value)}
          >
            <option value="">Selecione um coordenador</option>
            {coordenadores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.username}
              </option>
            ))}
          </select>
        ) : (
          <p>Nenhum coordenador encontrado.</p>
        )}
      </section>

      {/* Tabela de Lançamento */}
      {/* MODIFICADO: Só mostra se a chaveRascunho (e portanto, um coordenador) estiver ativa */}
      {chaveRascunho && (
        <section className="tabela-section">
          <div className="meta-geral">
            <h4>Meta Geral do Coordenador</h4>
            <div className="meta-geral-inputs">
              <div>
                <label>Meta Financeira (R$)</label>
                <CurrencyInput
                  value={parseFloat(metaGeral.financeira || 0)}
                  // --- MODIFICADO: Usa o novo handler ---
                  onChange={(val) => handleMetaGeralChange("financeira", val)}
                />
              </div>
              <div>
                <label>Meta de Positivacao (Qtd)</label>
                <NumericInput
                  value={parseInt(metaGeral.positivacao || 0)}
                  // --- MODIFICADO: Usa o novo handler ---
                  onChange={(val) => handleMetaGeralChange("positivacao", val)}
                />
              </div>
            </div>
          </div>

          <table className="planilha">
            <thead>
              <tr>
                <th>Fornecedor | Industria</th>
                <th className="num">Meta Financeira (R$)</th>
                <th className="num">Meta de Positivacao (Qtd)</th>
              </tr>
            </thead>
            <tbody>
              {/* O 'handleChange' já foi modificado, então isso funciona */}
              {dadosMetas.map((linha, i) => (
                <tr key={i}>
                  <td>{linha.industria}</td>
                  <td>
                    <CurrencyInput
                      value={parseFloat(linha.financeira || 0)}
                      onChange={(val) =>
                        handleChange(i, "financeira", val)
                      }
                    />
                  </td>
                  <td>
                    <NumericInput
                      value={parseInt(linha.positivacao || 0)}
                      onChange={(val) =>
                        handleChange(i, "positivacao", val)
                      }
                    />
                  </td>
                </tr>
              ))}

              <tr className="linha-total">
                <td><b>Total</b></td>
                <td><b>R${total.financeira.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></td>
                <td><b>{parseInt(total.positivacao)}</b></td>
              </tr>
            </tbody>
          </table>

          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <button className="btn-salvar" onClick={salvarMetas}>
              Salvar Metas do Coordenador
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
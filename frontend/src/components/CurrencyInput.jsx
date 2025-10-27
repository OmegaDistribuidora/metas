import React, { useEffect, useState } from "react";

function formatBRL(value) {
  const n = Number.isFinite(value) ? value : 0;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CurrencyInput({ value, onChange, readOnly = false }) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (!document.activeElement || document.activeElement.getAttribute("data-mask") !== "currency") {
      const num = typeof value === "number" ? value : parseFloat(String(value || 0));
      setDisplay(formatBRL(Number.isFinite(num) ? num : 0));
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    const digits = (raw.match(/\d+/g) || []).join("");
    const cents = digits ? parseInt(digits, 10) : 0;
    const num = cents / 100;
    if (onChange) onChange(num);
    setDisplay(formatBRL(num));
  };

  return (
    <input
      type="text"
      data-mask="currency"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      readOnly={readOnly}
      style={{ textAlign: "right", width: "100%" }}
      placeholder="R$ 0,00"
    />
  );
}

import React, { useEffect, useState } from "react";

function formatInt(value) {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString("pt-BR");
}

export default function NumericInput({ value, onChange, readOnly = false }) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (!document.activeElement || document.activeElement.getAttribute("data-mask") !== "integer") {
      const num = typeof value === "number" ? value : parseInt(String(value || 0), 10);
      setDisplay(formatInt(Number.isFinite(num) ? num : 0));
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    const digits = (raw.match(/\d+/g) || []).join("");
    const num = digits ? parseInt(digits, 10) : 0;
    if (onChange) onChange(num);
    setDisplay(formatInt(num));
  };

  return (
    <input
      type="text"
      data-mask="integer"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      readOnly={readOnly}
      style={{ textAlign: "right", width: "100%" }}
      placeholder="0"
    />
  );
}

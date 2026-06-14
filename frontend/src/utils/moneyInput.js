export const formatMoneyValue = (value) => {
  if (value === "" || value === null || value === undefined) return "";

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "";

  return numberValue.toFixed(2);
};

export const formatCentsInput = (rawValue) => {
  const digits = String(rawValue).replace(/\D/g, "");
  if (!digits) return "";

  return (Number(digits) / 100).toFixed(2);
};

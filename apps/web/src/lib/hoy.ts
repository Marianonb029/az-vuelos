// Fecha local del navegador en formato ISO (AAAA-MM-DD).
export const hoyIso = (): string => {
  const f = new Date();
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const dd = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${mm}-${dd}`;
};

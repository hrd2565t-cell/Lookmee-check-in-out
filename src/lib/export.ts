// ส่งออก CSV สำหรับเปิดใน Excel — ใส่ BOM ภาษาไทย + ครอบฟิลด์ตาม RFC 4180

export type CsvValue = string | number | null | undefined;

function cell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(
  filename: string,
  header: CsvValue[],
  rows: CsvValue[][],
): void {
  const csv = [header, ...rows].map((line) => line.map(cell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** วันนี้แบบ YYYY-MM-DD สำหรับตั้งชื่อไฟล์ */
export function exportStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

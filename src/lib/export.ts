import * as XLSX from "xlsx";

export type ExportData = {
  items: Array<Record<string, unknown>>;
  reminders: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  exportedAt: string;
};

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function exportJson(data: ExportData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  download(blob, `one-home-export-${stamp()}.json`);
}

export function exportCsv(data: ExportData) {
  const sections = [
    `# APPLICATIONS\n${toCsv(data.items)}`,
    `\n\n# REMINDERS\n${toCsv(data.reminders)}`,
    `\n\n# DOCUMENTS\n${toCsv(data.documents)}`,
  ].join("");
  const blob = new Blob([sections], { type: "text/csv" });
  download(blob, `one-home-export-${stamp()}.csv`);
}

export function exportXlsx(data: ExportData) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.items), "Applications");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.reminders), "Reminders");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.documents), "Documents");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `one-home-export-${stamp()}.xlsx`,
  );
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

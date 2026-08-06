"use client";

type ExportFormat = "pdf" | "word" | "txt";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, content: string) {
  triggerDownload(new Blob([content], { type: "text/plain;charset=utf-8" }), filename);
}

export function downloadWordFile(filename: string, title: string, body: string) {
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; margin: 1in; }
    h1 { font-size: 16pt; color: #0d6e6e; margin-bottom: 4pt; }
    h2 { font-size: 12pt; margin-top: 18pt; margin-bottom: 6pt; }
    .meta { font-size: 9pt; color: #555; margin-bottom: 16pt; }
    pre { white-space: pre-wrap; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    .risk { margin-bottom: 14pt; padding-bottom: 10pt; border-bottom: 1px solid #ddd; }
    .high { color: #b91c1c; } .medium { color: #b45309; } .low { color: #15803d; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <pre>${escapeHtml(body)}</pre>
</body>
</html>`;
  const name = filename.endsWith(".doc") ? filename : `${filename.replace(/\.[^.]+$/, "")}.doc`;
  triggerDownload(new Blob(["\ufeff", html], { type: "application/msword" }), name);
}

export async function downloadPdfFile(filename: string, title: string, body: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxW = pageW - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(13, 110, 110);
  const titleLines = doc.splitTextToSize(title, maxW);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);

  const lines = doc.splitTextToSize(body, maxW);
  const lineH = 5;
  const pageH = doc.internal.pageSize.getHeight();

  for (const line of lines) {
    if (y > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineH;
  }

  const name = filename.endsWith(".pdf") ? filename : `${filename.replace(/\.[^.]+$/, "")}.pdf`;
  doc.save(name);
}

export async function downloadDocument(
  format: ExportFormat,
  filename: string,
  title: string,
  body: string
) {
  if (format === "txt") downloadTextFile(filename.endsWith(".txt") ? filename : `${filename}.txt`, body);
  else if (format === "word") downloadWordFile(filename, title, body);
  else await downloadPdfFile(filename, title, body);
}

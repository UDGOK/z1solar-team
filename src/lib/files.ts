export function isImage(contentType?: string | null) {
  return !!contentType && contentType.startsWith("image/");
}

export function fileKind(contentType?: string | null, filename?: string): { label: string; color: string } {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || "";
  if (contentType === "application/pdf" || ext === "pdf") return { label: "PDF", color: "#C0392B" };
  if (contentType?.includes("word") || ["doc", "docx"].includes(ext)) return { label: "DOC", color: "#2B579A" };
  if (contentType?.includes("sheet") || contentType?.includes("excel") || ["xls", "xlsx", "csv"].includes(ext))
    return { label: "XLS", color: "#217346" };
  if (contentType?.includes("presentation") || ["ppt", "pptx"].includes(ext)) return { label: "PPT", color: "#D24726" };
  if (isImage(contentType) || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return { label: "IMG", color: "#4CAB3E" };
  return { label: "FILE", color: "#8A8A85" };
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

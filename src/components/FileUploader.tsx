"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { attachFileToProject } from "@/lib/actions";

export default function FileUploader({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const files = Array.from(fileList);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        await attachFileToProject(projectId, {
          url: blob.url,
          pathname: blob.pathname,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,image/*"
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="btn-secondary text-xs"
      >
        {uploading ? progress || "Uploading…" : "+ Upload Files"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <p className="text-xs text-brand-inkFaint mt-1">PDF, Word, Excel, PowerPoint, or images — up to 25MB each.</p>
    </div>
  );
}

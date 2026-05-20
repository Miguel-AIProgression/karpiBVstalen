"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Camera, Loader2, AlertCircle, Pencil, X } from "lucide-react";
import Image from "next/image";

interface LogoUploadProps {
  clientId: string;
  clientNumber: string | null;
  currentUrl: string | null;
  logoNotFound?: boolean;
  onUploaded: (url: string) => void;
}

export function LogoUpload({ clientId, clientNumber, currentUrl, logoNotFound, onUploaded }: LogoUploadProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filename = clientNumber ? `${clientNumber}.${ext}` : `${clientId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("client-logos")
        .upload(filename, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("client-logos").getPublicUrl(filename);
      const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;
      await supabase.from("clients").update({ logo_url: publicUrl }).eq("id", clientId);
      onUploaded(publicUrl);
    } catch (err: any) {
      setError(err.message ?? "Upload mislukt");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      <div className="flex flex-col items-center gap-1.5">
        {/* Logo vlak — klik = voorvertoning, hover = wijzig-knop */}
        <div className="relative h-20 w-20 group">
          <button
            type="button"
            onClick={() => currentUrl ? setPreview(true) : fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary"
            title={currentUrl ? "Voorvertoning" : "Logo uploaden"}
          >
            {uploading ? (
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            ) : currentUrl ? (
              <Image src={currentUrl} alt="Logo" fill className="object-cover rounded-xl" unoptimized />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary">
                <Camera size={20} />
                <span className="text-[10px]">Logo</span>
              </div>
            )}
          </button>

          {/* Wijzig-knop verschijnt op hover als er al een logo is */}
          {currentUrl && !uploading && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Logo wijzigen"
              className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-primary hover:border-primary opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil size={11} />
            </button>
          )}
        </div>

        {logoNotFound && (
          <div className="flex items-center gap-1 text-[10px] text-amber-600 max-w-[80px] text-center leading-tight">
            <AlertCircle size={10} className="shrink-0" />
            <span>Geen logo gevonden, upload handmatig</span>
          </div>
        )}
        {error && (
          <span className="text-[10px] text-destructive max-w-[80px] text-center">{error}</span>
        )}
      </div>

      {/* Voorvertoning modal */}
      {preview && currentUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreview(false)}
        >
          <div className="relative max-w-lg w-full mx-6" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreview(false)}
              className="absolute -top-3 -right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-card border border-border shadow-md text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
            <div className="overflow-hidden rounded-2xl bg-white shadow-2xl p-6 flex items-center justify-center">
              <img src={currentUrl} alt="Logo voorvertoning" className="max-h-80 max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Camera, Loader2, AlertCircle } from "lucide-react";
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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      // Sla op als {client_number}.{ext} zodat het overeenkomt met bestaande logo-bestanden
      const filename = clientNumber ? `${clientNumber}.${ext}` : `${clientId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("client-logos")
        .upload(filename, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("client-logos")
        .getPublicUrl(filename);

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
    <div className="flex flex-col items-center gap-1.5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title={currentUrl ? "Logo wijzigen" : "Logo uploaden"}
        className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary hover:bg-muted"
      >
        {uploading ? (
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        ) : currentUrl ? (
          <Image src={currentUrl} alt="Logo" fill className="object-cover" unoptimized />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary">
            <Camera size={20} />
            <span className="text-[10px]">Logo</span>
          </div>
        )}
      </button>
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
  );
}

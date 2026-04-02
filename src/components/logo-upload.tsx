"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Camera, Loader2 } from "lucide-react";
import Image from "next/image";

interface LogoUploadProps {
  clientId: string;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}

export function LogoUpload({ clientId, currentUrl, onUploaded }: LogoUploadProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${clientId}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("client-logos")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("client-logos")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      await supabase
        .from("clients")
        .update({ logo_url: publicUrl })
        .eq("id", clientId);

      onUploaded(publicUrl);
    } catch (err) {
      console.error("Logo upload error:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
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
        className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary hover:bg-muted"
      >
        {uploading ? (
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        ) : currentUrl ? (
          <Image
            src={currentUrl}
            alt="Client logo"
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary">
            <Camera size={20} />
            <span className="text-[10px]">Logo</span>
          </div>
        )}
      </button>
    </div>
  );
}

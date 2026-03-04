"use client";

import { useEffect, useMemo } from "react";
import { Trash2 } from "lucide-react";

import { useSupabaseUpload } from "@/hooks/useSupabaseUpload";
import {
  NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_BYTES,
  NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET,
} from "@/lib/env";
import { Button } from "@/components/ui/button";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/ui/dropzone";

interface CompanyLogoUploadFieldProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxFileSizeBytes?: number;
}

const sanitizePathSegment = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "general";

export function CompanyLogoUploadField({
  value,
  onChange,
  disabled = false,
  maxFileSizeBytes,
}: CompanyLogoUploadFieldProps) {
  const bucketName = NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET;
  const resolvedMaxFileSizeBytes =
    maxFileSizeBytes ?? NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_BYTES;

  const uploadPath = useMemo(
    () =>
      `advertisers/logos/${sanitizePathSegment(new Date().toISOString().slice(0, 10))}`,
    [],
  );

  const uploader = useSupabaseUpload({
    bucketName,
    path: uploadPath,
    allowedMimeTypes: ["image/*"],
    maxFileSize: resolvedMaxFileSizeBytes,
    maxFiles: 1,
    upsert: false,
    cacheControl: 3600,
  });

  useEffect(() => {
    if (!uploader.isSuccess || uploader.uploadedFiles.length === 0) return;
    const uploaded = uploader.uploadedFiles[0];
    if (uploaded.publicUrl) {
      onChange(uploaded.publicUrl);
    }
  }, [uploader.isSuccess, uploader.uploadedFiles, onChange]);

  return (
    <div className="space-y-3">
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
          <div className="h-16 w-16 overflow-hidden rounded-lg border bg-muted">
            <img
              src={value}
              alt="Company logo preview"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Current logo</p>
            <p className="truncate text-xs text-muted-foreground">{value}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onChange("")}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        </div>
      ) : null}

      <Dropzone
        {...uploader}
        className="rounded-xl border-border/60 bg-background/30"
      >
        <DropzoneEmptyState />
        <DropzoneContent />
      </Dropzone>
    </div>
  );
}

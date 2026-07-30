"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  REWARD_CATALOG_ALLOWED_MIME_TYPES,
  REWARD_CATALOG_GALLERY_MAX_ITEMS,
  REWARD_CATALOG_IMAGE_MAX_BYTES,
  validateRewardCatalogImage,
} from "@/lib/rewardCatalogImageShared";
import {
  removeRewardCatalogGalleryImage,
  removeRewardCatalogThumbnail,
  reorderRewardCatalogGallery,
  uploadRewardCatalogGalleryImage,
  uploadRewardCatalogThumbnail,
} from "@/app/actions/rewardCatalog";

export type RewardCatalogMediaValue = {
  thumbnailUrl: string;
  galleryUrls: string[];
};

export type StagedRewardCatalogMedia = {
  thumbnailFile: File | null;
  galleryFiles: File[];
  thumbnailCleared: boolean;
};

type RewardCatalogMediaFieldsProps = {
  value: RewardCatalogMediaValue;
  onChange: (next: RewardCatalogMediaValue) => void;
  /** When set, uploads persist immediately via server actions. */
  rewardId?: string;
  disabled?: boolean;
  /** Fired after a server-persisted media mutation succeeds (edit flow). */
  onPersisted?: () => void;
  /**
   * Create flow: files are staged until the product row exists.
   * Parent should read via `onStagedChange` and flush after insert.
   */
  staged?: boolean;
  onStagedChange?: (staged: StagedRewardCatalogMedia) => void;
};

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} as const;

const maxMb = REWARD_CATALOG_IMAGE_MAX_BYTES / (1024 * 1024);

function fileIdentity(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Upload staged create-flow media. On partial gallery failure, roll back
 * successfully uploaded gallery objects (and thumbnail if uploaded in this flush).
 */
export async function flushStagedRewardCatalogMedia(
  rewardId: string,
  staged: StagedRewardCatalogMedia,
  onProgress?: (percent: number, label: string) => void,
): Promise<{ success: boolean; error?: string }> {
  const totalSteps =
    (staged.thumbnailCleared ? 1 : 0) +
    (staged.thumbnailFile ? 1 : 0) +
    staged.galleryFiles.length;
  let completed = 0;
  const tick = (label: string) => {
    completed += 1;
    const percent =
      totalSteps === 0 ? 100 : Math.round((completed / totalSteps) * 100);
    onProgress?.(percent, label);
  };

  let thumbnailUploaded = false;
  const uploadedGalleryIndexes: number[] = [];

  const rollback = async () => {
    for (const index of [...uploadedGalleryIndexes].reverse()) {
      await removeRewardCatalogGalleryImage(rewardId, index);
    }
    if (thumbnailUploaded) {
      await removeRewardCatalogThumbnail(rewardId);
    }
  };

  try {
    if (staged.thumbnailCleared) {
      const cleared = await removeRewardCatalogThumbnail(rewardId);
      if (!cleared.success) {
        return { success: false, error: cleared.error };
      }
      tick("Cleared thumbnail");
    }

    if (staged.thumbnailFile) {
      const formData = new FormData();
      formData.append("file", staged.thumbnailFile);
      const uploaded = await uploadRewardCatalogThumbnail(rewardId, formData);
      if (!uploaded.success) {
        await rollback();
        return { success: false, error: uploaded.error };
      }
      thumbnailUploaded = true;
      tick("Uploaded thumbnail");
    }

    for (const file of staged.galleryFiles) {
      const formData = new FormData();
      formData.append("file", file);
      const uploaded = await uploadRewardCatalogGalleryImage(rewardId, formData);
      if (!uploaded.success) {
        await rollback();
        return { success: false, error: uploaded.error };
      }
      const index = (uploaded.galleryUrls?.length ?? 1) - 1;
      uploadedGalleryIndexes.push(index);
      tick(`Uploaded gallery image ${uploadedGalleryIndexes.length}`);
    }

    onProgress?.(100, "Done");
    return { success: true };
  } catch (err) {
    await rollback();
    return {
      success: false,
      error: err instanceof Error ? err.message : "Media upload failed",
    };
  }
}

export function RewardCatalogMediaFields({
  value,
  onChange,
  rewardId,
  disabled = false,
  onPersisted,
  staged = false,
  onStagedChange,
}: RewardCatalogMediaFieldsProps) {
  const { toast } = useToast();
  const thumbInputId = useId();
  const galleryInputId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(
    null,
  );
  const [showAdvancedUrls, setShowAdvancedUrls] = useState(false);
  const [stagedThumbFile, setStagedThumbFile] = useState<File | null>(null);
  const [stagedThumbPreview, setStagedThumbPreview] = useState<string | null>(
    null,
  );
  const [stagedGalleryFiles, setStagedGalleryFiles] = useState<File[]>([]);
  const [stagedGalleryPreviews, setStagedGalleryPreviews] = useState<string[]>(
    [],
  );
  const [thumbnailCleared, setThumbnailCleared] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);

  const emitStaged = useCallback(
    (next: {
      thumbnailFile?: File | null;
      galleryFiles?: File[];
      thumbnailCleared?: boolean;
    }) => {
      const payload: StagedRewardCatalogMedia = {
        thumbnailFile:
          next.thumbnailFile !== undefined
            ? next.thumbnailFile
            : stagedThumbFile,
        galleryFiles:
          next.galleryFiles !== undefined
            ? next.galleryFiles
            : stagedGalleryFiles,
        thumbnailCleared:
          next.thumbnailCleared !== undefined
            ? next.thumbnailCleared
            : thumbnailCleared,
      };
      onStagedChange?.(payload);
    },
    [onStagedChange, stagedGalleryFiles, stagedThumbFile, thumbnailCleared],
  );

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const trackPreview = (url: string) => {
    previewUrlsRef.current.push(url);
    return url;
  };

  const shownThumbnail =
    staged && stagedThumbPreview
      ? stagedThumbPreview
      : thumbnailCleared
        ? null
        : value.thumbnailUrl || null;

  const shownGallery =
    staged && stagedGalleryPreviews.length > 0
      ? [...value.galleryUrls, ...stagedGalleryPreviews]
      : value.galleryUrls;

  const runImmediate = async (
    key: string,
    action: () => Promise<{ success: boolean; error?: string }>,
    onSuccess?: () => void,
  ) => {
    setBusy(key);
    setError(null);
    setRetryAction(null);
    setProgress(15);
    setProgressLabel("Uploading…");
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Upload failed.");
        setProgress(0);
        setProgressLabel(null);
        setRetryAction(() => async () => {
          await runImmediate(key, action, onSuccess);
        });
        toast({
          title: "Media update failed",
          description: result.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      setProgress(100);
      setProgressLabel("Done");
      onSuccess?.();
      onPersisted?.();
      window.setTimeout(() => {
        setProgress(0);
        setProgressLabel(null);
      }, 600);
    } finally {
      setBusy(null);
    }
  };

  const handleThumbnailFile = async (file: File | null) => {
    setError(null);
    if (!file) return;

    const validation = validateRewardCatalogImage(file.type, file.size);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    if (staged || !rewardId) {
      if (stagedThumbPreview) URL.revokeObjectURL(stagedThumbPreview);
      const preview = trackPreview(URL.createObjectURL(file));
      setStagedThumbFile(file);
      setStagedThumbPreview(preview);
      setThumbnailCleared(false);
      emitStaged({ thumbnailFile: file, thumbnailCleared: false });
      return;
    }

    await runImmediate(
      "thumbnail",
      async () => {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadRewardCatalogThumbnail(rewardId, formData);
        if (result.success && result.thumbnailUrl) {
          onChange({ ...value, thumbnailUrl: result.thumbnailUrl });
          toast({ title: "Thumbnail uploaded" });
        }
        return result;
      },
    );
  };

  const handleRemoveThumbnail = async () => {
    setError(null);

    if (staged || !rewardId) {
      if (stagedThumbPreview) URL.revokeObjectURL(stagedThumbPreview);
      setStagedThumbFile(null);
      setStagedThumbPreview(null);
      setThumbnailCleared(true);
      onChange({ ...value, thumbnailUrl: "" });
      emitStaged({ thumbnailFile: null, thumbnailCleared: true });
      return;
    }

    await runImmediate("thumbnail-remove", async () => {
      const result = await removeRewardCatalogThumbnail(rewardId);
      if (result.success) {
        onChange({ ...value, thumbnailUrl: "" });
        toast({ title: "Thumbnail removed" });
      }
      return result;
    });
  };

  const handleGalleryFiles = async (files: File[]) => {
    setError(null);
    if (files.length === 0) return;

    for (const file of files) {
      const validation = validateRewardCatalogImage(file.type, file.size);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
    }

    const existingIdentities = new Set(
      [
        ...stagedGalleryFiles.map(fileIdentity),
        ...(stagedThumbFile ? [fileIdentity(stagedThumbFile)] : []),
      ],
    );
    const uniqueFiles = files.filter((file) => {
      const id = fileIdentity(file);
      if (existingIdentities.has(id)) return false;
      existingIdentities.add(id);
      return true;
    });
    if (uniqueFiles.length === 0) {
      setError("Those images are already staged for upload.");
      return;
    }
    if (uniqueFiles.length < files.length) {
      setError("Skipped duplicate files already staged.");
    }

    const room =
      REWARD_CATALOG_GALLERY_MAX_ITEMS -
      value.galleryUrls.length -
      (staged ? stagedGalleryFiles.length : 0);
    if (uniqueFiles.length > room) {
      setError(
        `Gallery is limited to ${REWARD_CATALOG_GALLERY_MAX_ITEMS} images.`,
      );
      return;
    }

    if (staged || !rewardId) {
      const nextFiles = [...stagedGalleryFiles, ...uniqueFiles];
      const nextPreviews = [
        ...stagedGalleryPreviews,
        ...uniqueFiles.map((file) => trackPreview(URL.createObjectURL(file))),
      ];
      setStagedGalleryFiles(nextFiles);
      setStagedGalleryPreviews(nextPreviews);
      emitStaged({ galleryFiles: nextFiles });
      return;
    }

    const total = uniqueFiles.length;
    let galleryUrls = value.galleryUrls;
    for (let i = 0; i < uniqueFiles.length; i += 1) {
      const file = uniqueFiles[i];
      // Sequential so slot numbers stay stable.
      // eslint-disable-next-line no-await-in-loop
      await runImmediate(`gallery-${file.name}-${i}`, async () => {
        setProgress(Math.round(((i + 0.5) / total) * 100));
        setProgressLabel(`Uploading ${i + 1} of ${total}…`);
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadRewardCatalogGalleryImage(
          rewardId,
          formData,
        );
        if (result.success && result.galleryUrls) {
          galleryUrls = result.galleryUrls;
          onChange({ ...value, galleryUrls });
          toast({ title: "Gallery image uploaded" });
        }
        return result;
      });
    }
  };

  const handleReplaceGallery = async (index: number, file: File) => {
    setError(null);
    if (!rewardId || staged) {
      setError("Save the product before replacing gallery images.");
      return;
    }

    const validation = validateRewardCatalogImage(file.type, file.size);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    await runImmediate(`gallery-replace-${index}`, async () => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadRewardCatalogGalleryImage(
        rewardId,
        formData,
        index,
      );
      if (result.success && result.galleryUrls) {
        onChange({ ...value, galleryUrls: result.galleryUrls });
        toast({ title: "Gallery image replaced" });
      }
      return result;
    });
  };

  const handleRemoveGallery = async (index: number) => {
    setError(null);

    if (staged || !rewardId) {
      // Staged extras sit after persisted URLs.
      const persistedCount = value.galleryUrls.length;
      if (index < persistedCount) {
        const next = value.galleryUrls.filter((_, i) => i !== index);
        onChange({ ...value, galleryUrls: next });
        return;
      }
      const stagedIndex = index - persistedCount;
      const nextFiles = stagedGalleryFiles.filter((_, i) => i !== stagedIndex);
      const revoked = stagedGalleryPreviews[stagedIndex];
      if (revoked) URL.revokeObjectURL(revoked);
      const nextPreviews = stagedGalleryPreviews.filter(
        (_, i) => i !== stagedIndex,
      );
      setStagedGalleryFiles(nextFiles);
      setStagedGalleryPreviews(nextPreviews);
      emitStaged({ galleryFiles: nextFiles });
      return;
    }

    await runImmediate(`gallery-remove-${index}`, async () => {
      const result = await removeRewardCatalogGalleryImage(rewardId, index);
      if (result.success && result.galleryUrls) {
        onChange({ ...value, galleryUrls: result.galleryUrls });
        toast({ title: "Gallery image removed" });
      }
      return result;
    });
  };

  const moveGallery = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.galleryUrls.length) return;
    if (staged || !rewardId) {
      const next = [...value.galleryUrls];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      onChange({ ...value, galleryUrls: next });
      return;
    }

    const next = [...value.galleryUrls];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);

    await runImmediate(`gallery-reorder-${index}`, async () => {
      const result = await reorderRewardCatalogGallery(rewardId, next);
      if (result.success && result.galleryUrls) {
        onChange({ ...value, galleryUrls: result.galleryUrls });
      }
      return result;
    });
  };

  const thumbDropzone = useDropzone({
    accept: ACCEPT,
    maxFiles: 1,
    multiple: false,
    disabled: disabled || busy !== null,
    noClick: true,
    onDrop: (accepted) => {
      void handleThumbnailFile(accepted[0] ?? null);
    },
  });

  const galleryDropzone = useDropzone({
    accept: ACCEPT,
    maxFiles: REWARD_CATALOG_GALLERY_MAX_ITEMS,
    multiple: true,
    disabled: disabled || busy !== null,
    noClick: true,
    onDrop: (accepted) => {
      void handleGalleryFiles(accepted);
    },
  });

  const isBusy = busy !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          JPEG, PNG or WebP, up to {maxMb} MB. Uploads are stored in MOVRR
          Storage
          {staged
            ? " after you save the product."
            : " and written to thumbnail / gallery URLs."}
        </p>
        {isBusy ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Working…
          </span>
        ) : null}
      </div>

      {progressLabel || progress > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{progressLabel ?? "Uploading…"}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Thumbnail</Label>
        <div
          {...thumbDropzone.getRootProps({
            className: cn(
              "rounded-lg border border-dashed border-border bg-muted/20 p-3 transition-colors",
              thumbDropzone.isDragActive && "border-primary bg-primary/5",
              disabled && "opacity-60",
            ),
          })}
        >
          <input {...thumbDropzone.getInputProps()} />
          {shownThumbnail ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage / external URLs vary by environment */}
              <img
                src={shownThumbnail}
                alt="Product thumbnail"
                className="h-20 w-20 rounded-md border object-cover bg-muted"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-xs text-muted-foreground">
                  {value.thumbnailUrl || "Staged thumbnail (uploads on save)"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || isBusy}
                    onClick={() =>
                      document.getElementById(thumbInputId)?.click()
                    }
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || isBusy}
                    onClick={() => void handleRemoveThumbnail()}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled || isBusy}
              className="flex w-full flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
              onClick={() => document.getElementById(thumbInputId)?.click()}
            >
              <ImagePlus className="h-6 w-6" />
              Drag & drop or click to upload thumbnail
            </button>
          )}
          <input
            id={thumbInputId}
            type="file"
            accept={REWARD_CATALOG_ALLOWED_MIME_TYPES.join(",")}
            className="hidden"
            disabled={disabled || isBusy}
            onChange={(event) => {
              void handleThumbnailFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Gallery</Label>
        {shownGallery.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {shownGallery.map((url, index) => {
              const isPersisted = index < value.galleryUrls.length;
              return (
                <div
                  key={`${url}-${index}`}
                  className="relative h-20 w-20 overflow-hidden rounded-md border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Gallery ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-black/50 p-0.5">
                    {isPersisted ? (
                      <>
                        <button
                          type="button"
                          className="rounded p-0.5 text-white disabled:opacity-40"
                          disabled={disabled || isBusy || index === 0}
                          onClick={() => void moveGallery(index, -1)}
                          title="Move earlier"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 text-white disabled:opacity-40"
                          disabled={
                            disabled ||
                            isBusy ||
                            index >= value.galleryUrls.length - 1
                          }
                          onClick={() => void moveGallery(index, 1)}
                          title="Move later"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        {rewardId && !staged ? (
                          <label className="cursor-pointer rounded p-0.5 text-white">
                            <Upload className="h-3.5 w-3.5" />
                            <input
                              type="file"
                              accept={REWARD_CATALOG_ALLOWED_MIME_TYPES.join(
                                ",",
                              )}
                              className="hidden"
                              disabled={disabled || isBusy}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void handleReplaceGallery(index, file);
                                event.target.value = "";
                              }}
                            />
                          </label>
                        ) : null}
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="rounded p-0.5 text-white"
                      disabled={disabled || isBusy}
                      onClick={() => void handleRemoveGallery(index)}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div
          {...galleryDropzone.getRootProps({
            className: cn(
              "rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center transition-colors",
              galleryDropzone.isDragActive && "border-primary bg-primary/5",
              disabled && "opacity-60",
            ),
          })}
        >
          <input {...galleryDropzone.getInputProps()} />
          <button
            type="button"
            disabled={disabled || isBusy}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            onClick={() => document.getElementById(galleryInputId)?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            Add gallery images
          </button>
          <input
            id={galleryInputId}
            type="file"
            accept={REWARD_CATALOG_ALLOWED_MIME_TYPES.join(",")}
            className="hidden"
            multiple
            disabled={disabled || isBusy}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              void handleGalleryFiles(files);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowAdvancedUrls((open) => !open)}
        >
          {showAdvancedUrls
            ? "Hide advanced URL fields"
            : "Advanced: paste external URLs (escape hatch)"}
        </button>
        {showAdvancedUrls ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reward-thumbnail-url-advanced">
                Thumbnail URL
              </Label>
              <Input
                id="reward-thumbnail-url-advanced"
                value={value.thumbnailUrl}
                disabled={disabled || isBusy}
                onChange={(event) => {
                  setThumbnailCleared(false);
                  onChange({
                    ...value,
                    thumbnailUrl: event.target.value,
                  });
                }}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reward-gallery-urls-advanced">
                Gallery URLs (comma-separated)
              </Label>
              <Input
                id="reward-gallery-urls-advanced"
                value={value.galleryUrls.join(", ")}
                disabled={disabled || isBusy}
                onChange={(event) => {
                  onChange({
                    ...value,
                    galleryUrls: event.target.value
                      .split(",")
                      .map((url) => url.trim())
                      .filter(Boolean),
                  });
                }}
                placeholder="https://…, https://…"
              />
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive">{error}</p>
          {retryAction ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isBusy}
              onClick={() => void retryAction()}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useDropzone,
  type FileError,
  type FileRejection,
} from "react-dropzone";

const supabase = createSupabaseBrowserClient();

const getFileIdentity = (file: File) =>
  `${file.name}-${file.size}-${file.lastModified}`;

const revokePreview = (file: FileWithPreview) => {
  if (file.preview) {
    URL.revokeObjectURL(file.preview);
  }
};

interface FileWithPreview extends File {
  preview?: string;
  errors: readonly FileError[];
}

interface UploadedSupabaseFile {
  name: string;
  path: string;
  publicUrl: string;
}

type UseSupabaseUploadOptions = {
  /**
   * Name of bucket to upload files to in your Supabase project
   */
  bucketName: string;
  /**
   * Folder to upload files to in the specified bucket within your Supabase project.
   *
   * Defaults to uploading files to the root of the bucket
   *
   * e.g If specified path is `test`, your file will be uploaded as `test/file_name`
   */
  path?: string;
  /**
   * Allowed MIME types for each file upload (e.g `image/png`, `text/html`, etc). Wildcards are also supported (e.g `image/*`).
   *
   * Defaults to allowing uploading of all MIME types.
   */
  allowedMimeTypes?: string[];
  /**
   * Maximum upload size of each file allowed in bytes. (e.g 1000 bytes = 1 KB)
   */
  maxFileSize?: number;
  /**
   * Maximum number of files allowed per upload.
   */
  maxFiles?: number;
  /**
   * The number of seconds the asset is cached in the browser and in the Supabase CDN.
   *
   * This is set in the Cache-Control: max-age=<seconds> header. Defaults to 3600 seconds.
   */
  cacheControl?: number;
  /**
   * When set to true, the file is overwritten if it exists.
   *
   * When set to false, an error is thrown if the object already exists. Defaults to `false`
   */
  upsert?: boolean;
};

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>;

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
  } = options;

  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([]);
  const [successes, setSuccesses] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedSupabaseFile[]>([]);
  const previousFilesRef = useRef<FileWithPreview[]>([]);
  const uploadSessionRef = useRef(0);

  const isSessionActive = useCallback(
    (sessionId: number) => uploadSessionRef.current === sessionId,
    [],
  );

  const cancelUpload = useCallback(() => {
    uploadSessionRef.current += 1;
    setLoading(false);
  }, []);

  const makeUniqueFilePath = useCallback(
    (fileName: string) => {
      const normalizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniquePrefix =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const resolvedName = `${uniquePrefix}-${normalizedName}`;
      return !!path ? `${path}/${resolvedName}` : resolvedName;
    },
    [path],
  );

  const isSuccess = useMemo(() => {
    if (errors.length === 0 && successes.length === 0) {
      return false;
    }
    if (errors.length === 0 && successes.length === files.length) {
      return true;
    }
    return false;
  }, [errors.length, successes.length, files.length]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const validFiles = acceptedFiles
        .filter((file) => !files.find((x) => x.name === file.name))
        .map((file) => {
          (file as FileWithPreview).preview = URL.createObjectURL(file);
          (file as FileWithPreview).errors = [];
          return file as FileWithPreview;
        });

      const invalidFiles = fileRejections.map(({ file, errors }) => {
        (file as FileWithPreview).preview = URL.createObjectURL(file);
        (file as FileWithPreview).errors = errors;
        return file as FileWithPreview;
      });

      const newFiles = [...files, ...validFiles, ...invalidFiles];

      setFiles(newFiles);
    },
    [files, setFiles],
  );

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce(
      (acc, type) => ({ ...acc, [type]: [] }),
      {},
    ),
    maxSize: maxFileSize,
    maxFiles: maxFiles,
    multiple: maxFiles !== 1,
  });

  const onUpload = useCallback(async () => {
    const currentSessionId = uploadSessionRef.current + 1;
    uploadSessionRef.current = currentSessionId;
    setLoading(true);
    try {
      // [Joshen] This is to support handling partial successes
      // If any files didn't upload for any reason, hitting "Upload" again will only upload the files that had errors
      const filesWithErrors = new Set(errors.map((x) => x.name));
      const candidateFiles =
        filesWithErrors.size > 0
          ? files.filter(
              (file) =>
                filesWithErrors.has(file.name) || !successes.includes(file.name),
            )
          : files;

      // Ensure we never enqueue the same file twice during retry paths.
      const filesToUpload = Array.from(
        new Map(
          candidateFiles.map((file) => [getFileIdentity(file), file]),
        ).values(),
      );

      const responses = await Promise.all(
        filesToUpload.map(async (file) => {
          const filePath = makeUniqueFilePath(file.name);
          const { error } = await supabase.storage
            .from(bucketName)
            .upload(filePath, file, {
              cacheControl: cacheControl.toString(),
              upsert,
            });

          if (error) {
            return { name: file.name, message: error.message };
          }

          const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
          return {
            name: file.name,
            message: undefined,
            path: filePath,
            publicUrl: data.publicUrl,
          };
        }),
      );

      if (!isSessionActive(currentSessionId)) {
        return;
      }

      const responseErrors = responses.filter((x) => x.message !== undefined);
      // if there were errors previously, this function tried to upload the files again so we should clear/overwrite the existing errors.
      setErrors(responseErrors);

      const responseSuccesses = responses.filter((x) => x.message === undefined);
      const newSuccesses = Array.from(
        new Set([...successes, ...responseSuccesses.map((x) => x.name)]),
      );
      setSuccesses(newSuccesses);
      const successfulUploads = responseSuccesses
        .filter(
          (
            item,
          ): item is {
            name: string;
            message: undefined;
            path: string;
            publicUrl: string;
          } => typeof item.path === "string" && typeof item.publicUrl === "string",
        )
        .map((item) => ({
          name: item.name,
          path: item.path,
          publicUrl: item.publicUrl,
        }));
      setUploadedFiles((current) => {
        const map = new Map(current.map((item) => [item.path, item]));
        successfulUploads.forEach((item) => {
          map.set(item.path, item);
        });
        return Array.from(map.values());
      });
    } catch (error) {
      if (!isSessionActive(currentSessionId)) {
        return;
      }
      setErrors([
        {
          name: "upload",
          message: error instanceof Error ? error.message : "Upload failed",
        },
      ]);
    } finally {
      if (isSessionActive(currentSessionId)) {
        setLoading(false);
      }
    }
  }, [
    files,
    bucketName,
    errors,
    successes,
    makeUniqueFilePath,
    cacheControl,
    upsert,
    isSessionActive,
  ]);

  useEffect(() => {
    const previousFiles = previousFilesRef.current;
    const currentFileIds = new Set(files.map(getFileIdentity));

    previousFiles
      .filter((file) => !currentFileIds.has(getFileIdentity(file)))
      .forEach(revokePreview);

    previousFilesRef.current = files;

    if (files.length === 0) {
      setErrors([]);
      setSuccesses([]);
      setUploadedFiles([]);
    }

    // If the number of files doesn't exceed the maxFiles parameter, remove the error 'Too many files' from each file
    if (files.length <= maxFiles) {
      let changed = false;
      const newFiles = files.map((file) => {
        if (file.errors.some((e) => e.code === "too-many-files")) {
          file.errors = file.errors.filter((e) => e.code !== "too-many-files");
          changed = true;
        }
        return file;
      });
      if (changed) {
        setFiles(newFiles);
      }
    }
  }, [files, setFiles, maxFiles]);

  useEffect(() => {
    return () => {
      uploadSessionRef.current += 1;
      previousFilesRef.current.forEach(revokePreview);
    };
  }, []);

  return {
    files,
    setFiles,
    successes,
    uploadedFiles,
    isSuccess,
    loading,
    errors,
    setErrors,
    onUpload,
    cancelUpload,
    maxFileSize: maxFileSize,
    maxFiles: maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  };
};

export {
  useSupabaseUpload,
  type UseSupabaseUploadOptions,
  type UseSupabaseUploadReturn,
};

"use client";

import React from "react";
import { useEffect, useState } from "react";
import { CldImage } from "next-cloudinary";
import { AiOutlineCloseCircle } from "react-icons/ai";
import { MdOutlineCloudUpload } from "react-icons/md";
import { UseFormSetValue } from "react-hook-form";
import { z } from "zod";

import { setImageName, setPublicId } from "@/redux/slices/imageUpload";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { useToast } from "@/hooks/useToast";
import {
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
} from "@/lib/env";

interface Props {
  name?: string;
  setValue: UseFormSetValue<any>;
  formResetTrigger: boolean;
  initialImageUrl?: string;
  disabled?: boolean;
}

const ImageUploadInput = ({
  name = "imageUpload",
  setValue,
  formResetTrigger,
  initialImageUrl,
  disabled,
}: Props) => {
  const { publicId } = useAppSelector((state) => state.imageUpload);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const dispatch = useAppDispatch();

  // Get environment variables
  const UPLOAD_PRESET = NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const CLOUD_NAME = NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  // Check if environment variables are set
  useEffect(() => {
    if (!UPLOAD_PRESET || !CLOUD_NAME) {
      console.error("Cloudinary environment variables are not set");
      setError("Cloudinary configuration is missing");
    }
  }, [UPLOAD_PRESET, CLOUD_NAME]);

  useEffect(() => {
    if (formResetTrigger) {
      dispatch(setPublicId(""));
      dispatch(setImageName(""));
      setValue("imageUrl", "");
    }
  }, [formResetTrigger, dispatch, setValue]);

  useEffect(() => {
    if (initialImageUrl) {
      dispatch(setPublicId(initialImageUrl));
      setValue("imageUrl", initialImageUrl);
    }
  }, [initialImageUrl, dispatch, setValue]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      uploadImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const uploadImage = async (file: File) => {
    // Validate environment variables
    if (!UPLOAD_PRESET || !CLOUD_NAME) {
      console.error("Cloudinary configuration is missing");
      return;
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Error",
        description: "Please upload a valid image file (JPEG, PNG, GIF, WEBP)",
      });
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "Error",
        description: "Image size should be less than 10MB",
      });
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);

      // Optional: Add these for better control
      formData.append("folder", "Blog_images");
      formData.append("resource_type", "image");

      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        true,
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setIsUploading(false);

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);

            if (data.secure_url && data.public_id) {
              dispatch(setPublicId(data.public_id));
              dispatch(setImageName(file.name));
              setValue("imageUrl", data.secure_url);
              setUploadProgress(null);
            } else {
              throw new Error("Invalid response from Cloudinary");
            }
          } catch (parseError) {
            console.error("Error parsing Cloudinary response:", parseError);
            toast({
              title: "Error",
              description: "Failed to process the upload response",
            });
            setError("Failed to process the upload response");
          }
        } else {
          let errorMessage = "Failed to upload image to Cloudinary";

          try {
            const errorResponse = JSON.parse(xhr.responseText);
            if (errorResponse.error && errorResponse.error.message) {
              errorMessage = errorResponse.error.message;
            }
          } catch (e) {
            console.error("Error parsing Cloudinary error response:", e);
            errorMessage = "An unexpected error occurred while uploading";
          }

          console.error("Cloudinary upload error:", errorMessage);
          toast({
            title: "Error",
            description: errorMessage,
          });
          setError(errorMessage);
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        const errorMessage = "Network error during image upload";
        console.error(errorMessage);
        toast({
          title: "Error",
          description: errorMessage,
        });
        setError(errorMessage);
        setUploadProgress(null);
      };

      xhr.send(formData);
    } catch (error) {
      setIsUploading(false);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error during upload";
      console.error("Error uploading image:", errorMessage);
      toast({
        title: "Error",
        description: `Failed to upload image: ${errorMessage}`,
      });
      setError(errorMessage);
      setUploadProgress(null);
    }
  };

  const removeImage = () => {
    dispatch(setPublicId(""));
    dispatch(setImageName(""));
    setValue("imageUrl", "");
  };

  return (
    <div
      className="w-full p-4 mt-2 bg-opacity-80 bg-white border border-gray-400 rounded-xl appearance-none"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center">
        {publicId && (
          <div className="relative w-full">
            <CldImage
              src={publicId}
              width={150}
              height={150}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              alt="Uploaded Image"
              className="w-full h-64 object-cover mx-auto rounded-2xl shadow-3xl"
            />
            {!initialImageUrl && !disabled && (
              <div
                className="absolute inset-0 hover:backdrop-blur-sm flex justify-center items-center rounded-2xl cursor-pointer"
                onClick={removeImage}
              >
                <AiOutlineCloseCircle className="w-20 h-20 text-gray-200/80" />
              </div>
            )}
          </div>
        )}
      </div>

      {!publicId && (
        <div className="flex flex-col justify-center items-center text-gray-400 hover:text-gray-600 border-dashed border-2 border-gray-300 h-40 cursor-pointer transition duration-300">
          <MdOutlineCloudUpload className="w-14 h-14 text-4xl mb-2" />

          {uploadProgress !== null && (
            <div className="bg-gray-200 rounded-full w-80 h-3.5 mb-4">
              <div
                className="bg-gray-400/40 h-3.5 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              ></div>
              <p className="text-gray-700 text-center font-semibold mt-2">
                {Math.round(uploadProgress)}%
              </p>
            </div>
          )}

          {uploadProgress === null && !isUploading && (
            <>
              <label htmlFor={name} className="cursor-pointer text-center px-4">
                {!UPLOAD_PRESET || !CLOUD_NAME
                  ? "Cloudinary configuration is missing"
                  : "Drag & drop your thumbnail image here or click to upload"}
              </label>
              <input
                id={name}
                key={name}
                name={name}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileChange}
                className="hidden"
                disabled={disabled || !UPLOAD_PRESET || !CLOUD_NAME}
              />
              <p className="text-xs text-gray-500 mt-2">
                Supported formats: JPEG, PNG, GIF, WEBP (max 10MB)
              </p>
            </>
          )}

          {isUploading && uploadProgress === null && (
            <p className="text-gray-700 text-center">Preparing upload...</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploadInput;

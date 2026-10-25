import { Cloudinary } from "@cloudinary/url-gen";
import { limitFit } from "@cloudinary/url-gen/actions/resize";

/** The upload command and stored secure_url stay unchanged; only preview delivery is built here. */
export function cloudinaryPreviewUrl(source: string, cloudName: string): string {
  // Existing persisted image URLs already identify the approved uploaded asset.
  if (/^https:\/\//i.test(source)) return source;
  return new Cloudinary({ cloud: { cloudName }, url: { secure: true, analytics: false } })
    .image(source).resize(limitFit().width(150)).format("auto").quality("auto").toURL();
}

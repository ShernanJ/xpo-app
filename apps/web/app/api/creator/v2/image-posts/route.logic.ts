const MB = 1024 * 1024;

export const MAX_IMAGE_TO_POST_UPLOAD_BYTES = 8 * MB;
export const MAX_IMAGE_TO_POST_IDEA_LENGTH = 500;
export const SUPPORTED_IMAGE_TO_POST_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export interface ImageToPostRouteInput {
  imageFile: File;
  idea: string | null;
}

interface ValidationError {
  field: string;
  message: string;
}

interface ParseImageToPostFormDataSuccess {
  ok: true;
  data: ImageToPostRouteInput;
}

interface ParseImageToPostFormDataFailure {
  ok: false;
  errors: ValidationError[];
}

export function parseImageToPostFormData(
  formData: FormData,
): ParseImageToPostFormDataSuccess | ParseImageToPostFormDataFailure {
  const rawImage = formData.get("image");
  if (!(rawImage instanceof File)) {
    return {
      ok: false,
      errors: [{ field: "image", message: "An image upload is required." }],
    };
  }

  if (rawImage.size <= 0) {
    return {
      ok: false,
      errors: [{ field: "image", message: "Uploaded image is empty." }],
    };
  }

  if (
    !SUPPORTED_IMAGE_TO_POST_MIME_TYPES.includes(
      rawImage.type as (typeof SUPPORTED_IMAGE_TO_POST_MIME_TYPES)[number],
    )
  ) {
    return {
      ok: false,
      errors: [
        {
          field: "image",
          message: "Image must be a PNG, JPG, JPEG, or WEBP file.",
        },
      ],
    };
  }

  if (rawImage.size > MAX_IMAGE_TO_POST_UPLOAD_BYTES) {
    return {
      ok: false,
      errors: [
        {
          field: "image",
          message: "Image must be 8 MB or smaller.",
        },
      ],
    };
  }

  const rawIdea = formData.get("idea");
  if (rawIdea !== null && typeof rawIdea !== "string") {
    return {
      ok: false,
      errors: [{ field: "idea", message: "Idea must be a string value." }],
    };
  }

  const idea = rawIdea?.trim() || null;
  if (idea && idea.length > MAX_IMAGE_TO_POST_IDEA_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "idea",
          message: `Idea must be ${MAX_IMAGE_TO_POST_IDEA_LENGTH} characters or fewer.`,
        },
      ],
    };
  }

  return {
    ok: true,
    data: {
      imageFile: rawImage,
      idea,
    },
  };
}

export async function fileToDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${bytes.toString("base64")}`;
}

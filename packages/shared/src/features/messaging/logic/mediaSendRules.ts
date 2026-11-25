import type { SendCommunityMessageMediaOptions } from "./types";

export function validateMediaSendOptions(
  options: SendCommunityMessageMediaOptions | undefined,
): { hasBlob: boolean; hasBuffer: boolean } {
  const hasBlob = options?.mediaFile != null;
  const hasBuffer = options?.mediaArrayBuffer != null;
  if (hasBlob && hasBuffer) {
    throw new Error("Cannot send both mediaFile and mediaArrayBuffer.");
  }
  if (hasBuffer && !options.mediaContentType?.trim()) {
    throw new Error(
      "mediaContentType is required when sending mediaArrayBuffer.",
    );
  }
  return { hasBlob, hasBuffer };
}

export function inferMediaFilename(
  options: SendCommunityMessageMediaOptions | undefined,
): string {
  return (
    options?.mediaFilename ??
    (options?.mediaFile && "name" in options.mediaFile
      ? String(options.mediaFile.name)
      : undefined) ??
    `upload-${Date.now()}`
  );
}

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";

export interface MessageObjectStore {
  uploadMessageAttachment(input: {
    bucketName: string;
    objectPath: string;
    body: Blob | ArrayBuffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<void>;
  removeObjects(bucketName: string, objectPaths: string[]): Promise<void>;
  createSignedUrls(
    bucketName: string,
    objectPaths: string[],
    expiresInSeconds: number,
  ): Promise<Record<string, string>>;
  createSignedImageUrl(
    bucketName: string,
    objectPath: string,
    expiresInSeconds: number,
  ): Promise<string | null>;
}

type GlobalFileReader = new () => {
  result: string | ArrayBuffer | null;
  error: DOMException | null;
  onerror: (() => void) | null;
  onload: (() => void) | null;
  readAsArrayBuffer: (blob: Blob) => void;
};

function getGlobalFileReader(): GlobalFileReader | undefined {
  const ctor = (globalThis as unknown as { FileReader?: GlobalFileReader }).FileReader;
  return typeof ctor === "function" ? ctor : undefined;
}

const blobToArrayBuffer = async (blob: Blob): Promise<ArrayBuffer> => {
  const candidate = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof candidate.arrayBuffer === "function") {
    return await candidate.arrayBuffer();
  }
  const FileReaderCtor = getGlobalFileReader();
  if (!FileReaderCtor) {
    throw new Error("Blob.arrayBuffer and FileReader are unavailable in this runtime.");
  }
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReaderCtor();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob as ArrayBuffer."));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
        return;
      }
      reject(new Error("FileReader did not return an ArrayBuffer."));
    };
    reader.readAsArrayBuffer(blob);
  });
};

class SupabaseMessageObjectStore implements MessageObjectStore {
  constructor(private readonly client: HavenSupabaseClient) {}

  async uploadMessageAttachment(input: {
    bucketName: string;
    objectPath: string;
    body: Blob | ArrayBuffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    const payload =
      input.body instanceof ArrayBuffer ? input.body : await blobToArrayBuffer(input.body);
    const { error } = await this.client.storage
      .from(input.bucketName)
      .upload(input.objectPath, payload, {
        cacheControl: input.cacheControl ?? "3600",
        contentType: input.contentType,
        upsert: false,
      });
    if (error) throw error;
  }

  async removeObjects(bucketName: string, objectPaths: string[]): Promise<void> {
    if (objectPaths.length === 0) return;
    const { error } = await this.client.storage.from(bucketName).remove(objectPaths);
    if (error) throw error;
  }

  async createSignedUrls(
    bucketName: string,
    objectPaths: string[],
    expiresInSeconds: number,
  ): Promise<Record<string, string>> {
    if (objectPaths.length === 0) return {};

    const { data, error } = await this.client.storage
      .from(bucketName)
      .createSignedUrls(objectPaths, expiresInSeconds);
    if (error) throw error;

    const byPath: Record<string, string> = {};
    for (const row of data ?? []) {
      if (!row?.path || !row.signedUrl) continue;
      byPath[row.path] = row.signedUrl;
    }
    return byPath;
  }

  async createSignedImageUrl(
    bucketName: string,
    objectPath: string,
    expiresInSeconds: number,
  ): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(bucketName)
      .createSignedUrl(objectPath, expiresInSeconds);
    if (error) throw error;
    return data?.signedUrl ?? null;
  }
}

export function createMessageObjectStore(client: HavenSupabaseClient): MessageObjectStore {
  return new SupabaseMessageObjectStore(client);
}

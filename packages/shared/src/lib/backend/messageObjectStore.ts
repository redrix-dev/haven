import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";

export interface MessageObjectStore {
  uploadMessageAttachment(input: {
    bucketName: string;
    objectPath: string;
    body: Blob;
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

class SupabaseMessageObjectStore implements MessageObjectStore {
  constructor(private readonly client: HavenSupabaseClient) {}

  async uploadMessageAttachment(input: {
    bucketName: string;
    objectPath: string;
    body: Blob;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    const { error } = await this.client.storage
      .from(input.bucketName)
      .upload(input.objectPath, input.body, {
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

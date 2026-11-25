/**
 * Attachments: links to the files on messages. Message files are private:
 * storage hands a signed link, good for an hour, only to someone who may see
 * the message (`media.signedUrls`). DATABASE.md: "Files".
 *
 * A link is held in memory while it still works, so a page scrolled back to
 * does not ask again, and asked for again shortly before it stops working.
 * Links are never kept on the device.
 */

import type { MediaBackend } from "@shared/lib/backend/media";
import type { MediaRecord } from "@shared/lib/backend/records";
import type { StatePort } from "../kit/statePort";

/** How long a link is treated as working; storage gives an hour. */
export const LINK_LIFETIME_MS = 50 * 60 * 1000;

export type AttachmentLink = { url: string; until: number };

export type AttachmentsState = {
  /** By file id. */
  links: Readonly<Record<string, AttachmentLink>>;
};

export const createAttachmentsState = (): AttachmentsState => ({ links: {} });

export class Attachments {
  /** File ids being asked for now. */
  private asking = new Set<string>();
  private generation = 0;

  constructor(
    private readonly port: StatePort<AttachmentsState>,
    private readonly media: Pick<MediaBackend, "signedUrls">,
    private readonly now: () => number = Date.now,
  ) {}

  /** A working link to the file, when one is held. */
  url(fileId: string): string | null {
    const link = this.port.get().links[fileId];
    return link && link.until > this.now() ? link.url : null;
  }

  /**
   * Asks for links to the files it holds none for (or whose link is about to
   * stop working). Call it with every file a screen shows; the rest cost
   * nothing. A file the person may not see gets no link.
   */
  async ensure(files: readonly MediaRecord[]): Promise<void> {
    const wanted = files.filter(
      (file) => !this.url(file.id) && !this.asking.has(file.id),
    );
    if (wanted.length === 0) return;
    const generation = this.generation;
    for (const file of wanted) this.asking.add(file.id);
    try {
      const found = await this.media.signedUrls([...wanted]);
      if (generation !== this.generation) return;
      const until = this.now() + LINK_LIFETIME_MS;
      const links = { ...this.port.get().links };
      for (const [id, url] of found) links[id] = { url, until };
      this.port.set({ links });
    } finally {
      if (generation === this.generation) {
        for (const file of wanted) this.asking.delete(file.id);
      }
    }
  }

  clear(): void {
    this.generation += 1;
    this.asking.clear();
    this.port.set(createAttachmentsState());
  }
}

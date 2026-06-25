import { dataCacheDebug } from "@shared/debug";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export type ExportDataCacheDebugResult = {
  filePath: string;
  entryCount: number;
  shared: boolean;
};

/**
 * Writes a sorted debug log to the app documents directory and opens the share sheet.
 * Always mirrors output to Metro console as well.
 */
export async function exportDataCacheDebugLog(): Promise<ExportDataCacheDebugResult> {
  const text = dataCacheDebug.exportAsSortedText();
  const entryCount = dataCacheDebug.getEntries().length;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `haven-data-cache-debug-${stamp}.txt`;
  const dir = FileSystem.documentDirectory;

  if (!dir) {
    console.log(
      "\n=== Haven Data Cache Debug Export (no documentDirectory) ===\n",
    );
    console.log(text);
    throw new Error("documentDirectory is unavailable on this platform.");
  }

  const filePath = `${dir}${fileName}`;
  await FileSystem.writeAsStringAsync(filePath, text, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  console.log(`[DataCache] Exported ${entryCount} entries to:\n  ${filePath}`);
  console.log(text);

  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filePath, {
      mimeType: "text/plain",
      dialogTitle: "Haven data cache debug log",
      UTI: "public.plain-text",
    });
    shared = true;
  }

  return { filePath, entryCount, shared };
}

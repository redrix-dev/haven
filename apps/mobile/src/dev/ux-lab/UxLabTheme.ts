import { useMemo } from "react";
import { useCSSVariable } from "uniwind";

export function useUxLabThemeColors() {
  const values = useCSSVariable([
    "--color-background",
    "--color-body-soft",
    "--color-border",
    "--color-border-panel",
    "--color-destructive",
    "--color-destructive-foreground",
    "--color-foreground",
    "--color-info",
    "--color-muted-foreground",
    "--color-primary",
    "--color-primary-foreground",
    "--color-status-away",
    "--color-status-dnd",
    "--color-status-online",
    "--color-surface-input",
    "--color-surface-modal",
    "--color-surface-panel",
  ]);

  return useMemo(() => {
    const color = (value: string | number | undefined, fallback: string) =>
      typeof value === "string" ? value : fallback;

    return {
      background: color(values[0], "#111a2b"),
      bodySoft: color(values[1], "#d4def0"),
      border: color(values[2], "#304867"),
      borderPanel: color(values[3], "#263a58"),
      destructive: color(values[4], "#b74a56"),
      destructiveForeground: color(values[5], "#fff1f3"),
      foreground: color(values[6], "#e6edf7"),
      info: color(values[7], "#8fc1ff"),
      mutedForeground: color(values[8], "#a9b8cf"),
      primary: color(values[9], "#3f79d8"),
      primaryForeground: color(values[10], "#f4f8ff"),
      statusAway: color(values[11], "#f0a832"),
      statusDnd: color(values[12], "#f04747"),
      statusOnline: color(values[13], "#44b894"),
      surfaceInput: color(values[14], "#263a58"),
      surfaceModal: color(values[15], "#1c2a43"),
      surfacePanel: color(values[16], "#142033"),
    };
  }, [values]);
}

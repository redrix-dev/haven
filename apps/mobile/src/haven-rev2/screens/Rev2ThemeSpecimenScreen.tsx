import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";

/** Theme / token specimen for rev2 shell — uses semantic Tailwind classes for contrast checks. */
export function Rev2ThemeSpecimenScreen() {
  return (
    <Box className="flex-1 gap-4 bg-background p-4">
      <Text className="text-lg font-semibold text-foreground">Theme specimen</Text>
      <Box className="rounded-xl border border-border bg-card p-4">
        <Text className="text-base text-foreground">Card foreground on card surface</Text>
        <Text className="mt-2 text-sm text-muted-foreground">Muted supporting text</Text>
        <Box className="mt-3 self-start rounded-md bg-primary px-3 py-2">
          <Text className="text-sm font-medium text-primary-foreground">Primary action</Text>
        </Box>
      </Box>
      <Box className="rounded-xl bg-primary/15 p-4">
        <Text className="text-sm text-foreground">Tinted surface (primary / 15%)</Text>
      </Box>
    </Box>
  );
}

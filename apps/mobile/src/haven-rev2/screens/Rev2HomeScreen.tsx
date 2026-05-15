import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";

export function Rev2HomeScreen() {
  return (
    <Box className="flex-1 justify-center bg-background px-6">
      <Text className="text-xl font-semibold text-foreground">Haven rev2</Text>
      <Text className="mt-2 text-sm text-muted-foreground">
        Drawer shell — open Community for live channel data, or the floating bubble for DMs.
      </Text>
    </Box>
  );
}

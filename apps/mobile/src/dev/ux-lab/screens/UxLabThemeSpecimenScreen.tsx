import { ScrollView } from "@/components/ui/scroll-view";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { UxLabTopBar } from "../components/UxLabTopBar";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { useUxLabThemeColors } from "../UxLabTheme";

const surfaceRows = [
  { label: "surface-0 / inset", className: "bg-surface-0" },
  { label: "surface-1 / app", className: "bg-surface-1" },
  { label: "surface-2 / panel", className: "bg-surface-2" },
  { label: "surface-3 / card", className: "bg-surface-3" },
  { label: "surface-3b / modal", className: "bg-surface-3b" },
  { label: "surface-4 / hover", className: "bg-surface-4" },
  { label: "surface-5 / input", className: "bg-surface-5" },
];

const semanticTiles = [
  { label: "surface-app", className: "bg-surface-app" },
  { label: "surface-panel", className: "bg-surface-panel" },
  { label: "surface-modal", className: "bg-surface-modal" },
  { label: "surface-input", className: "bg-surface-input" },
  { label: "surface-inset", className: "bg-surface-inset" },
  { label: "surface-hover", className: "bg-surface-hover" },
];

const colorChips = [
  { label: "online", className: "bg-status-online" },
  { label: "away", className: "bg-status-away" },
  { label: "dnd", className: "bg-status-dnd" },
  { label: "info", className: "bg-info" },
  { label: "amber", className: "bg-accent-amber" },
  { label: "success", className: "bg-accent-success" },
];

export function UxLabThemeSpecimenScreen() {
  const colors = useUxLabThemeColors();
  const { goToSurface } = useUxLabNavigationActions();

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar
        title="Theme specimen"
        subtitle="Dense token coverage for mobile rebuild decisions"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Box className="rounded-3xl border border-border bg-card p-4">
          <Text size="lg" bold className="text-foreground">
            Surface depth
          </Text>
          <Text size="sm" className="mt-1 text-muted-foreground">
            Primitive surfaces are shown from deepest shell to raised input.
          </Text>
          <VStack space="sm" className="mt-4">
            {surfaceRows.map((row) => (
              <HStack
                key={row.label}
                className={`items-center justify-between rounded-2xl border border-border-panel p-3 ${row.className}`}
              >
                <Text bold className="text-foreground">
                  {row.label}
                </Text>
                <Text size="xs" className="text-text-dim">
                  primitive
                </Text>
              </HStack>
            ))}
          </VStack>
        </Box>

        <Box className="rounded-3xl border border-border bg-surface-modal p-4">
          <Text size="lg" bold className="text-foreground">
            Semantic surfaces
          </Text>
          <HStack className="mt-4 flex-wrap" space="sm">
            {semanticTiles.map((tile) => (
              <Box
                key={tile.label}
                className={`mb-2 min-w-[46%] rounded-2xl border border-border p-3 ${tile.className}`}
              >
                <Text size="sm" bold className="text-foreground">
                  {tile.label}
                </Text>
                <Text size="xs" className="text-muted-foreground">
                  production role
                </Text>
              </Box>
            ))}
          </HStack>
        </Box>

        <Box className="rounded-3xl border border-border bg-surface-panel p-4">
          <Text size="lg" bold className="text-foreground">
            Text hierarchy
          </Text>
          <VStack space="xs" className="mt-3">
            <Text className="text-foreground">foreground / primary body</Text>
            <Text className="text-body-soft">body-soft / supporting body</Text>
            <Text className="text-muted-foreground">
              muted-foreground / descriptions
            </Text>
            <Text className="text-text-dim">text-dim / metadata</Text>
            <Text className="text-form-label">form-label / control labels</Text>
            <Text className="text-link-bright">
              link-bright / high-emphasis link
            </Text>
          </VStack>
        </Box>

        <Box className="rounded-3xl border border-border bg-card p-4">
          <Text size="lg" bold className="text-foreground">
            Actions and states
          </Text>
          <HStack className="mt-4 flex-wrap" space="sm">
            <Button className="mb-2">
              <ButtonText>Primary</ButtonText>
            </Button>
            <Button variant="outline" className="mb-2">
              <ButtonText>Outline</ButtonText>
            </Button>
            <Button className="mb-2 bg-destructive">
              <ButtonText className="text-destructive-foreground">
                Destructive
              </ButtonText>
            </Button>
            <Badge className="mb-2 bg-destructive">
              <BadgeText className="text-destructive-foreground">
                destructive
              </BadgeText>
            </Badge>
          </HStack>
          <Box className="mt-3 rounded-2xl border border-destructive bg-destructive-surface p-3">
            <Text bold className="text-destructive-soft">
              Destructive soft warning
            </Text>
            <Text size="sm" className="mt-1 text-destructive-banner">
              Used for confirmation, report, moderation, and irreversible flows.
            </Text>
          </Box>
        </Box>

        <Box className="rounded-3xl border border-border bg-surface-inset p-4">
          <Text size="lg" bold className="text-foreground">
            Status and accents
          </Text>
          <HStack className="mt-4 flex-wrap" space="sm">
            {colorChips.map((chip) => (
              <Box
                key={chip.label}
                className={`mb-2 rounded-full px-3 py-2 ${chip.className}`}
              >
                <Text size="xs" bold className="text-primary-foreground">
                  {chip.label}
                </Text>
              </Box>
            ))}
          </HStack>
          <HStack className="mt-3 items-center rounded-2xl border border-border-panel bg-surface-input p-3">
            <Box
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colors.statusOnline }}
            />
            <Text size="sm" className="ml-2 flex-1 text-muted-foreground">
              Native swatches resolve through UniWind CSS variables and should
              track session-only theme changes.
            </Text>
          </HStack>
        </Box>

        <Box className="rounded-3xl border border-selected bg-surface-row-selected p-4">
          <Text size="lg" bold className="text-foreground">
            UniWind CSS variable adapter
          </Text>
          <HStack className="mt-4 flex-wrap" space="sm">
            {[
              ["background", colors.background],
              ["modal", colors.surfaceModal],
              ["panel", colors.surfacePanel],
              ["input", colors.surfaceInput],
              ["primary", colors.primary],
              ["danger", colors.destructive],
            ].map(([label, value]) => (
              <VStack key={label} className="mb-3 min-w-[30%]">
                <Box
                  className="h-10 rounded-xl border border-border"
                  style={{ backgroundColor: value }}
                />
                <Text size="xs" className="mt-1 text-text-dim">
                  {label}
                </Text>
              </VStack>
            ))}
          </HStack>
        </Box>

        <Button variant="outline" onPress={() => goToSurface("community")}>
          <ButtonText>Back to realistic channel</ButtonText>
        </Button>
      </ScrollView>
    </VStack>
  );
}

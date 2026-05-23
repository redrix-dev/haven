import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import {
  type SideRailGlowPattern,
  type SideRailGlowSegment,
  useSideRailChromeStore,
} from "@/navigation/shell/sideRailChromeStore";

const colorOptions = [
  { label: "Sky", hex: "#38bdf8" },
  { label: "Violet", hex: "#a78bfa" },
  { label: "Emerald", hex: "#34d399" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Rose", hex: "#fb7185" },
];

const patternOptions: { label: string; value: SideRailGlowPattern }[] = [
  { label: "Steady", value: "steady" },
  { label: "Pulse", value: "pulse" },
  { label: "Breathe", value: "breathe" },
  { label: "Scan", value: "scan" },
];

const segmentOptions: { label: string; value: SideRailGlowSegment }[] = [
  { label: "Top", value: "top" },
  { label: "Middle", value: "middle" },
  { label: "Bottom", value: "bottom" },
];

export function MobileDevSideRailMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const enabled = useSideRailChromeStore((s) => s.edgeGlowEnabled);
  const color = useSideRailChromeStore((s) => s.edgeGlowColor);
  const intensity = useSideRailChromeStore((s) => s.edgeGlowIntensity);
  const pattern = useSideRailChromeStore((s) => s.edgeGlowPattern);
  const segments = useSideRailChromeStore((s) => s.edgeGlowSegments);
  const setEnabled = useSideRailChromeStore((s) => s.setEdgeGlowEnabled);
  const setColor = useSideRailChromeStore((s) => s.setEdgeGlowColor);
  const setIntensity = useSideRailChromeStore((s) => s.setEdgeGlowIntensity);
  const setPattern = useSideRailChromeStore((s) => s.setEdgeGlowPattern);
  const toggleSegment = useSideRailChromeStore((s) => s.toggleEdgeGlowSegment);

  const selectedColorLabel = useMemo(
    () => colorOptions.find((option) => option.hex === color)?.label ?? color,
    [color],
  );

  if (!__DEV__) return null;

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        className="absolute bottom-40 right-5 rounded-full bg-sky-600 px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel="Side rail developer menu"
      >
        <Text className="text-sm font-semibold text-white">Rail</Text>
      </Pressable>

      <Modal
        visible={isOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setIsOpen(false)}
        >
          <Pressable
            className="max-h-[76%] rounded-t-2xl bg-surface-modal pb-8"
            onPress={(event) => event.stopPropagation()}
          >
            <View className="border-b border-border px-4 pb-3 pt-4">
              <Text className="text-lg font-bold text-foreground">
                Side Rail Edge Light
              </Text>
              <Text className="text-sm text-muted-foreground">
                {enabled ? "Enabled" : "Disabled"} · {selectedColorLabel} ·{" "}
                {Math.round(intensity * 100)}%
              </Text>
            </View>

            <ScrollView>
              <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
                <Text className="text-base font-semibold text-foreground">
                  Edge light
                </Text>
                <Switch value={enabled} onValueChange={setEnabled} />
              </View>

              <View className="border-b border-border px-4 py-4">
                <Text className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                  Segments
                </Text>
                <View className="flex-row gap-2">
                  {segmentOptions.map((option) => {
                    const selected = segments[option.value];
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => toggleSegment(option.value)}
                        className={`flex-1 rounded-xl border px-3 py-3 ${
                          selected
                            ? "border-primary bg-primary"
                            : "border-border bg-surface-panel"
                        }`}
                      >
                        <Text
                          className={`text-center text-sm font-semibold ${
                            selected ? "text-primary-foreground" : "text-foreground"
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="border-b border-border px-4 py-4">
                <Text className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                  Color
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {colorOptions.map((option) => {
                    const selected = option.hex === color;
                    return (
                      <Pressable
                        key={option.hex}
                        onPress={() => setColor(option.hex)}
                        className={`min-w-[88px] rounded-xl border px-3 py-3 ${
                          selected ? "border-primary" : "border-border"
                        }`}
                      >
                        <View className="flex-row items-center gap-2">
                          <View
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: option.hex }}
                          />
                          <Text className="text-sm font-medium text-foreground">
                            {option.label}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="border-b border-border px-4 py-4">
                <Text className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                  Intensity
                </Text>
                <View className="flex-row items-center justify-between">
                  <Pressable
                    onPress={() => setIntensity(intensity - 0.1)}
                    className="rounded-xl bg-surface-panel px-5 py-3"
                  >
                    <Text className="text-lg font-bold text-foreground">-</Text>
                  </Pressable>
                  <Text className="text-lg font-semibold text-foreground">
                    {Math.round(intensity * 100)}%
                  </Text>
                  <Pressable
                    onPress={() => setIntensity(intensity + 0.1)}
                    className="rounded-xl bg-surface-panel px-5 py-3"
                  >
                    <Text className="text-lg font-bold text-foreground">+</Text>
                  </Pressable>
                </View>
              </View>

              <View className="px-4 py-4">
                <Text className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                  Pattern
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {patternOptions.map((option) => {
                    const selected = option.value === pattern;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setPattern(option.value)}
                        className={`rounded-xl border px-4 py-3 ${
                          selected
                            ? "border-primary bg-primary"
                            : "border-border bg-surface-panel"
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            selected ? "text-primary-foreground" : "text-foreground"
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

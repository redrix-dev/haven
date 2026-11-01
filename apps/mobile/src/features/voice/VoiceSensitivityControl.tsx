import { useRef, useState } from "react";
import {
  View,
  Text,
  type DimensionValue,
  type GestureResponderEvent,
} from "react-native";

type Props = {
  threshold: number;
  inputLevel: number;
  gateOpen: boolean;
  disabled?: boolean;
  onChange: (threshold: number) => void;
};

const INSET = 12;

export function VoiceSensitivityControl(props: Props) {
  const [width, setWidth] = useState(0);
  const gesture = useRef<{ pageX: number; position: number } | null>(null);
  const lastValue = useRef<number | null>(null);
  const threshold = Math.max(0, Math.min(100, Math.round(props.threshold)));
  const level = Math.max(0, Math.min(100, Math.round(props.inputLevel * 100)));
  const percent = (value: number) => `${value}%` as DimensionValue;

  const update = (position: number) => {
    if (props.disabled || width <= INSET * 2) return;
    const value = Math.round(
      Math.max(0, Math.min(1, position / (width - INSET * 2))) * 100,
    );
    if (lastValue.current === value) return;
    lastValue.current = value;
    props.onChange(value);
  };
  const start = (event: GestureResponderEvent) => {
    if (props.disabled) return;
    const { pageX, locationX } = event.nativeEvent;
    gesture.current = { pageX, position: locationX - INSET };
    lastValue.current = null;
    update(locationX - INSET);
  };
  const move = (event: GestureResponderEvent) => {
    if (!gesture.current) return;
    update(
      gesture.current.position +
        event.nativeEvent.pageX -
        gesture.current.pageX,
    );
  };
  const end = () => {
    gesture.current = null;
    lastValue.current = null;
  };

  return (
    <View className="rounded-xl bg-surface-panel p-4">
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <Text className="text-sm font-medium text-foreground">
          Voice sensitivity
        </Text>
        <Text className="text-xs tabular-nums text-muted-foreground">
          {threshold}%
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Voice activation threshold"
        accessibilityHint="Set the marker just above your background noise. Swipe up or down to adjust."
        accessibilityValue={{
          min: 0,
          max: 100,
          now: threshold,
          text: `${threshold} percent`,
        }}
        accessibilityState={{ disabled: !!props.disabled }}
        accessibilityActions={[
          { name: "increment", label: "Increase threshold" },
          { name: "decrement", label: "Decrease threshold" },
        ]}
        onAccessibilityAction={(event) => {
          if (props.disabled) return;
          if (
            event.nativeEvent.actionName !== "increment" &&
            event.nativeEvent.actionName !== "decrement"
          )
            return;
          const next =
            threshold + (event.nativeEvent.actionName === "increment" ? 1 : -1);
          props.onChange(Math.max(0, Math.min(100, next)));
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !props.disabled}
        onMoveShouldSetResponder={() => !props.disabled}
        onResponderGrant={start}
        onResponderMove={move}
        onResponderRelease={end}
        onResponderTerminate={end}
        onResponderTerminationRequest={() => false}
        className="h-11 justify-center"
        style={{ paddingHorizontal: INSET, opacity: props.disabled ? 0.5 : 1 }}
      >
        <View
          pointerEvents="none"
          className="h-4 rounded-md bg-surface-embedded"
        >
          <View
            className="h-full rounded-md bg-accent-success/70"
            style={{ width: percent(level) }}
          />
          <View
            className="absolute -top-2 h-8 w-2 rounded border-2 border-surface-panel bg-foreground"
            style={{ left: percent(threshold), marginLeft: -4 }}
          />
        </View>
      </View>
      <View className="flex-row justify-between px-3">
        <Text className="text-xs text-muted-foreground">Quiet</Text>
        <Text className="text-xs text-muted-foreground">Loud</Text>
      </View>
      <View className="mt-4 flex-row items-center gap-2">
        <View
          className={`h-1.5 w-1.5 rounded-full ${props.gateOpen ? "bg-accent-success" : "bg-muted-foreground"}`}
        />
        <Text className="flex-1 text-xs text-foreground">
          {props.gateOpen ? "Transmitting" : "Below threshold"}
        </Text>
        <Text className="text-xs tabular-nums text-muted-foreground">
          Input {level}%
        </Text>
      </View>
      <Text className="mt-2 text-xs text-muted-foreground">
        Drag the marker just above your background noise.
      </Text>
    </View>
  );
}

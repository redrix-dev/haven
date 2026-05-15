import type React from "react";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";

const StyledIonicons = withUniwind(Ionicons);

export type ThemedIoniconsProps = Omit<React.ComponentProps<typeof Ionicons>, "color"> & {
  colorClassName: `accent-${string}`;
};

/** Ionicons with UniWind `colorClassName` + `accent-*` (see https://docs.uniwind.dev/class-names#the-accent--prefix). */
export function ThemedIonicons({ colorClassName, ...props }: ThemedIoniconsProps) {
  return <StyledIonicons {...props} colorClassName={colorClassName} />;
}

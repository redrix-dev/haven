import type React from "react";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";

const StyledIonicons = withUniwind(Ionicons);

type UxLabIconProps = Omit<React.ComponentProps<typeof Ionicons>, "color"> & {
  colorClassName: `accent-${string}`;
};

export function UxLabIcon({ colorClassName, ...props }: UxLabIconProps) {
  return <StyledIonicons {...props} colorClassName={colorClassName} />;
}

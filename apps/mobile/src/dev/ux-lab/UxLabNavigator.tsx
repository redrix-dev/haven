import { UxLabBottomTabs } from "./navigation/UxLabBottomTabs";
import { UxLabCustomShell } from "./navigation/UxLabCustomShell";
import { UxLabDrawer } from "./navigation/UxLabDrawer";
import { UxLabJsStack } from "./navigation/UxLabJsStack";
import { UxLabMaterialTopTabs } from "./navigation/UxLabMaterialTopTabs";
import { UxLabNativeStack } from "./navigation/UxLabNativeStack";

type UxLabNavMode =
  | "nativeStack"
  | "jsStack"
  | "bottomTabs"
  | "materialTopTabs"
  | "drawer"
  | "customShell";

const UX_LAB_NAV_MODE: UxLabNavMode = "bottomTabs";

export function UxLabNavigator() {
  if (UX_LAB_NAV_MODE === "nativeStack") {
    return <UxLabNativeStack />;
  }

  if (UX_LAB_NAV_MODE === "jsStack") {
    return <UxLabJsStack />;
  }

  if (UX_LAB_NAV_MODE === "bottomTabs") {
    return <UxLabBottomTabs />;
  }

  if (UX_LAB_NAV_MODE === "materialTopTabs") {
    return <UxLabMaterialTopTabs />;
  }

  if (UX_LAB_NAV_MODE === "drawer") {
    return <UxLabDrawer />;
  }

  return <UxLabCustomShell />;
}

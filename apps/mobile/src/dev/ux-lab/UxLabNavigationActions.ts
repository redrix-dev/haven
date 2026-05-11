import { useNavigation } from "@react-navigation/native";
import type { UxLabSurface } from "./UxLabTypes";
import { useUxLabStore } from "./UxLabStore";

const routeCandidatesBySurface: Record<UxLabSurface, string[]> = {
  home: ["UxLabHome", "LabHome"],
  community: ["UxLabCommunity", "LabCommunity"],
  dms: ["UxLabDms", "LabDms"],
  friends: ["UxLabFriends", "LabFriends"],
  notifications: ["UxLabNotifications", "LabNotifications"],
  settings: ["UxLabSettings", "LabSettings"],
  profile: ["UxLabProfile", "LabProfile"],
  themeSpecimen: ["UxLabThemeSpecimen", "LabThemeSpecimen"],
};

type LabNavigation = {
  getState?: () => { routeNames?: string[] };
  navigate?: (routeName: string) => void;
};

export function useUxLabNavigationActions() {
  const navigation = useNavigation<LabNavigation>();
  const setActiveSurface = useUxLabStore((s) => s.setActiveSurface);

  return {
    goToSurface: (surface: UxLabSurface) => {
      const routeNames = navigation.getState?.().routeNames ?? [];
      const routeName = routeCandidatesBySurface[surface].find((candidate) =>
        routeNames.includes(candidate),
      );

      if (routeName && navigation.navigate) {
        navigation.navigate(routeName);
        return;
      }

      setActiveSurface(surface);
    },
  };
}

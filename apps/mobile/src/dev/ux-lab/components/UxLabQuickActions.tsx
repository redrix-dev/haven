import {
  ActionsheetItem,
  ActionsheetItemText,
} from "@/components/ui/actionsheet";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { useUxLabStore } from "../UxLabStore";
import { UxLabSheet } from "./UxLabSheet";

export function UxLabQuickActions() {
  const { goToSurface } = useUxLabNavigationActions();
  const setOpenSheet = useUxLabStore((s) => s.setOpenSheet);

  const go = (surface: Parameters<typeof goToSurface>[0]) => {
    goToSurface(surface);
    setOpenSheet(null);
  };

  return (
    <UxLabSheet
      sheet="quick-actions"
      title="Quick actions"
      subtitle="Fake command surface for testing modal depth."
    >
      <ActionsheetItem onPress={() => go("community")}>
        <ActionsheetItemText>Jump to community</ActionsheetItemText>
      </ActionsheetItem>
      <ActionsheetItem onPress={() => go("dms")}>
        <ActionsheetItemText>Open direct messages</ActionsheetItemText>
      </ActionsheetItem>
      <ActionsheetItem onPress={() => go("notifications")}>
        <ActionsheetItemText>Review notifications</ActionsheetItemText>
      </ActionsheetItem>
      <ActionsheetItem onPress={() => go("themeSpecimen")}>
        <ActionsheetItemText>Open theme specimen</ActionsheetItemText>
      </ActionsheetItem>
    </UxLabSheet>
  );
}

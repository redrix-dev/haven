import { useEffect } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import { requireHavenCore } from "@mobile-data";
import { confirmAuthLink } from "@/auth/mobileAuthService";
import { openLinkIntent } from "@/stores/mobilePushNavigationStore";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  createMobileLinkActionHandler,
  isRecoveryLink,
  type AuthConfirmLinkIntent,
} from "./mobileLinkActions";

/**
 * Feeds every link that opens the app into the shared link pipeline
 * (`core.links`) and carries out what it decides. Mount once, at the root, so
 * signed-out links (sign-up confirmation, password reset) are handled too.
 *
 * `setPasswordRecoveryRequired` must be stable (a state setter): a recovery
 * link signs someone in only to set a new password.
 */
export function useMobileLinkIntake(
  setPasswordRecoveryRequired: (required: boolean) => void,
): void {
  useEffect(() => {
    const links = requireHavenCore().links;

    /**
     * Signed out, the recovery gate goes up before the exchange, so the app
     * never renders between the new session and the gate. Signed in, it waits
     * for success: until then the gate would belong to the current account.
     */
    const confirm = async (
      intent: AuthConfirmLinkIntent,
      signedIn: boolean,
    ) => {
      const recovery = isRecoveryLink(intent);
      if (recovery && !signedIn) setPasswordRecoveryRequired(true);
      try {
        const { error } = await confirmAuthLink(intent.params);
        if (error) throw error;
        if (recovery) setPasswordRecoveryRequired(true);
      } catch (error) {
        if (recovery) setPasswordRecoveryRequired(false);
        Alert.alert(
          "That link didn't work",
          getErrorMessage(error, "Request a new link and try again."),
        );
      }
    };

    links.setHandler(
      createMobileLinkActionHandler({
        open: openLinkIntent,
        notify: ({ title, body }) => Alert.alert(title, body),
        confirmAuth: (intent) => void confirm(intent, false),
        askToSwitchAccount: (intent) =>
          Alert.alert(
            "You're already signed in",
            "This link may sign you in to a different account. Continue?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Continue", onPress: () => void confirm(intent, true) },
            ],
          ),
      }),
    );

    // An event listener rather than `Linking.useURL()`: tapping the same link
    // twice doesn't change useURL's value, so the second tap would be lost.
    const subscription = Linking.addEventListener("url", ({ url }) =>
      links.receive(url, "event"),
    );

    let disposed = false;
    void Linking.getInitialURL()
      .then((url) => {
        if (!disposed && url) links.receive(url, "initial");
      })
      .catch((error) => {
        console.warn("[links] getInitialURL failed", error);
      });

    return () => {
      disposed = true;
      subscription.remove();
      links.setHandler(null);
    };
  }, [setPasswordRecoveryRequired]);
}

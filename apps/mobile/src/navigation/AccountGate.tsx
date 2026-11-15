import { Asset } from "expo-asset";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { perfTrace } from "@shared/debug/perfTrace";
import {
  accountLoaded,
  nextOnboarding,
  termsToAccept,
} from "@shared/collections/account/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  HAVEN_PRIVACY_URL,
  HAVEN_TERMS_URL,
} from "@shared/infrastructure/platform/urls";
import { useHavenCore, useStore } from "@mobile-data";
import { MOBILE_ONBOARDING_ASSETS } from "@/features/onboarding/mobileOnboardingCards";
import { MobileOnboardingScreen } from "@/screens/onboarding/MobileOnboardingScreen";

/**
 * What stands between signing in and the app: the newest terms, when the
 * person has not accepted them, then each introduction offered on this build,
 * in the database's order. The account is read at sign-in (`core.account`).
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const core = useHavenCore();
  const loaded = useStore("account", accountLoaded);
  const terms = useStore("account", (s) => (loaded ? termsToAccept(s) : null));
  const campaign = useStore("account", (s) =>
    loaded ? nextOnboarding(s) : null,
  );
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const span = perfTrace.begin("onboarding-assets");
    void Asset.loadAsync(MOBILE_ONBOARDING_ASSETS)
      .catch((assetError) => {
        console.warn("[AccountGate] asset preload failed", assetError);
      })
      .finally(() => {
        span.end();
        if (!cancelled) setAssetsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(getErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (terms) {
    return (
      <TermsScreen
        version={terms}
        busy={busy}
        error={error}
        onAccept={() => void run(() => core.account.acceptTerms(terms))}
      />
    );
  }

  if (campaign) {
    if (!assetsLoaded) return <Loading />;
    return (
      <MobileOnboardingScreen
        key={campaign.key}
        campaign={campaign}
        completing={busy}
        error={error}
        onComplete={() =>
          void run(() => core.answerOnboarding(campaign.key, "completed"))
        }
        onSkip={() =>
          void run(() => core.answerOnboarding(campaign.key, "skipped"))
        }
      />
    );
  }

  return <>{children}</>;
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; matches foreground */}
      <ActivityIndicator color="#e6edf7" size="large" />
    </View>
  );
}

function TermsScreen(props: {
  version: string;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="mb-3 text-center text-xl font-semibold text-foreground">
        Haven's terms have changed
      </Text>
      <Text className="mb-6 text-center text-sm leading-6 text-muted-foreground">
        Please read the{" "}
        <Text
          className="text-primary underline"
          onPress={() => void Linking.openURL(HAVEN_TERMS_URL)}
        >
          Terms of Service
        </Text>{" "}
        and{" "}
        <Text
          className="text-primary underline"
          onPress={() => void Linking.openURL(HAVEN_PRIVACY_URL)}
        >
          Privacy Policy
        </Text>{" "}
        (version {props.version}) before carrying on.
      </Text>
      {props.error ? (
        <Text className="mb-4 text-center text-sm text-destructive">
          {props.error}
        </Text>
      ) : null}
      <Pressable
        className={`rounded-xl bg-primary px-6 py-3 ${props.busy ? "opacity-70" : ""}`}
        disabled={props.busy}
        onPress={props.onAccept}
      >
        <Text className="text-base font-semibold text-primary-foreground">
          {props.busy ? "Just a moment…" : "I agree"}
        </Text>
      </Pressable>
    </View>
  );
}

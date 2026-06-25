import { ArrowLeft, ArrowRight, Check } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OnboardingCampaign } from "@shared/lib/backend/types";
import { Icon } from "@/components/ui/icon";
import {
  MOBILE_ONBOARDING_CARDS,
  type MobileOnboardingMockKind,
} from "@/features/onboarding/mobileOnboardingCards";

type MobileOnboardingScreenProps = {
  campaign: OnboardingCampaign;
  completing: boolean;
  error: string | null;
  onComplete: () => void;
};

const ANIMATION_CONFIG = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
};

function MockBars({ count = 3 }: { count?: number }) {
  return (
    <View className="min-w-0 gap-2 overflow-hidden">
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          className={`h-3 rounded-full ${
            index === 0 ? "bg-primary" : "bg-muted-foreground/30"
          }`}
          style={{ width: `${index === 0 ? 72 : 52 + (index % 2) * 14}%` }}
        />
      ))}
    </View>
  );
}

function AppMock({ kind }: { kind: MobileOnboardingMockKind }) {
  if (kind === "profile") {
    return (
      <View className="h-52 overflow-hidden rounded-2xl border border-border bg-background p-4">
        <View className="flex-row items-center gap-3">
          <View className="h-14 w-14 rounded-full bg-primary/80" />
          <View className="min-w-0 flex-1">
            <View className="mb-2 h-4 w-4/5 rounded-full bg-foreground/80" />
            <View className="h-6 w-20 rounded-full border border-primary/50 bg-primary/20" />
          </View>
        </View>
        <View className="mt-5 flex-row gap-2">
          <View className="h-9 flex-1 rounded-xl bg-primary" />
          <View className="h-9 flex-1 rounded-xl border border-border bg-muted" />
          <View className="h-9 w-12 rounded-xl border border-border bg-muted" />
        </View>
        <View className="mt-5 rounded-xl bg-muted p-3">
          <MockBars count={3} />
        </View>
      </View>
    );
  }

  if (kind === "voice") {
    return (
      <View className="h-52 overflow-hidden rounded-2xl border border-border bg-background p-4">
        <View className="mb-4 h-4 w-3/5 rounded-full bg-foreground/80" />
        <View className="flex-row items-center gap-3 rounded-xl bg-muted p-3">
          <View className="h-10 w-10 rounded-full bg-primary" />
          <View className="min-w-0 flex-1">
            <View className="mb-2 h-3 w-3/5 rounded-full bg-foreground/70" />
            <View className="h-2 w-4/5 rounded-full bg-muted-foreground/30" />
          </View>
          <View className="h-8 w-8 rounded-full bg-primary/80" />
        </View>
        <View className="mt-4 flex-row items-end gap-2 overflow-hidden">
          {[18, 42, 28, 50, 24, 36].map((height, index) => (
            <View
              key={index}
              className="w-5 rounded-full bg-primary/70"
              style={{ height }}
            />
          ))}
        </View>
      </View>
    );
  }

  if (kind === "alpha") {
    return (
      <View className="h-52 overflow-hidden rounded-2xl border border-primary/40 bg-background p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="min-w-0 flex-1 pr-3">
            <View className="mb-2 h-4 w-4/5 rounded-full bg-foreground/80" />
            <View className="h-3 w-3/5 rounded-full bg-muted-foreground/30" />
          </View>
          <View className="h-8 w-20 rounded-full bg-primary" />
        </View>
        <View className="rounded-xl bg-muted p-3">
          <View className="mb-3 h-24 rounded-xl border border-border bg-card">
            <View className="h-full w-full justify-center px-4">
              <View className="mb-3 h-4 w-3/5 rounded-full bg-primary/80" />
              <MockBars count={2} />
            </View>
          </View>
          <View className="h-9 rounded-xl bg-primary" />
        </View>
      </View>
    );
  }

  if (kind === "channels") {
    return (
      <View className="h-52 flex-row overflow-hidden rounded-2xl border border-border bg-background p-3">
        <View className="mr-3 w-12 gap-3">
          {[0, 1, 2, 3].map((item) => (
            <View
              key={item}
              className={`h-10 w-10 rounded-2xl ${
                item === 1 ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </View>
        <View className="w-28 rounded-xl bg-muted p-3">
          <MockBars count={5} />
        </View>
        <View className="ml-3 min-w-0 flex-1 overflow-hidden rounded-xl bg-card p-3">
          <View className="mb-4 h-4 w-3/5 rounded-full bg-foreground/80" />
          <MockBars count={4} />
        </View>
      </View>
    );
  }

  return (
    <View className="h-52 flex-row overflow-hidden rounded-2xl border border-border bg-background p-3">
      <View className="mr-3 w-12 gap-3">
        {[0, 1, 2].map((item) => (
          <View
            key={item}
            className={`h-10 w-10 rounded-2xl ${
              item === 0 ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </View>
      <View className="min-w-0 flex-1 overflow-hidden rounded-xl bg-card p-4">
        <View className="mb-5 h-5 w-3/5 rounded-full bg-foreground/80" />
        <MockBars count={5} />
      </View>
    </View>
  );
}

export function MobileOnboardingScreen({
  campaign,
  completing,
  error,
  onComplete,
}: MobileOnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const progress = useSharedValue(1);
  const card = MOBILE_ONBOARDING_CARDS[index] ?? MOBILE_ONBOARDING_CARDS[0];
  const isFinalCard = index === MOBILE_ONBOARDING_CARDS.length - 1;
  const title = isFinalCard ? campaign.title : card.title;
  const body = isFinalCard ? (campaign.description ?? card.body) : card.body;

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, ANIMATION_CONFIG);
  }, [index, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));

  const dots = useMemo(
    () =>
      MOBILE_ONBOARDING_CARDS.map((item, dotIndex) => (
        <View
          key={item.id}
          className={`h-2 rounded-full ${
            dotIndex === index ? "w-7 bg-primary" : "w-2 bg-muted-foreground/40"
          }`}
        />
      )),
    [index],
  );

  const handleNext = () => {
    if (isFinalCard) {
      onComplete();
      return;
    }
    setIndex((current) =>
      Math.min(current + 1, MOBILE_ONBOARDING_CARDS.length - 1),
    );
  };

  return (
    <View
      className="flex-1 bg-background px-5"
      style={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Haven Alpha
        </Text>
        <View className="flex-row gap-1.5">{dots}</View>
      </View>

      <Animated.View
        className="mt-6 min-h-0 flex-1 justify-center"
        style={animatedStyle}
      >
        <View className="mb-5 flex-row items-end justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text
              className="text-4xl font-semibold leading-tight text-foreground"
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {title}
            </Text>
            <Text className="mt-3 text-base leading-6 text-muted-foreground">
              {body}
            </Text>
          </View>
          <View className="h-28 w-28 items-center justify-center overflow-hidden">
            <Image
              source={card.owl}
              resizeMode="contain"
              className="h-28 w-28"
              style={{ transform: [{ scale: card.owlScale }] }}
            />
          </View>
        </View>

        <AppMock kind={card.mock} />

        {error ? (
          <Text className="mt-4 text-center text-sm text-destructive">
            {error}
          </Text>
        ) : null}
      </Animated.View>

      <View className="mt-5 flex-row items-center gap-3">
        <Pressable
          accessibilityLabel="Previous onboarding card"
          className={`h-12 w-12 items-center justify-center rounded-xl border border-border bg-card ${
            index === 0 || completing ? "opacity-40" : ""
          }`}
          disabled={index === 0 || completing}
          onPress={() => setIndex((current) => Math.max(current - 1, 0))}
        >
          <Icon as={ArrowLeft} className="size-5 text-foreground" />
        </Pressable>

        <Pressable
          className={`h-12 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-5 ${
            completing ? "opacity-70" : ""
          }`}
          disabled={completing}
          onPress={handleNext}
        >
          {completing ? (
            <>
              {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; matches primary-foreground */}
              <ActivityIndicator color="#0b1220" size="small" />
              <Text className="text-base font-semibold text-primary-foreground">
                Joining
              </Text>
            </>
          ) : (
            <>
              <Text className="text-base font-semibold text-primary-foreground">
                {isFinalCard ? (card.cta ?? "Continue") : "Next"}
              </Text>
              {isFinalCard ? (
                <Icon as={Check} className="size-5 text-primary-foreground" />
              ) : (
                <Icon
                  as={ArrowRight}
                  className="size-5 text-primary-foreground"
                />
              )}
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

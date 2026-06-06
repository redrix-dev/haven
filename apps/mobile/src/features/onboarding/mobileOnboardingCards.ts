import type { ImageSourcePropType } from "react-native";

export type MobileOnboardingMockKind =
  | "home"
  | "channels"
  | "profile"
  | "voice"
  | "alpha";

export type MobileOnboardingCard = {
  id: string;
  title: string;
  body: string;
  owl: ImageSourcePropType;
  owlScale: number;
  mock: MobileOnboardingMockKind;
  cta?: string;
};

export const MOBILE_ONBOARDING_CARDS: MobileOnboardingCard[] = [
  {
    id: "welcome",
    title: "Welcome to Haven",
    body: "A quieter place for servers, friends, messages, and voice to live together.",
    owl: require("../../../assets/onboarding/owl-wave.png"),
    owlScale: 1,
    mock: "home",
  },
  {
    id: "layout",
    title: "Find your rooms fast",
    body: "Servers sit on the rail, channels sit beside them, and the conversation stays in reach.",
    owl: require("../../../assets/onboarding/owl-point.png"),
    owlScale: 1.02,
    mock: "channels",
  },
  {
    id: "profiles",
    title: "Profiles carry the useful bits",
    body: "Avatars, flair, friend actions, and message entry points all meet in one profile surface.",
    owl: require("../../../assets/onboarding/owl-callout.png"),
    owlScale: 1,
    mock: "profile",
  },
  {
    id: "voice",
    title: "Voice is built in",
    body: "Join a room when text is not enough and keep the rest of the app close by.",
    owl: require("../../../assets/onboarding/owl-idea.png"),
    owlScale: 0.94,
    mock: "voice",
  },
  {
    id: "alpha",
    title: "Step into the Alpha",
    body: "Join the Alpha community to start testing with the newest build and collect your Alpha badge.",
    owl: require("../../../assets/onboarding/owl-wave-wide.png"),
    owlScale: 0.9,
    mock: "alpha",
    cta: "Join Alpha",
  },
];

export const MOBILE_ONBOARDING_ASSETS = MOBILE_ONBOARDING_CARDS.map(
  (card) => card.owl as number,
);

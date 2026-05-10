import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getErrorMessage } from "@shared/platform/lib/errors";
import {
  HAVEN_PRIVACY_URL,
  HAVEN_TERMS_URL,
  openPlatformExternalUrl,
} from "@shared/platform/urls";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signUpWithPassword } from "@/auth/mobileAuthService";
import { Box } from "@/components/ui/box";
import { Button, ButtonSpinner, ButtonText } from "@/components/ui/button";
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { KeyboardAvoidingView } from "@/components/ui/keyboard-avoiding-view";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { RootStackParamList } from "@/navigation/types";

const KEYBOARD_CARD_LIFT = -128;
const KEYBOARD_ANIMATION_MS = 220;

export function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const onSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const { error } = await signUpWithPassword({
        email,
        password,
        confirmPassword,
        username,
        acceptedLegal,
      });
      if (error) throw error;
      setSubmitSuccess(true);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const animateCard = (toValue: number, duration = KEYBOARD_ANIMATION_MS) => {
      Animated.timing(cardTranslateY, {
        toValue,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      animateCard(KEYBOARD_CARD_LIFT, event.duration);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      animateCard(0, event.duration);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [cardTranslateY]);

  return (
    <KeyboardAvoidingView className="flex-1 bg-background">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: 16,
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        <Animated.View style={{ transform: [{ translateY: cardTranslateY }] }}>
          <Box className="w-full max-w-sm self-center rounded-3xl bg-card p-6">
            <VStack space="lg">
              <Text size="2xl" bold className="text-center text-foreground">
                Haven
              </Text>

              {submitSuccess ? (
                <VStack space="lg">
                  <Text size="lg" bold className="text-center text-foreground">
                    Check your email
                  </Text>
                  <Text size="sm" className="text-center text-muted-foreground">
                    We sent a verification link to{" "}
                    <Text size="sm" className="text-foreground">
                      {email.trim()}
                    </Text>
                    . Open the email and confirm your account before signing in.
                  </Text>
                  <Button
                    size="lg"
                    onPress={() => void navigation.navigate("Login")}
                  >
                    <ButtonText>Back to login</ButtonText>
                  </Button>
                </VStack>
              ) : (
                <VStack space="lg">
                  <Text size="sm" className="text-center text-muted-foreground">
                    Create your account
                  </Text>

                  <FormControl>
                    <FormControlLabel>
                      <FormControlLabelText className="text-xs uppercase tracking-wide text-muted-foreground">
                        Username
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Input className="rounded-xl bg-card px-1 py-1">
                      <InputField
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="username"
                        value={username}
                        onChangeText={setUsername}
                      />
                    </Input>
                  </FormControl>

                  <FormControl>
                    <FormControlLabel>
                      <FormControlLabelText className="text-xs uppercase tracking-wide text-muted-foreground">
                        Email
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Input className="rounded-xl bg-card px-1 py-1">
                      <InputField
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        placeholder="email@address.com"
                        value={email}
                        onChangeText={setEmail}
                      />
                    </Input>
                  </FormControl>

                  <FormControl>
                    <FormControlLabel>
                      <FormControlLabelText className="text-xs uppercase tracking-wide text-muted-foreground">
                        Password
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Input className="rounded-xl bg-card px-1 py-1">
                      <InputField
                        secureTextEntry
                        placeholder="••••••••"
                        value={password}
                        onChangeText={setPassword}
                      />
                    </Input>
                  </FormControl>

                  <FormControl>
                    <FormControlLabel>
                      <FormControlLabelText className="text-xs uppercase tracking-wide text-muted-foreground">
                        Confirm password
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Input className="rounded-xl bg-card px-1 py-1">
                      <InputField
                        secureTextEntry
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                      />
                    </Input>
                  </FormControl>

                  <Box className="rounded-xl border border-border bg-muted p-4">
                    <HStack space="sm" className="items-start">
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: acceptedLegal }}
                        hitSlop={8}
                        onPress={() => setAcceptedLegal(!acceptedLegal)}
                        className="pt-0.5"
                      >
                        <Box
                          className={`h-5 w-5 items-center justify-center rounded border-2 ${
                            acceptedLegal
                              ? "border-primary bg-primary"
                              : "border-border bg-transparent"
                          }`}
                        >
                          {acceptedLegal ? (
                            <Text
                              size="xs"
                              bold
                              className="text-primary-foreground"
                            >
                              ✓
                            </Text>
                          ) : null}
                        </Box>
                      </Pressable>
                      <Text
                        size="sm"
                        className="min-w-0 flex-1 text-muted-foreground"
                      >
                        I agree to the{" "}
                        <Text
                          size="sm"
                          className="text-primary"
                          onPress={() =>
                            void openPlatformExternalUrl(HAVEN_TERMS_URL)
                          }
                        >
                          Terms of Service
                        </Text>{" "}
                        and{" "}
                        <Text
                          size="sm"
                          className="text-primary"
                          onPress={() =>
                            void openPlatformExternalUrl(HAVEN_PRIVACY_URL)
                          }
                        >
                          Privacy Policy
                        </Text>
                      </Text>
                    </HStack>
                  </Box>

                  {error ? (
                    <Text size="sm" className="text-center text-destructive">
                      {error}
                    </Text>
                  ) : null}

                  <Button
                    size="lg"
                    isDisabled={loading}
                    onPress={() => void onSubmit()}
                  >
                    {loading ? <ButtonSpinner /> : null}
                    <ButtonText>
                      {loading ? "Signing up…" : "Sign Up"}
                    </ButtonText>
                  </Button>

                  <HStack
                    space="xs"
                    className="flex-wrap items-center justify-center"
                  >
                    <Text
                      size="sm"
                      className="text-center text-muted-foreground"
                    >
                      Already have an account?
                    </Text>
                    <Pressable
                      onPress={() => void navigation.navigate("Login")}
                      hitSlop={8}
                    >
                      <Text size="sm" className="text-center text-primary">
                        Sign in
                      </Text>
                    </Pressable>
                  </HStack>
                </VStack>
              )}
            </VStack>
          </Box>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

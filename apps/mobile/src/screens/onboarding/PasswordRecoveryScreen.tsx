import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  completePasswordRecovery,
  requestPasswordReset,
  signOutFromAuth,
} from "@/auth/mobileAuthService";
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
import { usePasswordRecoveryGate } from "@/navigation/PasswordRecoveryGateContext";

const KEYBOARD_CARD_LIFT = -64;
const KEYBOARD_ANIMATION_MS = 220;

export function PasswordRecoveryScreen() {
  const insets = useSafeAreaInsets();
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "PasswordRecovery">>();
  const recoveryGate = usePasswordRecoveryGate();

  const flow = route.params?.flow ?? "requestReset";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState("");

  const requestReset = async () => {
    setError("");
    setLoading(true);

    try {
      const { error: resetError } = await requestPasswordReset(email);
      if (resetError) throw resetError;
      setSubmitSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    if (setPasswordLoading) return;

    setSetPasswordLoading(true);
    setSetPasswordError("");

    try {
      const { error: updateError } = await completePasswordRecovery(
        newPassword,
        confirmPassword,
      );
      if (updateError) throw updateError;
      recoveryGate?.clearPasswordRecoveryGate();
    } catch (err) {
      setSetPasswordError(getErrorMessage(err, "Failed to update password."));
    } finally {
      setSetPasswordLoading(false);
    }
  };

  const signOutFromRecovery = async () => {
    try {
      await signOutFromAuth();
    } finally {
      recoveryGate?.clearPasswordRecoveryGate();
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

  if (flow === "setNewPassword") {
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
          <Animated.View
            style={{ transform: [{ translateY: cardTranslateY }] }}
          >
            <Box className="w-full max-w-sm self-center rounded-3xl bg-card p-6">
              <VStack space="lg">
                <Text size="2xl" bold className="text-center text-foreground">
                  Haven
                </Text>
                <Text size="lg" bold className="text-center text-foreground">
                  Set a new password
                </Text>
                <Text size="sm" className="text-center text-muted-foreground">
                  Your reset link is verified. Set a new password to finish
                  account recovery.
                </Text>

                <FormControl>
                  <FormControlLabel>
                    <FormControlLabelText className="text-xs uppercase tracking-wide text-muted-foreground">
                      New password
                    </FormControlLabelText>
                  </FormControlLabel>
                  <Input className="rounded-xl bg-card px-1 py-1">
                    <InputField
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="••••••••"
                      value={newPassword}
                      onChangeText={setNewPassword}
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
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                  </Input>
                </FormControl>

                {setPasswordError ? (
                  <Text size="sm" className="text-center text-destructive">
                    {setPasswordError}
                  </Text>
                ) : null}

                <Button
                  size="lg"
                  isDisabled={setPasswordLoading}
                  onPress={() => void submitNewPassword()}
                >
                  {setPasswordLoading ? <ButtonSpinner /> : null}
                  <ButtonText>
                    {setPasswordLoading ? "Updating…" : "Update Password"}
                  </ButtonText>
                </Button>

                <Pressable
                  className="py-2"
                  onPress={() => void signOutFromRecovery()}
                  hitSlop={8}
                >
                  <Text size="sm" className="text-center text-muted-foreground">
                    Sign out
                  </Text>
                </Pressable>
              </VStack>
            </Box>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
                    We sent a password reset link to{" "}
                    <Text size="sm" className="text-foreground">
                      {email.trim()}
                    </Text>
                    . Open the email and follow the link to choose a new
                    password.
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
                    Reset your password
                  </Text>

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
                        placeholder="you@example.com"
                        value={email}
                        onChangeText={setEmail}
                      />
                    </Input>
                  </FormControl>

                  {error ? (
                    <Text size="sm" className="text-center text-destructive">
                      {error}
                    </Text>
                  ) : null}

                  <Button
                    size="lg"
                    isDisabled={loading}
                    onPress={() => void requestReset()}
                  >
                    {loading ? <ButtonSpinner /> : null}
                    <ButtonText>
                      {loading ? "Sending…" : "Send reset link"}
                    </ButtonText>
                  </Button>

                  <HStack
                    space="xs"
                    className="flex-wrap items-center justify-center"
                  >
                    <Pressable
                      hitSlop={8}
                      onPress={() => void navigation.navigate("Login")}
                    >
                      <Text size="sm" className="text-center text-primary">
                        Back to login
                      </Text>
                    </Pressable>
                    <Text size="sm" className="text-muted-foreground">
                      ·
                    </Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => void navigation.navigate("SignUp")}
                    >
                      <Text size="sm" className="text-center text-primary">
                        Sign up
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

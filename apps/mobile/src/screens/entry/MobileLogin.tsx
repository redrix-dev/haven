import type { RootStackParamList } from "@/navigation/types";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signInWithPassword } from "@/auth/mobileAuthService";
import { Box } from "@/components/ui/box";
import { Button, ButtonSpinner, ButtonText } from "@/components/ui/button";
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Input, InputField } from "@/components/ui/input";
import { KeyboardAvoidingView } from "@/components/ui/keyboard-avoiding-view";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

const KEYBOARD_CARD_LIFT = -64;
const KEYBOARD_ANIMATION_MS = 220;

export function MobileLogin() {
  const insets = useSafeAreaInsets();
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const onSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const { error } = await signInWithPassword(email, password);
      if (error) throw error;
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

              <FormControl>
                <FormControlLabel>
                  <FormControlLabelText className="text-sm text-muted-foreground">
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

              <FormControl>
                <FormControlLabel>
                  <FormControlLabelText className="text-sm text-muted-foreground">
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
                <ButtonText>{loading ? "Signing in…" : "Sign in"}</ButtonText>
              </Button>

              <VStack space="sm">
                <Pressable
                  onPress={() => void navigation.navigate("PasswordRecovery")}
                >
                  <Text size="sm" className="text-center text-muted-foreground">
                    Forgot password?
                  </Text>
                </Pressable>
                <Pressable onPress={() => void navigation.navigate("SignUp")}>
                  <Text size="sm" className="text-center text-muted-foreground">
                    Don't have an account? Sign up
                  </Text>
                </Pressable>
              </VStack>
            </VStack>
          </Box>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

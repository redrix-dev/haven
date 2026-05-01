import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getErrorMessage } from "@shared/platform/lib/errors";
import {
  HAVEN_PRIVACY_URL,
  HAVEN_TERMS_URL,
  openPlatformExternalUrl,
} from "@shared/platform/urls";
import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { signUpWithPassword } from "@/auth/mobileAuthService";
import type { RootStackParamList } from "@/navigation/types";

const PLACEHOLDER_MUTED = "#a9b8cf";

const inputClassName =
  "mb-4 rounded-lg border border-border bg-muted px-4 py-3 text-foreground";

export function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
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
        <View
          className="w-full max-w-sm self-center rounded-3xl border border-border bg-card p-6 shadow-xl shadow-background/40"
          style={Platform.OS === "android" ? { elevation: 8 } : undefined}
        >
          <Text className="mb-1 text-center text-2xl font-semibold text-foreground">
            Haven
          </Text>

          {submitSuccess ? (
            <>
              <Text className="mb-6 text-center text-lg font-semibold text-foreground">
                Check your email
              </Text>
              <Text className="mb-8 text-center text-sm leading-6 text-muted-foreground">
                We sent a verification link to{" "}
                <Text className="text-sm text-foreground">{email.trim()}</Text>. Open the email and
                confirm your account before signing in.
              </Text>
              <Pressable
                className="rounded-xl bg-primary py-4"
                onPress={() => void navigation.navigate("Login")}
              >
                <Text className="text-center text-base font-semibold text-primary-foreground">
                  Back to login
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="mb-8 text-center text-sm text-muted-foreground">
                Create your account
              </Text>

              <Text className="mb-2 uppercase text-xs tracking-wide text-muted-foreground">
                Username
              </Text>
              <TextInput
                className={inputClassName}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="username"
                placeholderTextColor={PLACEHOLDER_MUTED}
                value={username}
                onChangeText={setUsername}
              />

              <Text className="mb-2 uppercase text-xs tracking-wide text-muted-foreground">
                Email
              </Text>
              <TextInput
                className={inputClassName}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="email@address.com"
                placeholderTextColor={PLACEHOLDER_MUTED}
                value={email}
                onChangeText={setEmail}
              />

              <Text className="mb-2 uppercase text-xs tracking-wide text-muted-foreground">
                Password
              </Text>
              <TextInput
                className={inputClassName}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={PLACEHOLDER_MUTED}
                value={password}
                onChangeText={setPassword}
              />

              <Text className="mb-2 uppercase text-xs tracking-wide text-muted-foreground">
                Confirm password
              </Text>
              <TextInput
                className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-foreground"
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={PLACEHOLDER_MUTED}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />

              <View className="mb-6 rounded-xl border border-border bg-muted p-4">
                <View className="flex-row items-start gap-3">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: acceptedLegal }}
                    hitSlop={8}
                    onPress={() => setAcceptedLegal(!acceptedLegal)}
                    className="pt-0.5"
                  >
                    <View
                      className={`h-5 w-5 items-center justify-center rounded border-2 ${
                        acceptedLegal ? "border-primary bg-primary" : "border-border bg-transparent"
                      }`}
                    >
                      {acceptedLegal ? (
                        <Text className="text-xs font-bold text-primary-foreground">✓</Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <Text className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
                    I agree to the{" "}
                    <Text
                      className="text-sm text-primary"
                      onPress={() => void openPlatformExternalUrl(HAVEN_TERMS_URL)}
                    >
                      Terms of Service
                    </Text>{" "}
                    and{" "}
                    <Text
                      className="text-sm text-primary"
                      onPress={() => void openPlatformExternalUrl(HAVEN_PRIVACY_URL)}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </View>
              </View>

              {error ? (
                <Text className="mb-4 text-center text-sm text-destructive">{error}</Text>
              ) : null}

              <Pressable
                className={`mb-6 rounded-xl bg-primary py-4 ${loading ? "opacity-60" : ""}`}
                disabled={loading}
                onPress={() => void onSubmit()}
              >
                <Text className="text-center text-base font-semibold text-primary-foreground">
                  {loading ? "Signing up…" : "Sign Up"}
                </Text>
              </Pressable>

              <View className="flex-row flex-wrap items-center justify-center gap-x-1">
                <Text className="text-center text-sm text-muted-foreground">
                  Already have an account?
                </Text>
                <Pressable
                  onPress={() => void navigation.navigate("Login")}
                  hitSlop={8}
                >
                  <Text className="text-center text-sm text-primary">Sign in</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getErrorMessage } from "@shared/platform/lib/errors";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import { useState } from "react";
import type { RootStackParamList } from "@/navigation/types";
import { usePasswordRecoveryGate } from "@/navigation/PasswordRecoveryGateContext";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  completePasswordRecovery,
  requestPasswordReset,
  signOutFromAuth,
} from "@/auth/mobileAuthService";

const PLACEHOLDER_MUTED = "#a9b8cf";

const inputClassName =
  "mb-4 rounded-lg border border-border bg-muted px-4 py-3 text-foreground";

export function PasswordRecoveryScreen() {
  const insets = useSafeAreaInsets();
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

  if (flow === "setNewPassword") {
    return (
      <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
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
            <Text className="mb-2 text-center text-lg font-semibold text-foreground">
              Set a new password
            </Text>
            <Text className="mb-8 text-center text-sm leading-5 text-muted-foreground">
              Your reset link is verified. Set a new password to finish account
              recovery.
            </Text>

            <Text className="mb-2 uppercase text-xs tracking-wide text-muted-foreground">
              New password
            </Text>
            <TextInput
              className={inputClassName}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="••••••••"
              placeholderTextColor={PLACEHOLDER_MUTED}
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <Text className="mb-2 uppercase text-xs tracking-wide text-muted-foreground">
              Confirm password
            </Text>
            <TextInput
              className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-foreground"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="••••••••"
              placeholderTextColor={PLACEHOLDER_MUTED}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            {setPasswordError ? (
              <Text className="mb-4 text-center text-sm text-destructive">
                {setPasswordError}
              </Text>
            ) : null}

            <Pressable
              className={`mb-4 rounded-xl bg-primary py-4 ${setPasswordLoading ? "opacity-60" : ""}`}
              disabled={setPasswordLoading}
              onPress={() => void submitNewPassword()}
            >
              <Text className="text-center text-base font-semibold text-primary-foreground">
                {setPasswordLoading ? "Updating…" : "Update Password"}
              </Text>
            </Pressable>

            <Pressable
              className="py-2"
              onPress={() => void signOutFromRecovery()}
              hitSlop={8}
            >
              <Text className="text-center text-sm text-muted-foreground">
                Sign out
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
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
                We sent a password reset link to{" "}
                <Text className="text-sm text-foreground">{email.trim()}</Text>.
                Open the email and follow the link to choose a new password.
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
                Reset your password
              </Text>

              <Text className="mb-2 uppercase text-xs tracking-wide text-muted-foreground">
                Email
              </Text>
              <TextInput
                className={inputClassName}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={PLACEHOLDER_MUTED}
                value={email}
                onChangeText={setEmail}
              />

              {error ? (
                <Text className="mb-4 text-center text-sm text-destructive">
                  {error}
                </Text>
              ) : null}

              <Pressable
                className={`mb-6 rounded-xl bg-primary py-4 ${loading ? "opacity-60" : ""}`}
                disabled={loading}
                onPress={() => void requestReset()}
              >
                <Text className="text-center text-base font-semibold text-primary-foreground">
                  {loading ? "Sending…" : "Send reset link"}
                </Text>
              </Pressable>

              <View className="flex-row flex-wrap items-center justify-center gap-x-1 gap-y-1">
                <Pressable
                  hitSlop={8}
                  onPress={() => void navigation.navigate("Login")}
                >
                  <Text className="text-center text-sm text-primary">
                    Back to login
                  </Text>
                </Pressable>
                <Text className="text-sm text-muted-foreground"> · </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => void navigation.navigate("SignUp")}
                >
                  <Text className="text-center text-sm text-primary">
                    Sign up
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

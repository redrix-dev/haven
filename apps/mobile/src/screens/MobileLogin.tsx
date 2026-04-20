import { RootStackParamList } from "@/navigation/types";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signInWithPassword } from "@/auth/mobileAuthService";

export function MobileLogin() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom, flexGrow: 1,  justifyContent: 'center' }}>
        <View className="w-full max-w-sm self-center bg-card rounded-3xl p-6">
          <Text className="mb-8 text-center text-2xl font-semibold text-foreground">
            Haven
          </Text>
          <Text className="mb-2 text-sm text-muted-foreground">Email</Text>
          <TextInput
            className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-foreground"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#a9b8cf"
            value={email}
            onChangeText={setEmail}
          />
          <Text className="mb-2 text-sm text-muted-foreground">Password</Text>
          <TextInput
            className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-foreground"
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#a9b8cf"
            value={password}
            onChangeText={setPassword}
          />
          {error ? (
            <Text className="mb-4 text-center text-sm text-destructive">{error}</Text>
          ) : null}
          <Pressable
            className={`rounded-xl bg-primary py-4 ${loading ? "opacity-60" : ""}`}
            disabled={loading}
            onPress={() => void onSubmit()}
          >
            <Text className="text-center text-base font-semibold text-primary-foreground">
              {loading ? "Signing in…" : "Sign in"}
            </Text>
          </Pressable>
          <Pressable
            className="text-sm text-muted-foreground"
            onPress={() => void navigation.navigate("PasswordRecovery")}
          >
            <Text className="text-center text-sm text-muted-foreground">Forgot password?</Text>
          </Pressable>
          <Pressable
            className="text-sm text-muted-foreground"
            onPress={() => void navigation.navigate("SignUp")}
          >
            <Text className="text-center text-sm text-muted-foreground">Don't have an account? Sign up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { getMobileSupabase } from "../supabase/getMobileSupabase";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: signError } = await getMobileSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) setError(getErrorMessage(signError));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="mb-8 text-center text-2xl font-semibold text-slate-50">
          Haven
        </Text>
        <Text className="mb-2 text-sm text-slate-400">Email</Text>
        <TextInput
          className="mb-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-50"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={setEmail}
        />
        <Text className="mb-2 text-sm text-slate-400">Password</Text>
        <TextInput
          className="mb-6 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-50"
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
        />
        {error ? (
          <Text className="mb-4 text-center text-sm text-red-400">{error}</Text>
        ) : null}
        <Pressable
          className={`rounded-xl bg-slate-100 py-4 ${loading ? "opacity-60" : ""}`}
          disabled={loading}
          onPress={() => void onSubmit()}
        >
          <Text className="text-center text-base font-semibold text-slate-950">
            {loading ? "Signing in…" : "Sign in"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

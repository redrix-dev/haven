import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMobileSupabase } from "../supabase/getMobileSupabase";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "@shared/contexts/AuthContext";
import { useState } from "react";
import { HavenInput } from "@/components/HavenInput";
export function PasswordRecoveryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    setError("");
    setLoading(true);
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom, flexGrow: 1,  justifyContent: 'center' }}>
        <View className="w-full max-w-sm self-center bg-card rounded-3xl p-6">
          <Text className="mb-8 text-center text-2xl font-semibold text-foreground">
            Password Recovery
          </Text>
        
            <Text className="mb-2 text-sm text-muted-foreground">Email</Text>
            <HavenInput
            className="mb-4"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="muted-foreground"
            value={email}
            onChangeText={setEmail}
            />
            
                <Pressable
                className={`rounded-xl bg-primary py-4 ${loading ? "opacity-60" : ""}`}
                disabled={loading}
                onPress={() => void onSubmit()}
                >
                <Text className="text-center text-base font-semibold text-primary-foreground">
                    {loading ? "Sending recovery email…" : "Send recovery email"}
                </Text>
                </Pressable>
                <View className="flex-row justify-between">
                <Pressable
                className="text-sm text-muted-foreground mt-3"
                onPress={() => void navigation.navigate("Login" as unknown as never)}
                >
                    <Text className="text-center text-sm text-muted-foreground">Back to login</Text>
                </Pressable>
                <Pressable
                    className="text-sm text-muted-foreground mt-3"
                    onPress={() => void navigation.navigate("SignUp" as unknown as never)}
                >
                    <Text className="text-center text-sm text-muted-foreground">Don't have an account? Sign up</Text>
                </Pressable>
            </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
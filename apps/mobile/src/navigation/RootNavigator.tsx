import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuthSession } from "../hooks/useAuthSession";
import { useMobileExpoPushRegistration } from "../hooks/useMobileExpoPushRegistration";
import { useMobileVoipFoundation } from "../hooks/useMobileVoipFoundation";
import { useServersRealtimeBootstrap } from "../hooks/useServersRealtimeBootstrap";
import { CreatePlaceholderScreen } from "../screens/CreatePlaceholderScreen";
import { CommunityScreen } from "../screens/CommunityScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { JoinPlaceholderScreen } from "../screens/JoinPlaceholderScreen";
import { SettingsPlaceholderScreen } from "../screens/SettingsPlaceholderScreen";
import type { RootStackParamList } from "./types";
import { PasswordRecoveryGateProvider } from "./PasswordRecoveryGateContext";
import { MobileLogin } from "../screens/MobileLogin";
import { PasswordRecoveryScreen } from "../screens/PasswordRecoveryScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { getMobileSupabase } from "@/supabase/getMobileSupabase";
import { consumeAuthConfirmUrl } from "@/auth/mobileAuthService";
const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const session = useAuthSession();
  useMobileExpoPushRegistration(session);
  useMobileVoipFoundation(session);
  useServersRealtimeBootstrap(session);
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] = useState(false);
  const url = Linking.useURL();
  const processedAuthConfirmUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const consumeAuthUrl = async (candidateUrl: string | null | undefined) => {
      if (!candidateUrl) return;
      if (processedAuthConfirmUrlsRef.current.has(candidateUrl)) return;
      try {
        const result = await consumeAuthConfirmUrl(candidateUrl);
        if (result.didProcess) {
          processedAuthConfirmUrlsRef.current.add(candidateUrl);
          setPasswordRecoveryRequired(result.requiresPasswordRecovery);
        }
      } catch (error) {
        console.error("Failed to process mobile auth confirmation URL.", error);
      }
    };

    void consumeAuthUrl(url);
  }, [url]);

  useEffect(() => {
    let disposed = false;

    const processInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (disposed) return;
        if (!initialUrl) return;
        if (processedAuthConfirmUrlsRef.current.has(initialUrl)) return;

        const result = await consumeAuthConfirmUrl(initialUrl);
        if (result.didProcess) {
          processedAuthConfirmUrlsRef.current.add(initialUrl);
          setPasswordRecoveryRequired(result.requiresPasswordRecovery);
        }
      } catch (error) {
        console.error("Failed to process initial mobile auth URL.", error);
      }
    };

    void processInitialUrl();

    const {
      data: { subscription },
    } = getMobileSupabase().auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryRequired(true);
      } else if (event === "SIGNED_OUT") {
        setPasswordRecoveryRequired(false);
      }
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <ActivityIndicator color="#e6edf7" size="large" />
      </View>
    );
  }

  return (
    <PasswordRecoveryGateProvider
      clearPasswordRecoveryGate={() => setPasswordRecoveryRequired(false)}
    >
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
          {session ? (
            <>
              {passwordRecoveryRequired ? (
                <Stack.Screen
                  name="PasswordRecovery"
                  component={PasswordRecoveryScreen}
                  initialParams={{ flow: "setNewPassword" }}
                />
              ) : (
                <>
                  <Stack.Screen name="Home" component={HomeScreen} />
                  <Stack.Screen
                    name="Community"
                    component={CommunityScreen}
                  />
                  <Stack.Screen
                    name="SettingsPlaceholder"
                    component={SettingsPlaceholderScreen}
                  />
                  <Stack.Screen
                    name="CreatePlaceholder"
                    component={CreatePlaceholderScreen}
                  />
                  <Stack.Screen
                    name="JoinPlaceholder"
                    component={JoinPlaceholderScreen}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={MobileLogin} />
              <Stack.Screen
                name="PasswordRecovery"
                component={PasswordRecoveryScreen}
                initialParams={{ flow: "requestReset" }}
              />
              <Stack.Screen name="SignUp" component={SignUpScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </PasswordRecoveryGateProvider>
  );
}

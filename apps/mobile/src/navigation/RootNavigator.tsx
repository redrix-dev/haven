import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useMobileExpoPushRegistration } from "@/hooks/useMobileExpoPushRegistration";
import { useMobileVoipFoundation } from "@/hooks/useMobileVoipFoundation";
import type { RootStackParamList } from "./types";
import { PasswordRecoveryGateProvider } from "./PasswordRecoveryGateContext";
import { MobileLogin } from "@/screens/entry/MobileLogin";
import { PasswordRecoveryScreen } from "@/screens/onboarding/PasswordRecoveryScreen";
import { SignUpScreen } from "@/screens/onboarding/SignUpScreen";
import { useEffect, useState } from "react";
import { getMobileSupabase } from "@/supabase/getMobileSupabase";
import { MainNavigator } from "@/navigation/MainNavigator";
import { MobileOnboardingGate } from "@/navigation/MobileOnboardingGate";
import { NAV_THEME } from "@/lib/theme";
import { useMobileLinkIntake } from "@/features/links/useMobileLinkIntake";

const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthenticatedMain() {
  return (
    <MobileOnboardingGate>
      <MainNavigator />
    </MobileOnboardingGate>
  );
}

export function RootNavigator() {
  const session = useAuthSession();
  useMobileExpoPushRegistration(session);
  useMobileVoipFoundation(session);
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] =
    useState(false);
  // Invite, destination, and auth email links: see features/links.
  useMobileLinkIntake(setPasswordRecoveryRequired);

  useEffect(() => {
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
      subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; resolves to --foreground */}
        <ActivityIndicator color="#e6edf7" size="large" />
      </View>
    );
  }

  return (
    <PasswordRecoveryGateProvider
      clearPasswordRecoveryGate={() => setPasswordRecoveryRequired(false)}
    >
      <NavigationContainer theme={NAV_THEME.dark}>
        <Stack.Navigator
          screenOptions={{ headerShown: false, animation: "fade" }}
        >
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
                  <Stack.Screen
                    name="Main"
                    component={AuthenticatedMain}
                    options={{ keyboardHandlingEnabled: false }}
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

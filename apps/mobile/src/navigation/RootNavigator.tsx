import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuthSession } from "../hooks/useAuthSession";
import { CreatePlaceholderScreen } from "../screens/CreatePlaceholderScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { JoinPlaceholderScreen } from "../screens/JoinPlaceholderScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { SettingsPlaceholderScreen } from "../screens/SettingsPlaceholderScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const session = useAuthSession();

  if (session === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator color="#f8fafc" size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        {session ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
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
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

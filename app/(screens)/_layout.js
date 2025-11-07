import { Stack } from "expo-router";

export default function ScreenLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="notification" />
      {/* <Stack.Screen name="login" /> */}
    </Stack>
  );
}
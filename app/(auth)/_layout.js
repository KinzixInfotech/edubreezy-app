import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="schoolcode" />
      <Stack.Screen name="profile-selector" />
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="forgot-password-sent" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

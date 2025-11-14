import { Stack } from "expo-router";

export default function ScreenLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="notification" />
      <Stack.Screen name="paymenthistory" />
      <Stack.Screen name="greeting" />
      <Stack.Screen name="my-child/attendance" />
      <Stack.Screen name="wish" />
      <Stack.Screen name="calendarscreen" />
      <Stack.Screen name="payfees" />
    </Stack>
  );
}
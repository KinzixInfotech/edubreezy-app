import { Stack } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function ScreenLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="notification" />
        <Stack.Screen name="paymenthistory" />
        <Stack.Screen name="greeting" />
        <Stack.Screen name="my-child/attendance" />
        <Stack.Screen name="wish" />
        <Stack.Screen name="teachers/stats-calendar" />
        <Stack.Screen name="teachers/delegationmarking" />
        <Stack.Screen name="calendarscreen" />
        <Stack.Screen name="payfees" />
        <Stack.Screen name="/homework/view" />
        <Stack.Screen name="syllabusview" />
        <Stack.Screen name="homework/assign" />
        <Stack.Screen
          name="transport/my-vehicle"
          options={{
            headerShown: true,
            title: 'My Vehicle',
            headerStyle: { backgroundColor: '#fff' },
            headerTitleStyle: { fontWeight: '700', fontSize: 18, color: '#111' },
            headerShadowVisible: false,
            headerTitleAlign: 'center',
            headerBackTitleVisible: false,
            headerTintColor: '#111',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
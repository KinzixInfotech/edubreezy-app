import { Stack } from 'expo-router';

export default function PrincipalLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="approvals" />
        </Stack>
    );
}

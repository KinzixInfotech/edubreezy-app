import { Stack } from 'expo-router';

export default function HPCLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="view" />
            <Stack.Screen name="reflection" />
            <Stack.Screen name="teacher-assess" />
            <Stack.Screen name="teacher-student-select" />
            <Stack.Screen name="parent-view" />
            <Stack.Screen name="student-reflection" />
            <Stack.Screen name="teacher-narrative" />
            <Stack.Screen name="parent-feedback" />
        </Stack>
    );
}

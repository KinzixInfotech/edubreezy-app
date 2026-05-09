import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';

const COPY = {
    SUSPENDED: {
        title: 'School account suspended',
        body: 'Access is temporarily blocked for this school account.',
    },
    TERMINATED: {
        title: 'School account terminated',
        body: 'This school account is no longer available.',
    },
};

export default function AccountStateScreen() {
    const params = useLocalSearchParams();
    const status = String(params.status || '');
    const message = String(params.message || '');
    const reason = String(params.reason || '');
    const copy = COPY[status] || {
        title: 'Account access blocked',
        body: 'This school account is currently unavailable.',
    };

    const handleLogout = async () => {
        try {
            await SecureStore.deleteItemAsync('schoolAccountState');
            await supabase.auth.signOut();
        } catch (error) {
            console.warn('Failed to clear session after school state block:', error?.message || error);
        } finally {
            router.replace('/(auth)/login');
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.body}>{message || copy.body}</Text>
                {!!reason && <Text style={styles.reason}>Reason: {reason}</Text>}
                <TouchableOpacity style={styles.button} onPress={handleLogout}>
                    <Text style={styles.buttonText}>Back to login</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#111827',
        borderRadius: 16,
        padding: 24,
        gap: 12,
    },
    title: {
        color: '#f8fafc',
        fontSize: 24,
        fontWeight: '700',
    },
    body: {
        color: '#cbd5e1',
        fontSize: 16,
        lineHeight: 22,
    },
    reason: {
        color: '#fca5a5',
        fontSize: 14,
        lineHeight: 20,
    },
    button: {
        marginTop: 8,
        backgroundColor: '#2563eb',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
});

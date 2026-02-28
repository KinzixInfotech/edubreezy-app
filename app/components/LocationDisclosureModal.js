import React from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Platform,
} from 'react-native';
import { MapPin, ShieldCheck, Bell, Clock } from 'lucide-react-native';
import HapticTouchable from './HapticTouch';

/**
 * Bottom-sheet style disclosure modal.
 * Explains foreground location tracking before permissions are requested.
 * Required for Google Play compliance.
 */
const LocationDisclosureModal = ({ visible, onAccept, onDecline }) => {
    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onDecline}
        >
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    {/* Handle */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.headerRow}>
                        <View style={styles.iconBg}>
                            <MapPin size={24} color="#2563EB" />
                        </View>
                        <View>
                            <Text style={styles.title}>Location Tracking</Text>
                            <Text style={styles.subtitle}>Foreground only</Text>
                        </View>
                    </View>

                    {/* Explanation */}
                    <Text style={styles.description}>
                        This app uses your device's GPS to share <Text style={styles.bold}>real-time bus location</Text> with parents while a trip is active. Tracking runs only in the <Text style={styles.bold}>foreground</Text> — it stops when you close the app or end the trip.
                    </Text>

                    {/* Info items */}
                    <View style={styles.infoBox}>
                        <View style={styles.infoRow}>
                            <Bell size={16} color="#F59E0B" />
                            <Text style={styles.infoText}>A notification will be shown while tracking is active.</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <ShieldCheck size={16} color="#10B981" />
                            <Text style={styles.infoText}>Location data is used only for bus tracking and student safety.</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Clock size={16} color="#64748B" />
                            <Text style={styles.infoText}>Tracking stops automatically when the trip ends.</Text>
                        </View>
                    </View>

                    {/* Buttons */}
                    <View style={styles.buttonRow}>
                        <HapticTouchable style={styles.declineBtn} onPress={onDecline}>
                            <Text style={styles.declineText}>Not Now</Text>
                        </HapticTouchable>
                        <HapticTouchable style={styles.acceptBtn} onPress={onAccept}>
                            <Text style={styles.acceptText}>I Understand & Agree</Text>
                        </HapticTouchable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    },
    handle: {
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#D1D5DB',
        alignSelf: 'center',
        marginBottom: 20,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 16,
    },
    iconBg: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
    },
    subtitle: {
        fontSize: 13,
        color: '#64748B',
        marginTop: 1,
    },
    description: {
        fontSize: 15,
        color: '#475569',
        lineHeight: 23,
        marginBottom: 18,
    },
    bold: {
        fontWeight: '700',
        color: '#1E293B',
    },
    infoBox: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 16,
        gap: 14,
        marginBottom: 24,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoText: {
        fontSize: 14,
        color: '#475569',
        flex: 1,
        lineHeight: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    declineBtn: {
        flex: 1,
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
    },
    declineText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#64748B',
    },
    acceptBtn: {
        flex: 2,
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#2563EB',
    },
    acceptText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
});

export default LocationDisclosureModal;

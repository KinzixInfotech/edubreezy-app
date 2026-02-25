import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { MapPin, ShieldCheck, Info, CheckSquare, Square } from 'lucide-react-native';
import HapticTouchable from './HapticTouch';

const { width } = Dimensions.get('window');

const LocationDisclosureModal = ({ visible, onAccept, onDecline }) => {
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const handleAccept = () => {
        onAccept(dontShowAgain); // pass preference up so parent can save it
    };

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onDecline}
        >
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    <View style={styles.iconContainer}>
                        <View style={styles.iconBackground}>
                            <MapPin size={32} color="#2563EB" />
                        </View>
                    </View>

                    <Text style={styles.title}>Location Tracking Disclosure</Text>

                    <Text style={styles.description}>
                        EduBreezy collects location data to enable <Text style={styles.bold}>real-time tracking of school buses</Text> even when the app is <Text style={styles.bold}>closed or not in use</Text>.
                    </Text>

                    <View style={styles.infoBox}>
                        <View style={styles.infoRow}>
                            <ShieldCheck size={18} color="#10B981" />
                            <Text style={styles.infoText}>Required for Bus Driver role safety services.</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Info size={18} color="#64748B" />
                            <Text style={styles.infoText}>Ensures parents get accurate arrival updates.</Text>
                        </View>
                    </View>

                    <Text style={styles.disclosureText}>
                        This data is used solely for the purpose of bus tracking and student safety. We do not sell your personal or location data.
                    </Text>

                    {/* Don't show again checkbox */}
                    <HapticTouchable
                        style={styles.checkboxRow}
                        onPress={() => setDontShowAgain(prev => !prev)}
                    >
                        {dontShowAgain
                            ? <CheckSquare size={20} color="#2563EB" />
                            : <Square size={20} color="#94A3B8" />
                        }
                        <Text style={[styles.checkboxLabel, dontShowAgain && styles.checkboxLabelActive]}>
                            Don't show again
                        </Text>
                    </HapticTouchable>

                    <View style={styles.buttonContainer}>
                        <HapticTouchable style={styles.declineButton} onPress={onDecline}>
                            <Text style={styles.declineText}>Not Now</Text>
                        </HapticTouchable>
                        <HapticTouchable style={styles.acceptButton} onPress={handleAccept}>
                            <Text style={styles.acceptText}>I Agree</Text>
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 5,
    },
    iconContainer: {
        marginBottom: 20,
    },
    iconBackground: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1E293B',
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 15,
        color: '#475569',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    bold: {
        fontWeight: '700',
        color: '#1E293B',
    },
    infoBox: {
        width: '100%',
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        gap: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    infoText: {
        fontSize: 13,
        color: '#475569',
        flex: 1,
    },
    disclosureText: {
        fontSize: 12,
        color: '#94A3B8',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 18,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        alignSelf: 'flex-start',
        marginBottom: 20,
        paddingHorizontal: 4,
    },
    checkboxLabel: {
        fontSize: 14,
        color: '#94A3B8',
        fontWeight: '500',
    },
    checkboxLabelActive: {
        color: '#2563EB',
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    declineButton: {
        flex: 1,
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
    },
    declineText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#64748B',
    },
    acceptButton: {
        flex: 2,
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#2563EB',
    },
    acceptText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});

export default LocationDisclosureModal;

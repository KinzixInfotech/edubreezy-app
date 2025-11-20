// components/DelegationCheckModal.js
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    ScrollView,
    Dimensions
} from 'react-native';
import { UserCheck, Calendar, Users, ArrowRight } from 'lucide-react-native';
import HapticTouchable from './HapticTouch';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DelegationCheckModal({ visible, delegations, onSelectDelegation, onClose }) {
    console.log('DelegationCheckModal rendered:', { visible, delegationsCount: delegations?.length });
    
    if (!visible || !delegations || delegations.length === 0) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Animated.View entering={FadeInDown.duration(400)} style={styles.modal}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerIcon}>
                            <UserCheck size={28} color="#fff" />
                        </View>
                        <Text style={styles.headerTitle}>Substitute Assignment</Text>
                        <Text style={styles.headerSubtitle}>
                            You are assigned as substitute teacher
                        </Text>
                    </View>

                    {/* Delegations List */}
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        <Text style={styles.sectionTitle}>Assigned Classes</Text>
                        <View style={styles.delegationsList}>
                            {delegations.map((delegation, index) => (
                                <Animated.View
                                    key={delegation.id}
                                    entering={FadeInDown.delay(200 + index * 100).duration(400)}
                                >
                                    <HapticTouchable onPress={() => {
                                        console.log('Delegation selected:', delegation.id);
                                        onSelectDelegation(delegation);
                                    }}>
                                        <View style={styles.delegationCard}>
                                            {/* Class Info */}
                                            <View style={styles.delegationHeader}>
                                                <View style={styles.classIcon}>
                                                    <Users size={24} color="#0469ff" />
                                                </View>
                                                <View style={styles.classInfo}>
                                                    <Text style={styles.className}>
                                                        {delegation.className}
                                                        {delegation.sectionName && ` - ${delegation.sectionName}`}
                                                    </Text>
                                                    <Text style={styles.studentCount}>
                                                        {delegation.studentCount} students
                                                    </Text>
                                                </View>
                                                <ArrowRight size={20} color="#999" />
                                            </View>

                                            {/* Original Teacher */}
                                            <View style={styles.teacherInfo}>
                                                <Text style={styles.label}>Original Teacher:</Text>
                                                <Text style={styles.teacherName}>
                                                    {delegation.originalTeacher.name}
                                                </Text>
                                            </View>

                                            {/* Date Range */}
                                            <View style={styles.dateRange}>
                                                <Calendar size={14} color="#666" />
                                                <Text style={styles.dateText}>
                                                    {new Date(delegation.startDate).toLocaleDateString()} - {' '}
                                                    {new Date(delegation.endDate).toLocaleDateString()}
                                                </Text>
                                            </View>

                                            {/* Reason */}
                                            {delegation.reason && (
                                                <Text style={styles.reason} numberOfLines={2}>
                                                    {delegation.reason}
                                                </Text>
                                            )}

                                            {/* Action Button */}
                                            <View style={styles.actionButton}>
                                                <Text style={styles.actionButtonText}>Mark Attendance →</Text>
                                            </View>
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))}
                        </View>

                        {/* Own Classes Link */}
                        <HapticTouchable onPress={() => {
                            console.log('Own classes button clicked');
                            onClose();
                        }}>
                            <View style={styles.ownClassesButton}>
                                <Text style={styles.ownClassesText}>
                                    Or mark attendance for my assigned classes
                                </Text>
                            </View>
                        </HapticTouchable>
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modal: {
        width: SCREEN_WIDTH - 40,
        maxWidth: 500,
        maxHeight: '80%',
        backgroundColor: '#fff',
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        backgroundColor: '#0469ff',
        padding: 24,
        alignItems: 'center',
    },
    headerIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.9)',
        textAlign: 'center',
    },
    content: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
    },
    delegationsList: {
        gap: 12,
        marginBottom: 20,
    },
    delegationCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: '#e9ecef',
    },
    delegationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    classIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E3F2FD',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    classInfo: {
        flex: 1,
    },
    className: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 2,
    },
    studentCount: {
        fontSize: 13,
        color: '#666',
    },
    teacherInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        fontSize: 12,
        color: '#666',
        marginRight: 6,
    },
    teacherName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#111',
        flex: 1,
    },
    dateRange: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    dateText: {
        fontSize: 12,
        color: '#666',
    },
    reason: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
        marginBottom: 12,
    },
    actionButton: {
        backgroundColor: '#0469ff',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    ownClassesButton: {
        paddingVertical: 16,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#e9ecef',
    },
    ownClassesText: {
        fontSize: 14,
        color: '#0469ff',
        fontWeight: '600',
    },
});
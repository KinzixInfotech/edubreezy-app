import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function ChangelogModal({ visible, onClose, changelog = [], latestVersion }) {
    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>What's New</Text>
                            {latestVersion && (
                                <Text style={styles.version}>Version {latestVersion}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {/* Changelog list */}
                    <ScrollView
                        style={styles.scrollView}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 20 }}
                    >
                        {changelog.length > 0 ? (
                            changelog.map((entry, idx) => (
                                <View key={idx} style={styles.entry}>
                                    <View style={styles.entryHeader}>
                                        <View style={styles.versionBadge}>
                                            <Text style={styles.versionBadgeText}>v{entry.version}</Text>
                                        </View>
                                        <Text style={styles.entryDate}>{entry.date}</Text>
                                    </View>
                                    {(entry.changes || []).map((change, cidx) => (
                                        <View key={cidx} style={styles.changeRow}>
                                            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                                            <Text style={styles.changeText}>{change}</Text>
                                        </View>
                                    ))}
                                </View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Ionicons name="document-text-outline" size={48} color="#ccc" />
                                <Text style={styles.emptyText}>No changelog available</Text>
                            </View>
                        )}
                    </ScrollView>

                    {/* Close button */}
                    <TouchableOpacity style={styles.doneButton} onPress={onClose} activeOpacity={0.8}>
                        <Text style={styles.doneButtonText}>Got It</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '75%',
        paddingTop: 20,
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    version: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    closeButton: {
        padding: 4,
    },
    scrollView: {
        maxHeight: 400,
    },
    entry: {
        marginBottom: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    entryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    versionBadge: {
        backgroundColor: '#e8f5e9',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginRight: 10,
    },
    versionBadgeText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#2e7d32',
    },
    entryDate: {
        fontSize: 13,
        color: '#999',
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
        paddingLeft: 4,
    },
    changeText: {
        fontSize: 14,
        color: '#444',
        marginLeft: 8,
        flex: 1,
        lineHeight: 20,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 15,
        color: '#aaa',
        marginTop: 12,
    },
    doneButton: {
        backgroundColor: '#1a1a2e',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    doneButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, TextInput, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ClipboardList, ChevronLeft, Search, Package, AlertTriangle, CheckCircle } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

export default function InventoryScreen() {
    const { schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-inventory', schoolId, searchQuery],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/inventory`, {
                params: { search: searchQuery }
            });
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const summary = data?.summary || {};
    const categories = data?.categories || [];
    const lowStockItems = data?.lowStockItems || [];
    const items = data?.items || [];

    const renderItem = ({ item }) => (
        <View style={styles.itemCard}>
            <View style={[styles.itemIcon, { backgroundColor: item.quantity <= item.minQuantity ? '#FEE2E2' : '#DCFCE7' }]}>
                <Package size={20} color={item.quantity <= item.minQuantity ? '#DC2626' : '#16A34A'} />
            </View>
            <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemCategory}>{item.category}</Text>
                {item.location && (
                    <Text style={styles.itemLocation}>{item.location}</Text>
                )}
            </View>
            <View style={styles.itemQuantity}>
                <Text style={[styles.quantityText, { color: item.quantity <= item.minQuantity ? '#DC2626' : '#1F2937' }]}>
                    {item.quantity}
                </Text>
                <Text style={styles.unitText}>{item.unit}</Text>
            </View>
        </View>
    );

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#6366F1" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style='dark' />
            <Stack.Screen options={{ headerShown: false }} />
            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Inventory</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: '#EEF2FF' }]}>
                    <ClipboardList size={20} color="#6366F1" />
                    <Text style={styles.summaryValue}>{summary.totalItems || 0}</Text>
                    <Text style={styles.summaryLabel}>Total Items</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#DCFCE7' }]}>
                    <CheckCircle size={20} color="#16A34A" />
                    <Text style={styles.summaryValue}>{summary.inStock || 0}</Text>
                    <Text style={styles.summaryLabel}>In Stock</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2' }]}>
                    <AlertTriangle size={20} color="#DC2626" />
                    <Text style={styles.summaryValue}>{summary.lowStock || 0}</Text>
                    <Text style={styles.summaryLabel}>Low Stock</Text>
                </View>
            </View>

            {/* Low Stock Alert */}
            {lowStockItems.length > 0 && (
                <View style={styles.alertCard}>
                    <AlertTriangle size={20} color="#DC2626" />
                    <Text style={styles.alertText}>
                        {lowStockItems.length} items running low on stock
                    </Text>
                </View>
            )}

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Search size={20} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search items..."
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Categories */}
            {categories.length > 0 && (
                <View style={styles.categoriesSection}>
                    <Text style={styles.categoriesTitle}>Categories</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
                        <View style={styles.categoriesContainer}>
                            {categories.map((cat, index) => (
                                <HapticTouchable key={index}>
                                    <View style={styles.categoryChip}>
                                        <Package size={16} color="#6366F1" />
                                        <Text style={styles.categoryName}>{cat.name}</Text>
                                        <View style={styles.categoryCountBadge}>
                                            <Text style={styles.categoryCount}>{cat.itemCount || 0}</Text>
                                        </View>
                                    </View>
                                </HapticTouchable>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            )}

            {/* Items List */}
            <FlatList
                data={items}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Package size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>No items found</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    summaryContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 12,
    },
    summaryCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1F2937',
        marginTop: 8,
    },
    summaryLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    alertCard: {
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#FEF2F2',
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    alertText: {
        flex: 1,
        fontSize: 14,
        color: '#991B1B',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchInput: {
        flex: 1,
        marginLeft: 12,
        fontSize: 16,
        color: '#1F2937',
    },
    categoriesSection: {
        marginBottom: 16,
    },
    categoriesTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    categoriesScroll: {
        marginBottom: 0,
    },
    categoriesContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 10,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        gap: 8,
    },
    categoryName: {
        fontSize: 14,
        fontWeight: '500',
        color: '#4338CA',
    },
    categoryCountBadge: {
        backgroundColor: '#6366F1',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    categoryCount: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    itemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    itemIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
        marginLeft: 12,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
    itemCategory: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    itemLocation: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    itemQuantity: {
        alignItems: 'flex-end',
    },
    quantityText: {
        fontSize: 18,
        fontWeight: '700',
    },
    unitText: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        fontSize: 16,
        color: '#9CA3AF',
        marginTop: 12,
    },
});

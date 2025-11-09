// // app/(screens)/payfees.jsx
// // ENHANCED: Show installment particular breakdowns

// import {
//   View,
//   Text,
//   StyleSheet,
//   ScrollView,
//   RefreshControl,
//   Pressable,
//   Modal,
//   Alert,
//   FlatList
// } from 'react-native';
// import { useState, useMemo, useCallback } from 'react';
// import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// import { router, useLocalSearchParams } from 'expo-router';
// import {
//   DollarSign,
//   Calendar,
//   CheckCircle,
//   Clock,
//   AlertCircle,
//   CreditCard,
//   ArrowLeft,
//   Info,
//   ChevronRight,
//   ChevronDown,
//   X
// } from 'lucide-react-native';
// import { LinearGradient } from 'expo-linear-gradient';
// import Animated, { FadeInDown, FadeInRight, SlideInRight } from 'react-native-reanimated';
// import * as SecureStore from 'expo-secure-store';
// import api from '../../lib/api';
// import HapticTouchable from '../components/HapticTouch';
// import { ActivityIndicator } from 'react-native';

// const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// export default function PayFeesScreen() {
//   const params = useLocalSearchParams();
//   const childData = params.childData ? JSON.parse(params.childData) : null;

//   const [refreshing, setRefreshing] = useState(false);
//   const [paymentModalVisible, setPaymentModalVisible] = useState(false);
//   const [selectedInstallments, setSelectedInstallments] = useState([]);
//   const [expandedInstallment, setExpandedInstallment] = useState(null);
//   const [paymentMethod, setPaymentMethod] = useState('ONLINE');

//   const queryClient = useQueryClient();

//   // Load user data
//   const { data: userData } = useQuery({
//     queryKey: ['user-data'],
//     queryFn: async () => {
//       const stored = await SecureStore.getItemAsync('user');
//       return stored ? JSON.parse(stored) : null;
//     },
//     staleTime: Infinity,
//   });

//   const schoolId = userData?.schoolId;

//   // Fetch academic years
//   const { data: academicYears } = useQuery({
//     queryKey: ['academic-years', schoolId],
//     queryFn: async () => {
//       const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
//       return res.data;
//     },
//     enabled: !!schoolId,
//     select: (data) => data?.find(y => y.isActive),
//   });

//   // Fetch student fee details
//   const { data: studentFee, isLoading: feeLoading } = useQuery({
//     queryKey: ['student-fee', childData?.studentId, academicYears?.id],
//     queryFn: async () => {
//       const params = new URLSearchParams({ academicYearId: academicYears.id });
//       const res = await api.get(`/schools/fee/students/${childData.studentId}?${params}`);
//       return res.data;
//     },
//     enabled: !!childData && !!academicYears,
//     staleTime: 1000 * 60 * 2,
//   });

//   const onRefresh = useCallback(async () => {
//     setRefreshing(true);
//     await queryClient.invalidateQueries(['student-fee']);
//     setRefreshing(false);
//   }, []);

//   const formatCurrency = (amount) => {
//     return new Intl.NumberFormat('en-IN', {
//       style: 'currency',
//       currency: 'INR',
//       maximumFractionDigits: 0
//     }).format(amount || 0);
//   };

//   const formatDate = (dateString) => {
//     return new Date(dateString).toLocaleDateString('en-IN', {
//       day: 'numeric',
//       month: 'short',
//       year: 'numeric'
//     });
//   };

//   const getStatusConfig = (status) => {
//     const configs = {
//       PAID: { color: '#51CF66', icon: CheckCircle, bg: '#E7F5E9' },
//       PENDING: { color: '#3B82F6', icon: Clock, bg: '#E3F2FD' },
//       PARTIAL: { color: '#FFB020', icon: Clock, bg: '#FFF9E0' },
//       OVERDUE: { color: '#FF6B6B', icon: AlertCircle, bg: '#FFE9E9' },
//     };
//     return configs[status] || configs.PENDING;
//   };

//   const toggleInstallment = (installmentId) => {
//     setSelectedInstallments(prev =>
//       prev.includes(installmentId)
//         ? prev.filter(id => id !== installmentId)
//         : [...prev, installmentId]
//     );
//   };

//   const totalPaymentAmount = useMemo(() => {
//     if (!studentFee?.installments) return 0;
//     return studentFee.installments
//       .filter(inst => selectedInstallments.includes(inst.id))
//       .reduce((sum, inst) => sum + (inst.amount - inst.paidAmount), 0);
//   }, [selectedInstallments, studentFee]);

//   if (!childData) {
//     return (
//       <View style={styles.loaderContainer}>
//         <AlertCircle size={48} color="#999" />
//         <Text style={styles.noFeeText}>No child selected</Text>
//         <HapticTouchable onPress={() => router.back()}>
//           <View style={styles.backButtonCenter}>
//             <Text style={styles.backButtonText}>Go Back</Text>
//           </View>
//         </HapticTouchable>
//       </View>
//     );
//   }

//   return (
//     <View style={styles.container}>
//       {/* Header */}
//       <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
//         <HapticTouchable onPress={() => router.back()}>
//           <View style={styles.backButton}>
//             <ArrowLeft size={24} color="#111" />
//           </View>
//         </HapticTouchable>
//         <View style={styles.headerCenter}>
//           <Text style={styles.headerTitle}>Fee Payment</Text>
//           <Text style={styles.headerSubtitle}>
//             {childData.name} - Class {childData.class?.className}
//           </Text>
//         </View>
//         <View style={{ width: 40 }} />
//       </Animated.View>

//       <ScrollView
//         style={styles.content}
//         showsVerticalScrollIndicator={false}
//         refreshControl={
//           <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
//         }
//       >
//         {feeLoading ? (
//           <View style={styles.loadingContainer}>
//             <ActivityIndicator size="large" color="#0469ff" />
//           </View>
//         ) : !studentFee ? (
//           <Animated.View entering={FadeInDown.delay(300)} style={styles.noFeeCard}>
//             <AlertCircle size={48} color="#999" />
//             <Text style={styles.noFeeText}>No fee assigned yet</Text>
//           </Animated.View>
//         ) : (
//           <>
//             {/* Summary Cards */}
//             <Animated.View entering={FadeInDown.delay(300).duration(500)}>
//               <View style={styles.summaryGrid}>
//                 <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
//                   <DollarSign size={24} color="#fff" />
//                   <Text style={styles.summaryValue}>{formatCurrency(studentFee.originalAmount)}</Text>
//                   <Text style={styles.summaryLabel}>Total Fee</Text>
//                 </LinearGradient>

//                 <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
//                   <CheckCircle size={24} color="#fff" />
//                   <Text style={styles.summaryValue}>{formatCurrency(studentFee.paidAmount)}</Text>
//                   <Text style={styles.summaryLabel}>Paid</Text>
//                 </LinearGradient>

//                 <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
//                   <AlertCircle size={24} color="#fff" />
//                   <Text style={styles.summaryValue}>{formatCurrency(studentFee.balanceAmount)}</Text>
//                   <Text style={styles.summaryLabel}>Balance</Text>
//                 </LinearGradient>
//               </View>
//             </Animated.View>

//             {/* Fee Structure Info */}
//             {studentFee.globalFeeStructure && (
//               <Animated.View entering={FadeInDown.delay(400)}>
//                 <View style={styles.feeStructureCard}>
//                   <Info size={20} color="#0469ff" />
//                   <View style={styles.feeStructureInfo}>
//                     <Text style={styles.feeStructureName}>{studentFee.globalFeeStructure.name}</Text>
//                     <Text style={styles.feeStructureMode}>{studentFee.globalFeeStructure.mode} Payment</Text>
//                   </View>
//                 </View>
//               </Animated.View>
//             )}

//             {/* Installments Section */}
//             <Animated.View entering={FadeInDown.delay(500)}>
//               <View style={styles.sectionHeader}>
//                 <Text style={styles.sectionTitle}>Payment Schedule</Text>
//                 <Text style={styles.installmentCount}>{studentFee.installments?.length} Installments</Text>
//               </View>

//               <FlatList
//                 data={studentFee.installments || []}
//                 keyExtractor={(item) => item.id}
//                 scrollEnabled={false}
//                 contentContainerStyle={styles.installmentsList}
//                 renderItem={({ item: installment, index }) => {
//                   const statusConfig = getStatusConfig(installment.status);
//                   const StatusIcon = statusConfig.icon;
//                   const isSelected = selectedInstallments.includes(installment.id);
//                   const isExpanded = expandedInstallment === installment.id;
//                   const canSelect = installment.status !== 'PAID';

//                   return (
//                     <Animated.View entering={FadeInRight.delay(600 + index * 100).duration(500)}>
//                       <View
//                         style={[
//                           styles.installmentCard,
//                           installment.status === 'PAID' && styles.paidInstallment,
//                           installment.isOverdue && styles.overdueInstallment,
//                           isSelected && styles.selectedInstallment
//                         ]}
//                       >
//                         {/* Main Installment Row */}
//                         <HapticTouchable
//                           onPress={() => canSelect && toggleInstallment(installment.id)}
//                           disabled={!canSelect}
//                         >
//                           <View style={styles.installmentMainRow}>
//                             <View style={styles.installmentLeft}>
//                               <View style={[styles.installmentNumber, { backgroundColor: statusConfig.bg }]}>
//                                 <Text style={[styles.installmentNumberText, { color: statusConfig.color }]}>
//                                   {installment.installmentNumber}
//                                 </Text>
//                               </View>
//                               <View style={styles.installmentInfo}>
//                                 <Text style={styles.installmentTitle}>Installment {installment.installmentNumber}</Text>
//                                 <View style={styles.installmentMeta}>
//                                   <Calendar size={12} color="#666" />
//                                   <Text style={styles.installmentDate}>Due: {formatDate(installment.dueDate)}</Text>
//                                 </View>
//                                 {installment.percentage && (
//                                   <Text style={styles.installmentPercentage}>{installment.percentage}% of total</Text>
//                                 )}
//                               </View>
//                             </View>

//                             <View style={styles.installmentRight}>
//                               <Text style={styles.installmentAmount}>{formatCurrency(installment.amount)}</Text>
//                               <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
//                                 <StatusIcon size={12} color={statusConfig.color} />
//                                 <Text style={[styles.statusText, { color: statusConfig.color }]}>
//                                   {installment.status}
//                                 </Text>
//                               </View>
//                               {canSelect && (
//                                 <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
//                                   {isSelected && <CheckCircle size={16} color="#fff" />}
//                                 </View>
//                               )}
//                             </View>
//                           </View>
//                         </HapticTouchable>

//                         {/* Expandable Particular Breakdown */}
//                         {installment.particularBreakdowns && installment.particularBreakdowns.length > 0 && (
//                           <>
//                             <HapticTouchable onPress={() => setExpandedInstallment(isExpanded ? null : installment.id)}>
//                               <View style={styles.expandButton}>
//                                 <Text style={styles.expandButtonText}>
//                                   {isExpanded ? 'Hide' : 'Show'} Fee Breakdown
//                                 </Text>
//                                 <ChevronDown
//                                   size={16}
//                                   color="#0469ff"
//                                   style={isExpanded ? { transform: [{ rotate: '180deg' }] } : {}}
//                                 />
//                               </View>
//                             </HapticTouchable>

//                             {isExpanded && (
//                               <Animated.View entering={FadeInDown.duration(300)} style={styles.particularBreakdown}>
//                                 <Text style={styles.breakdownTitle}>Included in this installment:</Text>
//                                 {installment.particularBreakdowns.map((particular, idx) => (
//                                   <View key={idx} style={styles.particularRow}>
//                                     <Text style={styles.particularName}>{particular.name}</Text>
//                                     <Text style={styles.particularAmount}>
//                                       {formatCurrency(particular.amountInThisInstallment)}
//                                     </Text>
//                                   </View>
//                                 ))}
//                                 <View style={styles.particularDivider} />
//                                 <View style={styles.particularRow}>
//                                   <Text style={styles.particularTotalLabel}>Installment Total</Text>
//                                   <Text style={styles.particularTotalAmount}>
//                                     {formatCurrency(installment.amount)}
//                                   </Text>
//                                 </View>
//                               </Animated.View>
//                             )}
//                           </>
//                         )}
//                       </View>
//                     </Animated.View>
//                   );
//                 }}
//               />
//             </Animated.View>

//             {/* All Fee Particulars (Optional Summary) */}
//             <Animated.View entering={FadeInDown.delay(700)}>
//               <View style={styles.sectionHeader}>
//                 <Text style={styles.sectionTitle}>Fee Components</Text>
//               </View>
//               {studentFee.particulars?.map((particular, idx) => (
//                 <Animated.View key={particular.id} entering={FadeInRight.delay(800 + idx * 100)}>
//                   <View style={styles.particularCard}>
//                     <View style={styles.particularCardLeft}>
//                       <Text style={styles.particularCardName}>{particular.name}</Text>
//                       <Text style={styles.particularCardMeta}>
//                         Paid: {formatCurrency(particular.paidAmount)} / {formatCurrency(particular.amount)}
//                       </Text>
//                     </View>
//                     <View style={styles.particularCardRight}>
//                       <Text style={styles.particularCardAmount}>{formatCurrency(particular.amount)}</Text>
//                       <View style={[styles.statusBadge, { backgroundColor: getStatusConfig(particular.status).bg }]}>
//                         <Text style={[styles.statusText, { color: getStatusConfig(particular.status).color }]}>
//                           {particular.status}
//                         </Text>
//                       </View>
//                     </View>
//                   </View>
//                 </Animated.View>
//               ))}
//             </Animated.View>

//             <View style={{ height: 120 }} />
//           </>
//         )}
//       </ScrollView>

//       {/* Floating Payment Button */}
//       {studentFee && studentFee.balanceAmount > 0 && (
//         <Animated.View entering={SlideInRight.delay(1000).springify()} style={styles.floatingButton}>
//           <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.payButton}>
//             <HapticTouchable onPress={() => {
//               if (selectedInstallments.length === 0) {
//                 Alert.alert('No Selection', 'Please select at least one installment to pay');
//               } else {
//                 setPaymentModalVisible(true);
//               }
//             }}>
//               <View style={styles.payButtonContent}>
//                 <View style={styles.payButtonLeft}>
//                   <CreditCard size={24} color="#fff" />
//                   <View>
//                     <Text style={styles.payButtonLabel}>
//                       {selectedInstallments.length > 0
//                         ? `Pay ${selectedInstallments.length} Installment(s)`
//                         : 'Select Installments to Pay'}
//                     </Text>
//                     <Text style={styles.payButtonAmount}>
//                       {formatCurrency(selectedInstallments.length > 0 ? totalPaymentAmount : studentFee.balanceAmount)}
//                     </Text>
//                   </View>
//                 </View>
//                 <ChevronRight size={24} color="#fff" />
//               </View>
//             </HapticTouchable>
//           </LinearGradient>
//         </Animated.View>
//       )}

//       {/* Payment Modal */}
//       <Modal visible={paymentModalVisible} transparent animationType="slide" onRequestClose={() => setPaymentModalVisible(false)}>
//         <View style={styles.modalOverlay}>
//           <Animated.View entering={SlideInRight.springify()} style={styles.modalContent}>
//             <View style={styles.modalHeader}>
//               <Text style={styles.modalTitle}>Complete Payment</Text>
//               <HapticTouchable onPress={() => setPaymentModalVisible(false)}>
//                 <X size={24} color="#666" />
//               </HapticTouchable>
//             </View>

//             <ScrollView style={styles.modalBody}>
//               <View style={styles.modalAmountCard}>
//                 <Text style={styles.modalAmountLabel}>Total Amount</Text>
//                 <Text style={styles.modalAmountValue}>{formatCurrency(totalPaymentAmount)}</Text>
//                 <Text style={styles.modalAmountSub}>For {selectedInstallments.length} installment(s)</Text>
//               </View>

//               {/* Show what's being paid */}
//               <Text style={styles.modalSectionTitle}>Selected Installments</Text>
//               <View style={styles.selectedInstallmentsList}>
//                 {studentFee?.installments
//                   ?.filter(inst => selectedInstallments.includes(inst.id))
//                   .map((inst) => (
//                     <View key={inst.id} style={styles.selectedInstallmentItem}>
//                       <Text style={styles.selectedInstNumber}>Installment {inst.installmentNumber}</Text>
//                       <Text style={styles.selectedInstAmount}>{formatCurrency(inst.amount - inst.paidAmount)}</Text>
//                     </View>
//                   ))}
//               </View>

//               <Text style={styles.modalSectionTitle}>Payment Method</Text>
//               <View style={styles.paymentMethods}>
//                 {[
//                   { id: 'ONLINE', label: 'Online Payment', icon: CreditCard },
//                   { id: 'OFFLINE', label: 'Pay at School', icon: DollarSign }
//                 ].map((method) => {
//                   const MethodIcon = method.icon;
//                   const isSelected = paymentMethod === method.id;
//                   return (
//                     <HapticTouchable key={method.id} onPress={() => setPaymentMethod(method.id)}>
//                       <View style={[styles.paymentMethodCard, isSelected && styles.paymentMethodSelected]}>
//                         <MethodIcon size={24} color={isSelected ? '#0469ff' : '#666'} />
//                         <Text style={[styles.paymentMethodText, isSelected && styles.paymentMethodTextSelected]}>
//                           {method.label}
//                         </Text>
//                         {isSelected && (
//                           <View style={styles.methodCheckmark}>
//                             <CheckCircle size={20} color="#0469ff" />
//                           </View>
//                         )}
//                       </View>
//                     </HapticTouchable>
//                   );
//                 })}
//               </View>

//               <HapticTouchable onPress={() => {
//                 // Call payment API
//                 Alert.alert('Payment', `Processing ${paymentMethod} payment of ${formatCurrency(totalPaymentAmount)}`);
//                 setPaymentModalVisible(false);
//               }}>
//                 <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.confirmButton}>
//                   <Text style={styles.confirmButtonText}>
//                     {paymentMethod === 'ONLINE' ? 'Proceed to Pay' : 'Confirm'}
//                   </Text>
//                   <ChevronRight size={20} color="#fff" />
//                 </LinearGradient>
//               </HapticTouchable>
//             </ScrollView>
//           </Animated.View>
//         </View>
//       </Modal>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: '#fff' },
//   loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
//   backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#0469ff', borderRadius: 12 },
//   backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
//   header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
//   backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
//   headerCenter: { flex: 1, alignItems: 'center' },
//   headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
//   headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
//   content: { flex: 1, padding: 16 },
//   loadingContainer: { padding: 40, alignItems: 'center' },
//   noFeeCard: { padding: 40, alignItems: 'center', gap: 12 },
//   noFeeText: { fontSize: 16, color: '#999' },
//   summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
//   summaryCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', gap: 8 },
//   summaryValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
//   summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
//   feeStructureCard: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#E3F2FD', borderRadius: 12, gap: 12, marginBottom: 20 },
//   feeStructureInfo: { flex: 1 },
//   feeStructureName: { fontSize: 14, fontWeight: '600', color: '#111' },
//   feeStructureMode: { fontSize: 12, color: '#666', marginTop: 2 },
//   sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
//   sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
//   installmentCount: { fontSize: 14, color: '#666', backgroundColor: '#f5f5f5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
//   installmentsList: { gap: 12, marginBottom: 20 },
//   installmentCard: { padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
//   paidInstallment: { opacity: 0.6 },
//   overdueInstallment: { borderColor: '#FFE9E9', backgroundColor: '#FFF5F5' },
//   selectedInstallment: { borderColor: '#0469ff', backgroundColor: '#E3F2FD' },
//   installmentMainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
//   installmentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
//   installmentNumber: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
//   installmentNumberText: { fontSize: 16, fontWeight: '700' },
//   installmentInfo: { flex: 1, gap: 4 },
//   installmentTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
//   installmentMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
//   installmentDate: { fontSize: 12, color: '#666' },
//   installmentPercentage: { fontSize: 11, color: '#0469ff', marginTop: 2 },
//   installmentRight: { alignItems: 'flex-end', gap: 8 },
//   installmentAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
//   statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
//   statusText: { fontSize: 11, fontWeight: '600' },
//   checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
//   checkboxSelected: { backgroundColor: '#0469ff', borderColor: '#0469ff' },
//   expandButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
//   expandButtonText: { fontSize: 13, fontWeight: '600', color: '#0469ff' },
//   particularBreakdown: { marginTop: 8, padding: 12, backgroundColor: '#fff', borderRadius: 8 },
//   breakdownTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
//   particularRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
//   particularName: { fontSize: 13, color: '#111', flex: 1 },
//   particularAmount: { fontSize: 13, fontWeight: '600', color: '#111' },
//   particularDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
//   particularTotalLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
//   particularTotalAmount: { fontSize: 14, fontWeight: '700', color: '#0469ff' },
//   particularCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 8 },
//   particularCardLeft: { flex: 1 },
//   particularCardName: { fontSize: 14, fontWeight: '600', color: '#111' },
//   particularCardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
//   particularCardRight: { alignItems: 'flex-end', gap: 6 },
//   particularCardAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
//   floatingButton: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
//   payButton: { borderRadius: 16, overflow: 'hidden' },
//   payButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
//   payButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
//   payButtonLabel: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
//   payButtonAmount: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 2 },
//   modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
//   modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '80%' },
//   modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
//   modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
//   modalBody: { padding: 20 },
//   modalAmountCard: { alignItems: 'center', padding: 24, backgroundColor: '#f8f9fa', borderRadius: 16, marginBottom: 24 },
//   modalAmountLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
//   modalAmountValue: { fontSize: 32, fontWeight: '700', color: '#111', marginBottom: 4 },
//   modalAmountSub: { fontSize: 13, color: '#666' },
//   modalSectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
//   selectedInstallmentsList: { gap: 8, marginBottom: 24 },
//   selectedInstallmentItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 },
//   selectedInstNumber: { fontSize: 13, color: '#666' },
//   selectedInstAmount: { fontSize: 14, fontWeight: '600', color: '#111' },
//   paymentMethods: { gap: 12, marginBottom: 24 },
//   paymentMethodCard: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 2, borderColor: 'transparent', gap: 12 },
//   paymentMethodSelected: { backgroundColor: '#E3F2FD', borderColor: '#0469ff' },
//   paymentMethodText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111' },
//   paymentMethodTextSelected: { color: '#0469ff' },
//   methodCheckmark: { marginLeft: 'auto' },
//   confirmButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 12, gap: 8 },
//   confirmButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
// });

// app/(screens)/payfees.jsx
// UPDATED: With working payment API integration

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  CreditCard,
  ArrowLeft,
  ChevronDown,
  Receipt
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';

export default function PayFeesScreen() {
  const params = useLocalSearchParams();
  const childData = params.childData ? JSON.parse(params.childData) : null;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedInstallments, setSelectedInstallments] = useState([]);
  const [expandedInstallment, setExpandedInstallment] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const queryClient = useQueryClient();

  // Load user data
  const { data: userData } = useQuery({
    queryKey: ['user-data'],
    queryFn: async () => {
      const stored = await SecureStore.getItemAsync('user');
      return stored ? JSON.parse(stored) : null;
    },
    staleTime: Infinity,
  });

  const schoolId = userData?.schoolId;

  // Fetch academic years
  const { data: academicYears } = useQuery({
    queryKey: ['academic-years', schoolId],
    queryFn: async () => {
      const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
      return res.data;
    },
    enabled: !!schoolId,
    select: (data) => data?.find(y => y.isActive),
  });

  // Fetch student fee details
  const { data: studentFee, isLoading: feeLoading } = useQuery({
    queryKey: ['student-fee', childData?.studentId, academicYears?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ academicYearId: academicYears.id });
      const res = await api.get(`/schools/fee/students/${childData.studentId}?${params}`);
      return res.data;
    },
    enabled: !!childData && !!academicYears,
    staleTime: 1000 * 60 * 2,
  });

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (paymentData) => {
      console.log('Submitting payment:', paymentData);

      const res = await api.post('/schools/fee/payments/record-offline', paymentData);

      console.log('Payment response:', res.data);
      return res.data;
    },
    onSuccess: (data) => {
      Alert.alert(
        'Payment Successful! 🎉',
        `Receipt: ${data.payment.receiptNumber}\nAmount: ₹${data.payment.amount}\nNew Balance: ₹${data.newBalance}`,
        [
          {
            text: 'View Receipt',
            onPress: () => {
              // TODO: Navigate to receipt screen
              console.log('View receipt:', data.payment.receiptNumber);
            }
          },
          {
            text: 'OK',
            onPress: () => {
              // Refresh fee data
              queryClient.invalidateQueries(['student-fee']);
              setSelectedInstallments([]);
            }
          }
        ]
      );
    },
    onError: (error) => {
      console.error('Payment error:', error);
      Alert.alert(
        'Payment Failed',
        error.response?.data?.error || error.message || 'Something went wrong. Please try again.'
      );
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(['student-fee']);
    setRefreshing(false);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusConfig = (status) => {
    const configs = {
      PAID: { color: '#51CF66', icon: CheckCircle, bg: '#E7F5E9' },
      PENDING: { color: '#3B82F6', icon: Clock, bg: '#E3F2FD' },
      PARTIAL: { color: '#FFB020', icon: Clock, bg: '#FFF9E0' },
      OVERDUE: { color: '#FF6B6B', icon: AlertCircle, bg: '#FFE9E9' },
    };
    return configs[status] || configs.PENDING;
  };

  const toggleInstallment = (installmentId) => {
    setSelectedInstallments(prev =>
      prev.includes(installmentId)
        ? prev.filter(id => id !== installmentId)
        : [...prev, installmentId]
    );
  };

  const totalPaymentAmount = useMemo(() => {
    if (!studentFee?.installments) return 0;
    return studentFee.installments
      .filter(inst => selectedInstallments.includes(inst.id))
      .reduce((sum, inst) => sum + (inst.amount - inst.paidAmount), 0);
  }, [selectedInstallments, studentFee]);

  const handlePayment = () => {
    if (selectedInstallments.length === 0) {
      Alert.alert('No Selection', 'Please select at least one installment to pay');
      return;
    }

    Alert.alert(
      'Confirm Payment',
      `Pay ₹${totalPaymentAmount.toLocaleString()} for ${selectedInstallments.length} installment(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: () => processPayment()
        }
      ]
    );
  };

  const processPayment = async () => {
    setIsProcessing(true);

    try {
      await paymentMutation.mutateAsync({
        studentFeeId: studentFee.id,
        studentId: childData.studentId,
        schoolId: schoolId,
        academicYearId: academicYears.id,
        amount: totalPaymentAmount,
        installmentIds: selectedInstallments,
        paymentMethod: 'CASH', // For testing
        remarks: 'Test payment from mobile app',
      });
    } catch (error) {
      // Error handled by mutation onError
    } finally {
      setIsProcessing(false);
    }
  };

  if (!childData) {
    return (
      <View style={styles.loaderContainer}>
        <AlertCircle size={48} color="#999" />
        <Text style={styles.noFeeText}>No child selected</Text>
        <HapticTouchable onPress={() => router.back()}>
          <View style={styles.backButtonCenter}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </View>
        </HapticTouchable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <HapticTouchable onPress={() => router.back()}>
          <View style={styles.backButton}>
            <ArrowLeft size={24} color="#111" />
          </View>
        </HapticTouchable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Fee Payment</Text>
          <Text style={styles.headerSubtitle}>
            {childData.name} - {childData.class?.className}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </Animated.View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
        }
      >
        {feeLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0469ff" />
          </View>
        ) : !studentFee ? (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.noFeeCard}>
            <AlertCircle size={48} color="#999" />
            <Text style={styles.noFeeText}>No fee assigned yet</Text>
          </Animated.View>
        ) : (
          <>
            {/* Summary Cards */}
            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
              <View style={styles.summaryGrid}>
                <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                  <DollarSign size={24} color="#fff" />
                  <Text style={styles.summaryValue}>{formatCurrency(studentFee.originalAmount)}</Text>
                  <Text style={styles.summaryLabel}>Total Fee</Text>
                </LinearGradient>

                <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                  <CheckCircle size={24} color="#fff" />
                  <Text style={styles.summaryValue}>{formatCurrency(studentFee.paidAmount)}</Text>
                  <Text style={styles.summaryLabel}>Paid</Text>
                </LinearGradient>

                <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                  <AlertCircle size={24} color="#fff" />
                  <Text style={styles.summaryValue}>{formatCurrency(studentFee.balanceAmount)}</Text>
                  <Text style={styles.summaryLabel}>Fees (Due)</Text>
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Installments */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Payment Schedule</Text>
              <Text style={styles.installmentCount}>{studentFee.installments?.length} Installments</Text>
            </View>

            {studentFee.installments?.map((installment, index) => {
              const statusConfig = getStatusConfig(installment.status);
              const StatusIcon = statusConfig.icon;
              const isSelected = selectedInstallments.includes(installment.id);
              const isExpanded = expandedInstallment === installment.id;
              const canSelect = installment.status !== 'PAID' && installment.paidAmount < installment.amount;

              return (
                <Animated.View key={installment.id} entering={FadeInRight.delay(400 + index * 50)}>
                  <View
                    style={[
                      styles.installmentCard,
                      installment.status === 'PAID' && styles.paidInstallment,
                      installment.isOverdue && styles.overdueInstallment,
                      isSelected && styles.selectedInstallment
                    ]}
                  >
                    <HapticTouchable
                      onPress={() => canSelect && toggleInstallment(installment.id)}
                      disabled={!canSelect}
                    >
                      <View style={styles.installmentMainRow}>
                        <View style={styles.installmentLeft}>
                          <View style={[styles.installmentNumber, { backgroundColor: statusConfig.bg }]}>
                            <Text style={[styles.installmentNumberText, { color: statusConfig.color }]}>
                              {installment.installmentNumber}
                            </Text>
                          </View>
                          <View style={styles.installmentInfo}>
                            <Text style={styles.installmentTitle}>Installment {installment.installmentNumber}</Text>
                            <View style={styles.installmentMeta}>
                              <Calendar size={12} color="#666" />
                              <Text style={styles.installmentDate}>Due: {formatDate(installment.dueDate)}</Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.installmentRight}>
                          <Text style={styles.installmentAmount}>{formatCurrency(installment.amount)}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                            <StatusIcon size={12} color={statusConfig.color} />
                            <Text style={[styles.statusText, { color: statusConfig.color }]}>
                              {installment.status}
                            </Text>
                          </View>
                          {canSelect && (
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                              {isSelected && <CheckCircle size={16} color="#fff" />}
                            </View>
                          )}
                        </View>
                      </View>
                    </HapticTouchable>

                    {/* Expandable Breakdown */}
                    {installment.particularBreakdowns && installment.particularBreakdowns.length > 0 && (
                      <>
                        <HapticTouchable onPress={() => setExpandedInstallment(isExpanded ? null : installment.id)}>
                          <View style={styles.expandButton}>
                            <Text style={styles.expandButtonText}>
                              {isExpanded ? 'Hide' : 'Show'} Fee Breakdown
                            </Text>
                            <ChevronDown
                              size={16}
                              color="#0469ff"
                              style={isExpanded ? { transform: [{ rotate: '180deg' }] } : {}}
                            />
                          </View>
                        </HapticTouchable>

                        {isExpanded && (
                          <Animated.View entering={FadeInDown.duration(300)} style={styles.particularBreakdown}>
                            <Text style={styles.breakdownTitle}>Included in this installment:</Text>
                            {installment.particularBreakdowns.map((particular, idx) => (
                              <View key={idx} style={styles.particularRow}>
                                <Text style={styles.particularName}>{particular.name}</Text>
                                <Text style={styles.particularAmount}>
                                  {formatCurrency(particular.amountInThisInstallment)}
                                </Text>
                              </View>
                            ))}
                            <View style={styles.particularDivider} />
                            <View style={styles.particularRow}>
                              <Text style={styles.particularTotalLabel}>Total</Text>
                              <Text style={styles.particularTotalAmount}>
                                {formatCurrency(installment.amount)}
                              </Text>
                            </View>
                          </Animated.View>
                        )}
                      </>
                    )}
                  </View>
                </Animated.View>
              );
            })}

            {/* Fee Components */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Fee Components</Text>
            </View>
            {studentFee.particulars?.map((particular) => {
              const statusConfig = getStatusConfig(particular.status);
              return (
                <View key={particular.id} style={styles.particularCard}>
                  <View style={styles.particularCardLeft}>
                    <Text style={styles.particularCardName}>{particular.name}</Text>
                    <Text style={styles.particularCardMeta}>
                      Paid: {formatCurrency(particular.paidAmount)} / {formatCurrency(particular.amount)}
                    </Text>
                  </View>
                  <View style={styles.particularCardRight}>
                    <Text style={styles.particularCardAmount}>{formatCurrency(particular.amount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                      <Text style={[styles.statusText, { color: statusConfig.color }]}>
                        {particular.status}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={{ height: 120 }} />
          </>
        )}
      </ScrollView>

      {/* Floating Payment Button */}
      {studentFee && studentFee.balanceAmount > 0 && (
        <View style={styles.floatingButton}>
          <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.payButton}>
            <HapticTouchable onPress={handlePayment} disabled={isProcessing || selectedInstallments.length === 0}>
              <View style={styles.payButtonContent}>
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <View style={styles.payButtonLeft}>
                      <CreditCard size={24} color="#fff" />
                      <View>
                        <Text style={styles.payButtonLabel}>
                          {selectedInstallments.length > 0
                            ? `Pay ${selectedInstallments.length} Installment(s)`
                            : 'Select Installments'}
                        </Text>
                        <Text style={styles.payButtonAmount}>
                          {formatCurrency(selectedInstallments.length > 0 ? totalPaymentAmount : studentFee.balanceAmount)}
                        </Text>
                      </View>
                    </View>
                    <Receipt size={24} color="#fff" />
                  </>
                )}
              </View>
            </HapticTouchable>
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

// Styles remain the same as before
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#0469ff', borderRadius: 12 },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  content: { flex: 1, padding: 16 },
  loadingContainer: { padding: 40, alignItems: 'center' },
  noFeeCard: { padding: 40, alignItems: 'center', gap: 12 },
  noFeeText: { fontSize: 16, color: '#999' },
  summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', gap: 8 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  installmentCount: { fontSize: 14, color: '#666', backgroundColor: '#f5f5f5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  installmentCard: { padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 2, borderColor: 'transparent', marginBottom: 12 },
  paidInstallment: { opacity: 0.6 },
  overdueInstallment: { borderColor: '#FFE9E9', backgroundColor: '#FFF5F5' },
  selectedInstallment: { borderColor: '#0469ff', backgroundColor: '#E3F2FD' },
  installmentMainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  installmentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  installmentNumber: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  installmentNumberText: { fontSize: 16, fontWeight: '700' },
  installmentInfo: { flex: 1, gap: 4 },
  installmentTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  installmentMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  installmentDate: { fontSize: 12, color: '#666' },
  installmentRight: { alignItems: 'flex-end', gap: 8 },
  installmentAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#0469ff', borderColor: '#0469ff' },
  expandButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  expandButtonText: { fontSize: 13, fontWeight: '600', color: '#0469ff' },
  particularBreakdown: { marginTop: 8, padding: 12, backgroundColor: '#fff', borderRadius: 8 },
  breakdownTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  particularRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  particularName: { fontSize: 13, color: '#111', flex: 1 },
  particularAmount: { fontSize: 13, fontWeight: '600', color: '#111' },
  particularDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  particularTotalLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
  particularTotalAmount: { fontSize: 14, fontWeight: '700', color: '#0469ff' },
  particularCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 8 },
  particularCardLeft: { flex: 1 },
  particularCardName: { fontSize: 14, fontWeight: '600', color: '#111' },
  particularCardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  particularCardRight: { alignItems: 'flex-end', gap: 6 },
  particularCardAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
  floatingButton: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  payButton: { borderRadius: 16, overflow: 'hidden' },
  payButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  payButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payButtonLabel: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  payButtonAmount: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 2 },
});
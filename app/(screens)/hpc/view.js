// HPC View Screen - NEP 2020 Holistic Progress Card
// Displays complete student HPC with download functionality
import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Download,
    BookOpen,
    Award,
    Activity,
    Heart,
    MessageSquare,
    Users,
    ChevronRight,
    ChevronDown,
    Star,
    Sparkles,
    TrendingUp,
    CheckCircle2,
    AlertCircle,
    Pencil,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;

// Grade Colors
const GRADE_COLORS = {
    'A+': '#10B981',
    'A': '#22C55E',
    'B+': '#84CC16',
    'B': '#EAB308',
    'C': '#F59E0B',
    'D': '#EF4444',
    'EXCELLENT': '#10B981',
    'PROFICIENT': '#22C55E',
    'DEVELOPING': '#F59E0B',
    'NEEDS_IMPROVEMENT': '#EF4444',
};

// SEL Grade display mapping
const SEL_GRADE_DISPLAY = {
    'NEEDS_IMPROVEMENT': 'Needs Improvement',
    'DEVELOPING': 'Developing',
    'PROFICIENT': 'Proficient',
    'EXCELLENT': 'Excellent',
};

// Star Rating Component
const StarRating = ({ rating, max = 5 }) => {
    return (
        <View style={styles.starContainer}>
            {Array.from({ length: max }).map((_, i) => (
                <Star
                    key={i}
                    size={14}
                    color={i < rating ? '#FFD93D' : '#E5E7EB'}
                    fill={i < rating ? '#FFD93D' : 'transparent'}
                />
            ))}
        </View>
    );
};

// Collapsible Section Component
const CollapsibleSection = ({ title, icon: Icon, iconColor, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.sectionCard}>
            <HapticTouchable onPress={() => setIsOpen(!isOpen)}>
                <View style={styles.sectionHeader}>
                    <View style={[styles.sectionIconBox, { backgroundColor: iconColor + '20' }]}>
                        <Icon size={20} color={iconColor} />
                    </View>
                    <Text style={styles.sectionTitle}>{title}</Text>
                    <ChevronDown
                        size={20}
                        color="#666"
                        style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
                    />
                </View>
            </HapticTouchable>
            {isOpen && <View style={styles.sectionContent}>{children}</View>}
        </Animated.View>
    );
};

export default function HPCViewScreen() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;
    const termNumber = params.termNumber ? Number(params.termNumber) : 1;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [downloading, setDownloading] = useState(false);

    // Get user data
    const { data: userData, isLoading: isUserLoading } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = childData?.studentId || userData?.id;

    // Fetch active academic year
    const { data: academicYear } = useQuery({
        queryKey: ['academic-year-active', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return res.data?.find((y) => y.isActive);
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 10,
    });

    // Fetch HPC Report
    const { data: hpcData, isLoading, error } = useQuery({
        queryKey: ['hpc-report', schoolId, studentId, academicYear?.id, termNumber],
        queryFn: async () => {
            const params = new URLSearchParams({
                studentId,
                ...(academicYear?.id && { academicYearId: academicYear.id }),
                termNumber: termNumber.toString(),
            });
            const res = await api.get(`/schools/${schoolId}/hpc/report?${params}`);
            return res.data;
        },
        enabled: !!schoolId && !!studentId,
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['hpc-report'] });
        setRefreshing(false);
    }, [queryClient]);

    // Download HPC PDF
    const handleDownload = async () => {
        if (!hpcData) return;

        setDownloading(true);
        try {
            // Generate PDF on server
            const res = await api.post(`/schools/${schoolId}/hpc/report`, {
                studentId,
                academicYearId: academicYear?.id,
                termNumber,
                generatedById: userData?.id,
            });

            if (res.data?.report?.pdfUrl) {
                const fileUri = FileSystem.documentDirectory + `HPC_${studentId}_Term${termNumber}.pdf`;
                const download = await FileSystem.downloadAsync(res.data.report.pdfUrl, fileUri);

                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(download.uri);
                } else {
                    Alert.alert('Success', 'HPC saved to your device');
                }
            } else {
                Alert.alert('Coming Soon', 'PDF generation will be available soon');
            }
        } catch (err) {
            console.error('Download error:', err);
            Alert.alert('Error', 'Failed to download HPC report');
        } finally {
            setDownloading(false);
        }
    };

    // Calculate overall HPC score
    const hpcScore = useMemo(() => {
        if (!hpcData?.hpc) return null;

        let totalScore = 0;
        let count = 0;

        // Academic competencies (60% weight)
        const academics = hpcData.hpc.academicCompetencies;
        if (academics && Object.keys(academics).length > 0) {
            const gradeToScore = { 'A+': 100, 'A': 90, 'B+': 80, 'B': 70, 'C': 60, 'D': 50 };
            let academicTotal = 0;
            let academicCount = 0;
            Object.values(academics).forEach((comps) => {
                comps.forEach((c) => {
                    if (c.grade && gradeToScore[c.grade]) {
                        academicTotal += gradeToScore[c.grade];
                        academicCount++;
                    }
                });
            });
            if (academicCount > 0) {
                totalScore += (academicTotal / academicCount) * 0.6;
                count += 0.6;
            }
        }

        // SEL (25% weight)
        const sel = hpcData.hpc.behaviorAndSEL;
        if (sel && Object.keys(sel).length > 0) {
            const selToScore = { 'EXCELLENT': 100, 'PROFICIENT': 80, 'DEVELOPING': 60, 'NEEDS_IMPROVEMENT': 40 };
            let selTotal = 0;
            let selCount = 0;
            Object.values(sel).forEach((params) => {
                params.forEach((p) => {
                    if (p.grade && selToScore[p.grade]) {
                        selTotal += selToScore[p.grade];
                        selCount++;
                    }
                });
            });
            if (selCount > 0) {
                totalScore += (selTotal / selCount) * 0.25;
                count += 0.25;
            }
        }

        // Activities (15% weight)
        const activities = hpcData.hpc.coCurricularActivities;
        if (activities && Object.keys(activities).length > 0) {
            let actTotal = 0;
            let actCount = 0;
            Object.values(activities).forEach((acts) => {
                acts.forEach((a) => {
                    const avg = ((a.participationRating || 0) + (a.consistencyRating || 0) + (a.attitudeRating || 0)) / 3;
                    actTotal += avg * 20; // Convert 5-star to 100
                    actCount++;
                });
            });
            if (actCount > 0) {
                totalScore += (actTotal / actCount) * 0.15;
                count += 0.15;
            }
        }

        return count > 0 ? Math.round(totalScore / count) : null;
    }, [hpcData]);

    // Loading state
    if (isLoading || isUserLoading || !schoolId) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loadingText}>Loading progress card...</Text>
            </View>
        );
    }

    // Error state - only show hard error if API returned error (not just empty data)
    if (error) {
        return (
            <View style={styles.loaderContainer}>
                <AlertCircle size={48} color="#F59E0B" />
                <Text style={styles.noDataText}>Unable to load Progress Card</Text>
                <Text style={styles.errorSubtext}>Please try again later</Text>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButtonCenter}>
                        <Text style={styles.backBtnText}>Go Back</Text>
                    </View>
                </HapticTouchable>
            </View>
        );
    }

    const student = hpcData?.student || { name: 'Student' };
    const hpc = hpcData?.hpc || {};

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Header */}
            <LinearGradient
                colors={['#0469ff', '#0347b8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Background Pattern */}
                <Text style={{ position: 'absolute', top: 20, right: 60, fontSize: 28, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>+</Text>
                <Text style={{ position: 'absolute', top: 70, right: 25, fontSize: 18, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>×</Text>
                <Text style={{ position: 'absolute', bottom: 40, right: 100, fontSize: 22, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>÷</Text>
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                <View style={{ position: 'absolute', bottom: -50, left: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Holistic Progress Card</Text>
                        <Text style={styles.headerSubtitle}>Term {termNumber} • {academicYear?.name || 'Current Year'}</Text>
                    </View>
                    <HapticTouchable onPress={handleDownload} disabled={downloading}>
                        <View style={[styles.downloadButton, downloading && { opacity: 0.6 }]}>
                            {downloading ? (
                                <ActivityIndicator size="small" color="#0469ff" />
                            ) : (
                                <Download size={20} color="#0469ff" />
                            )}
                        </View>
                    </HapticTouchable>
                </View>

                {/* Student Info Card */}
                <View style={styles.studentCard}>
                    <View style={styles.studentAvatar}>
                        <Text style={styles.avatarText}>
                            {student.name?.charAt(0) || 'S'}
                        </Text>
                    </View>
                    <View style={styles.studentInfo}>
                        <Text style={styles.studentName}>{student.name}</Text>
                        <Text style={styles.studentClass}>
                            Class {student.class} - {student.section} | Roll: {student.rollNumber}
                        </Text>
                    </View>
                </View>

                {/* HPC Score Widget */}
                {hpcScore !== null && (
                    <View style={styles.scoreWidget}>
                        <View style={styles.scoreCircle}>
                            <Text style={styles.scoreValue}>{hpcScore}</Text>
                            <Text style={styles.scoreMax}>/100</Text>
                        </View>
                        <View style={styles.scoreInfo}>
                            <Text style={styles.scoreLabel}>Overall HPC Score</Text>
                            <Text style={styles.scoreDesc}>Based on academics, behavior & activities</Text>
                        </View>
                        <Sparkles size={24} color="#FFD93D" />
                    </View>
                )}
            </LinearGradient>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {/* Academic Competencies */}
                {hpc.academicCompetencies && Object.keys(hpc.academicCompetencies).length > 0 && (
                    <CollapsibleSection
                        title="Academic Competencies"
                        icon={BookOpen}
                        iconColor="#0469ff"
                    >
                        {Object.entries(hpc.academicCompetencies).map(([subject, competencies], idx) => (
                            <View key={subject} style={[styles.subjectBlock, idx > 0 && { marginTop: 16 }]}>
                                <Text style={styles.subjectName}>{subject}</Text>
                                {competencies.map((comp, i) => (
                                    <View key={i} style={styles.competencyRow}>
                                        <Text style={styles.competencyName} numberOfLines={1}>{comp.competency}</Text>
                                        <View style={[
                                            styles.gradeBadge,
                                            { backgroundColor: (GRADE_COLORS[comp.grade] || '#666') + '20' }
                                        ]}>
                                            <Text style={[
                                                styles.gradeText,
                                                { color: GRADE_COLORS[comp.grade] || '#666' }
                                            ]}>
                                                {comp.grade}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </CollapsibleSection>
                )}

                {/* Co-Curricular Activities */}
                {hpc.coCurricularActivities && Object.keys(hpc.coCurricularActivities).length > 0 && (
                    <CollapsibleSection
                        title="Co-Curricular Activities"
                        icon={Activity}
                        iconColor="#10B981"
                    >
                        {Object.entries(hpc.coCurricularActivities).map(([category, activities], idx) => (
                            <View key={category} style={[styles.categoryBlock, idx > 0 && { marginTop: 16 }]}>
                                <Text style={styles.categoryName}>{category}</Text>
                                {activities.map((act, i) => (
                                    <View key={i} style={styles.activityRow}>
                                        <View style={styles.activityInfo}>
                                            <Text style={styles.activityName}>{act.activity}</Text>
                                            {act.achievements && (
                                                <Text style={styles.activityAchievement}>🏆 {act.achievements}</Text>
                                            )}
                                        </View>
                                        <View style={styles.ratingsColumn}>
                                            <View style={styles.ratingItem}>
                                                <Text style={styles.ratingLabel}>Participation</Text>
                                                <StarRating rating={act.participationRating || 0} />
                                            </View>
                                            <View style={styles.ratingItem}>
                                                <Text style={styles.ratingLabel}>Consistency</Text>
                                                <StarRating rating={act.consistencyRating || 0} />
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </CollapsibleSection>
                )}

                {/* Behavior & SEL */}
                {hpc.behaviorAndSEL && Object.keys(hpc.behaviorAndSEL).length > 0 && (
                    <CollapsibleSection
                        title="Behavior & Social-Emotional Learning"
                        icon={Heart}
                        iconColor="#EC4899"
                    >
                        {Object.entries(hpc.behaviorAndSEL).map(([category, params], idx) => (
                            <View key={category} style={[styles.selBlock, idx > 0 && { marginTop: 16 }]}>
                                <Text style={styles.selCategoryName}>{category}</Text>
                                {params.map((param, i) => (
                                    <View key={i} style={styles.selRow}>
                                        <Text style={styles.selParamName}>{param.parameter}</Text>
                                        <View style={[
                                            styles.selBadge,
                                            { backgroundColor: (GRADE_COLORS[param.grade] || '#666') + '20' }
                                        ]}>
                                            <Text style={[
                                                styles.selGradeText,
                                                { color: GRADE_COLORS[param.grade] || '#666' }
                                            ]}>
                                                {SEL_GRADE_DISPLAY[param.grade] || param.grade}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </CollapsibleSection>
                )}

                {/* Student Reflection */}
                {hpc.studentReflection && (
                    <CollapsibleSection
                        title="My Reflection"
                        icon={MessageSquare}
                        iconColor="#8B5CF6"
                    >
                        <View style={styles.reflectionCard}>
                            {hpc.studentReflection.whatLearned && (
                                <View style={styles.reflectionItem}>
                                    <Text style={styles.reflectionLabel}>What I Learned</Text>
                                    <Text style={styles.reflectionText}>{hpc.studentReflection.whatLearned}</Text>
                                </View>
                            )}
                            {hpc.studentReflection.whatFoundDifficult && (
                                <View style={styles.reflectionItem}>
                                    <Text style={styles.reflectionLabel}>What I Found Challenging</Text>
                                    <Text style={styles.reflectionText}>{hpc.studentReflection.whatFoundDifficult}</Text>
                                </View>
                            )}
                            {hpc.studentReflection.goalsForNextTerm && (
                                <View style={styles.reflectionItem}>
                                    <Text style={styles.reflectionLabel}>My Goals for Next Term</Text>
                                    <Text style={styles.reflectionText}>{hpc.studentReflection.goalsForNextTerm}</Text>
                                </View>
                            )}
                        </View>
                    </CollapsibleSection>
                )}

                {/* Teacher Feedback */}
                {hpc.teacherFeedback && hpc.teacherFeedback.length > 0 && (
                    <CollapsibleSection
                        title="Teacher's Feedback"
                        icon={Users}
                        iconColor="#F59E0B"
                    >
                        {hpc.teacherFeedback.map((fb, i) => (
                            <View key={i} style={styles.feedbackCard}>
                                <View style={styles.feedbackHeader}>
                                    <Text style={styles.feedbackTeacher}>{fb.teacher?.name || 'Teacher'}</Text>
                                    <Text style={styles.feedbackDesignation}>{fb.teacher?.designation}</Text>
                                </View>
                                {fb.strengths && (
                                    <View style={styles.feedbackItem}>
                                        <CheckCircle2 size={14} color="#10B981" />
                                        <Text style={styles.feedbackText}>
                                            <Text style={styles.feedbackBold}>Strengths:</Text> {fb.strengths}
                                        </Text>
                                    </View>
                                )}
                                {fb.areasToImprove && (
                                    <View style={styles.feedbackItem}>
                                        <TrendingUp size={14} color="#F59E0B" />
                                        <Text style={styles.feedbackText}>
                                            <Text style={styles.feedbackBold}>Areas to Improve:</Text> {fb.areasToImprove}
                                        </Text>
                                    </View>
                                )}
                                {fb.suggestions && (
                                    <View style={styles.feedbackItem}>
                                        <Sparkles size={14} color="#8B5CF6" />
                                        <Text style={styles.feedbackText}>
                                            <Text style={styles.feedbackBold}>Suggestions:</Text> {fb.suggestions}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </CollapsibleSection>
                )}

                {/* Empty State */}
                {(!hpc.academicCompetencies || Object.keys(hpc.academicCompetencies).length === 0) &&
                    (!hpc.behaviorAndSEL || Object.keys(hpc.behaviorAndSEL).length === 0) &&
                    (!hpc.coCurricularActivities || Object.keys(hpc.coCurricularActivities).length === 0) && (
                        <View style={styles.emptyState}>
                            <Award size={48} color="#ccc" />
                            <Text style={styles.emptyText}>No HPC data available for this term yet</Text>
                            <Text style={styles.emptySubtext}>Check back after assessments are completed</Text>
                        </View>
                    )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Sticky Bottom: Write Self Reflection Button */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.stickyBottom}>
                <HapticTouchable
                    onPress={() => router.push('/hpc/student-reflection')}
                >
                    <LinearGradient
                        colors={['#8B5CF6', '#7C3AED']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.reflectionButton}
                    >
                        <View style={styles.reflectionIconBox}>
                            <Pencil size={24} color="#fff" />
                        </View>
                        <View style={styles.reflectionTextBox}>
                            <Text style={styles.reflectionTitle}>Write Self Reflection</Text>
                            <Text style={styles.reflectionSubtitle}>Share your thoughts on your learning journey</Text>
                        </View>
                    </LinearGradient>
                </HapticTouchable>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        backgroundColor: '#fff',
    },
    loadingText: {
        fontSize: 14,
        color: '#666',
    },
    noDataText: {
        fontSize: 16,
        color: '#666',
        marginTop: 8,
    },
    errorSubtext: {
        fontSize: 13,
        color: '#999',
        marginTop: 4,
    },
    backButtonCenter: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#0469ff',
        borderRadius: 12,
    },
    backBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 20,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    downloadButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    studentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
    },
    studentAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
    },
    studentInfo: {
        flex: 1,
        marginLeft: 12,
    },
    studentName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    studentClass: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    scoreWidget: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: 14,
    },
    scoreCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreValue: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0469ff',
    },
    scoreMax: {
        fontSize: 10,
        color: '#666',
        marginTop: -4,
    },
    scoreInfo: {
        flex: 1,
        marginLeft: 14,
    },
    scoreLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    scoreDesc: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    sectionCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    sectionIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#111',
        marginLeft: 12,
    },
    sectionContent: {
        padding: 16,
    },
    subjectBlock: {},
    subjectName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0469ff',
        marginBottom: 10,
    },
    competencyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    competencyName: {
        flex: 1,
        fontSize: 13,
        color: '#333',
        marginRight: 12,
    },
    gradeBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 6,
    },
    gradeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    categoryBlock: {},
    categoryName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#10B981',
        marginBottom: 10,
    },
    activityRow: {
        flexDirection: 'row',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    activityInfo: {
        flex: 1,
    },
    activityName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
    },
    activityAchievement: {
        fontSize: 12,
        color: '#F59E0B',
        marginTop: 4,
    },
    ratingsColumn: {
        alignItems: 'flex-end',
    },
    ratingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    ratingLabel: {
        fontSize: 10,
        color: '#999',
        marginRight: 6,
    },
    starContainer: {
        flexDirection: 'row',
        gap: 2,
    },
    selBlock: {},
    selCategoryName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#EC4899',
        marginBottom: 10,
    },
    selRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    selParamName: {
        flex: 1,
        fontSize: 13,
        color: '#333',
    },
    selBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    selGradeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    reflectionCard: {
        backgroundColor: '#F3E8FF',
        borderRadius: 12,
        padding: 14,
    },
    reflectionItem: {
        marginBottom: 14,
    },
    reflectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#8B5CF6',
        marginBottom: 4,
    },
    reflectionText: {
        fontSize: 13,
        color: '#333',
        lineHeight: 20,
    },
    feedbackCard: {
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    feedbackHeader: {
        marginBottom: 10,
    },
    feedbackTeacher: {
        fontSize: 14,
        fontWeight: '700',
        color: '#92400E',
    },
    feedbackDesignation: {
        fontSize: 12,
        color: '#B45309',
    },
    feedbackItem: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    feedbackText: {
        flex: 1,
        fontSize: 13,
        color: '#333',
        lineHeight: 18,
    },
    feedbackBold: {
        fontWeight: '700',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#666',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 13,
        color: '#999',
        marginTop: 4,
    },
    stickyBottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 24,
        backgroundColor: '#f8f9fa',
    },
    reflectionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
    },
    reflectionIconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reflectionTextBox: {
        flex: 1,
        marginLeft: 14,
    },
    reflectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    reflectionSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 2,
    },
});

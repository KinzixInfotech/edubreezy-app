// src/components/AddChildModal.jsx
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TextInput,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    SlideInDown,
    SlideOutDown,
    ZoomIn,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
    useSharedValue,
    Easing,
} from 'react-native-reanimated';
import { X, User, Calendar, Phone, Check, Plus, AlertCircle } from 'lucide-react-native';
import api from '../../lib/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const AddChildModal = ({ visible = false, onClose, parentId, schoolId, onSuccess }) => {
    // Validate required props
    React.useEffect(() => {
        if (visible && (!parentId || !schoolId)) {
            console.error('AddChildModal: parentId and schoolId are required props');
        }
    }, [visible, parentId, schoolId]);

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Form data
    const [admissionNo, setAdmissionNo] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [studentData, setStudentData] = useState(null);

    // Animation values
    const checkScale = useSharedValue(0);
    const successOpacity = useSharedValue(0);

    // Step 1: Verify Admission Number
    const verifyAdmissionNumber = async () => {
        if (!admissionNo.trim()) {
            setError('Please enter admission number');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await api.post(`/schools/${schoolId}/verify-student`, {
                admissionNo: admissionNo.trim().toUpperCase(),
            });

            setStudentData(response.data.student);
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.error || 'Student not found');
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Verify DOB and Phone, then link
    const verifyAndLink = async () => {
        if (!email.trim() || !phoneNumber.trim()) {
            setError('Please fill all fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Verify details
            await api.post(`/schools/${schoolId}/verify-student-details`, {
                studentId: studentData.userId,
                email: email,
                phoneNumber: phoneNumber.trim(),
            });

            // Link student to parent
            await api.patch(`/schools/${schoolId}/parents/${parentId}/link-student`, {
                studentId: studentData.userId,
                relation: 'GUARDIAN',
                isPrimary: false,
            });

            // Success animation
            checkScale.value = withSequence(
                withTiming(1.2, { duration: 300, easing: Easing.out(Easing.back(1.5)) }),
                withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) })
            );
            successOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) });

            setStep(3);

            // Auto close after 2.5 seconds
            setTimeout(() => {
                handleClose();
                if (onSuccess && typeof onSuccess === 'function') {
                    onSuccess();
                }
            }, 2500);
        } catch (err) {
            setError(err.response?.data?.error || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setStep(1);
        setAdmissionNo('');
        setEmail('');
        setPhoneNumber('');
        setStudentData(null);
        setError('');
        checkScale.value = 0;
        successOpacity.value = 0;
        if (onClose && typeof onClose === 'function') {
            onClose();
        }
    };

    const checkAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkScale.value }],
    }));

    const successAnimatedStyle = useAnimatedStyle(() => ({
        opacity: successOpacity.value,
    }));

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.overlay}>
                    <TouchableOpacity style={styles.overlayTouchable} activeOpacity={1} onPress={handleClose} />

                    <Animated.View
                        entering={SlideInDown.duration(400).easing(Easing.out(Easing.cubic))}
                        exiting={SlideOutDown.duration(300).easing(Easing.in(Easing.cubic))}
                        style={styles.modalContainer}
                    >
                        {step !== 3 && (
                            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                                <X size={24} color="#666" />
                            </TouchableOpacity>
                        )}

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.scrollContent}
                            bounces={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Step 1: Admission Number */}
                            {step === 1 && (
                                <Animated.View entering={FadeIn.duration(300)}>
                                    <View style={styles.iconContainer}>
                                        <View style={styles.iconCircle}>
                                            <Plus size={32} color="#0469ff" strokeWidth={2.5} />
                                        </View>
                                    </View>

                                    <Text style={styles.title}>Add Your Child</Text>
                                    <Text style={styles.subtitle}>Enter your child's admission number to get started</Text>

                                    <View style={styles.inputContainer}>
                                        <View style={styles.inputIconContainer}>
                                            <User size={20} color="#666" />
                                        </View>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Admission Number"
                                            placeholderTextColor="#999"
                                            value={admissionNo}
                                            onChangeText={(text) => {
                                                setAdmissionNo(text);
                                                setError('');
                                            }}
                                            autoCapitalize="characters"
                                            autoCorrect={false}
                                        />
                                    </View>

                                    {error && (
                                        <Animated.View entering={FadeIn.duration(200)} style={styles.errorContainer}>
                                            <AlertCircle size={16} color="#FF6B6B" />
                                            <Text style={styles.errorText}>{error}</Text>
                                        </Animated.View>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.button, loading && styles.buttonDisabled]}
                                        onPress={verifyAdmissionNumber}
                                        disabled={loading}
                                    >
                                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
                                    </TouchableOpacity>
                                </Animated.View>
                            )}

                            {/* Step 2: DOB and Phone Verification */}
                            {step === 2 && (
                                <Animated.View entering={FadeIn.duration(300)}>
                                    <View style={styles.iconContainer}>
                                        <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}>
                                            <User size={32} color="#4CAF50" strokeWidth={2.5} />
                                        </View>
                                    </View>

                                    <Text style={styles.title}>Verify Details</Text>
                                    <Text style={styles.subtitle}>Please confirm the following details for security</Text>

                                    {studentData && (
                                        <View style={styles.studentInfoCard}>
                                            <Text style={styles.studentName}>{studentData.name}</Text>
                                            <Text style={styles.studentClass}>
                                                Class {studentData.class?.className} - {studentData.section?.name}
                                            </Text>
                                        </View>
                                    )}

                                    <View style={styles.inputContainer}>
                                        <View style={styles.inputIconContainer}>
                                            <Calendar size={20} color="#666" />
                                        </View>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Registered Student Email"
                                            placeholderTextColor="#999"
                                            value={email}
                                            onChangeText={(text) => {
                                                setEmail(text);
                                                setError('');
                                            }}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                        />
                                    </View>

                                    <View style={styles.inputContainer}>
                                        <View style={styles.inputIconContainer}>
                                            <Phone size={20} color="#666" />
                                        </View>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Registered Phone Number"
                                            placeholderTextColor="#999"
                                            value={phoneNumber}
                                            onChangeText={(text) => {
                                                setPhoneNumber(text);
                                                setError('');
                                            }}
                                            keyboardType="phone-pad"
                                        />
                                    </View>

                                    {error && (
                                        <Animated.View entering={FadeIn.duration(200)} style={styles.errorContainer}>
                                            <AlertCircle size={16} color="#FF6B6B" />
                                            <Text style={styles.errorText}>{error}</Text>
                                        </Animated.View>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.button, loading && styles.buttonDisabled]}
                                        onPress={verifyAndLink}
                                        disabled={loading}
                                    >
                                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Add</Text>}
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
                                        <Text style={styles.backButtonText}>Go Back</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            )}

                            {/* Step 3: Success */}
                            {step === 3 && (
                                <Animated.View
                                    entering={FadeIn.duration(400).easing(Easing.out(Easing.ease))}
                                    style={styles.successContainer}
                                >
                                    <Animated.View style={[styles.successCircle, checkAnimatedStyle]}>
                                        <Check size={64} color="#fff" strokeWidth={3} />
                                    </Animated.View>

                                    <Animated.View style={successAnimatedStyle}>
                                        <Text style={styles.successTitle}>Child Added Successfully!</Text>
                                        <Text style={styles.successSubtitle}>{studentData?.name} has been linked to your account</Text>
                                    </Animated.View>
                                </Animated.View>
                            )}
                        </ScrollView>
                    </Animated.View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    overlayTouchable: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    modalContainer: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 32,
        maxHeight: SCREEN_HEIGHT * 0.9,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    closeButton: {
        alignSelf: 'flex-end',
        padding: 8,
        marginBottom: 8,
    },
    iconContainer: {
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 20,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 20,
    },
    studentInfoCard: {
        backgroundColor: '#F8F9FA',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#E9ECEF',
    },
    studentName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    studentClass: {
        fontSize: 14,
        color: '#666',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E9ECEF',
    },
    inputIconContainer: {
        paddingLeft: 16,
        paddingRight: 12,
    },
    input: {
        flex: 1,
        height: 52,
        fontSize: 15,
        color: '#111',
        paddingRight: 16,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF5F5',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        gap: 8,
    },
    errorText: {
        fontSize: 13,
        color: '#FF6B6B',
        flex: 1,
    },
    button: {
        backgroundColor: '#0469ff',
        height: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    backButton: {
        marginTop: 12,
        padding: 12,
        alignItems: 'center',
    },
    backButtonText: {
        color: '#0469ff',
        fontSize: 15,
        fontWeight: '600',
    },
    successContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    successCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#4CAF50',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    successTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#111',
        textAlign: 'center',
        marginBottom: 8,
    },
    successSubtitle: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        lineHeight: 22,
    },
});

export default AddChildModal;
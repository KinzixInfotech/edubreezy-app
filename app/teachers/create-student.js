// app/teachers/create-student.js
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    Alert,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Upload, CheckCircle2, User, Camera, Mail, Phone, MapPin, X, Calendar as CalendarIcon, Save, Search } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { Image } from 'expo-image';
import { pickAndUploadImage } from '../../lib/uploadthing';
import { StatusBar } from 'expo-status-bar';

const DRAFT_KEY = 'draft_student_profile';

const INITIAL_FORM = {
    studentName: '',
    admissionNo: '',
    email: '',
    password: '',
    rollNumber: '',
    gender: 'MALE', // 'MALE', 'FEMALE', 'OTHER'
    bloodGroup: '',
    dob: new Date(),
    admissionDate: new Date(),
    linkedParentId: null,
    parentName: '',
    parentEmail: '',
    parentContactNumber: '',
    parentPassword: '',
    parentRelation: 'GUARDIAN', // 'FATHER', 'MOTHER', 'GUARDIAN'
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    contactNumber: '',
    profilePicture: null,
};

export default function CreateStudentScreen() {
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState(INITIAL_FORM);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [showDobPicker, setShowDobPicker] = useState(false);
    const [showAdmissionPicker, setShowAdmissionPicker] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [createParentProfile, setCreateParentProfile] = useState(false);

    // Initial Draft Check
    useEffect(() => {
        loadDraft();
    }, []);

    // Save draft occasionally
    useEffect(() => {
        const timeout = setTimeout(() => {
            saveDraft();
        }, 3000);
        return () => clearTimeout(timeout);
    }, [formData]);

    const loadDraft = async () => {
        try {
            const draft = await SecureStore.getItemAsync(DRAFT_KEY);
            if (draft) {
                const parsed = JSON.parse(draft);
                if (parsed.dob) parsed.dob = new Date(parsed.dob);
                if (parsed.admissionDate) parsed.admissionDate = new Date(parsed.admissionDate);

                Alert.alert(
                    "Draft Found",
                    "Do you want to restore your unsaved student profile?",
                    [
                        { text: "Discard", onPress: () => SecureStore.deleteItemAsync(DRAFT_KEY), style: "destructive" },
                        { text: "Restore", onPress: () => setFormData(parsed) }
                    ]
                );
            }
        } catch (error) {
            console.error('Failed to load draft:', error);
        }
    };

    const saveDraft = async () => {
        try {
            await SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(formData));
        } catch (error) {
            console.error('Failed to save draft:', error);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // User Data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });
    const schoolId = userData?.schoolId;
    const userId = userData?.id;

    const { data: teacherData, isLoading: teacherLoading } = useQuery({
        queryKey: ['teacher-data', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return null;
            const res = await api.get(`/schools/${schoolId}/teachers/${userId}`);
            const teachers = res.data?.teacher || res.data;
            return Array.isArray(teachers) ? teachers[0] : teachers;
        },
        enabled: !!schoolId && !!userId,
    });

    const classId = teacherData?.classId;
    const sectionId = teacherData?.sectionId;

    const searchParentMutation = useMutation({
        mutationFn: async (query) => {
            const res = await api.get(`/schools/${schoolId}/parents/search?q=${query}`);
            return res.data?.parents || [];
        },
        onSuccess: (data) => setSearchResults(data),
        onMutate: () => setIsSearching(true),
        onSettled: () => setIsSearching(false)
    });

    useEffect(() => {
        if (searchQuery.length >= 3) {
            const timeout = setTimeout(() => searchParentMutation.mutate(searchQuery), 500);
            return () => clearTimeout(timeout);
        } else {
            setSearchResults([]);
        }
    }, [searchQuery]);

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.post(`/schools/${schoolId}/teachers/${userId}/students`, data);
            return res.data;
        },
        onSuccess: async () => {
            await SecureStore.deleteItemAsync(DRAFT_KEY);
            Alert.alert("Success", "Student created successfully!", [
                { text: "OK", onPress: () => router.back() }
            ]);
            queryClient.invalidateQueries({ queryKey: ['teacher:students'] });
            queryClient.invalidateQueries({ queryKey: ['students'] });
        },
        onError: (error) => {
            const msg = error.response?.data?.error || error.response?.data?.message || 'Failed to create student';
            Alert.alert('Error', msg);
        }
    });

    const handlePickImage = async () => {
        if (!schoolId) return;

        try {
            await pickAndUploadImage('profiles',
                { schoolId, userId, title: 'Profile_Pic' },
                {
                    onStart: () => setIsUploading(true),
                    onProgress: (p) => setUploadProgress(p),
                    onComplete: (res) => {
                        if (res?.[0]) {
                            handleChange('profilePicture', res[0].url);
                        }
                    },
                    onError: (err) => Alert.alert('Upload Failed', err.message),
                }
            );
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const validateForm = () => {
        if (!formData.studentName.trim()) return "Student name is required";
        if (!formData.email.trim()) return "Email is required";
        if (!formData.password.trim() || formData.password.length < 6) return "Password must be at least 6 characters";
        if (!formData.admissionNo.trim()) return "Admission number is required";
        if (!formData.contactNumber.trim()) return "Primary contact number is required";
        if (!formData.linkedParentId && !createParentProfile) return "Please search and link an existing Parent or create a new one";
        if (createParentProfile) {
            if (!formData.parentName.trim()) return "Parent name is required";
            if (!formData.parentContactNumber.trim()) return "Parent contact number is required";
            if (!formData.parentPassword.trim() || formData.parentPassword.length < 6) return "Parent password must be at least 6 characters";
        }
        return null; // Valid
    };

    const handleSubmit = () => {
        const err = validateForm();
        if (err) {
            Alert.alert("Missing Fields", err);
            return;
        }

        const payload = {
            ...formData,
            createParentProfile,
            classId: Number(classId),
            sectionId: Number(sectionId),
            dob: formData.dob ? formData.dob.toISOString() : undefined,
            admissionDate: formData.admissionDate ? formData.admissionDate.toISOString() : undefined,
        };

        Alert.alert(
            "Confirm Setup",
            "Are you sure you want to create this student?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Confirm", onPress: () => createMutation.mutate(payload) }
            ]
        );
    };

    if (teacherLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loadingText}>Loading Details...</Text>
            </View>
        );
    }

    if (!classId) {
        return (
            <View style={styles.loaderContainer}>
                <Text style={styles.errorText}>You are not assigned to a class.</Text>
                <HapticTouchable onPress={() => router.back()}>
                    <Text style={{ color: '#0469ff', marginTop: 10, fontWeight: '600' }}>Go Back</Text>
                </HapticTouchable>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar style="dark" />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Add Student</Text>
                    <Text style={styles.headerSubtitle}>
                        Class {teacherData?.class?.className} {teacherData?.section ? `- ${teacherData.section.name}` : ''}
                    </Text>
                </View>
                <HapticTouchable disabled={createMutation.isPending} onPress={handleSubmit}>
                    <View style={styles.saveHeaderButton}>
                        {createMutation.isPending ? <ActivityIndicator size="small" color="#0469ff" /> : <Save size={24} color="#0469ff" />}
                    </View>
                </HapticTouchable>
            </Animated.View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                
                {/* Profile Picture Section */}
                <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.imageSection}>
                    <HapticTouchable onPress={handlePickImage} disabled={isUploading}>
                        <View style={styles.imageCircle}>
                            {formData.profilePicture ? (
                                <Image source={{ uri: formData.profilePicture }} style={styles.image} />
                            ) : (
                                <View style={styles.imagePlaceholder}>
                                    <Camera size={32} color="#999" />
                                </View>
                            )}
                            <View style={styles.imageBadge}>
                                {isUploading ? <ActivityIndicator size="small" color="#fff" /> : <Upload size={14} color="#fff" />}
                            </View>
                        </View>
                    </HapticTouchable>
                    {isUploading && <Text style={styles.uploadText}>Uploading... {Math.round(uploadProgress)}%</Text>}
                </Animated.View>

                {/* Section: Academic Details */}
                <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.card}>
                    <Text style={styles.cardTitle}>Academic Details</Text>
                    
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Student Full Name *</Text>
                        <TextInput style={styles.input} placeholder="e.g. John Doe" value={formData.studentName} onChangeText={t => handleChange('studentName', t)} />
                    </View>

                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.label}>Admission No *</Text>
                            <TextInput style={styles.input} placeholder="e.g. AD-2023" value={formData.admissionNo} onChangeText={t => handleChange('admissionNo', t)} />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.label}>Roll No</Text>
                            <TextInput style={styles.input} placeholder="e.g. 45" keyboardType="numeric" value={formData.rollNumber} onChangeText={t => handleChange('rollNumber', t)} />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Admission Date</Text>
                        <HapticTouchable onPress={() => setShowAdmissionPicker(true)}>
                            <View style={styles.dateSelector}>
                                <Text style={styles.dateSelectorText}>{formData.admissionDate ? formData.admissionDate.toDateString() : 'Select Date'}</Text>
                                <CalendarIcon size={20} color="#666" />
                            </View>
                        </HapticTouchable>
                        {showAdmissionPicker && (
                            <DateTimePicker
                                value={formData.admissionDate || new Date()}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(e, date) => {
                                    setShowAdmissionPicker(Platform.OS === 'ios');
                                    if (date) handleChange('admissionDate', date);
                                }}
                            />
                        )}
                    </View>
                </Animated.View>

                {/* Section: System Login */}
                <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.card}>
                    <Text style={styles.cardTitle}>System Login</Text>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email Address *</Text>
                        <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="student@school.com" value={formData.email} onChangeText={t => handleChange('email', t)} />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password *</Text>
                        <TextInput style={styles.input} placeholder="Minimum 6 characters" secureTextEntry value={formData.password} onChangeText={t => handleChange('password', t)} />
                    </View>
                </Animated.View>

                {/* Section: Personal Info */}
                <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.card}>
                    <Text style={styles.cardTitle}>Personal Info</Text>
                    
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Date of Birth</Text>
                        <HapticTouchable onPress={() => setShowDobPicker(true)}>
                            <View style={styles.dateSelector}>
                                <Text style={styles.dateSelectorText}>{formData.dob ? formData.dob.toDateString() : 'Select Date'}</Text>
                                <CalendarIcon size={20} color="#666" />
                            </View>
                        </HapticTouchable>
                        {showDobPicker && (
                            <DateTimePicker
                                value={formData.dob || new Date()}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                maximumDate={new Date()}
                                onChange={(e, date) => {
                                    setShowDobPicker(Platform.OS === 'ios');
                                    if (date) handleChange('dob', date);
                                }}
                            />
                        )}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Gender</Text>
                        <View style={styles.segmentControl}>
                            {['MALE', 'FEMALE', 'OTHER'].map(g => (
                                <HapticTouchable key={g} onPress={() => handleChange('gender', g)} style={[styles.segment, formData.gender === g && styles.segmentActive]}>
                                    <Text style={[styles.segmentText, formData.gender === g && styles.segmentTextActive]}>{g}</Text>
                                </HapticTouchable>
                            ))}
                        </View>
                    </View>

                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.label}>Primary Contact *</Text>
                            <TextInput style={styles.input} keyboardType="phone-pad" placeholder="10 Digits" value={formData.contactNumber} onChangeText={t => handleChange('contactNumber', t)} />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.label}>Blood Group</Text>
                            <TextInput style={styles.input} placeholder="e.g. O+" value={formData.bloodGroup} onChangeText={t => handleChange('bloodGroup', t)} />
                        </View>
                    </View>
                </Animated.View>

                {/* Section: Family & Address */}
                <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.card}>
                    <Text style={styles.cardTitle}>Guardian / Parent Details</Text>
                    
                    {!createParentProfile && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Search Existing Parent</Text>
                            <View style={styles.searchBox}>
                                <Search size={20} color="#999" />
                                <TextInput 
                                    style={styles.searchInput} 
                                    placeholder="Search by name, email, or phone" 
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {isSearching && <ActivityIndicator size="small" color="#0469ff" />}
                            </View>
                            
                            {searchResults.length > 0 && !formData.linkedParentId && (
                                <View style={styles.searchResults}>
                                    {searchResults.map(p => (
                                        <HapticTouchable key={p.id} onPress={() => {
                                            handleChange('linkedParentId', p.id);
                                            setSearchQuery('');
                                            setSearchResults([]);
                                            setFormData(prev => ({...prev, parentRelation: 'GUARDIAN'}));
                                        }}>
                                            <View style={styles.searchResultItem}>
                                                <User size={20} color="#666" />
                                                <View style={{ marginLeft: 12 }}>
                                                    <Text style={styles.searchResultName}>{p.name}</Text>
                                                    <Text style={styles.searchResultPhone}>{p.contactNumber} • {p.email}</Text>
                                                </View>
                                            </View>
                                        </HapticTouchable>
                                    ))}
                                </View>
                            )}
                            
                            {formData.linkedParentId && (
                                <View style={styles.linkedParentBox}>
                                    <View style={{flexDirection:'row', alignItems:'center'}}>
                                        <CheckCircle2 size={24} color="#10B981" />
                                        <Text style={styles.linkedParentText}>Parent Linked Successfully</Text>
                                    </View>
                                    <HapticTouchable onPress={() => handleChange('linkedParentId', null)}>
                                        <Text style={{color: '#EF4444', fontWeight: '600', fontSize: 13}}>Remove</Text>
                                    </HapticTouchable>
                                </View>
                            )}
                        </View>
                    )}

                    {!formData.linkedParentId && (
                        <HapticTouchable onPress={() => setCreateParentProfile(!createParentProfile)}>
                            <View style={styles.toggleCreateParent}>
                                <Text style={styles.toggleCreateParentText}>
                                    {createParentProfile ? "Cancel creating new parent" : "+ Create New Parent Profile"}
                                </Text>
                            </View>
                        </HapticTouchable>
                    )}

                    {createParentProfile && (
                        <View style={styles.newParentForm}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Relation to Student</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View style={styles.relationTabs}>
                                        {['FATHER', 'MOTHER', 'GUARDIAN'].map(rel => (
                                            <HapticTouchable key={rel} onPress={() => handleChange('parentRelation', rel)}>
                                                <View style={[styles.relationTab, formData.parentRelation === rel && styles.relationTabActive]}>
                                                    <Text style={[styles.relationTabText, formData.parentRelation === rel && styles.relationTabTextActive]}>{rel}</Text>
                                                </View>
                                            </HapticTouchable>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Parent Full Name *</Text>
                                <TextInput style={styles.input} placeholder="e.g. Richard Doe" value={formData.parentName} onChangeText={t => handleChange('parentName', t)} />
                            </View>
                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.label}>Contact Number *</Text>
                                    <TextInput style={styles.input} keyboardType="phone-pad" placeholder="10 Digits" value={formData.parentContactNumber} onChangeText={t => handleChange('parentContactNumber', t)} />
                                </View>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.label}>Email Address (Optional)</Text>
                                    <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="parent@email.com" value={formData.parentEmail} onChangeText={t => handleChange('parentEmail', t)} />
                                </View>
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Login Password *</Text>
                                <TextInput style={styles.input} secureTextEntry placeholder="Min 6 characters" value={formData.parentPassword} onChangeText={t => handleChange('parentPassword', t)} />
                            </View>
                        </View>
                    )}

                    <Text style={[styles.cardTitle, { marginTop: 16, fontSize: 16 }]}>Address</Text>
                    <View style={styles.inputGroup}>
                        <TextInput style={[styles.input, { height: 80 }]} multiline placeholder="Full Address" value={formData.address} onChangeText={t => handleChange('address', t)} />
                    </View>
                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <TextInput style={styles.input} placeholder="City" value={formData.city} onChangeText={t => handleChange('city', t)} />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <TextInput style={styles.input} placeholder="State" value={formData.state} onChangeText={t => handleChange('state', t)} />
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <TextInput style={styles.input} placeholder="Country" value={formData.country} onChangeText={t => handleChange('country', t)} />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <TextInput style={styles.input} keyboardType="numeric" placeholder="Pincode" value={formData.postalCode} onChangeText={t => handleChange('postalCode', t)} />
                        </View>
                    </View>
                </Animated.View>

                {/* Submit Button */}
                <Animated.View entering={FadeInDown.delay(600).duration(400)}>
                    <HapticTouchable onPress={handleSubmit} disabled={createMutation.isPending}>
                        <View style={[styles.submitButton, createMutation.isPending && styles.submitButtonDisabled]}>
                            {createMutation.isPending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.submitButtonText}>Create Student Profile</Text>
                            )}
                        </View>
                    </HapticTouchable>
                </Animated.View>

                <View style={{ height: 60 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    saveHeaderButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    loadingText: {
        marginTop: 12,
        color: '#666',
        fontSize: 16,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 16,
        fontWeight: '500',
    },
    content: {
        padding: 16,
    },
    imageSection: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    imageCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    imagePlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#e2e8f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    imageBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#0469ff',
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#f8f9fa',
    },
    uploadText: {
        marginTop: 8,
        fontSize: 12,
        color: '#0469ff',
        fontWeight: '600',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        marginBottom: 16,
    },
    inputGroup: {
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#444',
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: '#111',
    },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    dateSelectorText: {
        fontSize: 15,
        color: '#111',
    },
    segmentControl: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderRadius: 10,
        padding: 4,
    },
    segment: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    segmentActive: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    segmentText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
    },
    segmentTextActive: {
        color: '#0469ff',
    },
    submitButton: {
        backgroundColor: '#0469ff',
        borderRadius: 16,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#0469ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    submitButtonDisabled: {
        opacity: 0.7,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 48,
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        color: '#111',
    },
    searchResults: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        marginTop: 8,
        maxHeight: 200,
    },
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    searchResultName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    searchResultPhone: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    linkedParentBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#dcfce7',
        borderWidth: 1,
        borderColor: '#10B981',
        borderRadius: 12,
        padding: 16,
        marginTop: 8,
    },
    linkedParentText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#065f46',
        marginLeft: 8,
    },
    toggleCreateParent: {
        padding: 12,
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        borderRadius: 10,
        marginBottom: 16,
    },
    toggleCreateParentText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0469ff',
    },
    newParentForm: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    relationTabs: {
        flexDirection: 'row',
        gap: 8,
    },
    relationTab: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
    },
    relationTabActive: {
        backgroundColor: '#0469ff',
    },
    relationTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
    },
    relationTabTextActive: {
        color: '#fff',
    },
});

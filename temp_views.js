    const DriverView = ({ refreshing, onRefresh, onScroll, paddingTop, refreshOffset, schoolId, userId, prefetchedStaffData, prefetchedTripsData, navigateOnce, upcomingEvents, user_acc }) => {
        // Location tracking state
        const [isPollingLocation, setIsPollingLocation] = useState(false);
        const [startingTripId, setStartingTripId] = useState(null); // Track which trip is being started
        const locationWatchRef = useRef(null);
        const appStateRef = useRef(AppState.currentState);
        const queryClient = useQueryClient();

        // Use prefetched data directly
        const staffData = prefetchedStaffData;
        const transportStaffId = staffData?.id;

        // Get assignment from trips data (for on-demand trip creation)
        const tripsData = prefetchedTripsData;
        const trips = tripsData?.trips || [];
        const assignment = tripsData?.assignment;

        // Try to get vehicle from vehicleAssignments first, fallback to assignment
        const vehicle = staffData?.vehicleAssignments?.[0]?.vehicle || assignment?.vehicle;
        const route = staffData?.vehicleAssignments?.[0]?.vehicle?.routes?.[0] || assignment?.route;
        const routeStopsCount = route?.stops?.length || route?.busStops?.length || 0;

        // Refetch function for manual refresh
        // Refetch function - use parent's onRefresh to avoid duplicate refreshes
        const refetch = useCallback(() => {
            if (onRefresh && typeof onRefresh === 'function') {
                onRefresh();
            }
        }, [onRefresh]);

        // Filter: Show today's trips + any IN_PROGRESS trips from previous days
        const today = new Date().toISOString().split('T')[0];
        const relevantTrips = trips.filter(t => {
            const tripDate = new Date(t.scheduledDate || t.createdAt).toISOString().split('T')[0];
            // Include if: today's trip OR it's still IN_PROGRESS
            return tripDate === today || t.status === 'IN_PROGRESS';
        });

        // Detect stale trips (IN_PROGRESS from previous days)
        const staleTrips = trips.filter(t => {
            const tripDate = new Date(t.scheduledDate || t.createdAt).toISOString().split('T')[0];
            return t.status === 'IN_PROGRESS' && tripDate < today;
        });

        const activeTrip = relevantTrips.find(t => t.status === 'IN_PROGRESS');
        const completedTrips = relevantTrips.filter(t => t.status === 'COMPLETED').length;
        const totalTrips = relevantTrips.length;


        // Force-complete mutation for stale trips
        const forceCompleteMutation = useMutation({
            mutationFn: async (tripId) => {
                const res = await api.post(`/schools/transport/trips/${tripId}/complete`);
                return res.data;
            },
            onSuccess: () => {
                refetch();
                Alert.alert('Success', 'Trip marked as completed!');
            },
            onError: (error) => {
                Alert.alert('Error', error.response?.data?.error || 'Failed to complete trip');
            }
        });

        // Function to force-complete a stale trip
        const handleForceComplete = (trip) => {
            const tripDate = new Date(trip.scheduledDate || trip.createdAt).toLocaleDateString();
            Alert.alert(
                'Complete Old Trip?',
                `This trip from ${tripDate} is still marked as in-progress. Mark it as completed?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Complete Now', style: 'default', onPress: () => forceCompleteMutation.mutate(trip.id) }
                ]
            );
        };

        // Auto-complete stale trips on load (optional - uncomment to enable)
        // useEffect(() => {
        //     if (staleTrips.length > 0) {
        //         staleTrips.forEach(trip => forceCompleteMutation.mutate(trip.id));
        //     }
        // }, [staleTrips.length]);

        // Location Tracking Functions
        const startLocationTracking = useCallback(async (tripId, vehicleId) => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission Required', 'Location permission is needed for live tracking.');
                    return;
                }

                locationWatchRef.current = await Location.watchPositionAsync(
                    { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
                    async (location) => {
                        try {
                            await api.post('/schools/transport/location/update', {
                                vehicleId,
                                tripId,
                                transportStaffId,
                                latitude: location.coords.latitude,
                                longitude: location.coords.longitude,
                                speed: location.coords.speed,
                                heading: location.coords.heading,
                            });
                        } catch (err) {
                            console.error('Error updating location:', err);
                        }
                    }
                );
                setIsPollingLocation(true);
            } catch (err) {
                console.error('Error starting location tracking:', err);
            }
        }, [transportStaffId]);

        const stopLocationTracking = useCallback(async () => {
            // Stop foreground watcher
            if (locationWatchRef.current) {
                locationWatchRef.current.remove();
                locationWatchRef.current = null;
            }
            setIsPollingLocation(false);

            // Also stop background task if it's running
            try {
                const isRunning = await isBackgroundTaskRunning();
                if (isRunning) {
                    console.log('🧹 DriverView: Stopping background location task');
                    await stopBackgroundLocationTask();
                }
            } catch (err) {
                console.error('Error stopping background task:', err);
            }
        }, []);

        // Auto-start/stop location tracking based on active trip
        useEffect(() => {
            if (activeTrip && !isPollingLocation && vehicle) {
                startLocationTracking(activeTrip.id, vehicle.id);
            } else if (!activeTrip && isPollingLocation) {
                stopLocationTracking();
            }

            return () => stopLocationTracking();
        }, [activeTrip?.id, vehicle?.id]);

        // Proactive cleanup: When DriverView mounts/updates with no active trip, 
        // ensure background location task is stopped (handles coming back from active-trip screen)
        useEffect(() => {
            const cleanupStaleBackgroundTask = async () => {
                if (!activeTrip) {
                    try {
                        const isRunning = await isBackgroundTaskRunning();
                        if (isRunning) {
                            console.log('🧹 DriverView: No active trip but background task running - cleaning up');
                            await stopBackgroundLocationTask();
                        }
                    } catch (err) {
                        console.error('Error in proactive cleanup:', err);
                    }
                }
            };
            cleanupStaleBackgroundTask();
        }, [activeTrip]);

        // Handle app state changes - only restart location tracking, don't refetch (parent handles refresh)
        useEffect(() => {
            const subscription = AppState.addEventListener('change', (nextAppState) => {
                if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
                    // Restart location tracking if there's an active trip
                    if (activeTrip && vehicle && !isPollingLocation) {
                        startLocationTracking(activeTrip.id, vehicle.id);
                    }
                }
                appStateRef.current = nextAppState;
            });
            return () => subscription.remove();
        }, [activeTrip?.id, vehicle?.id, isPollingLocation, startLocationTracking]);

        const quickActions = [
            { icon: Bus, label: 'My Vehicle', color: '#0469ff', bgColor: '#DBEAFE', href: '/(screens)/transport/my-vehicle' },
            { icon: Users, label: 'Attendance', color: '#10B981', bgColor: '#D1FAE5', href: activeTrip ? { pathname: '/(screens)/transport/attendance-marking', params: { tripId: activeTrip.id } } : '/(screens)/transport/driver-attendance-history' },
            { icon: MapPin, label: 'My Route', color: '#8B5CF6', bgColor: '#EDE9FE', href: '/(screens)/transport/my-route' },
            { icon: Calendar, label: 'Trip History', color: '#F59E0B', bgColor: '#FEF3C7', href: '/(screens)/transport/driver-attendance-history' },
        ];
        // Get today's scheduled trips for this driver
        const todaysScheduledTrips = trips.filter(t => t.status === 'SCHEDULED');

        // Check what trip types are already done/in-progress today
        const todaysPickupDone = trips.some(t => t.tripType === 'PICKUP' && (t.status === 'COMPLETED' || t.status === 'IN_PROGRESS'));
        const todaysDropDone = trips.some(t => t.tripType === 'DROP' && (t.status === 'COMPLETED' || t.status === 'IN_PROGRESS'));

        // On-demand start trip function (creates trip on the fly)
        const handleStartOnDemand = async (tripType) => {
            if (!assignment) return;

            // Double-check for DROP
            if (tripType === 'DROP' && !todaysPickupDone) {
                Alert.alert(
                    '⚠️ PICKUP Not Completed',
                    'The PICKUP trip for today hasn\'t been completed yet. Are you sure you want to start the DROP trip?',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Start Anyway', style: 'destructive', onPress: () => startOnDemandTrip(tripType) }
                    ]
                );
                return;
            }
            startOnDemandTrip(tripType);
        };

        const startOnDemandTrip = async (tripType) => {
            Alert.alert(
                `Start ${tripType} Trip?`,
                `You are about to start the ${tripType.toLowerCase()} trip for ${assignment.route?.name}.\n\nThis will begin live tracking and notify parents.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Start Trip',
                        style: 'default',
                        onPress: async () => {
                            setStartingTripId(`ondemand-${tripType}`); // Show loading
                            try {
                                const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                                const res = await api.post('/schools/transport/trips/start-on-demand', {
                                    assignmentId: assignment.id,
                                    tripType,
                                    driverId: transportStaffId,
                                    latitude: location.coords.latitude,
                                    longitude: location.coords.longitude
                                });
                                if (res.data.success) {
                                    refetch();
                                    router.push({ pathname: '/(screens)/transport/active-trip', params: { tripId: res.data.trip.id } });
                                }
                            } catch (err) {
                                console.error('Failed to start on-demand trip:', err);
                                const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to start trip. Please try again.';
                                Alert.alert('Error', errorMsg);
                                setStartingTripId(null);
                            }
                        }
                    }
                ]
            );
        };

        // Fetch notices for driver
        const { data: recentNotices } = useQuery({
            queryKey: ['driver-notices', schoolId, userId],
            queryFn: async () => {
                if (!schoolId || !userId) return { notices: [] };
                const res = await api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`);
                return res.data;
            },
            enabled: !!schoolId && !!userId,
            ...CACHE_CONFIG.MODERATE,
        });

        const notices = recentNotices?.notices?.map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.createdAt).toLocaleString(),
            unread: !n.read,
        })) || [];

        return (
            <Animated.ScrollView
                style={styles.container}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: paddingTop }}
                onScroll={onScroll}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                        colors={['#0469ff']}
                        progressViewOffset={refreshOffset}
                    />
                }
            >

                <BannerCarousel schoolId={schoolId} role={user_acc?.role?.name} />

                {/* Stats Cards - Moved below Bus Card */}
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                    <View style={styles.statsGrid}>
                        <HapticTouchable style={{ flex: 1 }}>
                            <LinearGradient
                                colors={['#667eea', '#764ba2']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#667eea', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}><Calendar size={22} color="#fff" /></View>
                                <View>
                                    <Text style={styles.statValue}>{totalTrips}</Text>
                                    <Text style={styles.statLabel}>Today's Trips</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                        <HapticTouchable style={{ flex: 1 }}>
                            <LinearGradient
                                colors={['#4ECDC4', '#26A69A']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#4ECDC4', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}><CheckCircle2 size={22} color="#fff" /></View>
                                <View>
                                    <Text style={styles.statValue}>{completedTrips}</Text>
                                    <Text style={styles.statLabel}>Completed</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                        <HapticTouchable style={{ flex: 1 }}>
                            <LinearGradient
                                colors={activeTrip ? ['#10B981', '#059669'] : ['#f093fb', '#f5576c']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: activeTrip ? '#10B981' : '#f093fb', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}><Users size={22} color="#fff" /></View>
                                <View>
                                    <Text style={styles.statValue}>{activeTrip ? 'Active' : 'Idle'}</Text>
                                    <Text style={styles.statLabel}>Status</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                    </View>
                </Animated.View>
                {/* Bus Assignment Card - Moved to Top */}
                {/* School Banner Carousel */}
                {vehicle && (
                    <Animated.View entering={FadeInDown.delay(50).duration(600)} style={styles.section}>
                        <LinearGradient colors={['#0469ff', '#0052cc']} style={{ borderRadius: 20, padding: 20, shadowColor: "#0469ff", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Bus size={30} color="#fff" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 }}>MY ASSIGNED BUS</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff' }}>{vehicle.licensePlate}</Text>
                                        <HapticTouchable onPress={() => navigateOnce('/(screens)/transport/my-vehicle')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Details</Text>
                                        </HapticTouchable>
                                    </View>
                                </View>
                            </View>
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 16, padding: 16 }}>
                                <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Model</Text>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{vehicle.model || 'N/A'}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Capacity</Text>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{vehicle.capacity || 'N/A'} Seats</Text>
                                    </View>
                                </View>
                                {route && (
                                    <View>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Assigned Route</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <MapPin size={14} color="rgba(255,255,255,0.9)" style={{ marginRight: 6 }} />
                                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{route.name}</Text>
                                        </View>
                                    </View>
                                )}
                                {todaysScheduledTrips.length > 0 && (
                                    <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' }}>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>Today's Tripr</Text>
                                        {todaysScheduledTrips.map((trip, idx) => (
                                            <View key={trip.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx < todaysScheduledTrips.length - 1 ? 8 : 0 }}>
                                                <View style={{ width: 24, alignItems: 'flex-start' }}>
                                                    <Text style={{ fontSize: 14 }}>{trip.tripType === 'PICKUP' ? '🌅' : '🌆'}</Text>
                                                </View>
                                                <Text style={{ fontSize: 14, color: '#fff', marginLeft: 8, flex: 1 }}>{trip.tripType} • {trip.route?.name}</Text>
                                                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                                    <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>{trip.status}</Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </LinearGradient>
                    </Animated.View>
                )}

                {/* Start Trip Widget - Enhanced with PICKUP before DROP logic */}
                {!activeTrip && todaysScheduledTrips.length > 0 && (() => {
                    // Check if PICKUP trip is completed for today
                    const todaysPickupCompleted = trips.some(t => {
                        const tripDate = new Date(t.scheduledDate || t.createdAt).toISOString().split('T')[0];
                        return tripDate === today && t.tripType === 'PICKUP' && t.status === 'COMPLETED';
                    });

                    // Sort trips: PICKUP first, then DROP
                    const sortedTrips = [...todaysScheduledTrips].sort((a, b) => {
                        if (a.tripType === 'PICKUP' && b.tripType !== 'PICKUP') return -1;
                        if (a.tripType !== 'PICKUP' && b.tripType === 'PICKUP') return 1;
                        return 0;
                    });

                    const handleStartTrip = async (trip) => {
                        // Show warning if trying to start DROP without completing PICKUP (but don't block)
                        if (trip.tripType === 'DROP' && !todaysPickupCompleted) {
                            Alert.alert(
                                '⚠️ PICKUP Not Completed',
                                'The PICKUP trip for today hasn\'t been completed yet. Are you sure you want to start the DROP trip?',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Start Anyway',
                                        style: 'destructive',
                                        onPress: () => showStartConfirmation(trip)
                                    }
                                ]
                            );
                            return;
                        }

                        showStartConfirmation(trip);
                    };

                    const showStartConfirmation = (trip) => {
                        // Confirmation dialog
                        Alert.alert(
                            `Start ${trip.tripType} Trip?`,
                            `You are about to start the ${trip.tripType.toLowerCase()} trip for ${trip.route?.name}.\n\nThis will begin live tracking and notify parents.`,
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Start Trip',
                                    style: 'default',
                                    onPress: async () => {
                                        setStartingTripId(trip.id); // Show loading spinner
                                        try {
                                            const res = await api.post(`/schools/transport/trips/${trip.id}/start`, { driverId: transportStaffId });
                                            if (res.data.success) {
                                                refetch();
                                                router.push({ pathname: '/(screens)/transport/active-trip', params: { tripId: trip.id } });
                                            }
                                        } catch (err) {
                                            console.error('Failed to start trip:', err);
                                            Alert.alert('Error', err.response?.data?.error || 'Failed to start trip. Please try again.');
                                            setStartingTripId(null); // Clear loading on error
                                        }
                                    }
                                }
                            ]
                        );
                    };

                    return (
                        <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.section}>
                            <View style={{ backgroundColor: '#FFF7ED', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#FDBA74' }}>
                                {/* Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }}>
                                        <Clock size={24} color="#EA580C" />
                                    </View>
                                    <View style={{ marginLeft: 14, flex: 1 }}>
                                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#9A3412' }}>Ready to Start</Text>
                                        <Text style={{ fontSize: 13, color: '#C2410C' }}>{todaysScheduledTrips.length} trip{todaysScheduledTrips.length > 1 ? 's' : ''} scheduled</Text>
                                    </View>
                                </View>

                                {/* Vehicle Info Banner */}
                                {vehicle && (
                                    <View style={{ backgroundColor: '#FFEDD5', borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#FDBA74' }}>
                                        <Bus size={20} color="#EA580C" />
                                        <View style={{ marginLeft: 10, flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#9A3412' }}>{vehicle.licensePlate}</Text>
                                            <Text style={{ fontSize: 12, color: '#C2410C' }}>{vehicle.model} • {vehicle.capacity} seats</Text>
                                        </View>
                                    </View>
                                )}

                                {/* Trip Cards with Premium Start Button */}
                                {sortedTrips.map((trip, idx) => {
                                    const isDropLocked = trip.tripType === 'DROP' && !todaysPickupCompleted;

                                    return (
                                        <HapticTouchable
                                            key={trip.id}
                                            onPress={() => handleStartTrip(trip)}
                                            style={{
                                                backgroundColor: isDropLocked ? '#F8FAFC' : '#fff',
                                                padding: 16,
                                                borderRadius: 16,
                                                marginTop: idx > 0 ? 12 : 0,
                                                opacity: isDropLocked ? 0.7 : 1,
                                                borderWidth: 1,
                                                borderColor: isDropLocked ? '#E2E8F0' : '#10B981',
                                                shadowColor: isDropLocked ? '#000' : '#10B981',
                                                shadowOffset: { width: 0, height: 4 },
                                                shadowOpacity: isDropLocked ? 0.05 : 0.2,
                                                shadowRadius: 8,
                                                elevation: isDropLocked ? 1 : 4,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <View style={{
                                                    width: 52,
                                                    height: 52,
                                                    borderRadius: 26,
                                                    backgroundColor: trip.tripType === 'PICKUP' ? '#DBEAFE' : '#FCE7F3',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <Text style={{ fontSize: 24 }}>{trip.tripType === 'PICKUP' ? '🌅' : '🌆'}</Text>
                                                </View>
                                                <View style={{ flex: 1, marginLeft: 14 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <Text style={{ fontSize: 17, fontWeight: '700', color: isDropLocked ? '#92400E' : '#1E293B' }}>
                                                            {trip.route?.name || 'Route'}
                                                        </Text>
                                                        {isDropLocked && (
                                                            <View style={{ marginLeft: 8, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                <AlertTriangle size={10} color="#D97706" />
                                                                <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '700' }}>PICKUP First</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={{ fontSize: 13, color: '#64748B', marginTop: 3 }}>
                                                        {trip.tripType} Trip • {trip.route?.busStops?.length || 0} stops
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Start Button */}
                                            <View style={{
                                                marginTop: 14,
                                                backgroundColor: isDropLocked ? '#F59E0B' : '#10B981',
                                                paddingVertical: 14,
                                                borderRadius: 12,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                            }}>
                                                {startingTripId === trip.id ? (
                                                    <>
                                                        <ActivityIndicator size="small" color="#fff" />
                                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Starting Trip...</Text>
                                                    </>
                                                ) : isDropLocked ? (
                                                    <>
                                                        <AlertTriangle size={18} color="#fff" />
                                                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Start DROP (PICKUP pending)</Text>
                                                    </>
                                                ) : (
                                                    <>
                                                        <View style={{
                                                            width: 28,
                                                            height: 28,
                                                            borderRadius: 14,
                                                            backgroundColor: 'rgba(255,255,255,0.25)',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}>
                                                            <Play size={14} color="#fff" fill="#fff" />
                                                        </View>
                                                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Start {trip.tripType} Trip</Text>
                                                    </>
                                                )}
                                            </View>
                                        </HapticTouchable>
                                    );
                                })}

                                {/* Helpful tip */}
                                {sortedTrips.some(t => t.tripType === 'DROP') && !todaysPickupCompleted && (
                                    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FCD34D' }}>
                                        <AlertTriangle size={16} color="#D97706" />
                                        <Text style={{ fontSize: 12, color: '#92400E', flex: 1, marginLeft: 8 }}>PICKUP not completed yet. You can still start DROP if needed.</Text>
                                    </View>
                                )}
                            </View>
                        </Animated.View>
                    );
                })()}

                {/* ON-DEMAND Start Trip Widget - Shows when no scheduled trips but has assignment AND trips still pending */}
                {!activeTrip && todaysScheduledTrips.length === 0 && assignment && !(todaysPickupDone && todaysDropDone) && (() => {
                    return (
                        <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.section}>
                            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#86EFAC' }}>
                                {/* Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                                        <Play size={24} color="#16A34A" />
                                    </View>
                                    <View style={{ marginLeft: 14, flex: 1 }}>
                                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#166534' }}>Ready to Start</Text>
                                        <Text style={{ fontSize: 13, color: '#15803D' }}>Tap to begin your trip</Text>
                                    </View>
                                </View>

                                {/* Assignment Info Banner */}
                                <View style={{ backgroundColor: '#DCFCE7', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#86EFAC' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Bus size={20} color="#16A34A" />
                                        <View style={{ marginLeft: 10, flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534' }}>{assignment.vehicle?.licensePlate}</Text>
                                            <Text style={{ fontSize: 12, color: '#15803D' }}>{assignment.route?.name}</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Start PICKUP Button */}
                                {!todaysPickupDone && (
                                    <HapticTouchable
                                        onPress={() => handleStartOnDemand('PICKUP')}
                                        disabled={startingTripId === 'ondemand-PICKUP'}
                                        style={{ marginBottom: 12 }}
                                    >
                                        <View style={{
                                            backgroundColor: '#10B981',
                                            paddingVertical: 16,
                                            borderRadius: 14,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 10,
                                        }}>
                                            {startingTripId === 'ondemand-PICKUP' ? (
                                                <>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Starting Trip...</Text>
                                                </>
                                            ) : (
                                                <>
                                                    <Text style={{ fontSize: 22 }}>🌅</Text>
                                                    <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>Start PICKUP Trip</Text>
                                                </>
                                            )}
                                        </View>
                                    </HapticTouchable>
                                )}

                                {/* Start DROP Button */}
                                {!todaysDropDone && (
                                    <HapticTouchable
                                        onPress={() => handleStartOnDemand('DROP')}
                                        disabled={startingTripId === 'ondemand-DROP'}
                                    >
                                        <View style={{
                                            backgroundColor: todaysPickupDone ? '#8B5CF6' : '#F59E0B',
                                            paddingVertical: 16,
                                            borderRadius: 14,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 10,
                                        }}>
                                            {startingTripId === 'ondemand-DROP' ? (
                                                <>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Starting Trip...</Text>
                                                </>
                                            ) : (
                                                <>
                                                    <Text style={{ fontSize: 22 }}>🌆</Text>
                                                    <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>
                                                        {todaysPickupDone ? 'Start DROP Trip' : 'Start DROP (PICKUP pending)'}
                                                    </Text>
                                                </>
                                            )}
                                        </View>
                                    </HapticTouchable>
                                )}

                                {/* Helpful tip for DROP when PICKUP not done */}
                                {!todaysPickupDone && (
                                    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FCD34D' }}>
                                        <AlertTriangle size={16} color="#D97706" />
                                        <Text style={{ fontSize: 12, color: '#92400E', flex: 1, marginLeft: 8 }}>PICKUP not completed yet. You can still start DROP if needed.</Text>
                                    </View>
                                )}
                            </View>
                        </Animated.View>
                    );
                })()}

                {/* All Trips Completed Widget - Shows when both PICKUP and DROP are done */}
                {!activeTrip && assignment && todaysPickupDone && todaysDropDone && (
                    <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.section}>
                        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#86EFAC', alignItems: 'center' }}>
                            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                <CheckCircle2 size={36} color="#16A34A" />
                            </View>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#166534', marginBottom: 4 }}>All Done for Today! 🎉</Text>
                            <Text style={{ fontSize: 14, color: '#15803D', textAlign: 'center' }}>Both PICKUP and DROP trips completed successfully.</Text>
                            <View style={{ flexDirection: 'row', marginTop: 16, gap: 12 }}>
                                <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
                                    <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>🌅 PICKUP ✓</Text>
                                </View>
                                <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
                                    <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>🌆 DROP ✓</Text>
                                </View>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {activeTrip && (
                    <Animated.View entering={FadeInDown.delay(75).duration(600)} style={styles.section}>
                        {/* Location Tracking Banner */}
                        {isPollingLocation && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#86EFAC' }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' }} />
                                <MapPin size={14} color="#16A34A" />
                                <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600', flex: 1 }}>Location tracking active</Text>
                                <Text style={{ fontSize: 11, color: '#16A34A' }}>Parents can track</Text>
                            </View>
                        )}
                        <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/transport/active-trip', params: { tripId: activeTrip.id } })}>
                            <LinearGradient colors={['#10B981', '#059669']} style={{ borderRadius: 16, padding: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                        <Clock size={24} color="#fff" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Trip in Progress</Text>
                                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                                        </View>
                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>{activeTrip.route?.name} • {activeTrip.tripType}</Text>
                                    </View>
                                    <ChevronRight size={24} color="#fff" />
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                    </Animated.View>
                )}



                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.actionsGrid}>
                        {quickActions.map((action, index) => (
                            <Animated.View key={action.label} entering={FadeInDown.delay(300 + index * 50).duration(400)}>
                                <HapticTouchable onPress={() => action.href && navigateOnce(action.href)} disabled={!action.href}>
                                    <View style={[styles.actionButton, { backgroundColor: action.bgColor, opacity: action.href ? 1 : 0.5 }]}>
                                        {/* Decorative Graphics */}
                                        <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                        <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />

                                        <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                            <action.icon size={22} color={action.color} />
                                        </View>
                                        <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))}
                    </View>
                </Animated.View>

                {/* Today's Schedule - Redesigned */}
                <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text style={styles.sectionTitle}>Today's Schedule</Text>
                        {relevantTrips.length > 0 && (
                            <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#0469ff' }}>{relevantTrips.length} trip{relevantTrips.length > 1 ? 's' : ''}</Text>
                            </View>
                        )}
                    </View>

                    {relevantTrips.length === 0 ? (
                        /* Empty State */
                        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                <Calendar size={28} color="#94A3B8" />
                            </View>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#64748B', marginBottom: 6 }}>No trips for today</Text>
                            <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>Your scheduled trips will appear here</Text>
                        </View>
                    ) : (
                        /* Trip Cards */
                        <View style={{ gap: 12 }}>
                            {relevantTrips.map((trip, index) => (
                                <HapticTouchable
                                    key={trip.id}
                                    onPress={() => trip.status === 'IN_PROGRESS' && navigateOnce({ pathname: '/(screens)/transport/active-trip', params: { tripId: trip.id } })}
                                >
                                    <View style={{
                                        backgroundColor: trip.status === 'IN_PROGRESS' ? '#F0FDF4' : trip.status === 'COMPLETED' ? '#F0FDF4' : '#F8FAFC',
                                        borderRadius: 16,
                                        padding: 16,
                                        borderWidth: 1,
                                        borderColor: trip.status === 'IN_PROGRESS' ? '#86EFAC' : trip.status === 'COMPLETED' ? '#BBF7D0' : '#E2E8F0'
                                    }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            {/* Trip Type Icon */}
                                            <View style={{
                                                width: 48,
                                                height: 48,
                                                borderRadius: 12,
                                                backgroundColor: trip.tripType === 'PICKUP' ? '#FEF3C7' : '#E0E7FF',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginRight: 12
                                            }}>
                                                <Text style={{ fontSize: 24 }}>{trip.tripType === 'PICKUP' ? '🌅' : '🌆'}</Text>
                                            </View>

                                            {/* Trip Details */}
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1E293B' }}>{trip.route?.name || 'Route'}</Text>
                                                    <View style={{
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 4,
                                                        borderRadius: 8,
                                                        backgroundColor: trip.status === 'COMPLETED' ? '#D1FAE5' : trip.status === 'IN_PROGRESS' ? '#FEF3C7' : '#DBEAFE'
                                                    }}>
                                                        <Text style={{
                                                            fontSize: 11,
                                                            fontWeight: '700',
                                                            color: trip.status === 'COMPLETED' ? '#059669' : trip.status === 'IN_PROGRESS' ? '#D97706' : '#0469ff'
                                                        }}>
                                                            {trip.status === 'IN_PROGRESS' ? '● ACTIVE' : trip.status}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <Clock size={14} color="#64748B" />
                                                        <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>{trip.tripType}</Text>
                                                    </View>
                                                    {trip.vehicle && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            <Bus size={14} color="#64748B" />
                                                            <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>{trip.vehicle.licensePlate}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>

                                            {/* Arrow for active trips */}
                                            {trip.status === 'IN_PROGRESS' && (
                                                <ChevronRight size={20} color="#10B981" style={{ marginLeft: 8 }} />
                                            )}
                                        </View>
                                    </View>
                                </HapticTouchable>
                            ))}
                        </View>
                    )}
                </Animated.View>

                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                            <Text style={styles.seeAll}>See All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.eventsContainer}>
                        {upcomingEvents && upcomingEvents.length > 0 ? (
                            upcomingEvents.slice(0, 4).map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                        <View style={styles.eventCard}>
                                            <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.eventTitle}>{event.title}</Text>
                                                <View style={styles.eventDate}>
                                                    <Calendar size={14} color="#666" />
                                                    <Text style={styles.eventDateText}>{event.date}</Text>
                                                </View>
                                            </View>
                                            <ChevronRight size={20} color="#999" />
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(700).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    You're all caught up!
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>
                {/* Recent Notices */}
                <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Notices</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                            <Text style={styles.seeAll}>View All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.noticesContainer}>
                        {notices && notices.length > 0 ? (
                            notices.map((notice, index) => (
                                <Animated.View
                                    key={notice.id}
                                    entering={FadeInRight.delay(900 + index * 100).duration(500)}
                                >
                                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                        <View style={styles.noticeCard}>
                                            <View style={styles.noticeLeft}>
                                                <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                    <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                                </View>
                                                <View style={styles.noticeInfo}>
                                                    <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]} numberOfLines={1}>
                                                        {notice.title}
                                                    </Text>
                                                    <Text style={styles.noticeTime}>
                                                        {notice.time}
                                                    </Text>
                                                </View>
                                            </View>
                                            {notice.unread && <View style={styles.unreadDot} />}
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(900).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    No notices yet
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>

                {/* Bottom Spacer */}
                <View style={{ height: 100 }} />
            </Animated.ScrollView>
        );
    };

    // === CONDUCTOR VIEW ===
    const ConductorView = ({ refreshing, onRefresh, onScroll, paddingTop, refreshOffset, schoolId, userId, prefetchedStaffData, prefetchedTripsData, navigateOnce, upcomingEvents, user_acc }) => {
        const queryClient = useQueryClient();

        // Use prefetched data directly
        const staffData = prefetchedStaffData;
        const transportStaffId = staffData?.id;

        // Use prefetched trips data
        const tripsData = prefetchedTripsData;
        const trips = tripsData?.trips || [];
        const assignment = tripsData?.assignment;

        // Try to get vehicle from vehicleAssignments first, fallback to assignment
        const vehicle = staffData?.vehicleAssignments?.[0]?.vehicle || assignment?.vehicle;
        // Refetch function - use parent's onRefresh to avoid duplicate refreshes
        const refetch = useCallback(() => {
            if (onRefresh && typeof onRefresh === 'function') {
                onRefresh();
            }
        }, [onRefresh]);

        const activeTrip = trips.find(t => t.status === 'IN_PROGRESS');
        const totalStudents = activeTrip?.route?.busStops?.reduce((sum, stop) => sum + (stop.students?.length || 0), 0) || 0;
        const completedTrips = trips.filter(t => t.status === 'COMPLETED').length;

        // Fetch notices for conductor
        const { data: recentNotices } = useQuery({
            queryKey: ['conductor-notices', schoolId, userId],
            queryFn: async () => {
                if (!schoolId || !userId) return { notices: [] };
                const res = await api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`);
                return res.data;
            },
            enabled: !!schoolId && !!userId,
            ...CACHE_CONFIG.MODERATE,
        });

        const notices = recentNotices?.notices?.map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.createdAt).toLocaleString(),
            unread: !n.read,
        })) || [];

        const quickActions = [
            { icon: Bus, label: 'My Vehicle', color: '#0469ff', bgColor: '#DBEAFE', href: '/(screens)/transport/my-vehicle' },
            { icon: Users, label: 'Attendance', color: '#10B981', bgColor: '#D1FAE5', href: activeTrip ? { pathname: '/(screens)/transport/attendance-marking', params: { tripId: activeTrip.id } } : '/(screens)/transport/driver-attendance-history' },
            { icon: MapPin, label: 'My Route', color: '#8B5CF6', bgColor: '#EDE9FE', href: '/(screens)/transport/my-route' },
            { icon: Calendar, label: 'History', color: '#F59E0B', bgColor: '#FEF3C7', href: '/(screens)/transport/driver-attendance-history' },
        ];

        // Note: Loading is handled at HomeScreen level now

        return (
            <Animated.ScrollView
                style={styles.container}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: paddingTop }}
                onScroll={onScroll}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                        colors={['#0469ff']}
                        progressViewOffset={refreshOffset}
                    />
                }
            >
                {/* Header is rendered outside the ScrollView by parent component */}
                {/* Bus Assignment Card for Conductor */}
                {vehicle && (
                    <Animated.View entering={FadeInDown.delay(50).duration(600)} style={styles.section}>
                        <LinearGradient colors={['#8B5CF6', '#7C3AED']} style={{ borderRadius: 20, padding: 20, shadowColor: "#8B5CF6", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Bus size={26} color="#fff" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 }}>ASSIGNED BUS</Text>
                                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>{vehicle.licensePlate}</Text>
                                </View>
                                <HapticTouchable onPress={() => navigateOnce('/(screens)/transport/my-vehicle')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Details</Text>
                                </HapticTouchable>
                            </View>
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 12, padding: 12, flexDirection: 'row' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Model</Text>
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{vehicle.model || 'N/A'}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Capacity</Text>
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{vehicle.capacity || 'N/A'} Seats</Text>
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>
                )}

                {activeTrip && (
                    <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                        <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/transport/attendance-marking', params: { tripId: activeTrip.id } })}>
                            <LinearGradient colors={['#10B981', '#059669']} style={{ borderRadius: 16, padding: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                        <Users size={24} color="#fff" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Trip Active</Text>
                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>Tap to mark attendance</Text>
                                    </View>
                                    <ChevronRight size={24} color="#fff" />
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                    </Animated.View>
                )}

                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                    <View style={styles.statsGrid}>
                        <HapticTouchable style={{ flex: 1 }}>
                            <LinearGradient
                                colors={['#667eea', '#764ba2']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#667eea', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}><Calendar size={22} color="#fff" /></View>
                                <View>
                                    <Text style={styles.statValue}>{trips.length}</Text>
                                    <Text style={styles.statLabel}>Today's Trips</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                        <HapticTouchable style={{ flex: 1 }}>
                            <LinearGradient
                                colors={['#4ECDC4', '#26A69A']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#4ECDC4', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}><CheckCircle2 size={22} color="#fff" /></View>
                                <View>
                                    <Text style={styles.statValue}>{completedTrips}</Text>
                                    <Text style={styles.statLabel}>Completed</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                        <HapticTouchable style={{ flex: 1 }}>
                            <LinearGradient
                                colors={['#f093fb', '#f5576c']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#f093fb', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}><Users size={22} color="#fff" /></View>
                                <View>
                                    <Text style={styles.statValue}>{totalStudents}</Text>
                                    <Text style={styles.statLabel}>Students</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                    </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.actionsGrid}>
                        {quickActions.map((action, index) => (
                            <Animated.View key={action.label} entering={FadeInDown.delay(300 + index * 50).duration(400)}>
                                <HapticTouchable onPress={() => action.href && navigateOnce(action.href)} disabled={!action.href}>
                                    <View style={[styles.actionButton, { backgroundColor: action.bgColor, opacity: action.href ? 1 : 0.5 }]}>
                                        {/* Decorative Graphics */}
                                        <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                        <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />

                                        <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                            <action.icon size={22} color={action.color} />
                                        </View>
                                        <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))}
                    </View>
                </Animated.View>

                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                            <Text style={styles.seeAll}>See All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.eventsContainer}>
                        {upcomingEvents && upcomingEvents.length > 0 ? (
                            upcomingEvents.slice(0, 4).map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                        <View style={styles.eventCard}>
                                            <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.eventTitle}>{event.title}</Text>
                                                <View style={styles.eventDate}>
                                                    <Calendar size={14} color="#666" />
                                                    <Text style={styles.eventDateText}>{event.date}</Text>
                                                </View>
                                            </View>
                                            <ChevronRight size={20} color="#999" />
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(700).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    You're all caught up!
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>
                {/* Recent Notices */}
                <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Notices</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                            <Text style={styles.seeAll}>View All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.noticesContainer}>
                        {notices && notices.length > 0 ? (
                            notices.map((notice, index) => (
                                <Animated.View
                                    key={notice.id}
                                    entering={FadeInRight.delay(900 + index * 100).duration(500)}
                                >
                                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                        <View style={styles.noticeCard}>
                                            <View style={styles.noticeLeft}>
                                                <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                    <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                                </View>
                                                <View style={styles.noticeInfo}>
                                                    <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]} numberOfLines={1}>
                                                        {notice.title}
                                                    </Text>
                                                    <Text style={styles.noticeTime}>
                                                        {notice.time}
                                                    </Text>
                                                </View>
                                            </View>
                                            {notice.unread && <View style={styles.unreadDot} />}
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(900).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    No notices yet
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>

                {/* Bottom Spacer */}
                <View style={{ height: 100 }} />
            </Animated.ScrollView>
        );
    };

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';

const QUEUE_KEY = 'attendance_offline_queue_v1';

export async function getAttendanceQueue() {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
}

export async function enqueueAttendanceAction(action) {
    const queue = await getAttendanceQueue();
    const item = {
        id: action.id || `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        retries: 0,
        ...action,
    };
    queue.push(item);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return item;
}

export async function clearAttendanceQueue() {
    await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function syncAttendanceQueue() {
    const state = await NetInfo.fetch();
    const connected = state.isConnected && state.isInternetReachable !== false;
    if (!connected) return { synced: 0, failed: 0, skipped: 0 };

    const queue = await getAttendanceQueue();
    if (!queue.length) return { synced: 0, failed: 0, skipped: 0 };

    const remaining = [];
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
        try {
            await api.post(`/schools/${item.schoolId}/attendance/mark`, {
                userId: item.userId,
                type: item.type,
                location: item.location,
                deviceInfo: item.deviceInfo,
                remarks: item.remarks,
                capturedAt: item.capturedAt,
                submissionMode: 'OFFLINE_SYNC',
                queueId: item.id,
            });
            synced += 1;
        } catch (error) {
            failed += 1;
            remaining.push({
                ...item,
                retries: (item.retries || 0) + 1,
                lastError: error?.response?.data?.error || error.message,
            });
        }
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { synced, failed, skipped: 0 };
}

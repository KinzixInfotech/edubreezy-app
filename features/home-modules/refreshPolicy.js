import { homeQueryKeys } from './queryKeys';

const roleRefreshPolicies = {
    student: ({ schoolId, userId }) => [
        homeQueryKeys.studentDashboard(schoolId, userId),
    ],
    teaching_staff: ({ schoolId, userId }) => [
        homeQueryKeys.teacherProfile(userId, schoolId),
        homeQueryKeys.teacherDashboard(schoolId, userId),
    ],
    admin: ({ schoolId, userId }) => [
        homeQueryKeys.notificationsSummary(userId, schoolId),
    ],
    parent: ({ schoolId, parentId, selectedChildId }) => [
        homeQueryKeys.parentDashboardRoot(schoolId, parentId),
        homeQueryKeys.parentDashboard(schoolId, parentId, selectedChildId),
        selectedChildId ? homeQueryKeys.parentBadgeTimestamps(selectedChildId) : null,
    ].filter(Boolean),
    director: ({ schoolId, userId }) => [
        homeQueryKeys.academicYears(schoolId),
        homeQueryKeys.directorNotices(schoolId, userId),
    ],
    principal: ({ schoolId, userId }) => [
        homeQueryKeys.academicYears(schoolId),
        homeQueryKeys.principalNotices(schoolId, userId),
    ],
    accountant: ({ schoolId, userId }) => [
        homeQueryKeys.accountantDashboard(schoolId, userId),
    ],
    driver: ({ schoolId, userId, transportStaffId }) => [
        homeQueryKeys.transportStaff(schoolId, userId),
        homeQueryKeys.transportTrips(schoolId, transportStaffId),
        homeQueryKeys.driverNotices(schoolId, userId),
    ],
    conductor: ({ schoolId, userId, transportStaffId }) => [
        homeQueryKeys.transportStaff(schoolId, userId),
        homeQueryKeys.transportTrips(schoolId, transportStaffId),
        homeQueryKeys.conductorNotices(schoolId, userId),
    ],
};

export const getHomeRefreshKeys = ({ role, schoolId, userId, parentId, selectedChildId, transportStaffId }) => {
    const normalizedRole = role?.toLowerCase?.() || '';
    const sharedKeys = [
        homeQueryKeys.notificationsSummary(userId, schoolId),
        homeQueryKeys.upcomingEvents(schoolId),
    ].filter((key) => key.every(Boolean));

    const roleKeys = roleRefreshPolicies[normalizedRole]?.({
        schoolId,
        userId,
        parentId,
        selectedChildId,
        transportStaffId,
    }) || [];

    return [...sharedKeys, ...roleKeys];
};

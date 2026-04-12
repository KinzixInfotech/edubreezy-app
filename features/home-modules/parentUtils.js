export const mapParentChildren = (children = []) => (
    children.map((child) => ({
        id: child.studentId,
        studentId: child.studentId,
        name: child.name,
        class: child.class,
        classId: child.classId,
        section: child.section,
        sectionId: child.sectionId,
        admissionNo: child.admissionNo,
        rollNo: child.rollNumber,
        avatar: child.profilePicture,
        attendance: child.attendancePercentage ?? null,
        feeStatus: child.feeStatus ?? null,
        performance: child.performance ?? null,
        pendingFee: child.pendingFee ?? null,
    }))
);

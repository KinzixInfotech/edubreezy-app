import { useEffect, useReducer } from 'react';
import StatusViewer from '../../app/components/StatusViewer';
import StatusUpload from '../../app/components/StatusUpload';
import { homeQueryKeys } from './queryKeys';

export default function StatusModals({
    selectedStatusGroupRef = { current: null },
    showStatusUploadRef = { current: false },
    setSelectedStatusGroup,
    setShowStatusUpload,
    schoolId,
    userId,
    queryClient,
    modalUpdateRef = { current: null },
} = {}) {
    const [, forceUpdate] = useReducer((count) => count + 1, 0);

    useEffect(() => {
        modalUpdateRef.current = forceUpdate;
        return () => {
            modalUpdateRef.current = null;
        };
    }, [modalUpdateRef]);

    const selectedStatusGroup = selectedStatusGroupRef.current;
    const showStatusUpload = showStatusUploadRef.current;

    return (
        <>
            <StatusViewer
                visible={!!selectedStatusGroup}
                statusGroup={selectedStatusGroup}
                schoolId={schoolId}
                viewerId={userId}
                onClose={() => {
                    setSelectedStatusGroup(null);
                    queryClient.refetchQueries({ queryKey: homeQueryKeys.statusFeed(), type: 'active' });
                }}
            />
            <StatusUpload
                visible={showStatusUpload}
                onClose={() => setShowStatusUpload(false)}
                schoolId={schoolId}
                userId={userId}
            />
        </>
    );
}

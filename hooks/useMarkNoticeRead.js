// hooks/useMarkNoticeRead.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';


export const useMarkNoticeRead = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ noticeId, schoolId, userId }) => {
      // <-- your backend expects { userId } in the body
      await api.post(`/notices/${schoolId}/${noticeId}/mark-read`, { userId });
    },

    // ────── Optimistic UI (dot disappears instantly) ──────
    onMutate: async ({ noticeId }) => {
      await qc.cancelQueries({ queryKey: ['notices'] });

      const previous = qc.getQueryData(['notices']);

      qc.setQueryData(['notices'], (old) => {
        if (!old?.notices) return old;

        return {
          ...old,
          notices: old.notices.map((n) =>
            n.id === noticeId ? { ...n, read: true } : n
          ),
        };
      });

      return { previous };
    },

    // ────── Rollback if request fails ──────
    onError: (_err, _vars, context) => {
      qc.setQueryData(['notices'], context?.previous);
    },

    // ────── Keep list fresh after success ──────
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notices'] });
    },
  });
};
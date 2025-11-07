// lib/queries/user.js
import api from "../api";

// export const fetchUser = async ({ userId, token }) => {
//     console.log('api called');
    
//     const { data } = await api.get(`auth/user`, {
//         params: { userId },
//         headers: {
//             Authorization: `Bearer ${token}`,
//         },
//     });
//     return data;
// };

async function fetchUser(userId, token) {
  const res = await api.get(`/auth/user?userId=${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
export default fetchUser;
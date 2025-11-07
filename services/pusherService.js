// // import Pusher from 'pusher-js/react-native';
// // import { EXPO_PUBLIC_PUSHER_KEY, EXPO_PUBLIC_PUSHER_CLUSTER } from '@env';
// // class PusherService {
// //     constructor() {
// //         this.pusher = null;
// //         this.channel = null;
// //     }

// //     initialize(schoolId) {
// //         if (this.pusher) return;

// //         this.pusher = new Pusher(EXPO_PUBLIC_PUSHER_KEY, {
// //             cluster: EXPO_PUBLIC_PUSHER_CLUSTER,
// //             encrypted: true,
// //         });

// //         this.channel = this.pusher.subscribe(`school-${schoolId}`);
// //     }

// //     subscribeToNotices(callback) {
// //         if (!this.channel) return;

// //         this.channel.bind('new-notice', (data) => {
// //             callback(data.notice);
// //         });
// //     }

// //     unsubscribeFromNotices() {
// //         if (!this.channel) return;
// //         this.channel.unbind('new-notice');
// //     }

// //     disconnect() {
// //         if (this.pusher) {
// //             this.pusher.disconnect();
// //             this.pusher = null;
// //             this.channel = null;
// //         }
// //     }
// // }

// // export default new PusherService();
// import { EXPO_PUBLIC_PUSHER_KEY, EXPO_PUBLIC_PUSHER_CLUSTER } from '@env';

// import {
//     Pusher,
//     PusherEvent,
// } from '@pusher/pusher-websocket-react-native';

// class PusherService {
//     constructor() {
//         this.pusher = Pusher.getInstance();
//         this.subscription = null;
//     }

//     // async initialize(schoolId) {
//     //     if (this.subscription) return; // already subscribed

//     //     await this.pusher.init({
//     //         apiKey: EXPO_PUBLIC_PUSHER_KEY,
//     //         cluster: EXPO_PUBLIC_PUSHER_CLUSTER,
//     //     });

//     //     await this.pusher.connect();

//     //     this.subscription = await this.pusher.subscribe({
//     //         channelName: `school-${schoolId}`,
//     //         onEvent: (event) => {
//     //             console.log('Pusher event received:', event);
//     //             if (event.eventName === 'new-notice') {
//     //                 this.callback?.(event.data.notice);
//     //             }
//     //         },
//     //     });
//     // }
//     // async initialize(schoolId, callback) {
//     //     this.callback = callback;

//     //     if (this.subscription) return;

//     //     await this.pusher.init({
//     //         apiKey: EXPO_PUBLIC_PUSHER_KEY,
//     //         cluster: EXPO_PUBLIC_PUSHER_CLUSTER,
//     //     });

//     //     await this.pusher.connect();

//     //     this.subscription = await this.pusher.subscribe({
//     //         channelName: `school-${schoolId}`,
//     //         onEvent: (event) => {
//     //             console.log('Pusher event received:', event); // Debug
//     //             if (event.eventName === 'new-notice') {
//     //                 this.callback?.(event.data.notice);
//     //             }
//     //         },
//     //     });
//     // }
//     async initialize(schoolId, callback) {
//         this.callback = callback;

//         if (this.subscription) return;

//         await this.pusher.init({
//             apiKey: EXPO_PUBLIC_PUSHER_KEY,
//             cluster: EXPO_PUBLIC_PUSHER_CLUSTER,
//         });

//         await this.pusher.connect();

//         this.subscription = await this.pusher.subscribe({
//             channelName: `school-${schoolId}`,
//             onEvent: (event) => {
//                 console.log('Pusher event received:', event);
//                 if (event.eventName === 'new-notice') {
//                     // Parse the JSON string first
//                     const parsedData = JSON.parse(event.data);
//                     this.callback?.(parsedData.notice);
//                 }
//             },
//         });
//     }
//     subscribeToNotices(callback) {
//         this.callback = callback;
//     }

//     async unsubscribe() {
//         if (this.subscription) {
//             await this.pusher.unsubscribe(this.subscription);
//             this.subscription = null;
//         }
//     }

//     async disconnect() {
//         await this.unsubscribe();
//         await this.pusher.disconnect();
//     }
// }

// export default new PusherService();

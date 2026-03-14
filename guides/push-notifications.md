# Chat Push Notifications via Supabase Edge Functions

To enable real-time push notifications for the Edubreezy chat system, we recommend using Supabase Edge Functions. These functions can listen to database changes (via Database Webhooks) and trigger FCM (Firebase Cloud Messaging) notifications.

## 1. Setup Database Webhook

Go to the Supabase Dashboard -> Database -> Webhooks and create a new webhook:
- **Name**: `on_new_message`
- **Table**: `Message`
- **Events**: `INSERT`
- **Target**: `HTTP Request`
- **Method**: `POST`
- **URL**: `https://<your-project-ref>.supabase.co/functions/v1/send-chat-notification` (You will create this below)
- **Headers**: Add `Authorization: Bearer <your-anon-or-service-role-key>`

## 2. Edge Function Implementation

Create a new directory `supabase/functions/send-chat-notification/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { JWT } from "https://esm.sh/google-auth-library@9"

const SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')

async function getAccessToken() {
  const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON!)
  const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  const tokens = await client.authorize()
  return tokens.access_token
}

serve(async (req) => {
  const payload = await req.json()
  const newMessage = payload.record
  const project_id = JSON.parse(SERVICE_ACCOUNT_JSON!).project_id

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 2. Fetch other participants who should receive the notification
  const { data: participants, error: pError } = await supabase
    .from('ConversationParticipant')
    .select('userId, user:User(name, fcmToken)')
    .eq('conversationId', newMessage.conversationId)
    .neq('userId', newMessage.senderId)
    .eq('isActive', true)

  if (pError || !participants) return new Response('No participants to notify')

  // 3. Fetch sender name
  const { data: sender } = await supabase
    .from('User')
    .select('name')
    .eq('id', newMessage.senderId)
    .single()

  // 4. Send FCM Notifications (v1 API)
  const accessToken = await getAccessToken()
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${project_id}/messages:send`

  for (const p of participants) {
    if (p.user.fcmToken) {
      await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: p.user.fcmToken,
            notification: {
              title: sender?.name || 'New Message',
              body: newMessage.content || 'Sent an attachment',
            },
            data: {
              type: 'CHAT_MESSAGE',
              conversationId: newMessage.conversationId,
            },
            android: {
              priority: 'high',
              notification: { sound: 'default' }
            },
            apns: {
              payload: { aps: { sound: 'default' } }
            }
          },
        }),
      })
    }
  }

  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })
})
```

## 3. Environment Variables

Set your secrets via Supabase CLI or Dashboard:
```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT='{"type": "service_account", ...}'
```

> [!TIP]
> Paste the entire content of your Firebase JSON file into the `FIREBASE_SERVICE_ACCOUNT` secret.

## 4. Frontend Integration (Edubreezy)

Ensure the mobile app:
1. Requests notification permissions.
2. Saves the `fcmToken` to the `User` table upon login or app launch.
3. Handles the `data` payload in the notification to navigate to `/(screens)/chat/[conversationId]`.

> [!IMPORTANT]
> The `fcmToken` column must exist in the `User` table. If it doesn't, you should add it to the Prisma schema and run a migration.

## 5. Security Note
Always use the `service_role` key within Edge Functions for database operations to bypass RLS, but ensure the function itself is protected or only callable via authorized webhooks.

import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase'; // adjust path

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  console.log('Index screen mounted');

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      // console.log(data);
      setSession(data.session);
      setIsLoading(false);
    };

    getSession();

    // Optional: listen for session changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(screens)/greeting" />;
  }

  return <Redirect href="/(auth)/schoolcode" />;
}
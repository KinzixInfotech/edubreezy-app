// Quick debug script to check saved profiles
import * as SecureStore from 'expo-secure-store';

async function debugProfiles() {
  try {
    const data = await SecureStore.getItemAsync('savedProfiles');
    console.log('=== SAVED PROFILES DEBUG ===');
    console.log(JSON.stringify(JSON.parse(data || '{}'), null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

debugProfiles();

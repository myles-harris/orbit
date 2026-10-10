import { Alert } from 'react-native';
import { createAuthenticatedApiClient } from './apiClient';

let inFlight = false;

/** The one account-deletion flow: confirm, DELETE /me, then report the result. */
export function promptDeleteAccount(onDeleted: () => void): void {
  Alert.alert(
    'Delete account?',
    'This permanently deletes your profile, photo, and call history. Groups you own pass to the member who joined first, and groups with no other members are deleted. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => { void deleteNow(onDeleted); } },
    ],
  );
}

async function deleteNow(onDeleted: () => void): Promise<void> {
  // A second confirm while the first request is out would send a second DELETE.
  if (inFlight) return;
  inFlight = true;
  try {
    const client = await createAuthenticatedApiClient();
    await client.delete('/me');
  } catch {
    Alert.alert('Could not delete account', 'Check your connection and try again.');
    return;
  } finally {
    inFlight = false;
  }
  onDeleted();
  Alert.alert('Account deleted', 'Your Orbit account and its data have been deleted.');
}

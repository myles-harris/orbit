import { Alert } from 'react-native';
import { promptDeleteAccount } from '../deleteAccount';
import { createAuthenticatedApiClient } from '../apiClient';

jest.mock('../apiClient', () => ({ createAuthenticatedApiClient: jest.fn() }));

const flush = () => new Promise((resolve) => setImmediate(resolve));

function mockClient(deleteImpl: () => Promise<unknown>) {
  const client = { delete: jest.fn(deleteImpl) };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  return client;
}

function alertButtons() {
  return (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('promptDeleteAccount', () => {
  it('shows Delete account? with Cancel and a destructive Delete account; Cancel sends no request', () => {
    const onDeleted = jest.fn();
    const client = mockClient(async () => ({ status: 'deleted' }));

    promptDeleteAccount(onDeleted);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete account?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete account', style: 'destructive' }),
      ]),
    );

    alertButtons().find((b) => b.text === 'Cancel')!.onPress?.();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it('sends one DELETE /me, calls onDeleted once, then shows Account deleted', async () => {
    const onDeleted = jest.fn();
    const client = mockClient(async () => ({ status: 'deleted' }));

    promptDeleteAccount(onDeleted);
    alertButtons().find((b) => b.text === 'Delete account')!.onPress!();
    await flush();

    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(client.delete).toHaveBeenCalledWith('/me');
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Account deleted', expect.any(String));
  });

  it('a rejected request shows Could not delete account and never calls onDeleted', async () => {
    const onDeleted = jest.fn();
    mockClient(async () => { throw new Error('network'); });

    promptDeleteAccount(onDeleted);
    alertButtons().find((b) => b.text === 'Delete account')!.onPress!();
    await flush();

    expect(Alert.alert).toHaveBeenCalledWith('Could not delete account', expect.any(String));
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('pressing Delete account twice before the first request settles sends one request', async () => {
    const onDeleted = jest.fn();
    let resolveDelete!: () => void;
    const client = mockClient(() => new Promise((resolve) => {
      resolveDelete = () => resolve({ status: 'deleted' });
    }));

    promptDeleteAccount(onDeleted);
    const onPress = alertButtons().find((b) => b.text === 'Delete account')!.onPress!;
    onPress();
    onPress();
    await flush();

    expect(client.delete).toHaveBeenCalledTimes(1);

    resolveDelete();
    await flush();
  });
});

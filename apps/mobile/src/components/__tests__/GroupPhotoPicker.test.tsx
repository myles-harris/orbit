import { act } from 'react';
import { Alert, Image, Platform, TouchableOpacity } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { GroupPhotoPicker } from '../GroupPhotoPicker';
import { Display } from '../Display';
import { Icon } from '../Icon';
import { useTheme } from '../../context/ThemeContext';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { darkTheme } from '../../theme';
import { allText } from '../../testUtils/tree';

const mockResize = jest.fn();
const mockSaveAsync = jest.fn();

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({
  createAuthenticatedApiClient: jest.fn(),
  API_URL: 'http://test',
  peekAccessToken: () => 'tok',
  getAccessToken: async () => 'tok',
}));
jest.mock('@orbit/shared', () => ({ parseApiError: () => 'Friendly error message' }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: mockResize,
      renderAsync: async () => ({ saveAsync: mockSaveAsync }),
    })),
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

const STAMP = '2026-09-01T12:00:00.000Z';
const UPLOADED_AT = '2026-09-05T08:00:00.000Z';

type Props = Partial<React.ComponentProps<typeof GroupPhotoPicker>>;

function mockApi() {
  const client = {
    uploadGroupPhoto: jest.fn(async () => ({ ok: true, photo_updated_at: UPLOADED_AT })),
    deleteGroupPhoto: jest.fn(async () => ({ ok: true })),
  };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  return client;
}

async function render(props: Props = {}) {
  (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
  const client = mockApi();
  const onChange = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <GroupPhotoPicker
        groupId="g1"
        name="Track Club"
        editable
        hasPhoto={false}
        photoUpdatedAt={null}
        onChange={onChange}
        {...props}
      />,
    );
  });
  return { tree, client, onChange };
}

const button = (tree: ReactTestRenderer) => tree.root.findByType(TouchableOpacity);
const press = (tree: ReactTestRenderer) => act(async () => { button(tree).props.onPress(); });
const alertButtons = () => (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
const pick = (asset: object = { uri: 'file:///picked.jpg', width: 2000 }) =>
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [asset] });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockSaveAsync.mockResolvedValue({ uri: 'file:///resized.jpg', base64: 'BASE64' });
});

describe('GroupPhotoPicker upload', () => {
  it('goes straight to the picker when there is no photo, then uploads the re-encoded bytes', async () => {
    pick();
    const { tree, client, onChange } = await render();

    await press(tree);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [1, 1], base64: false }),
    );
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///picked.jpg');
    expect(client.uploadGroupPhoto).toHaveBeenCalledWith('g1', 'BASE64', 'image/jpeg');
    expect(onChange).toHaveBeenCalledWith({ hasPhoto: true, photoUpdatedAt: UPLOADED_AT });
  });

  it('re-encodes once, as a JPEG at quality 0.8, capped at 1080 wide', async () => {
    pick({ uri: 'file:///picked.jpg', width: 3024 });
    const { tree } = await render();

    await press(tree);

    expect(mockResize).toHaveBeenCalledWith({ width: 1080 });
    expect(mockSaveAsync).toHaveBeenCalledTimes(1);
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg', base64: true });
  });

  it('never upscales a picture already smaller than the cap', async () => {
    pick({ uri: 'file:///small.jpg', width: 600 });
    const { tree } = await render();

    await press(tree);

    expect(mockResize).toHaveBeenCalledWith({ width: 600 });
  });

  it('shows the picked file straight away, before the server has answered', async () => {
    pick();
    const { tree, client } = await render();
    let finish!: (v: object) => void;
    client.uploadGroupPhoto.mockReturnValueOnce(new Promise<object>((r) => { finish = r as (v: object) => void; }) as never);

    await press(tree);
    expect(tree.root.findByType(Image).props.source).toEqual({ uri: 'file:///resized.jpg' });

    await act(async () => { finish({ ok: true, photo_updated_at: UPLOADED_AT }); });
  });

  it('cannot be pressed again while a photo is uploading, and can once it has finished', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg', width: 2000 }],
    });
    const { tree, client } = await render();
    let finish!: (v: object) => void;
    client.uploadGroupPhoto.mockReturnValueOnce(new Promise<object>((r) => { finish = r as (v: object) => void; }) as never);

    // Still uploading: a second press here would start a second upload alongside it.
    await press(tree);
    expect(button(tree).props.disabled).toBe(true);

    await act(async () => { finish({ ok: true, photo_updated_at: UPLOADED_AT }); });
    expect(button(tree).props.disabled).toBeFalsy();
  });

  it('uploads nothing when the picker is cancelled', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    const { tree, client, onChange } = await render();

    await press(tree);

    expect(client.uploadGroupPhoto).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('on a failed upload, drops the preview, says so, and reports no change', async () => {
    pick();
    const { tree, client, onChange } = await render();
    client.uploadGroupPhoto.mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await press(tree);

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Friendly error message');
    expect(onChange).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(Image)).toHaveLength(0); // back to the initial
    expect(allText(tree)).toEqual(['T']);
  });

  // Nothing awaits the press handler, so a rejection here would be an unhandled promise
  // and the owner would get no word that nothing happened.
  it('says so, and stays usable, when the picker itself cannot be shown', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValueOnce(new Error('picker unavailable'));
    const { tree, client, onChange } = await render();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await press(tree);

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Friendly error message');
    expect(client.uploadGroupPhoto).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(button(tree).props.disabled).toBeFalsy();
  });

  it('says so when the image cannot be re-encoded, without touching the server', async () => {
    pick();
    mockSaveAsync.mockResolvedValueOnce({ uri: 'file:///resized.jpg', base64: undefined });
    const { tree, client } = await render();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await press(tree);

    expect(client.uploadGroupPhoto).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Error', "Orbit couldn't process that photo. Try a different one.");
  });
});

describe('GroupPhotoPicker permissions', () => {
  const original = Platform.OS;
  afterEach(() => { Platform.OS = original; });

  it('asks for the photo library on Android, and stops if it is refused', async () => {
    Platform.OS = 'android';
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    const { tree } = await render();

    await press(tree);

    expect(Alert.alert).toHaveBeenCalledWith('Permission Required', expect.stringContaining('group photo'));
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('says so, and does not open the picker, when the permission request itself fails', async () => {
    Platform.OS = 'android';
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockRejectedValueOnce(new Error('no permission service'));
    const { tree } = await render();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await press(tree);

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Friendly error message');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('does not ask on iOS, where the editing picker needs no authorization', async () => {
    Platform.OS = 'ios';
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    const { tree } = await render();

    await press(tree);

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
  });
});

describe('GroupPhotoPicker with a photo', () => {
  const withPhoto = { hasPhoto: true, photoUpdatedAt: STAMP };

  it('offers choose / remove / cancel, and removes it', async () => {
    const { tree, client, onChange } = await render(withPhoto);

    await press(tree);
    expect(Alert.alert).toHaveBeenCalledWith('Group Photo', undefined, expect.any(Array));
    expect(alertButtons().map((b) => b.text)).toEqual(['Choose new photo', 'Remove photo', 'Cancel']);

    await act(async () => { alertButtons().find((b) => b.text === 'Remove photo')!.onPress!(); });

    expect(client.deleteGroupPhoto).toHaveBeenCalledWith('g1');
    expect(onChange).toHaveBeenCalledWith({ hasPhoto: false, photoUpdatedAt: null });
  });

  it('replaces the photo through the same picker', async () => {
    pick();
    const { tree, client, onChange } = await render(withPhoto);

    await press(tree);
    await act(async () => { alertButtons().find((b) => b.text === 'Choose new photo')!.onPress!(); });

    expect(client.uploadGroupPhoto).toHaveBeenCalledWith('g1', 'BASE64', 'image/jpeg');
    expect(onChange).toHaveBeenCalledWith({ hasPhoto: true, photoUpdatedAt: UPLOADED_AT });
  });

  it('keeps the photo, and says so, when removal fails', async () => {
    const { tree, client, onChange } = await render(withPhoto);
    client.deleteGroupPhoto.mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await press(tree);
    await act(async () => { alertButtons().find((b) => b.text === 'Remove photo')!.onPress!(); });

    expect(Alert.alert).toHaveBeenLastCalledWith('Error', 'Friendly error message');
    expect(onChange).not.toHaveBeenCalled();
  });

  it("draws the group's photo from its versioned URL, with the token", async () => {
    const { tree } = await render(withPhoto);
    expect(tree.root.findByType(Image).props.source).toEqual({
      uri: `http://test/groups/g1/photo?v=${Date.parse(STAMP)}`,
      headers: { Authorization: 'Bearer tok' },
    });
  });
});

describe('GroupPhotoPicker without a photo', () => {
  it('falls back to the first letter of the name, in the display face', async () => {
    const { tree } = await render();
    expect(tree.root.findByType(Display).props.size).toBe(26);
    expect(allText(tree)).toEqual(['T']);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });
});

describe('GroupPhotoPicker for a non-owner', () => {
  it('shows the photo but offers no button and no camera badge', async () => {
    const { tree } = await render({ editable: false, hasPhoto: true, photoUpdatedAt: STAMP });

    expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(tree.root.findAllByType(Icon)).toHaveLength(0);
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
  });

  it('shows the initial when there is no photo, still with nothing to press', async () => {
    const { tree } = await render({ editable: false });
    expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(allText(tree)).toEqual(['T']);
  });
});

describe('GroupPhotoPicker for the owner', () => {
  it('is a labelled button carrying the marigold camera badge', async () => {
    const { tree } = await render();
    expect(button(tree).props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Change group photo' });
    const camera = tree.root.findAllByType(Icon).filter((i) => i.props.name === 'camera');
    expect(camera).toHaveLength(1);
    expect(camera[0].props.color).toBe(darkTheme.colors.onAccent);
  });
});

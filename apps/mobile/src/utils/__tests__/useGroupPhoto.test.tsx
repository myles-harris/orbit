import { act } from 'react';
import renderer from 'react-test-renderer';
import { peekAccessToken, getAccessToken } from '../apiClient';
import { useGroupPhoto, type GroupPhotoImage } from '../useGroupPhoto';

jest.mock('../apiClient', () => ({
  API_URL: 'http://test',
  peekAccessToken: jest.fn(),
  getAccessToken: jest.fn(),
}));

const STAMP = '2026-09-01T12:00:00.000Z';
const VERSION = new Date(STAMP).getTime();

type Args = Parameters<typeof useGroupPhoto>[0];

// Renders the hook and exposes what it currently returns.
function mount(initial: Args) {
  const out: { current: GroupPhotoImage | null } = { current: null };
  function Probe(props: Args) {
    out.current = useGroupPhoto(props);
    return null;
  }
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<Probe {...initial} />); });
  return {
    out,
    rerender: (next: Args) => act(() => { tree.update(<Probe {...next} />); }),
  };
}

const args = (over: Partial<Args> = {}): Args => ({ groupId: 'g1', hasPhoto: true, photoUpdatedAt: STAMP, ...over });

beforeEach(() => {
  // Jest is not configured to clear mocks, so call counts would carry between tests.
  (peekAccessToken as jest.Mock).mockReset().mockReturnValue('tok');
  (getAccessToken as jest.Mock).mockReset().mockResolvedValue('tok');
});

describe('useGroupPhoto', () => {
  it('is null for a group with no photo, so the no-photo state draws', () => {
    const { out } = mount(args({ hasPhoto: false }));
    expect(out.current).toBeNull();
  });

  it('points at the versioned photo URL with the bearer token, on the first frame', () => {
    const { out } = mount(args());
    expect(out.current!.source).toEqual({
      uri: `http://test/groups/g1/photo?v=${VERSION}`,
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('leaves the URL unversioned when there is no timestamp', () => {
    const { out } = mount(args({ photoUpdatedAt: null }));
    expect(out.current!.source.uri).toBe('http://test/groups/g1/photo');
  });

  it('changes the URL when the photo is replaced, which is what busts the image cache', () => {
    const { out, rerender } = mount(args());
    const later = '2026-09-02T12:00:00.000Z';

    rerender(args({ photoUpdatedAt: later }));

    expect(out.current!.source.uri).toBe(`http://test/groups/g1/photo?v=${new Date(later).getTime()}`);
  });

  describe('when the token is not in memory yet', () => {
    it('shows no photo until the keychain read resolves, then shows it', async () => {
      (peekAccessToken as jest.Mock).mockReturnValue(null);
      (getAccessToken as jest.Mock).mockResolvedValue('from-keychain');

      const { out } = mount(args());
      expect(out.current).toBeNull();

      await act(async () => {});
      expect(out.current!.source.headers).toEqual({ Authorization: 'Bearer from-keychain' });
    });

    it('does not read the keychain at all for a group with no photo', async () => {
      (peekAccessToken as jest.Mock).mockReturnValue(null);
      mount(args({ hasPhoto: false }));
      await act(async () => {});
      expect(getAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('a failed load', () => {
    it('retries once with a fresh token, remounting the image', async () => {
      const { out } = mount(args());
      const firstKey = out.current!.imageKey;
      (getAccessToken as jest.Mock).mockResolvedValue('fresh');

      await act(async () => { await out.current!.onError(); });

      expect(out.current!.imageKey).not.toBe(firstKey);
      expect(out.current!.source.headers).toEqual({ Authorization: 'Bearer fresh' });
    });

    it('does not remount until the fresh token is in hand', async () => {
      // Bumping the key first would remount with the stale token, fail again, and give
      // up before the fetched token could be applied.
      const { out } = mount(args());
      const firstKey = out.current!.imageKey;
      let resolveToken!: (t: string) => void;
      (getAccessToken as jest.Mock).mockReturnValue(new Promise<string>((r) => { resolveToken = r; }));

      let pending!: Promise<unknown>;
      await act(async () => { pending = Promise.resolve(out.current!.onError()); });
      expect(out.current!.imageKey).toBe(firstKey);
      expect(out.current!.source.headers).toEqual({ Authorization: 'Bearer tok' });

      await act(async () => { resolveToken('fresh'); await pending; });
      expect(out.current!.imageKey).not.toBe(firstKey);
      expect(out.current!.source.headers).toEqual({ Authorization: 'Bearer fresh' });
    });

    it('falls back to no photo when the token has not changed, since a retry would fail identically', async () => {
      const { out } = mount(args());
      // getAccessToken still yields 'tok'
      await act(async () => { await out.current!.onError(); });
      expect(out.current).toBeNull();
    });

    it('falls back to no photo when there is no token to retry with', async () => {
      const { out } = mount(args());
      (getAccessToken as jest.Mock).mockResolvedValue(null);
      await act(async () => { await out.current!.onError(); });
      expect(out.current).toBeNull();
    });

    it('gives up after the one retry fails too', async () => {
      const { out } = mount(args());
      (getAccessToken as jest.Mock).mockResolvedValue('fresh');
      await act(async () => { await out.current!.onError(); });
      expect(out.current).not.toBeNull();

      await act(async () => { await out.current!.onError(); });

      expect(out.current).toBeNull();
    });

    it('tries again from scratch when the photo is replaced after a failure', async () => {
      const { out, rerender } = mount(args());
      await act(async () => { await out.current!.onError(); });
      expect(out.current).toBeNull();

      rerender(args({ photoUpdatedAt: '2026-09-03T12:00:00.000Z' }));

      expect(out.current).not.toBeNull();
    });
  });
});

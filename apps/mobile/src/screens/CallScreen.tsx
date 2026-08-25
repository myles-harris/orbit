import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Animated, Easing, PanResponder, Dimensions, Alert, AppState, BackHandler, AccessibilityInfo, Platform } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Daily, { DailyCall, DailyParticipant, DailyEventObject, DailyMediaView, RTCPIPView, MediaStream as RTCMediaStream, MediaStreamTrack } from '@daily-co/react-native-daily-js';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import PipModule from '../../modules/pip';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

type CallRouteProp = RouteProp<RootStackParamList, 'Call'>;
type CallNavigationProp = StackNavigationProp<RootStackParamList, 'Call'>;

const PIP_WIDTH = 110;
const PIP_HEIGHT = 150;
// Minimum gap between the self-view and any screen edge or on-screen furniture.
const PIP_MARGIN = 12;
// Height of the control row measured up from insets.bottom:
//   18 (gap below the buttons) + 60 (button) + 16 (controlsRow paddingTop).
// Keep in sync with controlsRow in the StyleSheet.
const CONTROLS_HEIGHT = 94;
// Top edge of the countdown pill measured up from insets.bottom:
//   114 (its bottom offset) + ~38 (paddingVertical 8+8 + ~22 line box).
const TIMER_TOP = 152;

const computePipBounds = (
  i: EdgeInsets,
  timerShown: boolean,
  screenWidth: number,
  screenHeight: number,
) => {
  const bottomFurniture = timerShown ? TIMER_TOP : CONTROLS_HEIGHT;
  return {
    minX: PIP_MARGIN,
    maxX: screenWidth - PIP_WIDTH - PIP_MARGIN,
    minY: i.top + PIP_MARGIN,
    maxY: screenHeight - i.bottom - bottomFurniture - PIP_MARGIN - PIP_HEIGHT,
  };
};

export default function CallScreen() {
  const route = useRoute<CallRouteProp>();
  const navigation = useNavigation<CallNavigationProp>();
  const { callId, groupId, roomUrl, token, endsAt } = route.params;

  const callObjectRef = useRef<DailyCall | null>(null);
  const endCallRef = useRef<(expired?: boolean) => void>(() => {});
  const hasLeftRef = useRef(false);
  const [participants, setParticipants] = useState<{ [id: string]: DailyParticipant }>({});
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [useFrontCamera, setUseFrontCamera] = useState(true);
  const [localVideoKey, setLocalVideoKey] = useState(0);
  const [isChangingCamera, setIsChangingCamera] = useState(false);
  const videoEnabledRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  // appStateRef is read synchronously inside the AppState listener to detect
  // transitions; appState is the reactive copy so effects can depend on it.
  // Two variables, two jobs. Don't collapse them.
  const [appState, setAppState] = useState(AppState.currentState);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    endsAt ? Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000)) : null
  );
  // Most-recently-spoke participants first; used to prioritise which 9 to show
  const [speakerHistory, setSpeakerHistory] = useState<string[]>([]);

  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsVisibleRef = useRef(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  // With swipe-dismiss and hardware back both removed, hidden controls would
  // leave a screen-reader user with no reachable way to leave the call.
  const [screenReaderOn, setScreenReaderOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initializeCall(() => cancelled);
    return () => {
      cancelled = true;
      if (callObjectRef.current) {
        callObjectRef.current.destroy();
        callObjectRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    endCallRef.current = endCall;
  });

  // Keep a ref in sync so async callbacks always read the current value
  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  // Handle app state transitions during an active call:
  // • active → background: leave local video/audio running. iOS's call PiP
  //   (RTCPIPView with startAutomatically) and Android's PiP activity both
  //   keep the camera and mic capturing while backgrounded, so other
  //   participants should keep seeing and hearing this participant. On
  //   Android, also trigger system PiP explicitly.
  // • background/inactive → active: if video is on, force the
  //   DailyMediaView to remount so it re-attaches a fresh track. This fixes
  //   the local preview occasionally showing a stale/frozen frame after
  //   returning to the foreground (the outgoing track itself never stopped).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'active' && nextState === 'background') {
        if (Platform.OS === 'android') {
          PipModule.enterPipMode();
        }
      } else if (appStateRef.current !== 'active' && nextState === 'active') {
        if (callObjectRef.current && videoEnabledRef.current) {
          // A setLocalVideo(false)/setLocalVideo(true) pair used to run here to clear a
          // stale local preview after foregrounding. That staleness was a symptom of
          // the camera being suspended while backgrounded; multitasking camera access
          // now keeps capture alive, so the track is never stale to begin with.
          //
          // The pair was also expensive in a way that isn't obvious from JS: each
          // setLocalVideo(false) releases the track, which deallocs the native capture
          // controller, and setLocalVideo(true) re-acquires via getUserMedia and builds
          // a whole new AVCaptureSession. On the back camera that re-parks the OIS
          // actuator every time, which is audible and visible as jitter. Remounting the
          // view re-attaches the still-live track and is all that was ever needed.
          setLocalVideoKey(k => k + 1);
        }
      }
      appStateRef.current = nextState;
      setAppState(nextState);
    });
    return () => sub.remove();
  }, []);

  const didMountControlsRef = useRef(false);

  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
    // Skip the mount pass: controlsOpacity is already 1, so animating 1 -> 1 costs
    // a frame and a native-driver round-trip for nothing.
    if (!didMountControlsRef.current) {
      didMountControlsRef.current = true;
      return;
    }
    Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [controlsVisible]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled().then(on => {
      if (mounted) setScreenReaderOn(on);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderOn);
    return () => { mounted = false; sub.remove(); };
  }, []);

  // Never leave a screen-reader user with the controls hidden.
  useEffect(() => {
    if (screenReaderOn) setControlsVisible(true);
  }, [screenReaderOn]);

  // Android hardware back must not leave the call: Leave is the only exit.
  // Reveals hidden controls rather than no-opping, so a back press gives visible
  // feedback instead of reading as a frozen app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!controlsVisibleRef.current) setControlsVisible(true);
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const client = await createAuthenticatedApiClient();
        await client.post(`/groups/${groupId}/calls/${callId}/heartbeat`, {});
      } catch {
        // non-fatal — server prunes stale participants after 90s of no heartbeat
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft === null]);

  useEffect(() => {
    if (secondsLeft === 0) endCallRef.current(true);
  }, [secondsLeft]);

  const initializeCall = async (isCancelled: () => boolean) => {
    try {
      // Keep audio alive when the app is sent to the background.
      // UIBackgroundModes: ["voip"] in app.json enables this on iOS.
      // On Android the Daily.co foreground service already handles it.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      if (isCancelled()) return;
      const callObject = Daily.createCallObject();
      callObjectRef.current = callObject;
      if (isCancelled()) {
        callObject.destroy();
        callObjectRef.current = null;
        return;
      }

      callObject
        .on('joined-meeting', handleJoinedMeeting)
        .on('participant-joined', handleParticipantJoined)
        .on('participant-updated', handleParticipantUpdated)
        .on('participant-left', handleParticipantLeft)
        .on('left-meeting', handleLeftMeeting)
        .on('active-speaker-change', handleActiveSpeakerChange)
        .on('track-started', handleTrackStarted)
        .on('error', handleError);

      await callObject.join({ url: roomUrl, token });
    } catch (error) {
      console.error('Failed to join call:', error);
      Alert.alert('Unable to Join', 'This call is no longer available.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  const handleJoinedMeeting = () => {
    if (callObjectRef.current) setParticipants(callObjectRef.current.participants());
  };

  const handleParticipantJoined = (event: DailyEventObject<'participant-joined'>) => {
    setParticipants(prev => ({ ...prev, [event.participant.session_id]: event.participant }));
  };

  const handleParticipantUpdated = (event: DailyEventObject<'participant-updated'>) => {
    setParticipants(prev => ({ ...prev, [event.participant.session_id]: event.participant }));
  };

  // Fires when any track (including local video) transitions to playable. This
  // catches the rejoin case where joined-meeting fires before the local video
  // track is ready — we refresh participant state as soon as the track is live.
  // Also triggers the deferred DailyMediaView remount after a camera switch,
  // ensuring the new key is set only once the new track is actually available.
  const handleTrackStarted = (event: DailyEventObject<'track-started'>) => {
    if (callObjectRef.current) setParticipants(callObjectRef.current.participants());
    console.log('[TrackStarted] local=', event.participant?.local, 'kind=', event.track?.kind, 'pending=', pendingCameraRemountRef.current);
    if (
      pendingCameraRemountRef.current &&
      event.participant?.local &&
      event.track?.kind === 'video'
    ) {
      pendingCameraRemountRef.current = false;
      // Notify toggleCamera that the new track is ready; it handles the state
      // updates and starts phase 2 of the flip so everything stays in sync.
      cameraTrackReadyResolveRef.current?.();
      cameraTrackReadyResolveRef.current = null;
    }
  };

  const handleParticipantLeft = (event: DailyEventObject<'participant-left'>) => {
    setParticipants(prev => {
      const { [event.participant.session_id]: removed, ...rest } = prev;
      return rest;
    });
  };

  const handleLeftMeeting = () => {
    if (!hasLeftRef.current) {
      hasLeftRef.current = true;
      navigation.goBack();
    }
  };

  const handleActiveSpeakerChange = (event: any) => {
    const speakerId = event?.activeSpeaker?.peerId;
    if (speakerId) {
      setSpeakerHistory(prev => [speakerId, ...prev.filter(id => id !== speakerId)]);
    }
  };

  const handleError = (event: DailyEventObject<'error'>) => {
    console.error('Daily error:', event.error);
    if (!hasLeftRef.current) {
      hasLeftRef.current = true;
      const msg =
        event.error?.type === 'no-room'
          ? 'This call has already ended.'
          : 'An error occurred during the call.';
      Alert.alert('Call Ended', msg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    }
  };

  const endCall = async (expired = false) => {
    // Leave first: the user tapped Leave and expects the camera off immediately.
    // Guarded so a leave() rejection (e.g. the call object already torn down)
    // can't skip the backend notification below — that must fire regardless.
    try {
      if (callObjectRef.current) await callObjectRef.current.leave();
    } catch (error) {
      console.error('Failed to leave Daily call locally:', error);
    }
    try {
      const client = await createAuthenticatedApiClient();
      if (expired) {
        await client.post(`/groups/${groupId}/calls/${callId}/end`, {});
      } else {
        await client.post(`/groups/${groupId}/calls/${callId}/leave`, {});
      }
    } catch (error) {
      console.error('Failed to notify backend:', error);
    }
  };

  const toggleVideo = () => {
    if (!callObjectRef.current) return;
    const next = !videoEnabled;
    callObjectRef.current.setLocalVideo(next);
    setVideoEnabled(next);
    if (next) {
      // Force DailyMediaView to remount so it re-attaches the new track instead
      // of holding a reference to the paused/stale one.
      setLocalVideoKey(k => k + 1);
    }
  };

  const toggleAudio = () => {
    if (callObjectRef.current) {
      callObjectRef.current.setLocalAudio(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    }
  };

  const flipAnim = useRef(new Animated.Value(0)).current;
  const cameraFlippingRef = useRef(false);
  const pendingCameraRemountRef = useRef(false);
  const cameraTrackReadyResolveRef = useRef<(() => void) | null>(null);
  const toggleCameraRef = useRef<() => void>(() => {});
  // Tracks mirror state as a ref so it's always in sync with localVideoKey at reveal time,
  // regardless of React batching. Updated synchronously before every DailyMediaView remount.
  const localVideoMirrorRef = useRef(true);

  const toggleCamera = async () => {
    if (!callObjectRef.current || cameraFlippingRef.current) return;
    cameraFlippingRef.current = true;
    try {
      const nextFront = !useFrontCamera;

      // Phase 1: current camera view (untouched) rotates to the vanishing point.
      // The camera switch is NOT started yet — Daily.co would swap the track
      // immediately, showing the new camera during the animation. We wait until
      // edge-on.
      await new Promise<void>(resolve => {
        Animated.timing(flipAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: false,
        }).start(() => resolve());
      });

      // Card is edge-on and invisible — now start the camera switch.
      // Set up the ready promise BEFORE starting it so a fast track-started
      // doesn't slip past the listener.
      const trackReadyPromise = new Promise<void>(resolve => {
        cameraTrackReadyResolveRef.current = resolve;
      });
      pendingCameraRemountRef.current = true;

      setIsChangingCamera(true);
      setUseFrontCamera(nextFront);

      // cycleCamera() rather than setCamera(deviceId): it routes to the native
      // switchCamera, which swaps the device input on the EXISTING AVCaptureSession.
      // setCamera goes through a fresh getUserMedia, which allocates a new capture
      // controller and builds an entirely new session — and that full rebuild
      // re-parks the back camera's OIS actuator on every flip, which is what makes
      // the phone audibly buzz and the image shake after a couple of toggles.
      // This control is a binary front/back toggle, so cycling is the right API;
      // the enumerateDevices + label-matching it replaces was also expensive
      // (observed once at 1.3s just to acquire the device list).
      const switchPromise = callObjectRef.current.cycleCamera();

      await switchPromise;
      await Promise.race([
        trackReadyPromise,
        new Promise<void>(resolve => setTimeout(resolve, 300)),
      ]);
      cameraTrackReadyResolveRef.current = null;
      if (pendingCameraRemountRef.current) {
        pendingCameraRemountRef.current = false;
      }

      // Phase 2: reveal new camera from the opposite side.
      // Update mirror ref synchronously before the remount so the new DailyMediaView
      // instance always gets the correct value, regardless of React batching.
      localVideoMirrorRef.current = nextFront;
      setIsChangingCamera(false);
      setLocalVideoKey(k => k + 1);

      flipAnim.setValue(-1);
      Animated.timing(flipAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();

    } catch (e) {
      pendingCameraRemountRef.current = false;
      cameraTrackReadyResolveRef.current = null;
      setIsChangingCamera(false);
      flipAnim.setValue(0);
      throw e;
    } finally {
      cameraFlippingRef.current = false;
    }
  };
  toggleCameraRef.current = toggleCamera;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Cap at 9. Only sort by most-recent speaker in the two-size layout (7+ remotes),
  // where featured slots are meaningfully larger than thumbnails. In equal-size
  // layouts (1–6) tiles stay in stable join order so they don't shuffle on
  // every speaker change.
  const visibleRemote = useMemo(() => {
    const remote = Object.values(participants).filter(p => !p.local);
    const capped = remote.slice(0, 9);

    if (capped.length < 7) return capped;

    return [...capped].sort((a, b) => {
      const aIdx = speakerHistory.indexOf(a.session_id);
      const bIdx = speakerHistory.indexOf(b.session_id);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [participants, speakerHistory]);

  const localParticipant = useMemo(
    () => Object.values(participants).find(p => p.local),
    [participants]
  );

  // ─── PiP subject ────────────────────────────────────────────────────────────
  // AC-2/AC-3: with any remote present, PiP shows exactly one remote, the most
  // recent active speaker with a usable track. Self is never shown while a remote
  // exists; if no remote has usable video we clear the window rather than falling
  // back to self. Only when genuinely alone does PiP show the local camera.
  //
  // Presence of `track` is the right test, not `state === 'playable'`: per Daily's
  // type contract `track` is only present when the state is playable, and
  // `persistentTrack` is the not-guaranteed-playable sibling. Don't "optimise" this
  // to persistentTrack, it would hand PiP an unplayable reference.
  //
  // This recomputes on every participant-updated (audio levels etc.) but returns the
  // same MediaStreamTrack reference when the subject hasn't changed, so the effect
  // below stays stable and iOS gets a chance to settle the PiP session.
  const pipVideoTrack = useMemo(() => {
    const remotes = Object.values(participants).filter(p => !p.local);

    if (remotes.length === 0) {
      return localParticipant?.tracks.video.track ?? null;
    }

    for (const id of speakerHistory) {
      const track = remotes.find(r => r.session_id === id)?.tracks.video.track;
      if (track) return track;
    }
    for (const p of remotes) {
      if (p.tracks.video.track) return p.tracks.video.track;
    }
    return null;
  }, [participants, localParticipant, speakerHistory]);

  // RTCPIPView takes a streamURL, not a track, so wrap the chosen track in an
  // RTCMediaStream. Audio is deliberately excluded: RTCVideoView only ever reads
  // videoTracks.firstObject (RTCVideoViewManager.m:363), so including the audio track
  // bought nothing and churned the stream URL on every audio-level update. Remote
  // audio is unaffected, it rides the DailyMediaView tiles, which stay mounted.
  const pipTrackRef = useRef<MediaStreamTrack | null>(null);
  const pipStreamRef = useRef<RTCMediaStream | null>(null);
  const pipClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pipStreamURL, setPipStreamURL] = useState<string | undefined>(undefined);

  useEffect(() => {
    // streamURL has no consumer on Android; skip the native stream churn entirely.
    if (Platform.OS !== 'ios') return;

    if (pipClearTimerRef.current) {
      clearTimeout(pipClearTimerRef.current);
      pipClearTimerRef.current = null;
    }

    if (pipVideoTrack) {
      // Same subject as last time, nothing to rebuild. This matters because the
      // effect also depends on appState: without it, every foreground transition
      // would issue a fresh streamURL exactly as AVKit is tearing PiP down. It also
      // makes a track that drops and returns as the same object a no-op beyond
      // cancelling the pending clear above.
      if (pipTrackRef.current === pipVideoTrack) return;

      const stream = new RTCMediaStream([pipVideoTrack as any]);
      const previous = pipStreamRef.current;
      pipTrackRef.current = pipVideoTrack;
      pipStreamRef.current = stream;
      setPipStreamURL(stream.toURL());
      // release(false): these tracks are Daily-owned. release() defaults to
      // releaseTracks = true, which would dispose the participant's video everywhere.
      (previous as any)?.release?.(false);
      return;
    }

    if (!pipStreamRef.current) return;

    // Backgrounded with no track: hold. Setting streamURL on a track-less stream is a
    // native no-op (RTCVideoViewManager.m:363), so holding keeps the last frame in the
    // window. That's the degradation path if multitasking camera access isn't actually
    // honoured on this device, a frozen self-image rather than a black rectangle.
    // Do not remove this guard without re-reading the design section of this brief.
    if (appState !== 'active') return;

    // Foregrounded with no track: the user toggled video off, or we just came back
    // from a hold. Clear after a beat to absorb a transient drop during a camera flip
    // or rejoin.
    pipClearTimerRef.current = setTimeout(() => {
      (pipStreamRef.current as any)?.release?.(false);
      pipStreamRef.current = null;
      pipTrackRef.current = null;
      setPipStreamURL(undefined);
      pipClearTimerRef.current = null;
    }, 1500);
  }, [pipVideoTrack, appState]);

  useEffect(() => {
    return () => {
      if (pipClearTimerRef.current) clearTimeout(pipClearTimerRef.current);
      (pipStreamRef.current as any)?.release?.(false);
    };
  }, []);

  // ─── PiP drag ────────────────────────────────────────────────────────────────

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const insets = useSafeAreaInsets();
  // Stable for the lifetime of a call: secondsLeft is seeded once from route
  // params and, when non-null, decrements to 0 but never returns to null.
  const hasTimer = secondsLeft !== null;

  // The PanResponder below is created once via useRef, so it cannot close over
  // these values, it reads them through a ref at release time. Same indirection
  // the file already uses for toggleCameraRef.
  // Refreshed during render rather than in an effect: an effect that repositions
  // on inset change would fight a future Android system-PiP path, where the
  // activity shrinks and insets drop to zero, and the self-view would jump on
  // both entry and restore.
  const pipBounds = computePipBounds(insets, hasTimer, screenWidth, screenHeight);
  const pipBoundsRef = useRef(pipBounds);
  pipBoundsRef.current = pipBounds;

  const pipPosition = useRef(
    new Animated.ValueXY({ x: pipBounds.maxX, y: pipBounds.minY })
  ).current;
  const pipOffset = useRef({ x: pipBounds.maxX, y: pipBounds.minY });

  const pipPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pipPosition.setOffset({ x: pipOffset.current.x, y: pipOffset.current.y });
        pipPosition.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pipPosition.x, dy: pipPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        pipPosition.flattenOffset();
        const b = pipBoundsRef.current;
        const rawX = pipOffset.current.x + gesture.dx;
        const rawY = pipOffset.current.y + gesture.dy;
        const clampedX = Math.max(b.minX, Math.min(rawX, b.maxX));
        const clampedY = Math.max(b.minY, Math.min(rawY, b.maxY));
        pipOffset.current = { x: clampedX, y: clampedY };
        Animated.spring(pipPosition, {
          toValue: { x: clampedX, y: clampedY },
          useNativeDriver: false,
          bounciness: 4,
        }).start();
        // Treat small movements as a tap → flip camera
        if (Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5) {
          toggleCameraRef.current();
        }
      },
    })
  ).current;

  // ─── Tile renderer ───────────────────────────────────────────────────────────

  const renderTile = (p: DailyParticipant, tileStyle?: object) => (
    <View key={p.session_id} style={[styles.tile, tileStyle]}>
      <DailyMediaView
        videoTrack={(p.tracks.video.state === 'playable' ? p.tracks.video.track : null) || null}
        audioTrack={(p.tracks.audio.state === 'playable' ? p.tracks.audio.track : null) || null}
        mirror={false}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );

  // ─── Layout renderer ─────────────────────────────────────────────────────────

  const renderLayout = () => {
    const count = visibleRemote.length;

    if (count === 0) {
      return (
        <View style={styles.waitingContainer}>
          <Ionicons name="radio-button-off" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.waitingText}>Waiting for others to join…</Text>
        </View>
      );
    }

    // 1 remote: full-screen, no border radius so corners don't clip and reveal the background
    if (count === 1) {
      return renderTile(visibleRemote[0], { ...StyleSheet.absoluteFillObject, borderRadius: 0 });
    }

    // 2–3 remote: stacked vertical rows
    if (count <= 3) {
      return (
        <View style={styles.grid}>
          {visibleRemote.map(p => renderTile(p, { flex: 1 }))}
        </View>
      );
    }

    // 4 remote: 2×2 grid
    if (count === 4) {
      return (
        <View style={styles.grid}>
          <View style={styles.row}>
            {renderTile(visibleRemote[0], { flex: 1 })}
            {renderTile(visibleRemote[1], { flex: 1 })}
          </View>
          <View style={styles.row}>
            {renderTile(visibleRemote[2], { flex: 1 })}
            {renderTile(visibleRemote[3], { flex: 1 })}
          </View>
        </View>
      );
    }

    // 5 remote: 2×3, last slot empty
    if (count === 5) {
      return (
        <View style={styles.grid}>
          <View style={styles.row}>
            {renderTile(visibleRemote[0], { flex: 1 })}
            {renderTile(visibleRemote[1], { flex: 1 })}
          </View>
          <View style={styles.row}>
            {renderTile(visibleRemote[2], { flex: 1 })}
            {renderTile(visibleRemote[3], { flex: 1 })}
          </View>
          <View style={styles.row}>
            {renderTile(visibleRemote[4], { flex: 1 })}
            <View style={{ flex: 1, marginLeft: 4 }} />
          </View>
        </View>
      );
    }

    // 6 remote: full 2×3 grid
    if (count === 6) {
      return (
        <View style={styles.grid}>
          <View style={styles.row}>
            {renderTile(visibleRemote[0], { flex: 1 })}
            {renderTile(visibleRemote[1], { flex: 1 })}
          </View>
          <View style={styles.row}>
            {renderTile(visibleRemote[2], { flex: 1 })}
            {renderTile(visibleRemote[3], { flex: 1 })}
          </View>
          <View style={styles.row}>
            {renderTile(visibleRemote[4], { flex: 1 })}
            {renderTile(visibleRemote[5], { flex: 1 })}
          </View>
        </View>
      );
    }

    // 7–9 remote: large layout
    // 2 featured tiles (left column, stacked)
    // up to 4 thumbnails (right strip, stacked)
    // up to 3 thumbnails (bottom strip, side-by-side)
    const featured = visibleRemote.slice(0, 2);
    const rightStrip = visibleRemote.slice(2, 6);
    const bottomStrip = visibleRemote.slice(6, 9);

    return (
      <View style={styles.largeLayout}>
        {/* Upper section: featured + right strip */}
        <View style={styles.largeTop}>
          <View style={styles.featuredArea}>
            {featured.map(p => renderTile(p, { flex: 1 }))}
          </View>
          <View style={styles.rightStrip}>
            {rightStrip.map(p => renderTile(p, { flex: 1 }))}
          </View>
        </View>
        {/* Bottom thumbnail strip */}
        {bottomStrip.length > 0 && (
          <View style={styles.bottomStrip}>
            {bottomStrip.map(p => renderTile(p, { flex: 1 }))}
          </View>
        )}
      </View>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Call video is always on black; the app-level StatusBar follows the theme
          and would render dark glyphs on black in light mode once the screen goes
          full-screen. expo-status-bar merges mounted StatusBars in mount order, so
          this wins while the call is up and reverts on unmount. */}
      <StatusBar style="light" />

      {/* Video fills the entire screen */}
      <View style={StyleSheet.absoluteFill}>
        {renderLayout()}
      </View>

      {/* iOS system PiP source: a 1×1 invisible anchor for AVKit's PIPController.
          AVKit renders the real floating window from an
          AVPictureInPictureVideoCallViewController fed by RTCPIPView's
          SampleBufferVideoCallView, so this element's on-screen size is irrelevant.

          MOUNTED UNCONDITIONALLY for the life of the call: unmounting deallocs the
          native PIPController (PIPController.m:18) and kills the window mid-call.
          streamURL is the only thing that changes: the native setter swaps the
          renderer in place (PIPController.m:86), which is what makes speaker
          switching work with no native code of our own.

          The inline iosPIP literal is safe: RN deep-diffs plain object props, and
          setPIPOptions is idempotent (RTCVideoViewManager.m:194) even if it weren't.
          preferredSize is a 9:16 ratio hint. Left unset, AVKit sizes the window from
          the video's own dimensions and it would resize on every speaker change.

          ORDERING (see the in-call UX stage): the full-screen background tap target
          added at stage 6 is a later sibling than this element, so it paints above
          this 1×1 view and the bottom-right corner stays tappable. Do not move this
          element below it. */}
      {Platform.OS === 'ios' && (
        <RTCPIPView
          streamURL={pipStreamURL}
          iosPIP={{
            startAutomatically: true,
            stopAutomatically: true,
            preferredSize: { width: 270, height: 480 },
          }}
          style={{ position: 'absolute', width: 1, height: 1, bottom: 0, right: 0 }}
        />
      )}

      {/* Background tap target. Above the video layer AND above the 1x1 RTCPIPView
          anchor, below the self-view (zIndex 10) and the controls (zIndex 20), so taps
          on those are consumed by their own responders and never reach here.
          accessible={false} keeps a full-screen button out of the VoiceOver rotor;
          hiding is suppressed entirely while a screen reader is active. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessible={false}
        onPress={() => {
          if (!screenReaderOn) setControlsVisible(v => !v);
        }}
      />

      {/* Local PiP (draggable) */}
      {localParticipant && videoEnabled && (
        <Animated.View
          style={[styles.localPipWrapper, { left: pipPosition.x, top: pipPosition.y }]}
          {...pipPanResponder.panHandlers}
        >
          <Animated.View
            style={{
              flex: 1,
              transform: [
                { perspective: 800 },
                {
                  rotateY: flipAnim.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ['-90deg', '0deg', '90deg'],
                  }),
                },
              ],
            }}
          >
            <View style={styles.localVideoContainer}>
              <DailyMediaView
                key={`local-video-${localVideoKey}`}
                videoTrack={isChangingCamera ? null : (localParticipant.tracks.video.track ?? null)}
                audioTrack={null}
                mirror={localVideoMirrorRef.current}
                style={styles.localVideo}
              />
            </View>
          </Animated.View>

          {/* Flip affordance. Mounted on localPipWrapper, which carries no transform,
              so it stays upright and tappable through the 3D flip. hitSlop is capped at
              6 so the 44pt target lands exactly on the wrapper's edges: Android does not
              dispatch touches outside a parent's bounds, so overhanging hitSlop would
              work on iOS and silently fail on Android. */}
          <Animated.View
            style={[styles.pipFlipButton, { opacity: controlsOpacity }]}
            pointerEvents={controlsVisible ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={styles.pipFlipButtonInner}
              onPress={() => {
                // toggleCamera rethrows on failure. The existing call site in
                // onPanResponderRelease leaves that rejection unhandled; do not add a second.
                toggleCamera().catch(e => console.warn('[CameraSwitch] flip failed', e));
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Switch camera"
            >
              <Ionicons name="camera-reverse" size={16} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* Countdown timer */}
      {secondsLeft !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.timerContainer,
            { bottom: insets.bottom + 114 },
            secondsLeft <= 60 && styles.timerContainerUrgent,
          ]}
        >
          <Text style={[styles.timerText, secondsLeft <= 60 && styles.timerTextUrgent]}>
            {formatTime(secondsLeft)}
          </Text>
        </View>
      )}

      {/* Controls — floating buttons, no background */}
      <Animated.View
        style={[styles.controlsWrapper, { opacity: controlsOpacity }]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        <View style={[styles.controlsRow, { paddingBottom: insets.bottom + 18 }]}>
          <TouchableOpacity
            style={[styles.controlButton, !audioEnabled && styles.controlButtonOff]}
            onPress={toggleAudio}
            activeOpacity={0.8}
          >
            <Ionicons name={audioEnabled ? 'mic' : 'mic-off'} size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endCallButton}
            onPress={() => endCall(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.endCallText}>Leave</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, !videoEnabled && styles.controlButtonOff]}
            onPress={toggleVideo}
            activeOpacity={0.8}
          >
            <Ionicons name={videoEnabled ? 'videocam' : 'videocam-off'} size={22} color="#fff" />
          </TouchableOpacity>

        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },


  // ─── Shared tile ────────────────────────────────────────────────────────────
  tile: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#000',
  },

  // ─── Small grid layouts ─────────────────────────────────────────────────────
  // flex column by default; tiles passed with flex: 1 fill rows
  grid: {
    flex: 1,
    gap: 4,
    padding: 4,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },

  // ─── Large layout (7–9 remote) ──────────────────────────────────────────────
  largeLayout: {
    flex: 1,
    gap: 4,
    padding: 4,
  },
  // Top section takes ~75% of the height
  largeTop: {
    flex: 3,
    flexDirection: 'row',
    gap: 4,
  },
  // Left column: 2 featured tiles stacked
  featuredArea: {
    flex: 1,
    gap: 4,
  },
  // Right strip: ~23% width, up to 4 thumbnails stacked
  rightStrip: {
    width: '23%',
    gap: 4,
  },
  // Bottom strip: ~25% of height, thumbnails side-by-side
  bottomStrip: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },

  // ─── Waiting ────────────────────────────────────────────────────────────────
  waitingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  waitingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '500',
  },

  // ─── Local PiP ──────────────────────────────────────────────────────────────
  // Outer: absolute position + drag target (no visual styling, no transform)
  localPipWrapper: {
    position: 'absolute',
    width: 110,
    height: 150,
    zIndex: 10,
  },
  // Inner: visual shell — kept on a separate layer from the 3D transform so
  // overflow clipping and borderRadius don't interact with the rotation matrix
  localVideoContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  localVideo: {
    flex: 1,
  },
  pipFlipButton: {
    position: 'absolute',
    right: 6,
    bottom: 6,
  },
  // Same glass treatment as controlButton, scaled for a 110x150 self-view.
  pipFlipButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },

  // ─── Timer ──────────────────────────────────────────────────────────────────
  timerContainer: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  timerContainerUrgent: {
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  timerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timerTextUrgent: {
    color: '#FCA5A5',
  },

  // ─── Controls (floating liquid glass buttons) ────────────────────────────────
  controlsWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingTop: 16,
    paddingHorizontal: 24,
    // No background — buttons float over the video
  },
  // Liquid glass: semi-transparent white tint, specular top border, inner glow
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    // Subtle glow to simulate glass refraction
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  controlButtonOff: {
    backgroundColor: 'rgba(220,38,38,0.62)',
    borderColor: 'rgba(255,120,120,0.45)',
    shadowColor: '#DC2626',
  },
  // Leave pill — red liquid glass
  endCallButton: {
    backgroundColor: 'rgba(220,38,38,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,120,120,0.45)',
    paddingHorizontal: 34,
    paddingVertical: 18,
    borderRadius: 999,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  endCallText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

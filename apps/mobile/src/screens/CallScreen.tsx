import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Daily, { DailyCall, DailyParticipant, DailyEventObject } from '@daily-co/react-native-daily-js';
import { DailyMediaView } from '@daily-co/react-native-daily-js';

import { createAuthenticatedApiClient } from '../utils/apiClient';

type CallRouteProp = RouteProp<RootStackParamList, 'Call'>;
type CallNavigationProp = StackNavigationProp<RootStackParamList, 'Call'>;

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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    endsAt ? Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000)) : null
  );

  useEffect(() => {
    initializeCall();

    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.destroy();
      }
    };
  }, []);

  // Keep endCallRef current so the interval always calls the latest version
  useEffect(() => {
    endCallRef.current = endCall;
  });

  // Countdown timer for scheduled calls — runs the interval
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft === null]); // only restart if endsAt appears/disappears

  // Trigger leave when countdown reaches 0 — pass expired=true so the server
  // ends the call for all remaining participants, not just this user
  useEffect(() => {
    if (secondsLeft === 0) {
      endCallRef.current(true);
    }
  }, [secondsLeft]);

  const initializeCall = async () => {
    try {
      // Create Daily call object
      const callObject = Daily.createCallObject();
      callObjectRef.current = callObject;

      // Set up event listeners
      callObject
        .on('joined-meeting', handleJoinedMeeting)
        .on('participant-joined', handleParticipantJoined)
        .on('participant-updated', handleParticipantUpdated)
        .on('participant-left', handleParticipantLeft)
        .on('left-meeting', handleLeftMeeting)
        .on('error', handleError);

      // Join the call
      await callObject.join({ url: roomUrl, token });
    } catch (error) {
      console.error('Failed to join call:', error);
      navigation.goBack();
    }
  };

  const handleJoinedMeeting = () => {
    console.log('Joined meeting');
    if (callObjectRef.current) {
      const participants = callObjectRef.current.participants();
      setParticipants(participants);
    }
  };

  const handleParticipantJoined = (event: DailyEventObject<'participant-joined'>) => {
    console.log('Participant joined:', event.participant);
    setParticipants((prev) => ({
      ...prev,
      [event.participant.session_id]: event.participant,
    }));
  };

  const handleParticipantUpdated = (event: DailyEventObject<'participant-updated'>) => {
    setParticipants((prev) => ({
      ...prev,
      [event.participant.session_id]: event.participant,
    }));
  };

  const handleParticipantLeft = (event: DailyEventObject<'participant-left'>) => {
    console.log('Participant left:', event.participant);
    setParticipants((prev) => {
      const { [event.participant.session_id]: removed, ...rest } = prev;
      return rest;
    });
  };

  const handleLeftMeeting = () => {
    console.log('Left meeting');
    if (!hasLeftRef.current) {
      hasLeftRef.current = true;
      navigation.goBack();
    }
  };

  const handleError = (event: DailyEventObject<'error'>) => {
    console.error('Daily error:', event.error);
    // Navigate back on fatal errors (e.g. room was deleted by the server)
    if (!hasLeftRef.current) {
      hasLeftRef.current = true;
      navigation.goBack();
    }
  };

  const endCall = async (expired = false) => {
    try {
      const client = await createAuthenticatedApiClient();
      if (expired) {
        // Timer expired: end the call for all participants and delete the room.
        // The server deletion will fire a left-meeting event on all clients,
        // so navigation is handled by handleLeftMeeting.
        await client.post(`/groups/${groupId}/calls/${callId}/end`, {});
      } else {
        // User manually left: just record their departure
        await client.post(`/groups/${groupId}/calls/${callId}/leave`, {});
      }
    } catch (error) {
      console.error('Failed to notify backend:', error);
    }

    if (callObjectRef.current) {
      await callObjectRef.current.leave();
    }
  };

  const toggleVideo = () => {
    if (callObjectRef.current) {
      callObjectRef.current.setLocalVideo(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    if (callObjectRef.current) {
      callObjectRef.current.setLocalAudio(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const remoteParticipants = Object.values(participants).filter(p => !p.local);
  const localParticipant = Object.values(participants).find(p => p.local);

  return (
    <View style={styles.container}>
      {/* Remote participants */}
      <View style={styles.participantsContainer}>
        {remoteParticipants.length === 0 ? (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>Waiting for others to join...</Text>
          </View>
        ) : (
          remoteParticipants.map((participant) => (
            <View key={participant.session_id} style={styles.participantView}>
              <DailyMediaView
                videoTrack={(participant.tracks.video.state === 'playable' ? participant.tracks.video.track : null) || null}
                audioTrack={(participant.tracks.audio.state === 'playable' ? participant.tracks.audio.track : null) || null}
                mirror={false}
                style={styles.participantVideo}
              />
            </View>
          ))
        )}
      </View>

      {/* Local video (self view) */}
      {localParticipant && (
        <View style={styles.localVideoContainer}>
          <DailyMediaView
            videoTrack={(localParticipant.tracks.video.state === 'playable' ? localParticipant.tracks.video.track : null) || null}
            audioTrack={null}
            mirror={true}
            style={styles.localVideo}
          />
        </View>
      )}

      {/* Countdown timer for scheduled calls */}
      {secondsLeft !== null && (
        <View style={styles.timerContainer}>
          <Text style={[styles.timerText, secondsLeft <= 60 && styles.timerTextUrgent]}>
            {formatTime(secondsLeft)}
          </Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, !audioEnabled && styles.controlButtonOff]}
          onPress={toggleAudio}
        >
          <Text style={styles.controlText}>{audioEnabled ? '🎤' : '🔇'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endCallButton} onPress={() => endCall(false)}>
          <Text style={styles.endCallText}>Leave Call</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, !videoEnabled && styles.controlButtonOff]}
          onPress={toggleVideo}
        >
          <Text style={styles.controlText}>{videoEnabled ? '📹' : '🚫'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 10,
  },
  localVideo: {
    flex: 1,
  },
  participantsContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantView: {
    width: '100%',
    height: '50%',
  },
  participantVideo: {
    flex: 1,
  },
  waitingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingText: {
    color: '#fff',
    fontSize: 18,
  },
  placeholderText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonOff: {
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
  },
  controlText: {
    fontSize: 24,
  },
  endCallButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  endCallText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timerContainer: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  timerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timerTextUrgent: {
    color: '#FF3B30',
  },
});

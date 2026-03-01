import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Daily, { DailyCall, DailyParticipant, DailyEventObject } from '@daily-co/react-native-daily-js';

import { createAuthenticatedApiClient } from '../utils/apiClient';

type CallRouteProp = RouteProp<RootStackParamList, 'Call'>;
type CallNavigationProp = StackNavigationProp<RootStackParamList, 'Call'>;

export default function CallScreen() {
  const route = useRoute<CallRouteProp>();
  const navigation = useNavigation<CallNavigationProp>();
  const { callId, groupId, roomUrl, token } = route.params;

  const callObjectRef = useRef<DailyCall | null>(null);
  const [participants, setParticipants] = useState<{ [id: string]: DailyParticipant }>({});
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    initializeCall();

    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.destroy();
      }
    };
  }, []);

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
    navigation.goBack();
  };

  const handleError = (event: DailyEventObject<'error'>) => {
    console.error('Daily error:', event.error);
  };

  const endCall = async () => {
    try {
      // Notify backend
      const client = await createAuthenticatedApiClient();
      await client.post(`/groups/${groupId}/calls/${callId}/leave`, {});
    } catch (error) {
      console.error('Failed to notify backend:', error);
    }

    if (callObjectRef.current) {
      await callObjectRef.current.leave();
    }
    navigation.goBack();
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

  const remoteParticipants = Object.values(participants).filter(p => !p.local);

  return (
    <View style={styles.container}>
      {/* Remote participants */}
      <View style={styles.participantsContainer}>
        {remoteParticipants.length === 0 ? (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>Waiting for others to join...</Text>
          </View>
        ) : (
          <Text style={styles.placeholderText}>
            {remoteParticipants.length} participant{remoteParticipants.length !== 1 ? 's' : ''} in call
          </Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, !audioEnabled && styles.controlButtonOff]}
          onPress={toggleAudio}
        >
          <Text style={styles.controlText}>{audioEnabled ? '🎤' : '🔇'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
          <Text style={styles.endCallText}>End Call</Text>
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
});

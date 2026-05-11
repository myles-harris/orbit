import React, { useState, useRef, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTutorial } from '../context/TutorialContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme';
import { TUTORIAL_STEPS } from '../data/tutorialSteps';

const TOTAL_STEPS = TUTORIAL_STEPS.length;
const LAST_STEP = TOTAL_STEPS - 1;

export default function TutorialModal() {
  const { isVisible, isFirstRun, dismissTutorial, completeTutorial } = useTutorial();
  const { theme: { colors, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors]);

  const [currentStep, setCurrentStep] = useState(0);
  const anim = useRef(new Animated.Value(1)).current;

  // Reset to first step whenever the modal becomes visible
  const prevVisible = useRef(false);
  if (isVisible && !prevVisible.current) {
    setCurrentStep(0);
    anim.setValue(1);
  }
  prevVisible.current = isVisible;

  const stepTo = (next: number) => {
    Animated.timing(anim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setCurrentStep(next);
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const advance = () => {
    if (currentStep < LAST_STEP) {
      stepTo(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const back = () => {
    if (currentStep > 0) stepTo(currentStep - 1);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60) dismissTutorial();
      },
    })
  ).current;

  const step = TUTORIAL_STEPS[currentStep];
  const isLast = currentStep === LAST_STEP;

  const animStyle = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  const stepLabel =
    step.stepNumber != null
      ? `${String(step.stepNumber).padStart(2, '0')} / 08`
      : 'intro';

  const rightCtaLabel = currentStep === 0
    ? "Let's go"
    : isLast
      ? isFirstRun ? 'Get started' : 'Done'
      : 'Next';

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissTutorial}
    >
      <View style={styles.overlay} {...panResponder.panHandlers}>
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          <View style={styles.sheet}>
            {/* Drag handle */}
            <View style={styles.dragHandle} />

            {/* Top row: step counter + skip/close */}
            <View style={styles.topRow}>
              <Text style={styles.stepCounter}>{stepLabel}</Text>
              {isFirstRun ? (
                <TouchableOpacity onPress={completeTutorial} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={dismissTutorial} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Animated step content */}
            <Animated.View style={[styles.contentArea, animStyle]}>
              {/* Illustration */}
              <View style={styles.illustration}>
                <Ionicons name={step.icon as any} size={48} color={colors.primary} />
              </View>

              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.body}>{step.body}</Text>
            </Animated.View>

            {/* Dot indicators */}
            <View style={styles.dots}>
              {TUTORIAL_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === currentStep ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>

            {/* Navigation buttons */}
            <View style={styles.buttonRow}>
              {currentStep > 0 ? (
                <TouchableOpacity onPress={back} style={styles.backButton} activeOpacity={0.7}>
                  <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.backButton} />
              )}

              <TouchableOpacity
                onPress={advance}
                style={[styles.nextButton, isLast && styles.nextButtonCta]}
                activeOpacity={0.8}
              >
                <Text style={styles.nextButtonText}>{rightCtaLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function makeStyles(colors: any, shadow: any) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    safeArea: {
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.xxxl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    stepCounter: {
      fontFamily: 'RobotoMono_500Medium',
      fontSize: 11,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    skipText: {
      fontFamily: 'RobotoMono_700Bold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    contentArea: {
      minHeight: 220,
    },
    illustration: {
      width: 80,
      height: 80,
      borderRadius: radius.xl,
      backgroundColor: colors.primaryLighter,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: colors.primaryLight,
    },
    title: {
      fontFamily: 'Roboto_700Bold',
      fontSize: 26,
      lineHeight: 32,
      color: colors.text,
      letterSpacing: -0.5,
      marginBottom: spacing.md,
    },
    body: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.xxl,
      marginBottom: spacing.lg,
      gap: 6,
    },
    dot: {
      height: 6,
      borderRadius: 3,
    },
    dotActive: {
      width: 20,
      backgroundColor: colors.primary,
    },
    dotInactive: {
      width: 6,
      backgroundColor: colors.border,
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    backButton: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      minWidth: 72,
    },
    backButtonText: {
      fontFamily: 'RobotoMono_500Medium',
      fontSize: 14,
      color: colors.textSecondary,
    },
    nextButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      ...shadow.md,
    },
    nextButtonCta: {
      ...shadow.lg,
    },
    nextButtonText: {
      fontFamily: 'Roboto_700Bold',
      fontSize: 15,
      color: '#fff',
    },
  });
}

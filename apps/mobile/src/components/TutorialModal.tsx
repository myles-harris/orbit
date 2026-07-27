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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTutorial } from '../context/TutorialContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme';
import { TUTORIAL_STEPS } from '../data/tutorialSteps';
import TutorialDemo from './TutorialDemo';

const TOTAL_STEPS = TUTORIAL_STEPS.length;
const LAST_STEP = TOTAL_STEPS - 1;

export default function TutorialModal() {
  const { isVisible, isFirstRun, dismissTutorial, completeTutorial } = useTutorial();
  const { theme: { colors, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

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
    if (currentStep < LAST_STEP) stepTo(currentStep + 1);
    else completeTutorial();
  };

  const back = () => {
    if (currentStep > 0) stepTo(currentStep - 1);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) dismissTutorial();
      },
    }),
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

  const rightCtaLabel =
    currentStep === 0
      ? "Let's go"
      : isLast
        ? isFirstRun ? 'Get started' : 'Done'
        : 'Next';

  return (
    <Modal
      visible={isVisible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismissTutorial}
    >
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>

          {/* ── Grabber + header ────────────────────────────────────── */}
          <View style={styles.header} {...panResponder.panHandlers}>
            <View style={styles.dragHandle} />
            <View style={styles.topRow}>
              <Text style={styles.stepCounter}>{stepLabel}</Text>
              {isFirstRun ? (
                <TouchableOpacity
                  onPress={completeTutorial}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={dismissTutorial}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Scrollable content ──────────────────────────────────── */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Animated.View key={step.id} style={[styles.contentArea, animStyle]}>
              {/* Icon */}
              <View style={styles.iconWrap}>
                <Ionicons name={step.icon as any} size={28} color={colors.primary} />
              </View>

              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.body}>{step.body}</Text>

              {/* Demo zone */}
              <View style={styles.demoZone}>
                <TutorialDemo kind={step.demo} onTap={advance} />
              </View>
            </Animated.View>
          </ScrollView>

          {/* ── Footer: dots + buttons ──────────────────────────────── */}
          <View style={styles.footer}>
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
              <TouchableOpacity
                onPress={back}
                style={styles.backButton}
                activeOpacity={currentStep === 0 ? 1 : 0.7}
              >
                <Text style={[styles.backButtonText, currentStep === 0 && styles.backButtonDisabled]}>
                  ← Back
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={advance}
                style={[styles.nextButton, isLast && styles.nextButtonCta]}
                activeOpacity={0.8}
              >
                {isLast && isFirstRun && (
                  <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginRight: 6 }} />
                )}
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
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    safeArea: {
      flex: 1,
    },
    header: {
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.sm,
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(230,221,200,0.2)',
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.lg,
    },
    contentArea: {
      paddingTop: spacing.lg,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: radius.lg,
      backgroundColor: colors.primaryLighter,
      borderWidth: 1,
      borderColor: colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
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
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
    },
    demoZone: {
      width: '100%',
    },
    footer: {
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLight,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
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
      gap: spacing.md,
    },
    backButton: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      minWidth: 72,
    },
    backButtonText: {
      fontFamily: 'RobotoMono_500Medium',
      fontSize: 14,
      color: colors.textSecondary,
    },
    backButtonDisabled: {
      color: 'rgba(230,221,200,0.2)',
    },
    nextButton: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      justifyContent: 'center',
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

export interface TutorialStep {
  id: string;
  stepNumber: number | null; // null = welcome step (no counter shown)
  icon: string;              // Ionicons name
  title: string;
  body: string;
  demo: string;              // TutorialDemo kind
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    stepNumber: null,
    icon: 'planet-outline',
    title: 'Welcome to Orbit',
    body: 'Orbit keeps your group in sync with scheduled video calls that happen automatically — no planning required.',
    demo: 'welcome',
  },
  {
    id: 'create',
    stepNumber: 1,
    icon: 'add-circle-outline',
    title: 'Form a group',
    body: 'Tap the + button on the home screen to create a group. Give it a name and you\'re ready to set a schedule.',
    demo: 'create',
  },
  {
    id: 'configure',
    stepNumber: 2,
    icon: 'time-outline',
    title: 'Set a schedule',
    body: 'Choose how often you want to meet, how long each call should be, and the time window when Orbit can fire a call.',
    demo: 'configure',
  },
  {
    id: 'home',
    stepNumber: 3,
    icon: 'grid-outline',
    title: 'Your groups',
    body: 'The home screen shows all your groups as cards. Use the filter tabs to view by Daily, Weekly, or pending Invited groups.',
    demo: 'home',
  },
  {
    id: 'invite',
    stepNumber: 4,
    icon: 'person-add-outline',
    title: 'Add people',
    body: 'Open any group and tap + Invite to add members. They\'ll receive an invitation they can accept or decline.',
    demo: 'invite',
  },
  {
    id: 'invited',
    stepNumber: 5,
    icon: 'mail-outline',
    title: 'Accept invitations',
    body: 'When someone invites you to a group, it appears under the Invited filter on the home screen. Tap to accept or decline.',
    demo: 'invited',
  },
  {
    id: 'random',
    stepNumber: 6,
    icon: 'notifications-outline',
    title: 'Scheduled calls',
    body: 'At a random time within your configured window, Orbit fires a call. Tap the push notification to drop into your group.',
    demo: 'random',
  },
  {
    id: 'spontaneous',
    stepNumber: 7,
    icon: 'videocam-outline',
    title: 'Start a call anytime',
    body: 'Don\'t want to wait? Open any group and tap Start Call Now to kick off an immediate call for all members.',
    demo: 'spontaneous',
  },
  {
    id: 'owner',
    stepNumber: 8,
    icon: 'shield-checkmark-outline',
    title: 'Owner controls',
    body: 'Only the group owner can edit the schedule, rename the group, remove members, or transfer ownership.',
    demo: 'owner',
  },
];

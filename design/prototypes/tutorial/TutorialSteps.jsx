// Tutorial step definitions — matches apps/mobile/src/data/tutorialSteps.ts
// Two copy tone variants (playful / crisp) for the tweaks panel.

const TUTORIAL_STEPS = [
  {
    id: 'welcome', num: null, icon: 'planet-outline',
    titlePlayful: 'welcome to orbit.',
    titleCrisp:   'Welcome to Orbit.',
    bodyPlayful: 'Tiny rituals that keep your people close. Eight quick stops to learn the loop.',
    bodyCrisp:   'Orbit is a group video call app. This 8-step tour covers the core flow.',
    demo: 'welcome',
  },
  {
    id: 'create', num: 1, icon: 'add-circle-outline',
    titlePlayful: 'Form an orbit.',
    titleCrisp:   'Create a group.',
    bodyPlayful: 'Tap the (+) to gather a new circle — roommates, cousins, the climbing crew. Anyone you want to stay in orbit with.',
    bodyCrisp:   'Tap the + button on the home screen to create a new group.',
    demo: 'create',
  },
  {
    id: 'configure', num: 2, icon: 'options-outline',
    titlePlayful: 'Set the rhythm.',
    titleCrisp:   'Configure cadence.',
    bodyPlayful: 'Daily or weekly? How long per call? Pick the rhythm and Orbit handles the rest.',
    bodyCrisp:   'Choose a frequency (daily or weekly), calls per period, and call duration.',
    demo: 'configure',
  },
  {
    id: 'home', num: 3, icon: 'grid-outline',
    titlePlayful: 'Your orbits, all together.',
    titleCrisp:   'Your groups on Home.',
    bodyPlayful: 'Every circle gets a card. Use the filter tabs to browse by Daily, Weekly, or pending invitations.',
    bodyCrisp:   'The home screen shows all your groups. Filter by Daily, Weekly, or Invited.',
    demo: 'home',
  },
  {
    id: 'invite', num: 4, icon: 'person-add-outline',
    titlePlayful: 'Pull people in.',
    titleCrisp:   'Invite members.',
    bodyPlayful: "Open any group and tap + Invite. They'll get a nudge to join the orbit.",
    bodyCrisp:   'Open a group and tap + Invite to send an invitation.',
    demo: 'invite',
  },
  {
    id: 'invited', num: 5, icon: 'mail-unread-outline',
    titlePlayful: 'Caught in the pull.',
    titleCrisp:   'Accept invitations.',
    bodyPlayful: 'On the receiving end? Invitations land in the Invited tab on Home. Accept to join.',
    bodyCrisp:   'Incoming invitations appear in the Invited filter. Tap to accept or decline.',
    demo: 'invited',
  },
  {
    id: 'random-call', num: 6, icon: 'notifications-outline',
    titlePlayful: 'A surprise alignment.',
    titleCrisp:   'Scheduled calls.',
    bodyPlayful: 'Orbit picks a random moment in your window and rings everyone at once. Tap the notification to drop in.',
    bodyCrisp:   'Calls fire at a random time within your group\'s schedule. Tap the notification to join.',
    demo: 'random',
  },
  {
    id: 'spontaneous', num: 7, icon: 'flash-outline',
    titlePlayful: 'Or call on a whim.',
    titleCrisp:   'Start a call anytime.',
    bodyPlayful: "Feeling it? Open a group and tap Start Call Now — everyone gets pinged immediately.",
    bodyCrisp:   'Tap Start Call Now inside any group to start an immediate call for all members.',
    demo: 'spontaneous',
  },
  {
    id: 'owner', num: 8, icon: 'shield-checkmark-outline',
    titlePlayful: 'Owners steer the orbit.',
    titleCrisp:   'Owner controls.',
    bodyPlayful: "Only the group owner can change the schedule, rename the group, or remove members.",
    bodyCrisp:   'Group owners are the only ones who can edit settings, remove members, or transfer ownership.',
    demo: 'owner',
  },
];

window.TUTORIAL_STEPS = TUTORIAL_STEPS;

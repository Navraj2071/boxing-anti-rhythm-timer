# Project Requirements: Random Boxing Punch Timer

## 1. Project Overview

Build a **client-side Next.js web application** that helps boxers train their reaction speed, rhythm, and punch execution by listening to randomly timed audio cues.

During boxing training, athletes often develop predictable punching rhythms. This application should challenge that predictability by playing distinct audio cues at randomized intervals. Each cue represents a specific punch, and the boxer must execute the corresponding punch as soon as they hear it.

The application acts as a virtual boxing trainer, providing unpredictable but appropriately paced punch instructions.

## 2. Technical Requirements

- Build the application using Next.js.
- The application must operate entirely on the client side.
- Do not require a backend, database, authentication, or server-side APIs.
- It must work primarily in mobile browsers, with responsive support for desktop browsers.
- Keep the implementation lightweight and avoid unnecessary dependencies.
- Handle mobile browser audio restrictions correctly. Provide an explicit user interaction, such as pressing Start, to initialize audio playback.
- Once a training session starts, the timer and audio cue generation should operate locally in the browser.

## 3. Supported Punch Types

The application must support the following six punch types:

1. Jab
2. Cross
3. Left Hook
4. Right Hook
5. Left Uppercut
6. Right Uppercut

Each punch type must have its own **distinct, easily recognizable audio cue**.

### Audio requirements

- Every punch must map consistently to its assigned sound.
- Sounds must be distinguishable from one another, even during fast training sessions.
- Audio playback should be clear and reliable on mobile devices.
- Avoid sounds that are too similar, unnecessarily long, or difficult to recognize quickly.
- Use short audio cues that allow the boxer to react and execute the punch without being distracted by the sound itself.
- Include appropriate default audio assets in the project, or generate distinct tones if suitable audio assets are unavailable.
- Keep audio assets local to the application so that playback does not depend on network requests during a session.

## 4. Punch Selection and Distribution

Before starting a session, users must be able to select which punch types are included in the training routine.

For example:

- Jab and Cross only
- Jab, Cross, and Left Hook
- All six punch types

At least one punch type must be selected before a session can start.

### Punch distribution

The application must support two ways of distributing the selected punches:

**A. Automatic distribution (default)**

- If the user does not configure percentages, distribute the selected punch types as uniformly as possible.
- Each selected punch should have approximately the same probability of being played.
- For example, if Jab, Cross, and Left Hook are selected, each should have approximately a one-third probability of being selected for each cue.
- Avoid predictable repeating sequences and unnecessary consecutive repetitions of the same punch.

**B. Custom percentage distribution (optional)**

- Allow users to assign a desired percentage to each selected punch.
- Percentages for selected punches must add up to exactly 100%.
- Provide a clear interface for editing percentages and validating the total.
- Unselected punches must have a probability of zero and must not be played.
- For example:
  - Jab: 70%
  - Cross: 30%
  - All other punches: 0%

The random selection algorithm must respect the configured probabilities over time. Do not implement custom distribution by simply repeating a fixed sequence of punches.

## 5. Random Interval Timer

The core feature is a timer that plays punch audio cues at randomized intervals.

### Timing behavior

- After a session starts, wait for an initial randomized interval before playing the first cue.
- After each cue, wait for another randomized interval before playing the next cue.
- Do not use a fixed interval between cues.
- Do not allow cues to occur so close together that a boxer cannot reasonably react and execute the instructed punch.
- Do not make the intervals so long that the training session loses its rhythm or intensity.
- Randomize the intervals within a configurable range appropriate to the selected training speed.
- Avoid obvious or repetitive timing patterns.

The random timing should feel unpredictable to the boxer while remaining practical for real boxing training.

### Important implementation detail

Use a minimum interval to prevent impossibly rapid cues and a maximum interval to prevent excessively long pauses. Randomize intervals within these limits, optionally using weighted randomness rather than a purely uniform distribution.

Do not schedule the next cue at a fixed interval after the previous cue.

## 6. Training Speed and Difficulty

Provide an optional training difficulty selector with three presets:

- **Beginner:** Slower pace, longer recovery time between cues, and more time to react.
- **Intermediate:** Moderate pace with shorter intervals and increased reaction demands.
- **Advanced:** Faster pace, shorter intervals, and greater demands on reaction speed.

Each preset should define appropriate minimum and maximum intervals between cues.

Use sensible default values and keep the timing configuration centralized so that the values can be adjusted easily after testing.

The difficulty setting must affect the timing of the cues, not the identity or audio quality of the punches.

The application should prioritize practical boxing training over simply making the timer as fast as possible. Even at the Advanced level, intervals must remain physically achievable.

## 7. Training Session Controls

Provide the following controls:

- **Start:** Begin a new training session and initialize audio playback.
- **Pause:** Temporarily stop the session and prevent additional cues from playing.
- **Resume:** Continue the session after pausing, without triggering unexpected rapid or overlapping cues.
- **Stop:** End the current session and cancel all scheduled cues.
- **Restart:** Reset and begin a fresh session using the current configuration.

When paused or stopped, no additional punch sounds should play.

Ensure that restarting or rapidly interacting with the controls cannot leave behind multiple active timers or cause overlapping audio cues.

Optionally display elapsed training time and the total number of cues played during the current session.

## 8. User Interface and Experience

The UI should be **simple, clean, minimal, and designed primarily for mobile use**.

Avoid unnecessary animations, decorative elements, complex dashboards, or elaborate visual effects.

The main screen should make it easy for a boxer to configure and start training with minimal interaction.

### Suggested layout

1. **Header:** Application name, such as "Boxing Reflex Trainer".
2. **Punch selection:** Six clearly labeled, touch-friendly controls for selecting punches.
3. **Distribution settings:** A simple option to use equal distribution or configure custom punch percentages.
4. **Difficulty selection:** Beginner, Intermediate, or Advanced.
5. **Session controls:** Prominent Start, Pause, Resume, and Stop controls as appropriate to the current session state.
6. **Session status:** A minimal indicator showing whether the timer is ready, running, or paused.
7. **Optional statistics:** Elapsed time and number of cues played.

The user should be able to configure the session and begin training without navigating through multiple screens.

### Mobile usability

- Use responsive layouts and sufficiently large touch targets.
- Ensure controls are easy to use on small screens.
- Keep important controls visible and easy to reach.
- Avoid layouts that require horizontal scrolling.
- Ensure text and control labels remain readable.
- Do not rely exclusively on color to communicate selected punches or session states.

## 9. Reliability and Edge Cases

The application must handle the following scenarios correctly:

- Starting without selecting any punches.
- Invalid custom percentages or percentages that do not total 100%.
- Switching punch selections or difficulty settings while a session is running.
- Pausing, resuming, stopping, or restarting rapidly.
- Preventing duplicate timers and overlapping cue playback.
- Handling audio initialization failures or browser audio restrictions.
- Handling mobile browsers that suspend audio or throttle background tabs.
- Ensuring no scheduled cues remain after a session is stopped or restarted.

If the browser suspends the application in the background, do not attempt to compensate by playing a burst of overdue cues when the application becomes active again. Resume safely or require the user to restart the session.

Prevent the device from unexpectedly sleeping during an active session where browser capabilities permit it, but treat this as a progressive enhancement rather than a core requirement.

## 10. Implementation Guidelines

- Keep the code modular and easy to maintain.
- Separate punch definitions, audio mappings, distribution logic, interval generation, session state, and UI components.
- Use a reliable client-side scheduling mechanism.
- Ensure timers are cleaned up correctly when session state changes or components unmount.
- Use semantic HTML and accessible controls.
- Keep the application independent of external services during training.
- Do not introduce a backend or persistent data store unless absolutely necessary.
- Persisting user preferences locally in the browser is optional, not required.

## 11. Acceptance Criteria

The application is complete when:

1. A user can select any combination of the six supported punch types.
2. Each punch produces its own distinct audio cue.
3. Automatic distribution provides approximately equal probabilities across the selected punches.
4. Custom percentages are validated and respected by the random selection algorithm.
5. Punch cues occur at randomized, configurable intervals.
6. Minimum and maximum timing limits prevent cues from being either impractically close together or excessively far apart.
7. Beginner, Intermediate, and Advanced presets provide meaningfully different training speeds.
8. Start, Pause, Resume, Stop, and Restart behave reliably without duplicate timers or unintended audio playback.
9. The interface works well on common mobile browsers and remains usable on desktop.
10. The app works without a backend or network connection after its assets have loaded.
11. The interface remains minimal, responsive, and easy to operate during a boxing workout.

## 12. Development Approach

First, implement a complete working version with sensible default timing ranges, six distinct audio cues, equal punch distribution, and the three difficulty presets.

Then add custom punch percentages, session statistics, and any optional usability enhancements.

Prioritize correct timing, genuinely randomized punch selection, reliable audio playback, and mobile usability over visual complexity.

Before considering the application complete, test the actual cue timing and audio playback on a mobile browser. Adjust the default intervals based on practical boxing usability rather than relying exclusively on arbitrary numbers.

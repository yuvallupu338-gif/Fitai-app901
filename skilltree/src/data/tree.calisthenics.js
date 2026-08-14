/*
 * tree.calisthenics.js — the Calisthenics tree.
 *
 * Twenty-two skills, ordered by what actually has to come first: you cannot
 * train a muscle-up before a clean pull-up and a clean dip, and a front lever
 * is a core progression long before it is a back progression.
 *
 * How this tree grades, and why it is different from the other two.
 *
 * The web tree runs your code. The maths tree checks your arithmetic. Neither
 * is possible here — no browser can see whether your elbows flared — so every
 * gate in this tree is a self-reported checklist, and the app says so on the
 * result screen rather than dressing a tick box up as a measurement. The brief
 * is explicit about this (§40): a physical standard here is not a substitute
 * for coaching, and pretending otherwise would be exactly the fake progress
 * §75 rules out.
 *
 * What the checklists can honestly do is describe the standard precisely. Most
 * people asking "can I do a pull-up" are performing something with a kip and a
 * partial range; a checklist that names chin-over-bar, no swing, controlled
 * descent and both directions under control gives them something real to
 * measure against. That is coaching-adjacent and useful. Counting it as proof
 * is not, hence `selfReported` flowing through to the UI.
 *
 * Rep targets are conservative and every progression gate asks for control and
 * range before load or difficulty. Nothing here prescribes training volume,
 * frequency or programming — that is a coach's job, and this is a skill tree.
 */

const check = (id, title, brief, checklist, extra = {}) => ({
  id, kind: extra.kind || 'challenge', title, brief, checklist, ...extra,
});

export const CALISTHENICS_TREE = {
  id: 'calisthenics',
  name: 'Calisthenics',
  tagline: 'Bodyweight strength, in the order the movements build on each other.',
  category: 'Fitness',
  icon: 'activity',
  /* Surfaced once, prominently, on the tree screen rather than buried per
   * skill — a warning nobody reads is not a warning. */
  notice: 'Progress is self-reported here — the app cannot see your form. Standards describe what a clean rep looks like; they are not a substitute for a coach, and nothing here is medical advice.',
  skills: [
    {
      id: 'bodyweight_basics',
      name: 'Bodyweight Basics',
      category: 'Foundations',
      difficulty: 1,
      estimatedHours: [2, 5],
      requires: [],
      description: 'Bracing, breathing, joint preparation and what a controlled rep means.',
      why: 'Every movement in this tree is the same few positions under more load. Getting the positions right first is what makes the rest possible.',
      activities: [
        {
          id: 'bodyweight_basics.learn',
          kind: 'learn',
          title: 'What a clean rep is',
          body: [
            'A repetition has three parts and most people only train one. The lifting phase, the lowering phase, and the position you hold at each end. Lowering under control is where a lot of the strength is built, and dropping out of every rep discards it.',
            'Bracing means the trunk does not sag or twist while the limbs move. A useful test: if someone could push you sideways and you would fold, you are not braced. Practise it in a plank before you need it in a lever.',
            'Full range beats extra reps, every time. Ten partial push-ups train less than five where the chest reaches the floor and the arms lock out. When range shortens, the set is over — that is the honest end of it.',
            'Progression is by leverage, not by weight. A movement gets harder as your body moves further from the pivot: incline push-ups are easier than flat, which are easier than decline, and the same principle runs all the way to the front lever.',
          ],
        },
        {
          id: 'bodyweight_basics.quiz',
          kind: 'quiz',
          title: 'Check yourself',
          questions: [
            {
              prompt: 'Your last three push-ups had a shorter range than the first ten. What does that mean?',
              options: ['The set is finished — range is the limit, not rep count', 'Push through to a round number', 'Speed up to finish', 'Switch to an easier variation and continue'],
              answer: 0,
              explain: 'Reps past the point where range collapses train the compensation, not the movement.',
            },
            {
              prompt: 'How do bodyweight movements get harder without adding weight?',
              options: ['By changing leverage — moving your mass further from the pivot', 'By going faster', 'By doing more reps', 'By resting less'],
              answer: 0,
              explain: 'Leverage is the load dial for calisthenics. It is why a tuck lever is a step toward a full one.',
            },
            {
              prompt: 'Why train the lowering phase deliberately?',
              options: ['A controlled descent builds strength that dropping discards', 'It looks better', 'It is easier on the joints', 'It counts as two reps'],
              answer: 0,
              explain: 'Eccentric control is often how the next progression is unlocked.',
            },
          ],
        },
        check('bodyweight_basics.gate', 'Foundation standard',
          'Meet each of these with control, not at maximum effort.',
          [
            'Plank held 45 seconds with hips level — no sag, no pike',
            'Deep squat held 30 seconds, heels down, chest up',
            'Dead hang from a bar for 20 seconds with shoulders active',
            'Can describe what a full range rep looks like for a push-up',
          ]),
      ],
    },

    {
      id: 'incline_pushups',
      name: 'Incline Push-Ups',
      category: 'Push',
      difficulty: 1,
      estimatedHours: [2, 6],
      requires: [{ skillId: 'bodyweight_basics', minLevel: 2 }],
      description: 'Push-ups with hands raised — the entry point for the whole push branch.',
      why: 'The angle is the dial. Starting where your form holds is what gets you to a floor push-up fastest.',
      activities: [
        {
          id: 'incline_pushups.learn',
          kind: 'learn',
          title: 'Set the angle to your strength',
          body: [
            'Hands on a raised surface reduces the proportion of your bodyweight you are pressing. A kitchen counter is easy; a low bench is close to a floor push-up. Lower the surface as your form holds, not as your patience runs out.',
            'The body stays in one line from head to heels throughout. The most common fault is hips leading — either sagging toward the floor or piking up — which shortens the range and takes the trunk out of the work.',
            'Elbows track back at roughly 45° from the torso, not flared straight out to the sides. Flared elbows put the shoulder in its least comfortable position under load.',
          ],
        },
        check('incline_pushups.gate', 'Incline standard',
          'On a surface around knee height.',
          [
            '12 controlled reps, chest touching the surface',
            'Body in one line throughout — no sagging or piking hips',
            'Elbows tracking back, not flared wide',
            'Lowering phase takes about two seconds',
          ]),
      ],
    },

    {
      id: 'pushups',
      name: 'Push-Ups',
      category: 'Push',
      difficulty: 2,
      estimatedHours: [4, 12],
      requires: [{ skillId: 'incline_pushups', minLevel: 3 }],
      description: 'The full floor push-up with chest to the ground and a locked-out finish.',
      why: 'The reference push movement. Dips, handstand work and the muscle-up all assume it.',
      activities: [
        {
          id: 'pushups.learn',
          kind: 'learn',
          title: 'The floor push-up',
          body: [
            'Hands about shoulder width, slightly below the shoulders. Chest to the floor, then press to full lock-out. Anything less than that range is a partial, however many you do.',
            'The trunk works as hard as the arms. Squeeze the glutes and brace the midsection so the hips cannot lead — this is the plank you already practised, moving.',
            'If form breaks before eight reps, go back to an incline for a while. That is not a step backwards; it is the fastest route to a clean floor push-up.',
          ],
        },
        check('pushups.gate', 'Push-up standard',
          'Floor push-ups, chest touching, full lock-out.',
          [
            '10 consecutive reps with chest touching the floor',
            'Full elbow lock-out at the top of every rep',
            'Hips level throughout — no sag, no pike',
            'No pause needed mid-set to reset position',
          ]),
      ],
    },

    {
      id: 'diamond_pushups',
      name: 'Diamond Push-Ups',
      category: 'Push',
      difficulty: 3,
      estimatedHours: [3, 8],
      requires: [{ skillId: 'pushups', minLevel: 3 }],
      description: 'Hands close together, shifting the emphasis toward the triceps.',
      why: 'Builds the lock-out strength that dips and the muscle-up transition demand.',
      activities: [
        check('diamond_pushups.gate', 'Diamond standard',
          'Hands together under the chest, index fingers and thumbs touching.',
          [
            '8 consecutive reps, chest touching the hands',
            'Elbows staying close to the body rather than flaring',
            'Full lock-out at the top',
            'No wrist or elbow pain during or after',
          ]),
      ],
    },

    {
      id: 'pike_pushups',
      name: 'Pike Push-Ups',
      category: 'Push',
      difficulty: 3,
      estimatedHours: [3, 8],
      requires: [{ skillId: 'pushups', minLevel: 3 }],
      description: 'Hips high, pressing overhead — the vertical push pattern.',
      why: 'The first real overhead pressing strength, and the direct road to a handstand push-up.',
      activities: [
        {
          id: 'pike_pushups.learn',
          kind: 'learn',
          title: 'Finding the vertical',
          body: [
            'From a push-up position, walk the feet in and lift the hips until the torso is closer to vertical than horizontal. The closer to vertical, the more of your weight the shoulders carry.',
            'The head travels forward of the hands and down toward the floor, not straight down between them. Elbows stay in front of the body rather than flaring wide.',
            'Raising the feet onto a step increases the angle. That progression continues all the way to a handstand push-up, which is the same movement fully vertical.',
          ],
        },
        check('pike_pushups.gate', 'Pike standard',
          'Feet on the floor, hips high.',
          [
            '8 reps with the head touching lightly at the bottom',
            'Torso closer to vertical than horizontal',
            'Elbows tracking forward, not flaring out',
            'Shoulders taking the load without the lower back arching'
          ]),
      ],
    },

    {
      id: 'dips',
      name: 'Dips',
      category: 'Push',
      difficulty: 3,
      estimatedHours: [5, 15],
      requires: [
        { skillId: 'pushups', minLevel: 3 },
        { skillId: 'diamond_pushups', minLevel: 2 },
      ],
      description: 'Vertical pressing on parallel bars through a full range.',
      why: 'Half of the muscle-up. The strength above the bar comes from here.',
      activities: [
        {
          id: 'dips.learn',
          kind: 'learn',
          title: 'Depth and shoulder position',
          body: [
            'Lower until the upper arms are roughly parallel to the ground, then press to lock-out. Going deeper than your shoulder can control is where most dip injuries come from — depth is earned, not assumed.',
            'Keep the shoulders down and away from the ears at the bottom. Letting them shrug up puts the joint in a vulnerable position under a lot of load.',
            'If full dips are not there yet, negatives work: start at the top, lower as slowly as you can, step off and reset. Control of the lowering phase usually arrives well before the press.',
            'This is a movement where existing shoulder problems genuinely matter. If something hurts, that is information — stop, and get it looked at rather than working around it.',
          ],
        },
        check('dips.gate', 'Dip standard',
          'On parallel bars, full range.',
          [
            '8 consecutive reps to upper arms parallel',
            'Full lock-out at the top of each rep',
            'Shoulders staying down and back at the bottom',
            'Minimal swinging — the body stays close to vertical',
            'No shoulder pain during or after',
          ]),
      ],
    },

    {
      id: 'hanging',
      name: 'Hanging',
      category: 'Pull',
      difficulty: 1,
      estimatedHours: [1, 4],
      requires: [{ skillId: 'bodyweight_basics', minLevel: 2 }],
      description: 'Grip, shoulder position and simply staying on the bar.',
      why: 'Grip is what fails first for most beginners on the pull branch, and it is the easiest thing to fix.',
      activities: [
        {
          id: 'hanging.learn',
          kind: 'learn',
          title: 'Passive and active hangs',
          body: [
            'A passive hang lets the shoulders rise toward the ears and everything relax. An active hang pulls the shoulders down and back without bending the arms. Both are useful; the active one is what every pull starts from.',
            'The transition between them — repeatedly moving from passive to active — is called a scapular pull, and it is the first strength most people are missing when a pull-up will not start.',
            'Grip endurance improves quickly with plain accumulated hanging time. Total time across a session matters more than any single long hang.',
          ],
        },
        check('hanging.gate', 'Hang standard',
          'From a bar, overhand grip.',
          [
            '30 second passive hang without dropping',
            '15 second active hang, shoulders pulled down and back',
            '8 scapular pulls with straight arms',
            'No numbness or tingling in the hands',
          ]),
      ],
    },

    {
      id: 'australian_pullups',
      name: 'Australian Pull-Ups',
      category: 'Pull',
      difficulty: 2,
      estimatedHours: [3, 8],
      requires: [{ skillId: 'hanging', minLevel: 2 }],
      description: 'Horizontal rows under a low bar, feet on the ground.',
      why: 'The pulling equivalent of the incline push-up — where you build a pull-up from if you do not have one.',
      activities: [
        check('australian_pullups.gate', 'Row standard',
          'Under a waist-height bar, body straight, heels on the floor.',
          [
            '12 reps with the chest touching the bar',
            'Body in one straight line — hips not sagging',
            'Shoulder blades pulling together at the top',
            'Controlled lowering to straight arms each rep',
          ]),
      ],
    },

    {
      id: 'pullups',
      name: 'Pull-Ups',
      category: 'Pull',
      difficulty: 3,
      estimatedHours: [8, 25],
      requires: [
        { skillId: 'australian_pullups', minLevel: 3 },
        { skillId: 'hanging', minLevel: 3 },
      ],
      description: 'Overhand grip, chin over the bar, from a dead hang.',
      why: 'The reference pull movement, and the gate to everything above it in this tree.',
      activities: [
        {
          id: 'pullups.learn',
          kind: 'learn',
          title: 'From a dead hang',
          body: [
            'A rep starts from straight arms and finishes with the chin clearly over the bar. Starting from a slightly bent arm shortens the hardest part of the movement, which is precisely the part you are trying to train.',
            'The pull starts at the shoulder blades, not the elbows. Depress and retract first, then bend the arms — this is why scapular pulls come earlier in the tree.',
            'Kipping — using a leg swing to generate momentum — is a different exercise with different purposes. For building strict strength it removes the load you came for.',
            'Negatives are the most reliable route to a first pull-up: jump or step to the top, lower as slowly as you can. When you can control a five-second descent, the concentric is usually close.',
          ],
        },
        {
          id: 'pullups.quiz',
          kind: 'quiz',
          title: 'Check yourself',
          questions: [
            {
              prompt: 'You cannot do a single pull-up yet. Most reliable next step?',
              options: ['Slow negatives from the top, plus rows', 'Kipping until you can do strict ones', 'Attempting maximal pull-ups daily', 'Waiting until you are lighter'],
              answer: 0,
              explain: 'Controlling the lowering phase builds the same strength and is available immediately.',
            },
            {
              prompt: 'Where should a pull-up begin?',
              options: ['A dead hang with straight arms', 'A slight bend, to protect the elbows', 'Chin already at the bar', 'A small swing for momentum'],
              answer: 0,
              explain: 'The bottom is the hardest position. Skipping it skips the training effect.',
            },
          ],
        },
        check('pullups.gate', 'Pull-up standard',
          'Overhand grip, no kipping.',
          [
            '5 consecutive reps from a dead hang',
            'Chin clearly over the bar each rep',
            'Straight arms at the bottom of every rep',
            'No leg kick or swing to generate momentum',
            'Controlled descent, not a drop',
          ]),
      ],
    },

    {
      id: 'chinups',
      name: 'Chin-Ups',
      category: 'Pull',
      difficulty: 3,
      estimatedHours: [3, 8],
      requires: [{ skillId: 'pullups', minLevel: 2 }],
      description: 'Underhand grip, more biceps involvement.',
      why: 'Usually stronger than the pull-up, which makes it useful for building volume.',
      activities: [
        check('chinups.gate', 'Chin-up standard',
          'Underhand grip, shoulder width.',
          [
            '8 consecutive reps from a dead hang',
            'Chin clearly over the bar',
            'Straight arms at the bottom',
            'No swing or kip',
          ]),
      ],
    },

    {
      id: 'core_control',
      name: 'Core Control',
      category: 'Core',
      difficulty: 2,
      estimatedHours: [3, 8],
      requires: [{ skillId: 'bodyweight_basics', minLevel: 3 }],
      description: 'Hollow body, arch, and holding a line under load.',
      why: 'Every lever in this tree is a core hold with the arms somewhere else. This is where they are built.',
      activities: [
        {
          id: 'core_control.learn',
          kind: 'learn',
          title: 'The hollow body',
          body: [
            'Lie on your back, press the lower back into the floor, and lift the shoulders and legs slightly. That flat-lower-back position is the hollow body, and it is the shape almost every skill on this tree is held in.',
            'The test is the lower back. If it lifts off the floor, the position has been lost and the hold should stop — the point is not the seconds, it is the shape.',
            'Make it easier by tucking the knees or keeping the arms by your sides; harder by extending arms overhead and legs straight. That range of leverage is the whole progression.',
          ],
        },
        check('core_control.gate', 'Core standard',
          'Held positions, not repetitions.',
          [
            '30 second hollow body hold with the lower back flat on the floor',
            '30 second arch (superman) hold',
            '45 second plank with level hips',
            'Can hold a hollow shape while someone taps your ribs without folding',
          ]),
      ],
    },

    {
      id: 'lsit',
      name: 'L-Sit',
      category: 'Core',
      difficulty: 4,
      estimatedHours: [6, 20],
      requires: [
        { skillId: 'core_control', minLevel: 3 },
        { skillId: 'dips', minLevel: 2 },
      ],
      description: 'Supported on the hands, legs straight and horizontal.',
      why: 'Compression strength and straight-arm scapular strength — both prerequisites for the levers.',
      activities: [
        {
          id: 'lsit.learn',
          kind: 'learn',
          title: 'Compression and depression',
          body: [
            'Two things happen at once: the shoulders push down hard to lift the body clear, and the hip flexors lift the legs to horizontal. Most people have one and not the other, and it is worth knowing which.',
            'If the hips do not clear the ground, the limit is shoulder depression — practise on parallettes or blocks. If they clear but the legs will not rise, the limit is compression — practise tucked, then one leg out, then both.',
            'Hamstring flexibility caps how straight the legs can go. That is a mobility issue, not a strength one, and no amount of trying harder fixes it.',
          ],
        },
        check('lsit.gate', 'L-sit standard',
          'On parallettes, low bars or the floor.',
          [
            '10 second hold with both legs straight and roughly horizontal',
            'Shoulders pushed down — hips clear of the ground throughout',
            'Knees not bending during the hold',
            'Can enter and exit the position under control',
          ]),
      ],
    },

    {
      id: 'handstand_basics',
      name: 'Handstand Basics',
      category: 'Balance',
      difficulty: 3,
      estimatedHours: [8, 25],
      requires: [
        { skillId: 'pike_pushups', minLevel: 2 },
        { skillId: 'core_control', minLevel: 3 },
      ],
      description: 'Wall handstands, alignment and learning to bail safely.',
      why: 'Overhead strength and a straight line under load — plus the confidence that comes from knowing how to fall.',
      activities: [
        {
          id: 'handstand_basics.learn',
          kind: 'learn',
          title: 'Line, and bailing',
          body: [
            'Learn to bail before you learn to balance. From a wall handstand, practise turning out — pick a shoulder, rotate, and step down sideways. Knowing this removes the fear that keeps most people from ever getting vertical.',
            'A chest-to-wall handstand teaches alignment better than a back-to-wall one. Back-to-wall encourages a banana shape with an arched lower back; facing the wall forces a straight line, which is what you actually want.',
            'The correction happens at the fingers. Pressing the fingertips down stops a forward fall; easing off lets the weight come forward. Balance is in the hands, not the hips.',
          ],
        },
        check('handstand_basics.gate', 'Wall handstand standard',
          'Chest to the wall where possible.',
          [
            '30 second chest-to-wall handstand',
            'Body in a straight line — ribs down, no lower-back arch',
            'Can bail safely by turning out, demonstrated at least five times',
            'Shoulders fully open, ears roughly in line with the arms',
          ]),
      ],
    },

    {
      id: 'handstand',
      name: 'Freestanding Handstand',
      category: 'Balance',
      difficulty: 5,
      estimatedHours: [30, 100],
      requires: [{ skillId: 'handstand_basics', minLevel: 3 }],
      description: 'Balancing on the hands, unsupported.',
      why: 'One of the longest-timeline skills here. Almost entirely practice frequency rather than strength.',
      activities: [
        {
          id: 'handstand.learn',
          kind: 'learn',
          title: 'Frequency beats duration',
          body: [
            'This is a coordination skill, and coordination responds to how often you practise far more than to how long. Short daily sessions outperform one long weekly one by a wide margin.',
            'Kick up with control rather than power. Overshooting and bailing repeatedly teaches your body to expect to fall, and that expectation is most of what stops the balance settling.',
            'Expect this to take months. That is not a failure of your training; it is the normal timeline for the skill, and the estimate on this node reflects it honestly.',
          ],
        },
        check('handstand.gate', 'Freestanding standard',
          'Away from the wall.',
          [
            '10 second freestanding hold on flat ground',
            'Can kick up to balance without overshooting most attempts',
            'Can bail safely from a freestanding position',
            'Reasonably straight line — not held by a heavy lower-back arch',
          ]),
      ],
    },

    {
      id: 'explosive_pullups',
      name: 'Explosive Pull-Ups',
      category: 'Pull',
      difficulty: 4,
      estimatedHours: [5, 15],
      requires: [{ skillId: 'pullups', minLevel: 4 }],
      description: 'Pulling high and fast — chest to bar and above.',
      why: 'The muscle-up needs height and speed, not just strength. This is where both come from.',
      activities: [
        {
          id: 'explosive_pullups.learn',
          kind: 'learn',
          title: 'Height is the metric',
          body: [
            'The goal is how high you clear the bar, not how many you do. Chest to bar first; navel to bar means you have the height a muscle-up needs.',
            'Pull with intent from the very bottom. A slow start cannot be rescued by a fast finish — the acceleration has to begin at the dead hang.',
            'These are demanding on the elbows. Low reps, full recovery, and stop the set when the height drops rather than grinding out slower ones.',
          ],
        },
        check('explosive_pullups.gate', 'Explosive standard',
          'Strict, no kipping.',
          [
            '5 reps with the chest touching the bar',
            '3 reps clearing the bar to lower chest or below',
            'Pull starts fast from a dead hang, not from a bent arm',
            'No elbow pain during or after',
          ]),
      ],
    },

    {
      id: 'muscle_up_basics',
      name: 'Muscle-Up Prep',
      category: 'Pull',
      difficulty: 4,
      estimatedHours: [8, 25],
      requires: [
        { skillId: 'explosive_pullups', minLevel: 3 },
        { skillId: 'dips', minLevel: 3 },
      ],
      description: 'The transition — the part between the pull and the dip.',
      why: 'Almost everyone who cannot do a muscle-up is missing the transition, not the strength.',
      activities: [
        {
          id: 'muscle_up_basics.learn',
          kind: 'learn',
          title: 'The transition is the skill',
          body: [
            'A muscle-up is a high pull, a rotation of the elbows over the bar, and a dip. The middle part is the one nobody trains, and it is the one that stops people.',
            'Drill it with a false grip on rings, or with transition negatives: start supported above the bar, lower slowly through the transition, and learn the position under control.',
            'Lean forward as you clear the bar. Staying vertical leaves you underneath it with nowhere to go — the chest has to travel over.',
            'If the pull is barely reaching chest height, this is not yet the thing to work on. Go back to explosive pull-ups; the height gate exists for a reason.',
          ],
        },
        check('muscle_up_basics.gate', 'Transition standard',
          'On a bar or rings.',
          [
            '3 controlled transition negatives from support to hang',
            'Can hold a false grip hang for 15 seconds (rings) or a straight-bar support for 20 seconds',
            'Chest clears the bar on explosive pull-ups',
            'Understand and can describe the forward lean through the transition',
          ]),
      ],
    },

    {
      id: 'muscle_up',
      name: 'Muscle-Up',
      category: 'Pull',
      difficulty: 5,
      estimatedHours: [15, 50],
      requires: [
        { skillId: 'muscle_up_basics', minLevel: 3 },
        { skillId: 'dips', minLevel: 4 },
      ],
      description: 'Hang to support above the bar in one continuous movement.',
      why: 'The landmark skill of the pull branch, and the one most people who start calisthenics are aiming at.',
      activities: [
        check('muscle_up.gate', 'Muscle-up standard',
          'One continuous movement, no kipping.',
          [
            'One complete rep from a dead hang to full support above the bar',
            'No leg kip or swing',
            'Lock-out at the top',
            'Can lower back down with control rather than dropping',
          ]),
        {
          id: 'muscle_up.mastery',
          kind: 'mastery',
          title: 'Repeatable and clean',
          brief: 'A first muscle-up is often a fluke of adrenaline. This is the standard for owning it.',
          checklist: [
            '3 consecutive strict reps',
            'Same technique on each — not progressively more kip',
            'Controlled descent through the transition each time',
            'Can perform it on a day you are not fresh',
          ],
        },
      ],
    },

    {
      id: 'tuck_front_lever',
      name: 'Tuck Front Lever',
      category: 'Levers',
      difficulty: 4,
      estimatedHours: [8, 25],
      requires: [
        { skillId: 'pullups', minLevel: 3 },
        { skillId: 'core_control', minLevel: 4 },
      ],
      description: 'Hanging horizontal with the knees tucked to the chest.',
      why: 'The first lever position, and where straight-arm pulling strength starts.',
      activities: [
        {
          id: 'tuck_front_lever.learn',
          kind: 'learn',
          title: 'Straight arms, flat back',
          body: [
            'The arms stay straight. Bending them turns this into a different, easier exercise and stalls the progression — straight-arm strength is the entire point of a lever.',
            'The back should be flat or slightly rounded, not arched, and the body horizontal. Sagging hips are the usual tell that the position has been lost.',
            'Progression runs by leverage: tuck, advanced tuck (knees away from the chest), one leg extended, straddle, full. Each is the same hold with the mass further from the bar.',
          ],
        },
        check('tuck_front_lever.gate', 'Tuck standard',
          'Hanging from a bar, knees tucked.',
          [
            '10 second hold with the torso horizontal',
            'Arms completely straight throughout',
            'Back flat rather than arched',
            'Can enter the position under control rather than swinging into it',
          ]),
      ],
    },

    {
      id: 'adv_tuck_front_lever',
      name: 'Advanced Tuck Front Lever',
      category: 'Levers',
      difficulty: 5,
      estimatedHours: [10, 30],
      requires: [{ skillId: 'tuck_front_lever', minLevel: 3 }],
      description: 'Knees away from the chest, hips open — the halfway point.',
      why: 'The step where the front lever stops being a core hold and starts being a full-body one.',
      activities: [
        check('adv_tuck_front_lever.gate', 'Advanced tuck standard',
          'Hips open to roughly 90°.',
          [
            '10 second hold with the torso horizontal',
            'Hips open — thighs no longer against the chest',
            'Arms straight, back flat',
            'Shoulders staying depressed rather than shrugging',
          ]),
      ],
    },

    {
      id: 'straddle_front_lever',
      name: 'Straddle Front Lever',
      category: 'Levers',
      difficulty: 5,
      estimatedHours: [15, 40],
      requires: [{ skillId: 'adv_tuck_front_lever', minLevel: 3 }],
      description: 'Legs straight and wide — the last step before the full lever.',
      why: 'Widening the legs shortens the lever just enough to bridge a gap that is otherwise very large.',
      activities: [
        check('straddle_front_lever.gate', 'Straddle standard',
          'Legs straight, split wide.',
          [
            '8 second hold with the body horizontal',
            'Legs straight — knees not bending to cheat the leverage',
            'Arms straight, shoulders depressed',
            'Hips level with the shoulders, not sagging',
          ]),
      ],
    },

    {
      id: 'front_lever',
      name: 'Front Lever',
      category: 'Levers',
      difficulty: 5,
      estimatedHours: [25, 80],
      requires: [
        { skillId: 'straddle_front_lever', minLevel: 3 },
        { skillId: 'lsit', minLevel: 3 },
      ],
      description: 'The full position — body straight and horizontal, hanging from the bar.',
      why: 'The landmark skill of the lever branch. Years of straight-arm strength in one position.',
      activities: [
        check('front_lever.gate', 'Front lever standard',
          'Full position, legs together and straight.',
          [
            '5 second hold with the body horizontal',
            'Legs together and completely straight',
            'Arms straight, back flat rather than arched',
            'Hips level with the shoulders throughout',
          ]),
        {
          id: 'front_lever.mastery',
          kind: 'mastery',
          title: 'Owned, not caught',
          brief: 'The standard for a front lever you have rather than one you once hit.',
          checklist: [
            '10 second hold, clean throughout',
            'Can enter from a hang under control rather than dropping into it',
            'Can hold it on a day you are not fresh',
            'Position looks the same at the end of the hold as at the start',
          ],
        },
      ],
    },

    {
      id: 'calisthenics_athlete',
      name: 'Calisthenics Athlete',
      category: 'Milestone',
      difficulty: 5,
      estimatedHours: [40, 120],
      requires: [
        { skillId: 'muscle_up', minLevel: 3 },
        { skillId: 'front_lever', minLevel: 3 },
        { skillId: 'handstand', minLevel: 3 },
      ],
      description: 'Strength across all three branches: push, pull and balance.',
      why: 'The capstone. Not one impressive skill but a body that is strong in every direction.',
      activities: [
        {
          id: 'calisthenics_athlete.mastery',
          kind: 'mastery',
          title: 'All three branches',
          brief: 'Demonstrate the landmark skill of each branch, on the same day, in one session.',
          checklist: [
            'Muscle-up: 3 strict reps',
            'Front lever: 5 second clean hold',
            'Freestanding handstand: 10 second hold',
            'All three in one session, with control rather than at maximum effort',
            'No pain in shoulders, elbows or wrists during or after',
          ],
        },
      ],
    },
  ],
};

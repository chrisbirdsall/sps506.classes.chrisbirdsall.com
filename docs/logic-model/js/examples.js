/* =============================================================================
   examples.js — the worked examples under File → Load example.

   To add one, copy an entry below and edit the text. Every list is an array of
   short strings (one box each). Keep boxes short: a phrase, not a paragraph.
   Teaching rules the examples follow:
     - the problem statement names the problem and its causes, not the
       missing solution (it must not already contain the program);
     - outputs are countable products of the activities, with a count or
       target where one is natural: 'Mentors trained (target:\u00a040)'
       (\u00a0 is a no-break space, so the number never sits alone on a line);
     - outcomes are changes in people or conditions;
     - long-term outcomes connect back to the problem statement.
   Do not use programs students are evaluating this semester.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;

  LMB.examples = [
    {
      id: 'first-gen',
      name: 'First-generation college mentoring',
      content: {
        title: 'Next Step: First-Generation College Mentoring',
        problem: 'Many first-generation students leave our high school without a plan after graduation, and few adults at home have been through college applications.',
        theory: 'If first-generation juniors and seniors get a trained mentor who has been to college and hands-on help with applications and aid, then more of them will graduate with a plan, enroll, and stay in college.',
        inputs: [
          'Volunteer mentors (local alumni and college students)',
          'Part-time program coordinator',
          'School counselors and student records',
          'Community foundation grant',
          'Two partner colleges'
        ],
        activities: [
          'Recruit, screen, and train mentors',
          'Match each student with a mentor',
          'Hold biweekly one-on-one mentoring sessions',
          'Run FAFSA and application nights for families',
          'Lead visits to partner campuses'
        ],
        outputs: [
          'Mentors trained (target:\u00a040)',
          'Students matched with a mentor (target:\u00a080)',
          'Mentoring sessions held',
          'Families attending FAFSA nights',
          'Students completing a campus visit'
        ],
        shortTerm: [
          'Students know the steps and deadlines for applying',
          'Families understand financial aid options',
          'Students identify colleges that fit their goals',
          'Students feel they belong in college'
        ],
        intermediate: [
          'More students submit applications and the FAFSA',
          'Graduates leave with a written postsecondary plan',
          'More graduates enroll in college or training the next fall'
        ],
        longTerm: [
          'More first-generation graduates return for a second year of college',
          'More first-generation graduates complete a degree or credential',
          'Gap in college completion between first-generation and other graduates narrows'
        ],
        antecedent: [
          'Students’ academic preparation',
          'Family income and work hours',
          'Distance to the nearest college',
          'Counselor caseloads of about 400 students'
        ],
        mediating: [
          'Mentor turnover during the school year',
          'Changes to the FAFSA or federal aid rules',
          'A strong local job market pulling graduates into work',
          'Other college-access programs at the school'
        ],
        assumptions: [
          'Mentors who went to college can supply know-how families lack',
          'Students meet often enough to build trust with a mentor',
          'Information and support, not only cost, keep students from enrolling',
          'Partner colleges stay engaged for visits and follow-up'
        ]
      }
    },
    {
      id: 'wildfire-smoke',
      name: 'Wildfire smoke: portable air cleaners',
      content: {
        title: 'Clean Air at Home: Portable Air Cleaners for Wildfire Smoke',
        problem: 'During wildfire season, older adults, young children, and county residents with asthma or heart disease breathe unhealthy smoke indoors, because smoke seeps into older, leaky homes and many of these residents cannot leave the area on bad-air days.',
        theory: 'If the health district gives at-risk households portable HEPA air cleaners and shows them when and how to use them, then indoor smoke exposure will fall on bad-air days and fewer residents will need emergency care for smoke-related illness.',
        inputs: [
          'State grant for 500 HEPA air cleaners',
          'Public health nurses and community health workers',
          'Referral partners: clinics and senior centers',
          'Air quality forecasts from the state',
          'Education materials in English and Spanish'
        ],
        activities: [
          'Identify and enroll eligible households',
          'Deliver and set up air cleaners in homes',
          'Teach residents when and how to use them',
          'Text residents on poor air quality days',
          'Replace filters before each fire season'
        ],
        outputs: [
          'Households enrolled (target:\u00a0500)',
          'Air cleaners delivered and set up (target:\u00a0500)',
          'Residents trained on use',
          'Smoke-day text alerts sent',
          'Replacement filters distributed'
        ],
        shortTerm: [
          'Residents know how to read air quality alerts',
          'Residents know when to close windows and run the cleaner',
          'Residents feel able to protect their household from smoke'
        ],
        intermediate: [
          'Households run air cleaners on poor air days',
          'Indoor fine particle (PM2.5) levels drop on smoke days',
          'Fewer residents report smoke-related symptoms'
        ],
        longTerm: [
          'Fewer smoke-related emergency visits among at-risk residents',
          'At-risk residents can stay safely at home during smoke events',
          'Health gaps from wildfire smoke narrow across the county'
        ],
        antecedent: [
          'Residents’ ages and health conditions',
          'Age and leakiness of housing',
          'Household electricity costs',
          'Language spoken at home'
        ],
        mediating: [
          'Severity and length of each fire season',
          'Power outages during heat and smoke',
          'Changes in state or federal grant funding',
          'Price and supply of air cleaners in stores'
        ],
        assumptions: [
          'Households will run the cleaners despite noise and power costs',
          'One cleaner in a main room cuts exposure enough to matter',
          'Referral partners can reach the residents most at risk',
          'Residents trust health messages from the county'
        ]
      }
    }
  ];
})();

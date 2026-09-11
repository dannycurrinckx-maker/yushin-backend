// Vraag/antwoorddata voor de TCM 10+2 anamnese — Engelse vertaling.
// Verbatim overgenomen uit de client-side tool (extracted.js, const
// SECTIONS_EN) voor taak #71. Structureel identiek aan sectionsNl.js (zelfde
// id's, gate-sleutels, clockSeg, onlyIf, therapistOnly, requires) — enkel
// title/intro/text/label/patterns zijn vertaald. Nog niet klinisch nagekeken
// door de therapeut zelf (zie het meegeleverde controledocument).

// MDR-safe-launch (04/09, launch-blocker): the "s0safety" section (13 alarm
// symptoms) used to be an interactive question series here — each answer
// could trigger an automatic EMERGENCY/ALERT message via `redFlag:"..."`
// (Track 1.4, task #104/#105). That is functionally automated medical triage
// on patient answers, which undermines the non-medical positioning (task
// #111). Decision Danny: this coupling with `answers` has been removed. The
// checklist content has NOT disappeared — it now exists as a static,
// language-aware reference list (see redFlagData.js →
// staticSafetyChecklist(), exposed via getStaticSafetyChecklist() in
// flowEngine.js and shown as a non-blocking panel in the client), fully
// decoupled from whatever answers a therapist/patient fills in.
export const SECTIONS_EN = [
  {
    id: 's1',
    title: '1. Fever and chills',
    intro: 'First, some questions about fever and chills.',
    questions: [
      {
        text: 'Which combination of fever and chills best describes the patient?',
        options: [
          { label: 'Mild fever + severe chills + no sweating', patterns: ['External Wind-Cold'] },
          { label: 'Severe fever + mild chills + red face + thirst', patterns: ['External Wind-Heat'] },
          { label: 'Mild fever + aversion to wind + spontaneous sweating', patterns: ['Exterior pattern with Wei Qi Deficiency'] },
          { label: 'Fever and chills + heaviness + pain + thirst + irritability', patterns: ['External Summer-Heat'] },
          { label: 'Fever and chills + heaviness + pain + fullness in the chest', patterns: ['External Dampness'] },
          { label: 'Fever and chills + dry throat + cough', patterns: ['External Dryness'] },
          { label: 'No fever or chills present', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's2',
    title: '2. Sweating',
    questions: [
      {
        text: 'Exterior pattern: is sweating present (or absent) together with fever and chills?',
        options: [
          { label: 'No sweating + severe chills + mild fever + headache', gate: {"key": "zweten", "value": false}, patterns: ['External Wind-Cold'] },
          { label: 'Sweating + fever + aversion to wind', gate: {"key": "zweten", "value": true}, patterns: ['External Wind'] },
          { label: 'Sweating + high fever + headache + sore throat', gate: {"key": "zweten", "value": true}, patterns: ['External Wind-Heat'] },
          { label: 'Not applicable', patterns: [] },
        ]
      },
      {
        text: 'Interior pattern: how would you describe the sweating?',
        options: [
          { label: 'Spontaneous daytime sweating + aversion to cold + fatigue', gate: {"key": "zweten", "value": true}, patterns: ['Yang Deficiency'] },
          { label: 'Night sweats + flushed cheeks + afternoon fever', gate: {"key": "zweten", "value": true}, patterns: ['Yin Deficiency'] },
          { label: 'Profuse, continuous sweating + red face + thirst', gate: {"key": "zweten", "value": true}, patterns: ['External Wind-Heat', 'Interior Heat'] },
          { label: 'Profuse cold sweat with beads + cold hands/feet (acute)', gate: {"key": "zweten", "value": true}, patterns: ['Yang Collapse'] },
          { label: 'None of these; the patient does not sweat noticeably', gate: {"key": "zweten", "value": false}, patterns: [] },
        ]
      },
      {
        text: 'At what time is the sweating most pronounced?',
        requires: ["zweten"],
        options: [
          { label: 'During the day', patterns: ['Yang Deficiency'] },
          { label: 'At night', patterns: ['Yin Deficiency'] },
          { label: 'No clear time', patterns: [] },
        ]
      },
      {
        text: 'Where on the body does the patient sweat the most?',
        requires: ["zweten"],
        options: [
          { label: 'On the head', patterns: ['Stomach Heat', 'Damp-Heat Middle Burner'] },
          { label: 'Oily sweat on the forehead', patterns: ['Yang Collapse'] },
          { label: 'Arms and legs', patterns: ['Stomach and Spleen Deficiency'] },
          { label: 'Hands', patterns: ['Lung Qi Deficiency', 'nervousness'] },
          { label: 'Whole body', patterns: ['Lung Qi Deficiency'] },
          { label: 'Five centres (palms, soles and chest)', patterns: ['Yin Deficiency'] },
          { label: 'No specific location', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's3',
    title: '3. Head and body',
    questions: [
      {
        text: 'Does the patient have a headache? If so, how did it begin?',
        options: [
          { label: 'Yes — sudden and short-lived', gate: {"key": "hoofdpijn", "value": true}, patterns: ['External Wind-Cold'] },
          { label: 'Yes — gradual and long-lasting', gate: {"key": "hoofdpijn", "value": true}, patterns: ['Internal cause'] },
          { label: 'No headaches', gate: {"key": "hoofdpijn", "value": false}, patterns: [] },
        ]
      },
      {
        text: 'Headache - when is it worse?',
        requires: ["hoofdpijn"],
        options: [
          { label: 'During the day', patterns: ['Qi Deficiency or Yang Deficiency'] },
          { label: 'At night', patterns: ['Blood Deficiency or Yin Deficiency'] },
          { label: 'No clear time', patterns: [] },
        ]
      },
      {
        text: 'Headache - where exactly?',
        requires: ["hoofdpijn"],
        options: [
          { label: 'Occipital (back of the head)', patterns: ['External Wind-Cold or Kidney Deficiency'] },
          { label: 'Forehead', patterns: ['Stomach Heat or Blood Deficiency'] },
          { label: 'Temporal / lateral', patterns: ['External Wind-Cold/Wind-Heat or Liver-Gallbladder Fire'] },
          { label: 'Vertex', patterns: ['Liver Blood Deficiency'] },
          { label: 'Entire head', patterns: ['External Wind-Cold'] },
          { label: 'No clear location', patterns: [] },
        ]
      },
      {
        text: 'Headache - how does the pain feel?',
        requires: ["hoofdpijn"],
        options: [
          { label: 'Heavy feeling', patterns: ['Dampness or Phlegm'] },
          { label: 'Pain feels deep inside the head', patterns: ['Kidney Deficiency'] },
          { label: 'Throbbing, distending feeling', patterns: ['Liver Yang rising'] },
          { label: 'Boring pain, as if a nail were driven into the head', patterns: ['Blood Stasis'] },
          { label: 'None of these', patterns: [] },
        ]
      },
      {
        text: 'Headache - what aggravates or relieves it?',
        requires: ["hoofdpijn"],
        options: [
          { label: 'Worse with wind/cold', patterns: ['External pathogenic factor'] },
          { label: 'Worse with cold', patterns: ['Cold (excess or Deficiency)'] },
          { label: 'Worse with heat', patterns: ['Heat (excess or Deficiency)'] },
          { label: 'Worse with fatigue, better with rest', patterns: ['Qi Deficiency'] },
          { label: 'No clear connection', patterns: [] },
        ]
      },
      {
        text: 'Does the patient have vertigo or dizziness? If so, how severe is it?',
        options: [
          { label: 'Yes — severe vertigo + loss of balance', gate: {"key": "vertigo", "value": true}, patterns: ['Internal Wind'] },
          { label: 'Yes — mild vertigo + heavy head', gate: {"key": "vertigo", "value": true}, patterns: ['Phlegm'] },
          { label: 'Yes — mild vertigo, worse with fatigue', gate: {"key": "vertigo", "value": true}, patterns: ['Qi Deficiency'] },
          { label: 'No vertigo', gate: {"key": "vertigo", "value": false}, patterns: [] },
        ]
      },
      {
        text: 'Vertigo - what was the onset?',
        requires: ["vertigo"],
        options: [
          { label: 'Suddenly', patterns: ['Excess pattern'] },
          { label: 'Gradually', patterns: ['Deficiency pattern'] },
          { label: 'Unknown', patterns: [] },
        ]
      },
      {
        text: 'Pain throughout the body?',
        options: [
          { label: 'Sudden + cold chills + fever', patterns: ['External Wind-Cold'] },
          { label: 'Generalised pain + fatigue', patterns: ['Qi Deficiency or Blood Deficiency'] },
          { label: 'In women after childbirth — dull pain', patterns: ['Blood Deficiency'] },
          { label: 'In women after childbirth — sharp pain', patterns: ['Blood Stasis'] },
          { label: 'Pain in arms/shoulders when walking', patterns: ['Liver Qi Stagnation'] },
          { label: 'Pain in all muscles + warm head', patterns: ['Stomach Heat'] },
          { label: 'Pain + heaviness', patterns: ['Dampness in muscles'] },
          { label: 'No body pain', patterns: [] },
        ]
      },
      {
        text: 'Joint pain (Bi syndrome)?',
        options: [
          { label: 'Moves from joint to joint', patterns: ['Bi syndrome Wind'] },
          { label: 'Fixed and very painful', patterns: ['Bi syndrome Cold'] },
          { label: 'Fixed, with swelling and numbness', patterns: ['Bi syndrome Dampness'] },
          { label: 'No joint pain', patterns: [] },
        ]
      },
      {
        text: 'Back pain?',
        options: [
          { label: 'Continuous, dull', patterns: ['Kidney Deficiency'] },
          { label: 'Recent, intense, stiff', patterns: ['Blood Stasis'] },
          { label: 'Intense pain, worse with cold and damp', patterns: ['External Cold and Dampness in the channels'] },
          { label: 'Boring pain + impossible to rotate', patterns: ['Blood Stasis'] },
          { label: 'Pain radiating to shoulders', patterns: ['External pathogenic factor'] },
          { label: 'No back pain', patterns: [] },
        ]
      },
      {
        text: 'Numbness in the limbs?',
        options: [
          { label: 'Bilateral numbness in the arms, legs or hands', patterns: ['Blood Deficiency'] },
          { label: 'Unilateral numbness in the fingers, elbow or arm', patterns: ['Internal Wind and Dampness'] },
          { label: 'No numbness', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's4',
    title: '4. Chest and abdomen',
    questions: [
      {
        text: 'Chest pain?',
        options: [
          { label: 'Chest pain (general)', patterns: ['Heart Blood Stasis (due to Yang Deficiency)'] },
          { label: 'Chest pain + cough with yellow phlegm', patterns: ['Lung Heat'] },
          { label: 'Distension or fullness in the hypochondriac region', patterns: ['Liver Qi Stagnation'] },
          { label: 'Same symptoms + intense pain', patterns: ['Liver Qi Stagnation', 'Liver Blood Stasis'] },
          { label: 'No chest pain', patterns: [] },
        ]
      },
      {
        text: 'Epigastric pain (stomach region)?',
        options: [
          { label: 'Epigastric pain (general)', patterns: ['Food Retention Stomach or Stomach Heat'] },
          { label: 'Very dull, mild pain', patterns: ['Cold Deficiency in the stomach'] },
          { label: 'Pain decreases with eating', patterns: ['Deficiency pattern'] },
          { label: 'Pain worsens with eating', patterns: ['Excess pattern'] },
          { label: 'Fullness in the epigastrium', patterns: ['Spleen Deficiency or Dampness'] },
          { label: 'No epigastric pain', patterns: [] },
        ]
      },
      {
        text: 'Lower abdominal pain?',
        options: [
          { label: 'Better after defecation', patterns: ['Excess pattern'] },
          { label: 'Worse after defecation', patterns: ['Deficiency pattern'] },
          { label: 'Lower abdominal pain (general)', patterns: ['Internal Cold / Liver Qi Stagnation / Liver Blood Stasis / Damp-Heat / Blood Stasis in the Intestines or Uterus'] },
          { label: 'Hypogastric pain', patterns: ['Damp-Heat in the Bladder', 'Liver Fire reaching the Bladder'] },
          { label: 'No abdominal pain', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's5',
    title: '5. Food and taste',
    questions: [
      {
        text: 'How are the symptoms affected by eating?',
        options: [
          { label: 'Worse after eating', patterns: ['Excess pattern'] },
          { label: 'Better after eating', patterns: ['Deficiency pattern'] },
          { label: 'No clear connection', patterns: [] },
        ]
      },
      {
        text: 'How would you describe the appetite and food preferences?',
        options: [
          { label: 'Lack of appetite', patterns: ['Spleen Qi Deficiency'] },
          { label: 'Always hungry', patterns: ['Stomach Heat'] },
          { label: 'Fullness/distension after eating', patterns: ['Food Retention'] },
          { label: 'Preference for warm food', patterns: ['Cold syndrome'] },
          { label: 'Preference for cold food', patterns: ['Heat syndrome'] },
          { label: 'No abnormalities', patterns: [] },
        ]
      },
      {
        text: 'Is there an unusual taste in the mouth?',
        options: [
          { label: 'Bitter taste (general)', patterns: ['Heat in Liver or Heart'] },
          { label: 'Constant bitter taste', patterns: ['Liver Fire'] },
          { label: 'Bitter taste in the morning + insomnia', patterns: ['Heart Fire'] },
          { label: 'Sweet taste', patterns: ['Spleen Deficiency or Damp-Heat'] },
          { label: 'Sour taste', patterns: ['Food Retention / Liver-Stomach disharmony'] },
          { label: 'Salty taste', patterns: ['Kidney Yin Deficiency'] },
          { label: 'Lack of taste', patterns: ['Spleen Deficiency'] },
          { label: 'Spicy/pungent taste', patterns: ['Lung Heat'] },
          { label: 'No unusual taste', patterns: [] },
        ]
      },
      {
        text: 'Is there vomiting? If so, how?',
        options: [
          { label: 'Sour vomit', patterns: ['Liver attacking Stomach'] },
          { label: 'Bitter vomit', patterns: ['Heat in Liver and Gallbladder'] },
          { label: 'Clear, watery vomit', patterns: ['Cold in the Stomach + fluid retention'] },
          { label: 'Vomiting immediately after eating, forceful and sudden', patterns: ['Excess Heat Pattern'] },
          { label: 'Vomiting immediately after eating, slow and quiet', patterns: ['Empty Heat'] },
          { label: 'No vomiting', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's6',
    title: '6. Bowel movements and urine',
    questions: [
      {
        text: 'Is there constipation?',
        options: [
          { label: 'Worse after defecation', patterns: ['Deficiency pattern'] },
          { label: 'Better after defecation', patterns: ['Excess pattern'] },
          { label: 'Acute constipation + thirst + dry yellow tongue coating', patterns: ['Heat in the Stomach and Intestines'] },
          { label: 'Constipation in the elderly or after childbirth', patterns: ['Blood Deficiency'] },
          { label: 'Constipation with pellet-like stools', patterns: ['Liver Qi Stagnation or Heat in the Intestines'] },
          { label: 'Difficult defecation without dry stools', patterns: ['Liver Qi Stagnation'] },
          { label: 'Constipation + abdominal pain', patterns: ['Internal Cold and Yang Deficiency'] },
          { label: 'Constipation + dry stools without thirst', patterns: ['Kidney and/or Stomach Yin Deficiency'] },
          { label: 'Alternating constipation and diarrhea', patterns: ['Liver attacking Spleen'] },
          { label: 'No constipation', patterns: [] },
        ]
      },
      {
        text: 'Is there diarrhea?',
        options: [
          { label: 'Diarrhea with pain', patterns: ['Liver or Heat'] },
          { label: 'Foul-smelling diarrhoea', patterns: ['Heat'] },
          { label: 'Diarrhoea without a foul smell', patterns: ['Cold'] },
          { label: 'Chronic diarrhea', patterns: ['Spleen Yang Deficiency and/or Kidney Yang Deficiency'] },
          { label: 'Chronic daily early-morning diarrhoea', patterns: ['Kidney Yang Deficiency'] },
          { label: 'Diarrhea + abdominal pain', patterns: ['Internal Cold in the intestines'] },
          { label: 'Diarrhea + mucus in stool', patterns: ['Dampness in the intestines'] },
          { label: 'Diarrhea + mucus + blood', patterns: ['Damp-Heat in the intestines'] },
          { label: 'Loose stools + undigested food', patterns: ['Spleen Qi Deficiency'] },
          { label: 'Burning anal sensation during defecation', patterns: ['Heat'] },
          { label: 'Stools are not loose but are difficult to hold', patterns: ['Stomach and Spleen Qi Deficiency', 'Spleen Qi Sinking'] },
          { label: 'Borborygmi (rumbling intestines) + loose stools', patterns: ['Spleen Deficiency'] },
          { label: 'Borborygmi + abdominal distension', patterns: ['Liver Qi Stagnation'] },
          { label: 'No diarrhea', patterns: [] },
        ]
      },
      {
        text: 'Is there flatulence?',
        options: [
          { label: 'Foul-smelling flatulence', patterns: ['Damp-Heat in Spleen or Stomach Heat'] },
          { label: 'Flatulence without a foul smell', patterns: ['Internal Cold from Spleen Yang Deficiency'] },
          { label: 'No flatulence', patterns: [] },
        ]
      },
      {
        text: 'Is there blood with bowel movements?',
        options: [
          { label: 'Black, dark stools', patterns: ['Blood Stasis'] },
          { label: 'Blood spurts out before the stool', patterns: ['Damp-Heat in the intestines'] },
          { label: 'Blood associated with a painful anus', patterns: ['Blood Heat'] },
          { label: 'Stool is passed first, followed by blood', patterns: ['Spleen Qi Deficiency'] },
          { label: 'No blood loss', patterns: [] },
        ]
      },
      {
        text: 'How would you describe urination?',
        options: [
          { label: 'Enuresis or incontinence', patterns: ['Kidney Deficiency'] },
          { label: 'Urinary retention', patterns: ['Damp-Heat in the Bladder'] },
          { label: 'Difficult urination', patterns: ['Damp-Heat in the Bladder or Kidney Deficiency'] },
          { label: 'Frequent and copious urination', patterns: ['Kidney Yang Deficiency'] },
          { label: 'Frequent but scanty urination', patterns: ['Qi Deficiency'] },
          { label: 'No abnormalities', patterns: [] },
        ]
      },
      {
        text: 'Is there pain when urinating?',
        options: [
          { label: 'Pain before urinating', patterns: ['Qi Stagnation in the Lower Burner'] },
          { label: 'Pain during urination', patterns: ['Heat in the Bladder'] },
          { label: 'Pain after urinating', patterns: ['Qi Deficiency'] },
          { label: 'No pain when urinating', patterns: [] },
        ]
      },
      {
        text: 'What colour is the urine?',
        options: [
          { label: 'Pale', patterns: ['Cold in the Bladder and Kidney'] },
          { label: 'Dark', patterns: ['Heat'] },
          { label: 'Cloudy and turbid', patterns: ['Dampness in the Bladder'] },
          { label: 'Copious, clear, pale urine (with high fever)', patterns: ['External Wind-Heat/Wind-Cold progressing toward internal exhaustion'] },
          { label: 'Normal colour', patterns: [] },
        ]
      },
      {
        text: 'How much urine is produced?',
        options: [
          { label: 'Large volume', patterns: ['Kidney Yang Deficiency'] },
          { label: 'Small volume', patterns: ['Kidney Yin Deficiency'] },
          { label: 'Normal amount', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's7',
    title: '7. Sleep & TCM Organ Clock',
    intro: 'This section explores sleep in relation to the traditional TCM Organ Clock. The time at which symptoms occur may provide an additional diagnostic clue.',
    questions: [
      {
        text: 'Is there insomnia?',
        options: [
          { label: 'Difficulty falling asleep, followed by sound sleep', patterns: ['Heart Blood Deficiency'] },
          { label: 'Frequent waking during the night', patterns: ['Kidney Yin Deficiency'] },
          { label: 'Dream-disturbed sleep', patterns: ['Liver Fire or Heart Fire'] },
          { label: 'Restless sleep + many dreams', patterns: ['Food Retention'] },
          { label: 'Waking up very early', patterns: ['Gallbladder Deficiency'] },
          { label: 'No sleep problems', patterns: [] },
        ]
      },
      {
        text: 'Is there excessive sleepiness (somnolence)?',
        options: [
          { label: 'Falling asleep after eating', patterns: ['Spleen Qi Deficiency'] },
          { label: 'General drowsiness + heaviness', patterns: ['Dampness Accumulation'] },
          { label: 'Same symptoms + vertigo', patterns: ['Phlegm'] },
          { label: 'Extreme lethargy + fatigue + feeling cold', patterns: ['Kidney Yang Deficiency'] },
          { label: 'No excessive sleepiness', patterns: [] },
        ]
      },
      {
        text: 'How do you fall asleep between 21:00-23:00 (Pericardium time)?',
        options: [
          { label: 'I fall asleep easily within about 20 minutes', patterns: [] },
          { label: 'I often lie awake for longer than 30 minutes', clockSeg: "21-23", patterns: ['Heart/Pericardium Shen Disturbance', 'Yin Deficiency'] },
          { label: 'My mind keeps racing with thoughts', clockSeg: "21-23", patterns: ['Liver Qi Stagnation', 'Shen Disturbance'] },
          { label: 'I already feel tense as soon as I go to sleep', clockSeg: "21-23", patterns: ['Liver Qi Stagnation'] },
        ]
      },
      {
        text: 'Do you wake up at night?',
        options: [
          { label: 'Never / rarely', gate: {"key": "nachtwaker", "value": false}, patterns: [] },
          { label: 'Sometimes', gate: {"key": "nachtwaker", "value": true}, patterns: [] },
          { label: 'Regularly', gate: {"key": "nachtwaker", "value": true}, patterns: ['Shen Disturbance'] },
        ]
      },
      {
        text: 'Around what time do you usually wake during the night? (TCM Organ Clock)',
        requires: ["nachtwaker"],
        options: [
          { label: '23:00–01:00 (Gallbladder time)', clockSeg: "23-01", patterns: ['Gallbladder Qi Stagnation (indecisiveness, Shao Yang)'] },
          { label: '01:00–03:00 (Liver time)', clockSeg: "01-03", patterns: ['Liver Qi Stagnation or Liver Fire'] },
          { label: '03:00–05:00 (Lung time)', clockSeg: "03-05", patterns: ['Lung Qi Deficiency', 'Yin Deficiency'] },
          { label: '05:00–07:00 (Large Intestine time)', clockSeg: "05-07", patterns: ['Large Intestine disharmony (elimination/letting go)'] },
          { label: 'Varies, no fixed time', patterns: [] },
        ]
      },
      {
        text: 'Do you manage to fall back asleep afterwards?',
        requires: ["nachtwaker"],
        options: [
          { label: 'Yes, immediately', patterns: [] },
          { label: 'With difficulty', patterns: ['Yin Deficiency', 'Heart Blood Deficiency'] },
          { label: 'No, I stay awake for a long time', patterns: ['Yin Deficiency', 'Heart Blood Deficiency', 'Shen Disturbance'] },
        ]
      },
      {
        text: 'How do you feel in the morning when you wake up?',
        options: [
          { label: 'Refreshed and rested', patterns: [] },
          { label: 'Tired', patterns: ['Spleen Qi Deficiency'] },
          { label: 'Hard to get out of bed', patterns: ['Yang Deficiency or Kidney Yang Deficiency'] },
          { label: 'As if I haven\'t slept at all', patterns: ['Kidney Qi Deficiency', 'Heart Blood Deficiency'] },
        ]
      },
      {
        text: 'Is there a clear afternoon energy dip?',
        options: [
          { label: 'No', patterns: [] },
          { label: 'Around 1pm (Small Intestine time)', clockSeg: "13-15", patterns: ['Spleen Qi Deficiency', 'Blood Deficiency'] },
          { label: 'Around 3pm (Bladder time)', clockSeg: "15-17", patterns: ['Spleen Qi Deficiency', 'Stomach Qi Deficiency'] },
          { label: 'Every day, pronounced', clockSeg: ["13-15", "15-17"], patterns: ['Spleen Qi Deficiency', 'Blood Deficiency', 'Stomach Qi Deficiency'] },
        ]
      },
      {
        text: 'When are you generally the most tired?',
        options: [
          { label: 'In the morning, hard to get going', patterns: ['Yang Deficiency or Kidney Yang Deficiency'] },
          { label: 'Mid-morning (09:00-11:00, Spleen time)', clockSeg: "09-11", patterns: ['Spleen Qi Deficiency'] },
          { label: 'Late in the evening', patterns: ['Shen Disturbance', 'Yin Deficiency'] },
          { label: 'All day long', patterns: ['Qi Deficiency (general)'] },
        ]
      },
      {
        text: 'How would you describe your dreams during sleep?',
        options: [
          { label: 'Almost never / little recollection', patterns: [] },
          { label: 'Occasionally', patterns: [] },
          { label: 'Frequent, vivid dreams', patterns: ['Heart Fire or Liver Fire', 'Shen Disturbance'] },
          { label: 'Regular nightmares', patterns: ['Shen Disturbance', 'Yin Deficiency'] },
        ]
      },
      {
        text: 'Are there night sweats?',
        options: [
          { label: 'No', patterns: [] },
          { label: 'Sometimes', patterns: ['Yin Deficiency'] },
          { label: 'Often', patterns: ['Yin Deficiency', 'Empty Heat'] },
        ]
      },
      {
        text: 'How do you generally feel between 15:00-17:00 (Bladder time)?',
        options: [
          { label: 'High energy', patterns: [] },
          { label: 'Tired', clockSeg: "15-17", patterns: ['Bladder/Kidney Deficiency'] },
          { label: 'Thirst', clockSeg: "15-17", patterns: ['Kidney Yin Deficiency'] },
          { label: 'Lower back pain', clockSeg: "15-17", patterns: ['Kidney Deficiency'] },
        ]
      },
      {
        text: 'How do you generally feel between 17:00-19:00 (Kidney time)?',
        options: [
          { label: 'Good', patterns: [] },
          { label: 'Cold feet', clockSeg: "17-19", patterns: ['Kidney Yang Deficiency'] },
          { label: 'Exhausted', clockSeg: "17-19", patterns: ['Kidney Qi Deficiency', 'Jing Deficiency'] },
          { label: 'Frequent or excessive urination', clockSeg: "17-19", patterns: ['Kidney Yang Deficiency', 'Jing Deficiency'] },
        ]
      },
    ]
  },
  {
    id: 's8',
    title: '8. Eyes and ears',
    questions: [
      {
        text: 'Is there tinnitus (ringing in the ears)?',
        options: [
          { label: 'Sudden onset', patterns: ['Liver Fire / Liver Wind'] },
          { label: 'Gradual onset', patterns: ['Kidney Deficiency'] },
          { label: 'Worsens with pressure on the ear', patterns: ['Excess pattern'] },
          { label: 'Improves with pressure on the ear', patterns: ['Deficiency pattern'] },
          { label: 'Loud, high-pitched sound (whistling)', patterns: ['Liver Yang / Liver Fire / Liver Wind'] },
          { label: 'Low-pitched sound (like waves)', patterns: ['Kidney Deficiency'] },
          { label: 'No tinnitus', patterns: [] },
        ]
      },
      {
        text: 'Is there hearing loss?',
        options: [
          { label: 'Sudden onset', patterns: ['Excess pattern'] },
          { label: 'Gradual onset', patterns: ['Deficiency pattern'] },
          { label: 'Chronic deafness', patterns: ['Kidney Deficiency / Heart Blood Deficiency / Qi Deficiency / Yang Deficiency'] },
          { label: 'No hearing problems', patterns: [] },
        ]
      },
      {
        text: 'Are there eye complaints?',
        options: [
          { label: 'Needle-like pain + red eyes', patterns: ['Toxic Fire in the Heart channel'] },
          { label: 'Red, painful and swollen eyes', patterns: ['External pathogenic factor Wind-Heat or Liver Fire'] },
          { label: 'Blurred vision', patterns: ['Liver Blood Deficiency'] },
          { label: 'Photophobia (light sensitivity)', patterns: ['Liver Blood Deficiency'] },
          { label: 'Feeling of pressure in the eyes', patterns: ['Kidney Yin Deficiency'] },
          { label: 'Dry eyes', patterns: ['Liver Yin Deficiency and/or Kidney Yin Deficiency'] },
          { label: 'No eye complaints', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's9',
    title: '9. Thirst and drinks',
    questions: [
      {
        text: 'How would you describe thirst and drinking behaviour?',
        options: [
          { label: 'Strong thirst with a desire to drink large quantities', patterns: ['Excess Heat'] },
          { label: 'No thirst', patterns: ['Cold in the Stomach or Spleen'] },
          { label: 'Thirst without a desire to drink', patterns: ['Damp-Heat'] },
          { label: 'Thirst with a preference for small sips', patterns: ['Stomach or Kidney Yin Deficiency'] },
          { label: 'Preference for cold drinks', patterns: ['Heat syndrome'] },
          { label: 'Preference for warm drinks', patterns: ['Cold syndrome'] },
          { label: 'Normal thirst', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's10',
    title: '10. Pain — general',
    questions: [
      {
        text: 'Does the patient currently have any additional pain that still needs to be characterised (head, body and abdominal pain already covered above)?',
        options: [
          { label: 'Yes, additional pain still needs to be characterised', gate: {"key": "pijn_algemeen", "value": true}, patterns: [] },
          { label: 'No, no additional pain', gate: {"key": "pijn_algemeen", "value": false}, patterns: [] },
        ]
      },
      {
        text: 'Does the pain correspond more closely to an Excess or Deficiency pattern?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Excess-type pain', patterns: ['External pathogenic factor / Internal Cold or Heat / Qi or Blood Stasis / Phlegm Obstruction / Food Retention'] },
          { label: 'Deficiency-type pain', patterns: ['Qi and Blood Deficiency / depletion of Body Fluids associated with Yin Deficiency'] },
          { label: 'Unclear', patterns: [] },
        ]
      },
      {
        text: 'How would you describe the character and location of the pain?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Distending pain without a precise location', patterns: ['Qi Stagnation'] },
          { label: 'Intense, boring pain with a precise fixed location', patterns: ['Blood Stasis'] },
          { label: 'Not applicable', patterns: [] },
        ]
      },
      {
        text: 'How is the pain affected by pressure?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Relieved by pressure', patterns: ['Deficiency pattern'] },
          { label: 'Worsens with pressure', patterns: ['Excess pattern'] },
          { label: 'No effect / unknown', patterns: [] },
        ]
      },
      {
        text: 'How is the pain affected by eating?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Relieved by eating', patterns: ['Deficiency pattern'] },
          { label: 'Worsens with eating', patterns: ['Excess pattern'] },
          { label: 'No effect / unknown', patterns: [] },
        ]
      },
      {
        text: 'What type of pain is it?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Dull, longstanding pain', patterns: ['Deficiency pattern'] },
          { label: 'Acute pain', patterns: ['Excess pattern'] },
          { label: 'Cramping pain', patterns: ['Cold pattern'] },
          { label: 'Burning pain', patterns: ['Heat pattern'] },
          { label: 'None of these', patterns: [] },
        ]
      },
      {
        text: 'How is the pain affected by temperature?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Relieved by warmth', patterns: ['Cold pattern'] },
          { label: 'Relieved by cold', patterns: ['Heat pattern'] },
          { label: 'No effect / unknown', patterns: [] },
        ]
      },
      {
        text: 'How is the pain affected by defecation?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Worsens after defecation', patterns: ['Deficiency pattern', 'Cold pattern'] },
          { label: 'Improves after defecation', patterns: ['Excess pattern', 'Heat pattern'] },
          { label: 'No effect / unknown', patterns: [] },
        ]
      },
      {
        text: 'Which position relieves the pain?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Lying down', patterns: ['Deficiency pattern'] },
          { label: 'Sitting', patterns: ['Excess pattern'] },
          { label: 'No clear preference', patterns: [] },
        ]
      },
      {
        text: 'What was the onset of the pain?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Slow, gradual', patterns: ['Deficiency pattern'] },
          { label: 'Sudden', patterns: ['Excess pattern'] },
          { label: 'Unknown', patterns: [] },
        ]
      },
      {
        text: 'How is the pain affected by vomiting?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Worsens with vomiting', patterns: ['Deficiency pattern', 'Cold pattern'] },
          { label: 'Improves with vomiting', patterns: ['Excess pattern', 'Heat pattern'] },
          { label: 'Not applicable', patterns: [] },
        ]
      },
      {
        text: 'How is the pain affected by rest or movement?',
        requires: ["pijn_algemeen"],
        options: [
          { label: 'Better with rest', patterns: ['Deficiency pattern'] },
          { label: 'Better with movement (but worse with cold)', patterns: ['Excess pattern or Cold pattern'] },
          { label: 'Worse with movement', patterns: ['Heat pattern'] },
          { label: 'No effect / unknown', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's11',
    title: '11. Gynaecology',
    onlyIf: 'female',
    questions: [
      {
        text: 'Does the patient currently menstruate? If so, what is the cycle like?',
        options: [
          { label: 'Yes - menstruation consistently occurs early', gate: {"key": "menstruatie", "value": true}, patterns: ['Blood Heat or Qi Deficiency'] },
          { label: 'Yes - menstruation consistently occurs late', gate: {"key": "menstruatie", "value": true}, patterns: ['Blood Deficiency / Blood Stasis / Cold Stasis'] },
          { label: 'Yes - irregular cycle', gate: {"key": "menstruatie", "value": true}, patterns: ['Liver Qi Stagnation / Liver Blood Stasis / Spleen Deficiency'] },
          { label: 'Yes - regular cycle', gate: {"key": "menstruatie", "value": true}, patterns: [] },
          { label: 'No (pregnancy, menopause, or n/a)', gate: {"key": "menstruatie", "value": false}, patterns: [] },
        ]
      },
      {
        text: 'Amount of menstrual bleeding?',
        requires: ["menstruatie"],
        options: [
          { label: 'Heavy', patterns: ['Blood Heat', 'Qi Deficiency'] },
          { label: 'Small volume', patterns: ['Blood Deficiency or Blood Stasis / Cold Stasis'] },
          { label: 'Normal amount', patterns: [] },
        ]
      },
      {
        text: 'Colour of the menstrual blood?',
        requires: ["menstruatie"],
        options: [
          { label: 'Dark red or bright red', patterns: ['Blood Heat'] },
          { label: 'Pale', patterns: ['Blood Deficiency'] },
          { label: 'Very dark', patterns: ['Blood Stasis or Cold Stasis'] },
          { label: 'Fresh blood (with empty heat)', patterns: ['Empty Heat from Yin Deficiency'] },
          { label: 'Normal colour', patterns: [] },
        ]
      },
      {
        text: 'Consistency of the blood?',
        requires: ["menstruatie"],
        options: [
          { label: 'Clotted, with blood clots', patterns: ['Blood Stasis or Cold Stasis'] },
          { label: 'Watery', patterns: ['Blood Deficiency or Yin Deficiency'] },
          { label: 'Turbid', patterns: ['Blood Heat / Cold Stasis'] },
          { label: 'Normal consistency', patterns: [] },
        ]
      },
      {
        text: 'Is there pain related to menstruation?',
        requires: ["menstruatie"],
        options: [
          { label: 'Pain before menstruation', patterns: ['Qi Stagnation / Blood Stasis'] },
          { label: 'Pain during menstruation', patterns: ['Blood Heat / Cold Stasis / Blood Stasis'] },
          { label: 'Pain after menstruation', patterns: ['Blood Deficiency'] },
          { label: 'No menstrual pain', patterns: [] },
        ]
      },
      {
        text: 'Is there abnormal vaginal discharge? What colour?',
        options: [
          { label: 'White', gate: {"key": "afscheiding", "value": true}, patterns: ['Spleen Yang Deficiency / Kidney Yang Deficiency / External Damp-Cold / Liver Qi Stagnation'] },
          { label: 'Yellow', gate: {"key": "afscheiding", "value": true}, patterns: ['Damp-Heat in the Lower Burner'] },
          { label: 'Greenish', gate: {"key": "afscheiding", "value": true}, patterns: ['Damp-Heat in the Liver channel'] },
          { label: 'Mixed red and white', gate: {"key": "afscheiding", "value": true}, patterns: ['Damp-Heat'] },
          { label: 'Yellow discharge + pus + blood (during menopause)', gate: {"key": "afscheiding", "value": true}, patterns: ['Toxic Damp-Heat in the uterus'] },
          { label: 'No abnormal discharge', gate: {"key": "afscheiding", "value": false}, patterns: [] },
        ]
      },
      {
        text: 'Consistency of the vaginal discharge?',
        requires: ["afscheiding"],
        options: [
          { label: 'Watery', patterns: ['Damp-Cold'] },
          { label: 'Thick', patterns: ['Damp-Heat'] },
          { label: 'Unknown', patterns: [] },
        ]
      },
      {
        text: 'Are there any relevant features related to pregnancy or childbirth?',
        options: [
          { label: 'Infertility', patterns: ['Blood Deficiency / Kidney Jing Deficiency / Damp-Heat in the Lower Burner / Blood Stasis in the uterus'] },
          { label: 'Vomiting during pregnancy', patterns: ['Stomach Deficiency', 'Chong Mai Deficiency'] },
          { label: 'Miscarriage before the third month', patterns: ['Blood Deficiency', 'Kidney Jing Deficiency'] },
          { label: 'Miscarriage after the third month', patterns: ['Liver Blood Deficiency', 'Spleen Qi collapse'] },
          { label: 'Nausea and severe bleeding after childbirth', patterns: ['Chong Mai exhaustion'] },
          { label: 'Sweating and fever after childbirth', patterns: ['Qi and Blood exhaustion'] },
          { label: 'Postnatal depression', patterns: ['Blood Deficiency progressing to Heart Blood Deficiency'] },
          { label: 'None of these', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's12',
    title: '12. Paediatrics / birth history',
    onlyIf: 'pediatric',
    questions: [
      {
        text: 'Was there significant shock or trauma during pregnancy, or exposure to alcohol, medication or tobacco?',
        options: [
          { label: 'Yes, shock or trauma during pregnancy', patterns: ['Possible influence on constitution'] },
          { label: 'Yes, exposure to alcohol, medication or tobacco during pregnancy', patterns: ['Negative influence on health'] },
          { label: 'No, neither', patterns: [] },
        ]
      },
      {
        text: 'Was the birth difficult (e.g. Caesarean section or prolonged labour)?',
        options: [
          { label: 'Yes', patterns: ['Lung impairment'] },
          { label: 'No', patterns: [] },
        ]
      },
      {
        text: 'Was the child weaned too early?',
        options: [
          { label: 'Yes', patterns: ['Food Retention and skin conditions'] },
          { label: 'No / not applicable', patterns: [] },
        ]
      },
      {
        text: 'Did the child have significant childhood illnesses (e.g. whooping cough or measles)?',
        options: [
          { label: 'Yes', patterns: ['Weakened Lung'] },
          { label: 'No', patterns: [] },
        ]
      },
    ]
  },
  {
    id: 's13',
    title: '13. Pulse diagnosis',
    therapistOnly: true,
    questions: [
      {
        text: 'Pulse rate?',
        options: [
          { label: 'Normal (~4 beats per respiratory cycle)', patterns: [] },
          { label: 'Rapid (Shuo)', patterns: ['Heat'] },
          { label: 'Slow (Chi)', patterns: ['Cold'] },
        ]
      },
      {
        text: 'Depth of the pulse?',
        options: [
          { label: 'Normal - clearly palpable at moderate pressure', patterns: [] },
          { label: 'Floating (Fu) - palpable with light pressure', patterns: ['Exterior pattern'] },
          { label: 'Deep (Chen) - only palpable with firm pressure', patterns: ['Interior pattern'] },
        ]
      },
      {
        text: 'Strength of the pulse?',
        options: [
          { label: 'Normal - forceful but not hard', patterns: [] },
          { label: 'Full / Forceful (Shi)', patterns: ['Excess pattern (Shi)'] },
          { label: 'Empty / Weak (Xu)', patterns: ['Qi Deficiency (general)'] },
        ]
      },
      {
        text: 'Pulse width and shape?',
        options: [
          { label: 'Normal width', patterns: [] },
          { label: 'Thin / Thready (Xi)', patterns: ['Blood Deficiency or Yin Deficiency'] },
          { label: 'Slippery (Hua)', patterns: ['Dampness or Phlegm'] },
          { label: 'Wiry (Xian) - taut like a bowstring', patterns: ['Liver Qi Stagnation'] },
        ]
      },
      {
        text: 'Rhythm of the pulse?',
        options: [
          { label: 'Regular', patterns: [] },
          { label: 'Intermittent pulse with regular pauses (Dai)', patterns: ['Heart Qi Deficiency or Blood Stasis'] },
          { label: 'Irregular pulse with variable pauses (Cu/Jie)', patterns: ['Heat with stagnation or Heart disharmony'] },
        ]
      },
      {
        text: 'Any other notable pulse quality?',
        options: [
          { label: 'No notable quality', patterns: [] },
          { label: 'Choppy (Se)', patterns: ['Blood Stasis or Blood Deficiency'] },
          { label: 'Soggy / Soft (Ru)', patterns: ['Qi Deficiency or Dampness'] },
          { label: 'Hidden / deeply concealed pulse (Fu)', patterns: ['Internal blockage or severe Cold'] },
        ]
      },
    ]
  },
];

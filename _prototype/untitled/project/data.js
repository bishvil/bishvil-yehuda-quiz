// Quiz data + brand presets — bishvil yehuda quiz platform

window.BSY_BRANDS = {
  yehuda: {
    id: 'yehuda',
    name: 'בשביל יהודה',
    sub: 'מורשת בדרך ערך',
    logo: 'assets/logos/logo_yehuda.png',
    primary: '#306030',
    accent: '#A0C040',
    deep: '#1F4720',
  },
  haari: {
    id: 'haari',
    name: 'בשביל הארי',
    sub: 'מורשת בדרך ערך',
    logo: 'assets/logos/logo_haari.png',
    primary: '#306030',
    accent: '#A0C040',
    deep: '#1F4720',
  },
  tzafon: {
    id: 'tzafon',
    name: 'בשביל הצפון',
    sub: 'מורשת בדרך ערך',
    logo: 'assets/logos/logo_tzafon.png',
    primary: '#306030',
    accent: '#A0C040',
    deep: '#1F4720',
  },
  etzion: {
    id: 'etzion',
    name: 'בשביל עציון',
    sub: 'מורשת בדרך ערך',
    logo: 'assets/logos/logo_etzion.jpeg',
    primary: '#306030',
    accent: '#A0C040',
    deep: '#1F4720',
  },
};

window.BSY_QUIZ = {
  title: 'מסע בעקבות אבות האומה — חברון',
  subtitle: 'מסלול חידון לחיילי טירונות',
  pin: '482·193',

  // Custom quiz-level logo (overrides brand logo for participants).
  // null = inherit from brand. Otherwise an image URL.
  customLogo: null,
  customLogoLabel: 'פלוגה ב׳ · חטיבת הצנחנים',

  // Join fields — admin-configured. Phone is mandatory; rest are toggleable.
  joinFields: [
    { id: 'phone', label: 'מספר נייד', type: 'tel', required: true, fixed: true,
      placeholder: '050-1234567', help: 'נשתמש בו כדי לזהות אותך בלוח התוצאות' },
    { id: 'name',  label: 'שם פרטי', type: 'text', required: true, placeholder: 'כפי שירשם בלוח' },
    { id: 'unit',  label: 'גדוד / פלוגה', type: 'text', required: false, placeholder: 'גדוד 890' },
    { id: 'team',  label: 'צוות', type: 'select', required: false,
      options: ['ללא', 'צוות א׳', 'צוות ב׳', 'צוות ג׳', 'צוות ד׳'] },
  ],

  questions: [
    {
      id: 1,
      type: 'single',
      typeLabel: 'רב־ברירה',
      prompt: 'מי קנה ראשון את חלקת הקבר במערת המכפלה?',
      options: [
        { id: 'a', text: 'אברהם אבינו' },
        { id: 'b', text: 'יצחק אבינו' },
        { id: 'c', text: 'יעקב אבינו' },
        { id: 'd', text: 'משה רבנו' },
      ],
      correct: ['a'],
      explanation: 'אברהם רכש את שדה המכפלה מעפרון החתי בארבע מאות שקל כסף, כפי שמתואר בספר בראשית פרק כ״ג.',
      time: 25,
    },
    {
      id: 2,
      type: 'truefalse',
      typeLabel: 'נכון / לא נכון',
      prompt: 'תל חברון העתיקה (תל רומיידה) הוא אחד האתרים הארכיאולוגיים העתיקים ביותר בארץ ישראל.',
      options: [
        { id: 't', text: 'נכון' },
        { id: 'f', text: 'לא נכון' },
      ],
      correct: ['t'],
      explanation: 'בתל רומיידה נחשפו שכבות יישוב שראשיתן בתקופת הברונזה הקדומה, לפני יותר מ־4,000 שנה.',
      time: 15,
    },
    {
      id: 3,
      type: 'image',
      typeLabel: 'זיהוי תמונה',
      prompt: 'איזה אתר היסטורי מופיע בתמונה?',
      image: 'mearat-hamachpela',
      options: [
        { id: 'a', text: 'מצדה' },
        { id: 'b', text: 'מערת המכפלה' },
        { id: 'c', text: 'הכותל המערבי' },
        { id: 'd', text: 'קבר רחל' },
      ],
      correct: ['b'],
      explanation: 'הבניין שעליו רואים את החומה ההרודיאנית הוא מערת המכפלה בחברון — המבנה היחיד מימי בית שני שעדיין שלם.',
      time: 20,
    },
    {
      id: 4,
      type: 'multi',
      typeLabel: 'בחירה מרובה',
      prompt: 'אילו מהדמויות הבאות קבורות במערת המכפלה לפי המסורת? (סמנו את כל הנכונות)',
      options: [
        { id: 'a', text: 'אברהם ושרה' },
        { id: 'b', text: 'יצחק ורבקה' },
        { id: 'c', text: 'יעקב ולאה' },
        { id: 'd', text: 'דוד המלך' },
      ],
      correct: ['a', 'b', 'c'],
      explanation: 'במערה קבורים שלושת זוגות האבות והאמהות. רחל, אשת יעקב, נקברה בקבר רחל סמוך לבית לחם.',
      time: 25,
    },
    {
      id: 5,
      type: 'map',
      typeLabel: 'דקירה על מפה',
      prompt: 'סמנו על המפה את מיקום מערת המכפלה.',
      // bounding region in image (% units): the 'correct' pin location and tolerance radius.
      mapImage: 'judea-region',
      target: { x: 55, y: 52 },     // % from left and top (matches SVG city pos)
      targetLabel: 'חברון',
      tolerance: 8,                  // % radius
      label: 'חברון, יהודה',
      explanation: 'מערת המכפלה ממוקמת בלב העיר חברון, כ-30 ק״מ מדרום לירושלים בהר חברון.',
      time: 30,
    },
    {
      id: 6,
      type: 'single',
      typeLabel: 'רב־ברירה',
      prompt: 'בכמה שנים מלך דוד המלך בחברון לפני שעלה לירושלים?',
      options: [
        { id: 'a', text: 'שנה אחת' },
        { id: 'b', text: 'שלוש שנים' },
        { id: 'c', text: 'שבע שנים וחצי' },
        { id: 'd', text: 'ארבעים שנה' },
      ],
      correct: ['c'],
      explanation: 'דוד מלך בחברון על שבט יהודה במשך שבע שנים ושישה חודשים, ורק לאחר מכן הוכתר על כל ישראל ועלה לירושלים.',
      time: 20,
    },
  ],
};

// players for the host live view
window.BSY_PLAYERS = [
  { id: 1, name: 'נועה ל.', score: 4200, answered: true, av: 'נ' },
  { id: 2, name: 'אורי כ.', score: 3850, answered: true, av: 'א' },
  { id: 3, name: 'תמר ב.', score: 3700, answered: true, av: 'ת' },
  { id: 4, name: 'יואב ר.', score: 3550, answered: true, av: 'י' },
  { id: 5, name: 'מיכל פ.', score: 3400, answered: true, av: 'מ' },
  { id: 6, name: 'איתן ש.', score: 3200, answered: true, av: 'א' },
  { id: 7, name: 'שירה מ.', score: 3050, answered: false, av: 'ש' },
  { id: 8, name: 'רון ד.', score: 2900, answered: true, av: 'ר' },
  { id: 9, name: 'הילה ע.', score: 2750, answered: false, av: 'ה' },
  { id: 10, name: 'בן נ.', score: 2600, answered: true, av: 'ב' },
  { id: 11, name: 'יעל ק.', score: 2450, answered: true, av: 'י' },
  { id: 12, name: 'דניאל ז.', score: 2300, answered: false, av: 'ד' },
];

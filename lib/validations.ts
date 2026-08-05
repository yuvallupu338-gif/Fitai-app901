import { z } from 'zod';

// ---------------------------------------------------------------------
// אימות
// ---------------------------------------------------------------------

export const usernameSchema = z
  .string({ required_error: 'שם משתמש הוא שדה חובה' })
  .trim()
  .min(3, 'שם המשתמש חייב להכיל לפחות 3 תווים')
  .max(30, 'שם המשתמש יכול להכיל עד 30 תווים')
  .regex(
    /^[a-zA-Z0-9._א-ת]+$/,
    'שם המשתמש יכול להכיל אותיות בעברית או באנגלית, ספרות, נקודה וקו תחתון בלבד',
  );

export const passwordSchema = z
  .string({ required_error: 'סיסמה היא שדה חובה' })
  .min(8, 'הסיסמה חייבת להכיל לפחות שמונה תווים')
  .max(72, 'הסיסמה ארוכה מדי')
  .regex(/[A-Za-zא-ת]/, 'הסיסמה חייבת להכיל לפחות אות אחת')
  .regex(/\d/, 'הסיסמה חייבת להכיל לפחות ספרה אחת');

export const registerSchema = z
  .object({
    fullName: z
      .string({ required_error: 'שם מלא הוא שדה חובה' })
      .trim()
      .min(2, 'יש להזין שם מלא')
      .max(80, 'השם ארוך מדי'),
    username: usernameSchema,
    cityId: z.string({ required_error: 'יש לבחור עיר מגורים' }).uuid('יש לבחור עיר מהרשימה'),
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'יש לאמת את הסיסמה' }),
    avatarUrl: z.string().url().optional().nullable(),
    birthDate: z.string().optional().nullable(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'יש לאשר את תנאי השימוש' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'הסיסמאות אינן תואמות',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  username: z.string({ required_error: 'יש להזין שם משתמש' }).trim().min(1, 'יש להזין שם משתמש'),
  password: z.string({ required_error: 'יש להזין סיסמה' }).min(1, 'יש להזין סיסמה'),
  remember: z.boolean().default(true),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'יש להזין את הסיסמה הנוכחית'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'הסיסמאות אינן תואמות',
    path: ['confirmPassword'],
  });

export const resetPasswordSchema = z
  .object({
    username: z.string().trim().min(1, 'יש להזין שם משתמש'),
    recoveryCode: z.string().trim().min(8, 'יש להזין את קוד השחזור'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'הסיסמאות אינן תואמות',
    path: ['confirmPassword'],
  });

// ---------------------------------------------------------------------
// פרופיל אישי
// ---------------------------------------------------------------------

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'יש להזין שם מלא').max(80),
  username: usernameSchema,
  cityId: z.string().uuid('יש לבחור עיר מהרשימה'),
  bio: z.string().trim().max(400, 'התיאור ארוך מדי').optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  birthDate: z.string().optional().nullable(),
});

export const privacySchema = z.object({
  show_city: z.boolean(),
  show_reviews: z.boolean(),
  show_following: z.boolean(),
  allow_messages_from: z.enum(['everyone', 'following']),
});

export const notificationPrefsSchema = z.object({
  in_app: z.boolean(),
  push: z.boolean(),
  new_message: z.boolean(),
  new_follower: z.boolean(),
  post_like: z.boolean(),
  post_comment: z.boolean(),
  bookings: z.boolean(),
  reminders: z.boolean(),
  reviews: z.boolean(),
});

export const guardianSchema = z.object({
  guardianName: z.string().trim().min(2, 'יש להזין שם של הורה או אחראי'),
  guardianPhone: z
    .string()
    .trim()
    .regex(/^0\d{1,2}-?\d{7}$/, 'יש להזין מספר טלפון ישראלי תקין'),
});

// ---------------------------------------------------------------------
// פרופיל מקצועי
// ---------------------------------------------------------------------

export const professionalDetailsSchema = z.object({
  businessName: z.string().trim().min(2, 'יש להזין שם עסק או שם מקצועי').max(80),
  headline: z.string().trim().max(140, 'התיאור הקצר ארוך מדי').optional().nullable(),
  bio: z.string().trim().max(2000, 'התיאור המפורט ארוך מדי').optional().nullable(),
  professionIds: z.array(z.string().uuid()).min(1, 'יש לבחור לפחות מקצוע אחד'),
  otherProfession: z.string().trim().max(60).optional().nullable(),
  cityId: z.string().uuid('יש לבחור עיר'),
  yearsExperience: z.coerce.number().int().min(0).max(70).optional().nullable(),
  avatarUrl: z.string().url('יש להעלות תמונת פרופיל מקצועית'),
  coverUrl: z.string().url().optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^0\d{1,2}-?\d{7}$/, 'יש להזין מספר טלפון ישראלי תקין'),
  websiteUrl: z.string().url('כתובת אתר לא תקינה').optional().or(z.literal('')).nullable(),
  instagramUrl: z.string().trim().max(200).optional().nullable(),
});

export const serviceLocationSchema = z
  .object({
    acceptsHomeVisits: z.boolean(),
    acceptsStudio: z.boolean(),
    acceptsEvents: z.boolean(),
    acceptsOnline: z.boolean(),
    studioAddress: z.string().trim().max(200).optional().nullable(),
    serviceAreaCityIds: z.array(z.string().uuid()).default([]),
    maxTravelKm: z.coerce.number().int().min(0).max(300).optional().nullable(),
    travelFeeType: z.enum(['none', 'fixed', 'per_km', 'per_city']),
    travelFee: z.coerce.number().min(0).max(1000).default(0),
  })
  .refine((d) => d.acceptsHomeVisits || d.acceptsStudio || d.acceptsEvents || d.acceptsOnline, {
    message: 'יש לבחור לפחות אפשרות אחת למתן שירות',
    path: ['acceptsHomeVisits'],
  })
  .refine((d) => !d.acceptsHomeVisits || d.serviceAreaCityIds.length > 0, {
    message: 'יש לבחור לפחות אזור שירות אחד כאשר מגיעים לבית הלקוח',
    path: ['serviceAreaCityIds'],
  })
  .refine((d) => !d.acceptsStudio || Boolean(d.studioAddress && d.studioAddress.length > 3), {
    message: 'יש להזין את כתובת הסטודיו (הכתובת נשמרת באופן פרטי)',
    path: ['studioAddress'],
  });

export const serviceSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, 'יש להזין שם שירות').max(80),
    description: z.string().trim().max(600).optional().nullable(),
    professionId: z.string().uuid().optional().nullable(),
    priceType: z.enum(['fixed', 'range', 'on_request']),
    priceMin: z.coerce.number().min(0).max(100000).optional().nullable(),
    priceMax: z.coerce.number().min(0).max(100000).optional().nullable(),
    durationMinutes: z.coerce.number().int().min(5, 'משך מינימלי 5 דקות').max(1440),
    bufferMinutes: z.coerce.number().int().min(0).max(240).default(15),
    atClientHome: z.boolean().default(false),
    atStudio: z.boolean().default(false),
    atEvent: z.boolean().default(false),
    supportsRecurring: z.boolean().default(true),
    imageUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.priceType !== 'fixed' || (d.priceMin ?? -1) >= 0, {
    message: 'יש להזין מחיר',
    path: ['priceMin'],
  })
  .refine(
    (d) => d.priceType !== 'range' || ((d.priceMin ?? -1) >= 0 && (d.priceMax ?? -1) >= (d.priceMin ?? 0)),
    { message: 'טווח המחירים אינו תקין', path: ['priceMax'] },
  )
  .refine((d) => d.atClientHome || d.atStudio || d.atEvent, {
    message: 'יש לבחור היכן ניתן להזמין את השירות',
    path: ['atClientHome'],
  });

export const availabilityWindowSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'שעה לא תקינה'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'שעה לא תקינה'),
    isBreak: z.boolean().default(false),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
    path: ['endTime'],
  });

export const availabilitySchema = z.object({
  windows: z.array(availabilityWindowSchema).min(1, 'יש להגדיר לפחות יום פעילות אחד'),
  minLeadTimeMinutes: z.coerce.number().int().min(0).max(60 * 24 * 30).default(120),
  maxLeadTimeDays: z.coerce.number().int().min(1).max(365).default(90),
  cancellationPolicy: z.string().trim().max(600).optional().nullable(),
});

export const blockedDateSchema = z
  .object({
    startAt: z.string().min(1, 'יש לבחור תאריך התחלה'),
    endAt: z.string().min(1, 'יש לבחור תאריך סיום'),
    reason: z.string().trim().max(120).optional().nullable(),
    isVacation: z.boolean().default(false),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
    path: ['endAt'],
  });

// ---------------------------------------------------------------------
// פוסטים
// ---------------------------------------------------------------------

export const postMediaSchema = z.object({
  url: z.string().url(),
  mediaType: z.enum(['image', 'video']),
  thumbnailUrl: z.string().url().optional().nullable(),
  width: z.number().int().optional().nullable(),
  height: z.number().int().optional().nullable(),
  beforeAfterRole: z.enum(['before', 'after']).optional().nullable(),
  altText: z.string().max(160).optional().nullable(),
});

export const postSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(2, 'יש להזין כותרת').max(120),
    description: z.string().trim().max(2000).optional().nullable(),
    serviceId: z.string().uuid().optional().nullable(),
    professionId: z.string().uuid().optional().nullable(),
    cityId: z.string().uuid().optional().nullable(),
    priceEstimate: z.coerce.number().min(0).max(100000).optional().nullable(),
    priceType: z.enum(['fixed', 'range', 'on_request']).default('on_request'),
    durationMinutes: z.coerce.number().int().min(5).max(1440).optional().nullable(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10, 'עד 10 תגיות').default([]),
    isBeforeAfter: z.boolean().default(false),
    consentConfirmed: z.boolean().default(false),
    status: z.enum(['draft', 'published']).default('published'),
    media: z.array(postMediaSchema).min(1, 'יש להעלות לפחות תמונה או סרטון אחד').max(10),
  })
  .refine((d) => !d.isBeforeAfter || d.consentConfirmed, {
    message: 'פרסום תמונות לפני ואחרי מחייב אישור מפורש של הלקוח',
    path: ['consentConfirmed'],
  })
  .refine(
    (d) =>
      !d.isBeforeAfter ||
      (d.media.some((m) => m.beforeAfterRole === 'before') &&
        d.media.some((m) => m.beforeAfterRole === 'after')),
    { message: 'יש לסמן תמונת "לפני" ותמונת "אחרי"', path: ['media'] },
  );

export const commentSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(1, 'אי אפשר לשלוח תגובה ריקה').max(1000, 'התגובה ארוכה מדי'),
  parentId: z.string().uuid().optional().nullable(),
});

// ---------------------------------------------------------------------
// כתובות והזמנות
// ---------------------------------------------------------------------

export const addressSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40).default('הבית שלי'),
  cityId: z.string().uuid('יש לבחור עיר'),
  street: z.string().trim().min(2, 'יש להזין רחוב').max(80),
  houseNumber: z.string().trim().max(10).optional().nullable(),
  apartment: z.string().trim().max(10).optional().nullable(),
  floor: z.string().trim().max(10).optional().nullable(),
  entranceCode: z.string().trim().max(20).optional().nullable(),
  arrivalNotes: z.string().trim().max(300).optional().nullable(),
  hasParking: z.boolean().optional().nullable(),
  isDefault: z.boolean().default(false),
});

export const bookingSchema = z
  .object({
    professionalId: z.string().uuid(),
    serviceId: z.string().uuid({ message: 'יש לבחור שירות' }),
    locationType: z.enum(['client_home', 'studio', 'event', 'online']),
    scheduledStart: z.string().min(1, 'יש לבחור תאריך ושעה'),
    addressId: z.string().uuid().optional().nullable(),
    eventAddress: z.string().trim().max(200).optional().nullable(),
    peopleCount: z.coerce.number().int().min(1).max(50).default(1),
    notes: z.string().trim().max(1000).optional().nullable(),
    inspirationUrl: z.string().url().optional().nullable(),
    sourcePostId: z.string().uuid().optional().nullable(),
    guardianContact: z.string().trim().max(120).optional().nullable(),
    shareWithContact: z.string().trim().max(120).optional().nullable(),
  })
  .refine((d) => d.locationType !== 'client_home' || Boolean(d.addressId), {
    message: 'יש לבחור כתובת לביקור בית',
    path: ['addressId'],
  })
  .refine((d) => d.locationType !== 'event' || Boolean(d.eventAddress), {
    message: 'יש להזין את כתובת האירוע',
    path: ['eventAddress'],
  });

export const proposeChangeSchema = z.object({
  bookingId: z.string().uuid(),
  proposedStart: z.string().optional().nullable(),
  proposedPrice: z.coerce.number().min(0).max(100000).optional().nullable(),
  note: z.string().trim().max(400).optional().nullable(),
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(300).optional().nullable(),
});

// ---------------------------------------------------------------------
// מפגשים קבועים
// ---------------------------------------------------------------------

export const seriesSchema = z
  .object({
    professionalId: z.string().uuid(),
    serviceId: z.string().uuid({ message: 'יש לבחור שירות' }),
    locationType: z.enum(['client_home', 'studio', 'event', 'online']),
    addressId: z.string().uuid().optional().nullable(),
    frequency: z.enum(['weekly', 'biweekly', 'every_3_weeks', 'every_4_weeks', 'monthly', 'custom']),
    intervalWeeks: z.coerce.number().int().min(1).max(12).default(2),
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'שעה לא תקינה'),
    startDate: z.string().min(1, 'יש לבחור תאריך התחלה'),
    endDate: z.string().optional().nullable(),
    plannedOccurrences: z.coerce.number().int().min(1).max(104).optional().nullable(),
    approvalMode: z.enum(['whole_series', 'each_occurrence']).default('whole_series'),
    priceAmount: z.coerce.number().min(0).max(100000).optional().nullable(),
    notes: z.string().trim().max(600).optional().nullable(),
    skipSequences: z.array(z.number().int()).default([]),
  })
  .refine((d) => d.locationType !== 'client_home' || Boolean(d.addressId), {
    message: 'יש לבחור כתובת קבועה לביקורי בית',
    path: ['addressId'],
  })
  .refine((d) => Boolean(d.endDate) || Boolean(d.plannedOccurrences), {
    message: 'יש לבחור תאריך סיום או מספר מפגשים',
    path: ['plannedOccurrences'],
  });

// ---------------------------------------------------------------------
// הודעות, ביקורות ודיווחים
// ---------------------------------------------------------------------

export const messageSchema = z
  .object({
    conversationId: z.string().uuid(),
    body: z.string().trim().max(4000).optional().nullable(),
    attachmentUrl: z.string().url().optional().nullable(),
  })
  .refine((d) => Boolean(d.body?.length) || Boolean(d.attachmentUrl), {
    message: 'אי אפשר לשלוח הודעה ריקה',
    path: ['body'],
  });

export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, 'יש לבחור דירוג').max(5),
  body: z.string().trim().max(2000).optional().nullable(),
  imageUrls: z.array(z.string().url()).max(4).default([]),
});

export const reviewReplySchema = z.object({
  reviewId: z.string().uuid(),
  body: z.string().trim().min(1, 'יש להזין תגובה').max(1500),
});

export const reportSchema = z.object({
  targetType: z.enum(['user', 'professional', 'post', 'comment', 'message', 'review']),
  targetId: z.string().uuid(),
  reason: z.string().min(1, 'יש לבחור סיבה'),
  details: z.string().trim().max(1000).optional().nullable(),
});

export const professionRequestSchema = z.object({
  rawName: z
    .string()
    .trim()
    .min(2, 'יש להזין שם מקצוע')
    .max(60, 'שם המקצוע ארוך מדי'),
  note: z.string().trim().max(300).optional().nullable(),
});

export const savedSearchSchema = z.object({
  name: z.string().trim().min(1, 'יש להזין שם לחיפוש').max(60),
  query: z.record(z.unknown()),
  notifyOnMatch: z.boolean().default(false),
});

// ---------------------------------------------------------------------
// חיפוש
// ---------------------------------------------------------------------

export const searchFiltersSchema = z.object({
  term: z.string().trim().max(120).optional(),
  professionIds: z.array(z.string().uuid()).optional(),
  cityId: z.string().uuid().optional().nullable(),
  maxDistanceKm: z.coerce.number().int().min(1).max(300).optional().nullable(),
  priceMin: z.coerce.number().min(0).optional().nullable(),
  priceMax: z.coerce.number().min(0).optional().nullable(),
  minRating: z.coerce.number().min(0).max(5).optional().nullable(),
  minExperience: z.coerce.number().int().min(0).max(70).optional().nullable(),
  homeVisit: z.boolean().optional(),
  studio: z.boolean().optional(),
  event: z.boolean().optional(),
  online: z.boolean().optional(),
  availableToday: z.boolean().optional(),
  availableNow: z.boolean().optional(),
  recurring: z.boolean().optional(),
  verified: z.boolean().optional(),
  sort: z
    .enum(['recommended', 'nearest', 'newest', 'rating', 'price_low', 'response', 'availability', 'followers'])
    .default('recommended'),
  page: z.coerce.number().int().min(1).default(1),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type SeriesInput = z.infer<typeof seriesSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type ProfessionalDetailsInput = z.infer<typeof professionalDetailsSchema>;
export type ServiceLocationInput = z.infer<typeof serviceLocationSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

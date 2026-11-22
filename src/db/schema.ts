import { relations } from 'drizzle-orm';
import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('Role', ['ADMIN', 'DOSEN', 'MAHASISWA']);
export type Role = (typeof roleEnum.enumValues)[number];

export const accountStatusEnum = pgEnum('AccountStatus', ['ACTIVE', 'INACTIVE', 'PENDING']);
export type AccountStatus = (typeof accountStatusEnum.enumValues)[number];

export const classStatusEnum = pgEnum('ClassStatus', ['OPEN', 'CLOSED']);
export type ClassStatus = (typeof classStatusEnum.enumValues)[number];

export const materialTypeEnum = pgEnum('MaterialType', ['TEXT', 'LINK', 'FILE']);
export type MaterialType = (typeof materialTypeEnum.enumValues)[number];

export const assignmentStatusEnum = pgEnum('AssignmentStatus', ['OPEN', 'CLOSED']);
export type AssignmentStatus = (typeof assignmentStatusEnum.enumValues)[number];

export const gradeStatusEnum = pgEnum('GradeStatus', ['DRAFT', 'PUBLISHED']);
export type GradeStatus = (typeof gradeStatusEnum.enumValues)[number];

export const quizStatusEnum = pgEnum('QuizStatus', ['DRAFT', 'PUBLISHED', 'CLOSED']);
export type QuizStatus = (typeof quizStatusEnum.enumValues)[number];

export const questionTypeEnum = pgEnum('QuestionType', ['MULTIPLE_CHOICE', 'ESSAY']);
export type QuestionType = (typeof questionTypeEnum.enumValues)[number];

export const attemptStatusEnum = pgEnum('AttemptStatus', ['IN_PROGRESS', 'PROVISIONAL', 'FINAL']);
export type AttemptStatus = (typeof attemptStatusEnum.enumValues)[number];

export const notificationTypeEnum = pgEnum('NotificationType', [
  'ASSIGNMENT_NEW',
  'QUIZ_NEW',
  'ANNOUNCEMENT_NEW',
  'GRADE_PUBLISHED',
  'MATERIAL_NEW',
]);
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** @deprecated Historical nullable column from retired Google Sign-In; preserved non-destructively. */
  uid: text('uid').unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 150 }).notNull(),
  role: roleEnum('role').notNull(),
  status: accountStatusEnum('status').default('PENDING').notNull(),
  authVersion: integer('auth_version').default(0).notNull(),
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 2000 }),
    status: classStatusEnum('status').default('OPEN').notNull(),
    invitationCodeHash: char('invitation_code_hash', { length: 64 }).unique(),
    invitationCodeVersion: integer('invitation_code_version').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('classes_owner_id_status_created_at_id_idx').on(table.ownerId, table.status, table.createdAt, table.id)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('memberships_class_id_user_id_key').on(table.classId, table.userId),
    index('memberships_user_id_created_at_id_idx').on(table.userId, table.createdAt, table.id),
    index('memberships_class_id_created_at_id_idx').on(table.classId, table.createdAt, table.id),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    csrfHash: char('csrf_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('sessions_user_id_revoked_at_expires_at_idx').on(table.userId, table.revokedAt, table.expiresAt)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('password_reset_tokens_user_id_used_at_expires_at_idx').on(
      table.userId,
      table.usedAt,
      table.expiresAt,
    ),
  ],
);

export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    bucketKey: varchar('bucket_key', { length: 128 }).primaryKey(),
    hits: integer('hits').default(1).notNull(),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('rate_limit_buckets_reset_at_idx').on(table.resetAt)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id'),
    action: varchar('action', { length: 80 }).notNull(),
    subjectId: uuid('subject_id'),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_events_created_at_idx').on(table.createdAt),
    index('audit_events_actor_id_created_at_idx').on(table.actorId, table.createdAt),
  ],
);

export const studentRoster = pgTable('student_roster', {
  id: uuid('id').defaultRandom().primaryKey(),
  nim: varchar('nim', { length: 30 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 150 }).notNull(),
  registrationEligible: boolean('registration_eligible').default(false).notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true }),
  registeredUserId: uuid('registered_user_id')
    .unique()
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 150 }).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('topics_class_id_sort_order_idx').on(table.classId, table.sortOrder, table.createdAt)],
);

export const materials = pgTable(
  'materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 160 }).notNull(),
    type: materialTypeEnum('type').default('TEXT').notNull(),
    content: text('content'),
    externalUrl: varchar('external_url', { length: 1000 }),
    attachmentName: varchar('attachment_name', { length: 255 }),
    attachmentMime: varchar('attachment_mime', { length: 120 }),
    attachmentSize: integer('attachment_size'),
    attachmentData: text('attachment_data'),
    isPublished: boolean('is_published').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('materials_class_id_topic_id_sort_idx').on(table.classId, table.topicId, table.sortOrder, table.createdAt)],
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    instructions: text('instructions').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: assignmentStatusEnum('status').default('OPEN').notNull(),
    allowLate: boolean('allow_late').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('assignments_class_id_due_at_idx').on(table.classId, table.dueAt, table.createdAt)],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    textAnswer: text('text_answer'),
    attachmentName: varchar('attachment_name', { length: 255 }),
    attachmentMime: varchar('attachment_mime', { length: 120 }),
    attachmentSize: integer('attachment_size'),
    attachmentData: text('attachment_data'),
    version: integer('version').default(1).notNull(),
    isLate: boolean('is_late').default(false).notNull(),
    score: numeric('score', { precision: 5, scale: 2 }),
    feedback: text('feedback'),
    gradeStatus: gradeStatusEnum('grade_status'),
    gradedBy: uuid('graded_by').references(() => users.id, { onDelete: 'set null' }),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('submissions_assignment_id_student_id_key').on(table.assignmentId, table.studentId),
    index('submissions_assignment_id_submitted_at_idx').on(table.assignmentId, table.submittedAt),
  ],
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description'),
    timeLimitMinutes: integer('time_limit_minutes').default(30).notNull(),
    maxAttempts: integer('max_attempts').default(1).notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    status: quizStatusEnum('status').default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('quizzes_class_id_status_closes_at_idx').on(table.classId, table.status, table.closesAt)],
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    type: questionTypeEnum('type').notNull(),
    prompt: text('prompt').notNull(),
    points: numeric('points', { precision: 5, scale: 2 }).default('10.00').notNull(),
    position: integer('position').default(0).notNull(),
  },
  (table) => [index('questions_quiz_id_position_idx').on(table.quizId, table.position)],
);

export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    position: integer('position').default(0).notNull(),
  },
  (table) => [index('question_options_question_id_position_idx').on(table.questionId, table.position)],
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').default(1).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    autoScore: numeric('auto_score', { precision: 5, scale: 2 }).default('0.00').notNull(),
    manualScore: numeric('manual_score', { precision: 5, scale: 2 }).default('0.00').notNull(),
    finalScore: numeric('final_score', { precision: 5, scale: 2 }),
    status: attemptStatusEnum('status').default('IN_PROGRESS').notNull(),
  },
  (table) => [
    uniqueIndex('quiz_attempts_quiz_id_student_id_attempt_number_key').on(
      table.quizId,
      table.studentId,
      table.attemptNumber,
    ),
    index('quiz_attempts_quiz_id_student_id_idx').on(table.quizId, table.studentId),
  ],
);

export const attemptAnswers = pgTable(
  'attempt_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => quizAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    selectedOptionId: uuid('selected_option_id').references(() => questionOptions.id, { onDelete: 'set null' }),
    textAnswer: text('text_answer'),
    pointsAwarded: numeric('points_awarded', { precision: 5, scale: 2 }),
    feedback: text('feedback'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('attempt_answers_attempt_id_question_id_key').on(table.attemptId, table.questionId)],
);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('announcements_class_id_created_at_idx').on(table.classId, table.createdAt)],
);

export const forumTopics = pgTable(
  'forum_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('forum_topics_class_id_created_at_idx').on(table.classId, table.createdAt)],
);

export const forumReplies = pgTable(
  'forum_replies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => forumTopics.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('forum_replies_topic_id_created_at_idx').on(table.topicId, table.createdAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message').notNull(),
    targetUrl: varchar('target_url', { length: 500 }).notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('notifications_user_id_is_read_created_at_idx').on(table.userId, table.isRead, table.createdAt)],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  passwordResetTokens: many(passwordResetTokens),
  ownedClasses: many(classes),
  memberships: many(memberships),
  submissions: many(submissions),
  quizAttempts: many(quizAttempts),
  announcements: many(announcements),
  forumTopics: many(forumTopics),
  forumReplies: many(forumReplies),
  notifications: many(notifications),
  rosterRegistration: one(studentRoster, {
    fields: [users.id],
    references: [studentRoster.registeredUserId],
  }),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  owner: one(users, {
    fields: [classes.ownerId],
    references: [users.id],
  }),
  memberships: many(memberships),
  topics: many(topics),
  materials: many(materials),
  assignments: many(assignments),
  quizzes: many(quizzes),
  announcements: many(announcements),
  forumTopics: many(forumTopics),
  notifications: many(notifications),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  class: one(classes, {
    fields: [memberships.classId],
    references: [classes.id],
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  class: one(classes, {
    fields: [topics.classId],
    references: [classes.id],
  }),
  materials: many(materials),
}));

export const materialsRelations = relations(materials, ({ one }) => ({
  class: one(classes, {
    fields: [materials.classId],
    references: [classes.id],
  }),
  topic: one(topics, {
    fields: [materials.topicId],
    references: [topics.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  class: one(classes, {
    fields: [assignments.classId],
    references: [classes.id],
  }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  assignment: one(assignments, {
    fields: [submissions.assignmentId],
    references: [assignments.id],
  }),
  student: one(users, {
    fields: [submissions.studentId],
    references: [users.id],
  }),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  class: one(classes, {
    fields: [quizzes.classId],
    references: [classes.id],
  }),
  questions: many(questions),
  attempts: many(quizAttempts),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
  options: many(questionOptions),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one }) => ({
  question: one(questions, {
    fields: [questionOptions.questionId],
    references: [questions.id],
  }),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [quizAttempts.quizId],
    references: [quizzes.id],
  }),
  student: one(users, {
    fields: [quizAttempts.studentId],
    references: [users.id],
  }),
  answers: many(attemptAnswers),
}));

export const attemptAnswersRelations = relations(attemptAnswers, ({ one }) => ({
  attempt: one(quizAttempts, {
    fields: [attemptAnswers.attemptId],
    references: [quizAttempts.id],
  }),
  question: one(questions, {
    fields: [attemptAnswers.questionId],
    references: [questions.id],
  }),
  selectedOption: one(questionOptions, {
    fields: [attemptAnswers.selectedOptionId],
    references: [questionOptions.id],
  }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  class: one(classes, {
    fields: [announcements.classId],
    references: [classes.id],
  }),
  author: one(users, {
    fields: [announcements.authorId],
    references: [users.id],
  }),
}));

export const forumTopicsRelations = relations(forumTopics, ({ one, many }) => ({
  class: one(classes, {
    fields: [forumTopics.classId],
    references: [classes.id],
  }),
  author: one(users, {
    fields: [forumTopics.authorId],
    references: [users.id],
  }),
  replies: many(forumReplies),
}));

export const forumRepliesRelations = relations(forumReplies, ({ one }) => ({
  topic: one(forumTopics, {
    fields: [forumReplies.topicId],
    references: [forumTopics.id],
  }),
  author: one(users, {
    fields: [forumReplies.authorId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  class: one(classes, {
    fields: [notifications.classId],
    references: [classes.id],
  }),
}));

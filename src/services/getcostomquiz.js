/**
 * src/services/getcostomquiz.js
 * ---------------------------------------------------------------------------
 * Custom quiz storage on MongoDB — the AlexaInc/alexatg way.
 *
 * This is a straight port of alexatg's `db/models/quiz.js` (schema) plus the
 * secondary-connection part of `db/index.js`: the quiz pack lives in its own
 * cluster (QUIZ_MONGO_URI) instead of a JSON file on disk.
 *
 * ONLY the storage side changed — sending questions and answering/looking up
 * responses still lives in src/modules/quizManager.js, untouched.
 *
 *   before: ./data/quizzes/<quizId>.json   (fs.writeJson / fs.readJson)
 *   after : `quizzes` collection           (new Model().save() / Model.findOne)
 *
 * If QUIZ_MONGO_URI is not configured we must NOT open a connection (an empty
 * uri makes the driver throw an unhandled MongoParseError and kills the bot
 * process at startup). Callers get `null` back and answer with
 * "custom quizzes are not available (DB not connected)", like alexatg does.
 * ---------------------------------------------------------------------------
 */
const mongoose = require("mongoose");
const config = require("../config");

/** Same shape as alexatg db/models/quiz.js */
const CustomQuizSchema = new mongoose.Schema({
  quizId: { type: String, required: true, unique: true },
  creatorId: String,
  title: String,
  description: { type: String, default: "" },
  openPeriod: { type: Number, default: 20 }, // seconds per question (10-600)
  questions: [
    {
      question: String,
      options: [String],
      answer: Number, // 0-indexed correct option
      explanation: String,
      media: String, // file_id or url
      mediaType: String, // 'photo', 'video', 'animation'
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

let quizDb = null;
let CustomQuizModel = null;

if (config.QUIZ_MONGO_URI) {
  // Separate connection (like alexatg's SECONDARY_MONGO_URI) so the quiz
  // lookups never share the main mongoose connection of the app.
  quizDb = mongoose.createConnection(config.QUIZ_MONGO_URI);

  quizDb.on("connected", () => console.log("✅ Quiz MongoDB Connected"));
  quizDb.on("error", (err) =>
    console.error(
      "❌ Quiz MongoDB Connection Error:",
      (err && err.message) || err,
    ),
  );
  quizDb.on("disconnected", () => console.warn("⚠️ Quiz MongoDB disconnected"));

  // A failed handshake must never bubble up as an unhandled rejection.
  quizDb.asPromise().catch((err) => {
    console.error("❌ Quiz MongoDB could not be reached:", err.message);
  });

  CustomQuizModel = quizDb.model("Quiz", CustomQuizSchema);
} else {
  console.warn(
    "⚠️  config: QUIZ_MONGO_URI is not set — custom quizzes (/setquiz, /quiz <id>) are disabled.",
  );
}

module.exports = {
  /** Model for quiz packs, or null when no QUIZ_MONGO_URI is configured. */
  getCustomQuizModel: () => CustomQuizModel,
  CustomQuizSchema,
};

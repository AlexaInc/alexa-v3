const mongoose = require("mongoose");
const config = require("../config");
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

const quizDb = mongoose.createConnection(config.QUIZ_MONGO_URI);
const CustomQuizModel = quizDb.model("Quiz", CustomQuizSchema);

module.exports = { getCustomQuizModel: () => CustomQuizModel };

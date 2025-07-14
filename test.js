import OpenAI from "openai"

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: "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",

})

async function main() {
  const completion = await openai.chat.completions.create({
    model: "moonshotai/kimi-k2:free",
    messages: [
      {
        role: "user",
        content: "What is the meaning of life?"
      }
    ]
  })

  console.log(completion.choices[0].message)
}

main()

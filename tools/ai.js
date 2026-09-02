require('../src/config'); // load .env FIRST (in order)
const { OpenAI } = require("openai");

const token = process.env["OPENROUTER_TOKEN"];
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: token
  });

// To authenticate with the model you will need to generate a personal access token (PAT) in your GitHub settings. 
// Create your PAT token by following instructions here: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

async function ai(message,id) {



  const response = await client.chat.completions.create({
    messages: [
      { role:"system", content: "i Am alexxa , i am a whatsapp chatbot, i was made by hansaka." },
      { role:"user", content: `${message}` }
    ],
    model: "qwen/qwen2.5-vl-72b-instruct:free",
    user: `${id}`,
    temperature: 1,
    max_tokens: 4096,
    top_p: 1
  });

  //console.log(response.choices[0].message.content);
  const result = response.choices[0].message.content;
 return result
}

module.exports = {ai};
// result.catch((err) => {
//   console.error("The sample encountered an error:", err);
// });

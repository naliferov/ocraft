import OpenAI from 'openai';
const client = new OpenAI();

const stream = await client.responses.create({
  model: 'gpt-5.2',
  input: 'give me example server on node.js',
  stream: true,
});

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }
  if (event.type === "response.completed") {
    process.stdout.write("\n");
  }
  if (event.type === "error") {
    console.error("\n[stream error]", event.error);
  }
}
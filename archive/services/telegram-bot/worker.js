const tgAPI = async (token, method, params) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  const json = await response.json()
  return json
}

while (true) {
  const token = await fs.readFile('token', 'utf8')
  const json = await tgAPI(token, 'getUpdates')

  const updates = JSON.parse(await fs.readFile('updates.json', 'utf8'))

  for (const update of json.result) {
    if (updates[update.update_id]) continue
    updates[update.update_id] = 1
    await fs.writeFile('updates.json', JSON.stringify(updates))
    
    // await tgAPI(token, 'sendMessage', {
    //   chat_id: update.message.chat.id,
    //   text: 'Hello World!',
    // })
  }

  await new Promise(resolve => setTimeout(resolve, 2000))
}
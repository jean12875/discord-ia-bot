const { Client, GatewayIntentBits, Events } = require('discord.js')
const Groq = require('groq-sdk')
const fs = require('fs')
const path = require('path')
const http = require('http')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
})

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const cooldown = new Set()

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot connecté en tant que ${c.user.tag}`)
})

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  if (!message.mentions.has(client.user)) return

  // Anti-doublon : ignore si déjà en train de traiter ce message
  if (cooldown.has(message.id)) return
  cooldown.add(message.id)
  setTimeout(() => cooldown.delete(message.id), 5000)

  const userMessage = message.content
    .replace(/<@!?[0-9]+>/g, '')
    .trim()

  if (!userMessage) {
    return message.reply('Oui ? Tu voulais me dire quelque chose ? 😊')
  }

  await message.channel.sendTyping()

  try {
    const instructions = fs.readFileSync(
      path.join(__dirname, 'instructions.txt'),
      'utf-8'
    )

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 1024,
    })

    const reply = completion.choices[0].message.content

    if (reply.length > 1990) {
      const chunks = reply.match(/.{1,1990}/gs)
      for (const chunk of chunks) {
        await message.reply(chunk)
      }
    } else {
      await message.reply(reply)
    }

  } catch (error) {
    console.error('Erreur IA:', error)
    await message.reply('❌ Une erreur est survenue, réessaie dans quelques secondes.')
  }
})

http.createServer((req, res) => res.end('Bot en ligne')).listen(process.env.PORT || 3000)

client.login(process.env.DISCORD_TOKEN)

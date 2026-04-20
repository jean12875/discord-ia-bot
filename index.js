const { Client, GatewayIntentBits, Events } = require('discord.js')
const Groq = require('groq-sdk')
const fs = require('fs')
const path = require('path')
const http = require('http')

process.on('SIGTERM', () => process.exit(0))

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
})

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const processing = new Set()
const conversations = new Map()
const MAX_HISTORY = 10
const MEMORY_EXPIRY = 30 * 60 * 1000

const KEEPALIVE_CHANNEL_ID = '1495747495953961110'

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot connecté en tant que ${c.user.tag}`)

  setInterval(async () => {
    try {
      const channel = await client.channels.fetch(KEEPALIVE_CHANNEL_ID)
      if (channel) {
        const msg = await channel.send('🟢')
        setTimeout(() => msg.delete().catch(() => {}), 5000)
      }
    } catch (err) {
      console.error('Keep-alive error:', err)
    }
  }, 3 * 60 * 1000)
})

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  if (!message.mentions.has(client.user)) return

  if (processing.has(message.id)) return
  processing.add(message.id)

  try {
    const userMessage = message.content
      .replace(/<@!?[0-9]+>/g, '')
      .trim()

    if (!userMessage) {
      processing.delete(message.id)
      return message.reply('Oui ? Tu voulais me dire quelque chose ? 😊')
    }

    await message.channel.sendTyping()

    const instructions = fs.readFileSync(
      path.join(__dirname, 'instructions.txt'),
      'utf-8'
    )

    const userId = message.author.id
    if (!conversations.has(userId)) {
      conversations.set(userId, { history: [], lastActivity: Date.now() })
    }

    const userConv = conversations.get(userId)
    userConv.lastActivity = Date.now()
    userConv.history.push({ role: 'user', content: userMessage })

    if (userConv.history.length > MAX_HISTORY * 2) {
      userConv.history = userConv.history.slice(-MAX_HISTORY * 2)
    }

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: instructions },
        ...userConv.history
      ],
      max_tokens: 1024,
    })

    const reply = completion.choices[0].message.content
    userConv.history.push({ role: 'assistant', content: reply })

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
  } finally {
    processing.delete(message.id)
  }
})

setInterval(() => {
  const now = Date.now()
  for (const [userId, conv] of conversations.entries()) {
    if (now - conv.lastActivity > MEMORY_EXPIRY) {
      conversations.delete(userId)
    }
  }
}, 10 * 60 * 1000)

const PORT = process.env.PORT || 3000
http.createServer((req, res) => res.end('Bot en ligne')).listen(PORT)

client.login(process.env.DISCORD_TOKEN)

const { Client, GatewayIntentBits, Events } = require('discord.js')
const { GoogleGenerativeAI } = require('@google/generative-ai')
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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

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

    // Historique au format Gemini
    const geminiHistory = userConv.history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: instructions,
    })

    const chat = model.startChat({
      history: geminiHistory,
    })

    const result = await chat.sendMessage(userMessage)
    const reply = result.response.text()

    // Sauvegarde dans l'historique
    userConv.history.push({ role: 'user', content: userMessage })
    userConv.history.push({ role: 'assistant', content: reply })

    if (userConv.history.length > MAX_HISTORY * 2) {
      userConv.history = userConv.history.slice(-MAX_HISTORY * 2)
    }

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

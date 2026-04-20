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

// Mémoire de conversation par utilisateur
const conversations = new Map()
const MAX_HISTORY = 10 // Garde les 10 derniers échanges
const MEMORY_EXPIRY = 30 * 60 * 1000 // Efface après 30 min d'inactivité

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot connecté en tant que ${c.user.tag}`)
})

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  if (!message.mentions.has(client.user)) return

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

    // Récupère ou crée l'historique de cet utilisateur
    const userId = message.author.id
    if (!conversations.has(userId)) {
      conversations.set(userId, { history: [], lastActivity: Date.now() })
    }

    const userConv = conversations.get(userId)
    userConv.lastActivity = Date.now()

    // Ajoute le message de l'utilisateur à l'historique
    userConv.history.push({ role: 'user', content: userMessage })

    // Garde seulement les MAX_HISTORY derniers messages
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

    // Ajoute la réponse du bot à l'historique
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
  }
})

// Nettoie les conversations inactives toutes les 10 min
setInterval(() => {
  const now = Date.now()
  for (const [userId, conv] of conversations.entries()) {
    if (now - conv.lastActivity > MEMORY_EXPIRY) {
      conversations.delete(userId)
    }
  }
}, 10 * 60 * 1000)

http.createServer((req, res) => res.end('Bot en ligne')).listen(process.env.PORT || 3000)

client.login(process.env.DISCORD_TOKEN)

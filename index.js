const { Client, GatewayIntentBits, Events } = require('discord.js')
const Groq = require('groq-sdk')
const fs = require('fs')
const path = require('path')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
})

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot connecté en tant que ${c.user.tag}`)
})

client.on(Events.MessageCreate, async (message) => {
  // Ignore les autres bots
  if (message.author.bot) return

  // Répond seulement si le bot est mentionné
  if (!message.mentions.has(client.user)) return

  // Enlève la mention du message pour garder juste la question
  const userMessage = message.content
    .replace(/<@!?[0-9]+>/g, '')
    .trim()

  if (!userMessage) {
    return message.reply('Oui ? Tu voulais me dire quelque chose ? 😊')
  }

  // Indique que le bot est en train d'écrire
  await message.channel.sendTyping()

  try {
    // Lecture du fichier instructions
    const instructions = fs.readFileSync(
      path.join(__dirname, 'instructions.txt'),
      'utf-8'
    )

    // Appel à l'IA Groq
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 1024,
    })

    const reply = completion.choices[0].message.content

    // Discord limite les messages à 2000 caractères
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

client.login(process.env.DISCORD_TOKEN)

# vacua.js

Official JavaScript/TypeScript SDK for the [VACUA](https://vacua.app) API and Gateway.

## Installation

```bash
npm install vacua.js
# or
yarn add vacua.js
# or
bun add vacua.js
```

## Quick Start

```js
const { Client, GatewayIntents } = require('vacua.js')

const client = new Client({ intents: [GatewayIntents.Guilds, GatewayIntents.GuildMessages, GatewayIntents.MessageContent] })

client.on('ready', () => {
  console.log(`Logged in as ${client.user.username}`)
})

client.on('messageCreate', (message) => {
  if (message.content === '!ping') {
    message.reply('Pong!')
  }
})

client.login('YOUR_BOT_TOKEN')
```

## TypeScript

```ts
import { Client, GatewayIntents, RawMessage } from 'vacua.js'

const client = new Client({ intents: [GatewayIntents.Guilds, GatewayIntents.GuildMessages] })

client.on('messageCreate', (message: RawMessage) => {
  console.log(message.content)
})

client.login('YOUR_BOT_TOKEN')
```

## Slash Commands

```ts
import { Client, GatewayIntents, CommandInteraction, SlashCommandBuilder } from 'vacua.js'

const client = new Client({ intents: [GatewayIntents.Guilds] })

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
]

client.on('ready', async () => {
  await client.application?.commands.set(commands)
})

client.on('interactionCreate', async (interaction: CommandInteraction) => {
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!')
  }
})

client.login('YOUR_BOT_TOKEN')
```

## Embeds

```ts
import { EmbedBuilder } from 'vacua.js'

const embed = new EmbedBuilder()
  .setTitle('Hello World')
  .setDescription('This is an embed')
  .setColor('#5865F2')
  .setTimestamp()

message.channel.send({ embeds: [embed] })
```

## GatewayIntents

| Intent | Value | Description |
|---|---|---|
| `Guilds` | `1` | Server and channel events |
| `GuildMembers` | `2` | Member join/leave events |
| `GuildMessages` | `512` | Message events in servers |
| `MessageContent` | `32768` | Access to message content |
| `DirectMessages` | `4096` | DM events |

## Links

- [Documentation](https://vacua.app/developers/docs)
- [Developer Portal](https://vacua.app/developers)
- [npm](https://www.npmjs.com/package/vacua.js)

## License

MIT

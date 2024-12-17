// handlers.ts
import {
  Client,
  MessagePayload,
  TextChannel,
} from "https://deno.land/x/harmony/mod.ts"

// Fetch all channel messages in a guild (skips given channel IDs).
// Writes fetched data to a provided output directory.
export async function fetchAllChannelMessages(
  client: Client,
  skipChannels: string[],
  outputDir: string,
): Promise<Record<string, MessagePayload[]>> {
  const channels = await client.channels.array()
  console.log(`Found ${channels.length} channels`)

  const messagesByChannel: Record<string, MessagePayload[]> = {}

  for (const ch of channels) {
    if (skipChannels.includes(ch.id)) {
      console.log(`Skipping channel ${ch.id}`)
      continue
    }

    if (!ch.isText()) {
      console.log(`Skipping channel ${ch.id} (not a text channel)`)
      continue
    }

    const channel = ch as TextChannel
    console.log(`Fetching messages from channel ${channel.id}...`)

    messagesByChannel[channel.id] = []
    let lastMessageId: string | undefined

    while (true) {
      const opts: Record<string, unknown> = { limit: 100 }
      if (lastMessageId) opts.before = lastMessageId

      try {
        console.log(
          `Fetching messages with options: ${
            JSON.stringify(opts)
          } in channel ${channel.id}`,
        )
        const messages: MessagePayload[] = await channel.client.rest.api
          .channels[channel.id].messages
          .get(opts)

        if (!messages.length) {
          console.log(
            `No more messages found in channel ${channel.id}, stopping.`,
          )
          break
        }

        // Sort messages by timestamp (ascending)
        messages.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        lastMessageId = messages[messages.length - 1].id
        messagesByChannel[channel.id].push(...messages)

        // Write partial data to disk
        const jsonData = JSON.stringify(messagesByChannel, null, 2)
        await Deno.writeTextFile(
          `${outputDir}/${channel.id}-messages.json`,
          jsonData,
        )
        console.log(
          `Wrote ${
            messagesByChannel[channel.id].length
          } messages so far for channel ${channel.id}`,
        )
      } catch (error) {
        console.error("Error fetching or writing messages:", error)
        break
      }

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return messagesByChannel
}

// Filter a big record of messages by a given user ID
export function filterMessagesByUser(
  data: Record<string, MessagePayload[]>,
  userId: string,
): MessagePayload[] {
  const allMessages = Object.values(data).flat()
  return allMessages.filter((m) => m.author.id === userId)
}

// Takes messages keyed by channel ID (or a single array) and turns them into a JSONL dataset
// Also adds some custom user samples
export function createJsonl(
  data: Record<string, MessagePayload[]> | MessagePayload[],
): string {
  // If data is a record, flatten it:
  const messages = Array.isArray(data) ? data : Object.values(data).flat()

  if (!messages.length) {
    console.warn("No messages found; cannot create JSONL.")
    return ""
  }

  const username = messages[0].author.username
  const systemContent =
    `You are a discord bot representing a person named ${username} with the discord handle @${username}. Your mission is to draft messages in ${username} style.`

  // Filter out attachments, embeds, mentions, links
  let filtered = messages.filter((m) => m.attachments.length === 0)
  filtered = filtered.filter((m) => m.embeds.length === 0)
  filtered = filtered.filter((m) => m.mentions.length === 0)
  filtered = filtered.filter((m) => !m.content.includes("http"))

  const jsonlLines = filtered.map((m) => {
    const isReply = !!m.referenced_message?.content

    const conversation = isReply
      ? {
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: m.referenced_message!.content },
          { role: "assistant", content: m.content },
        ],
      }
      : {
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: "" },
          { role: "assistant", content: m.content },
        ],
      }

    return JSON.stringify(conversation)
  })

  // TODO
  // // Example custom user conversations
  // const customUserConversations = [
  //   {
  //     messages: [
  //       { role: "system", content: systemContent },
  //       { role: "user", content: "hi" },
  //       { role: "assistant", content: "yo" },
  //     ],
  //   },
  //   {
  //     messages: [
  //       { role: "system", content: systemContent },
  //       { role: "user", content: "how are you?" },
  //       { role: "assistant", content: "good" },
  //     ],
  //   },
  // ]
  // jsonlLines.push(
  //   ...customUserConversations.map((conv) => JSON.stringify(conv)),
  // )

  return jsonlLines.join("\n")
}

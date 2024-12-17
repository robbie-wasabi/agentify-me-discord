#!/usr/bin/env deno run --allow-net --allow-read --allow-write
// main.ts
import { config } from "https://deno.land/x/dotenv/mod.ts"
import { Client } from "https://deno.land/x/harmony/mod.ts"
import {
  createJsonl,
  fetchAllChannelMessages,
  filterMessagesByUser,
} from "./handlers.ts"

// Load environment variables
await config({ export: true })

const token = Deno.env.get("DISCORD_TOKEN")
if (!token) {
  console.error("DISCORD_TOKEN not found in environment variables.")
  Deno.exit(1)
}

// Minimal usage instructions:
//   deno run --allow-all main.ts fetch <comma_separated_skip_channels>
//   deno run --allow-all main.ts filter <USER_ID> <PATH_TO_JSON>
//   deno run --allow-all main.ts jsonl <PATH_TO_JSON>

const [command, arg1, arg2] = Deno.args
if (!command) {
  console.log(`
Usage:
  deno run --allow-all main.ts fetch [SKIP_CHANNELS]
    Fetch messages from all channels, skipping any comma-separated channels.
  
  deno run --allow-all main.ts filter <USER_ID> <INPUT_JSON>
    Filter messages by a user ID and write to a new file.
  
  deno run --allow-all main.ts jsonl <INPUT_JSON>
    Convert a saved JSON of messages into JSONL format.
`)
  Deno.exit(0)
}

// It's fun to write to a temp directory
const tempDir = await Deno.makeTempDir({ prefix: "discord_" })
console.log(`Using temp directory: ${tempDir}`)

// Create a Harmony client
const client = new Client({
  intents: ["GUILDS", "DIRECT_MESSAGES", "GUILD_MESSAGES"],
  token,
})

// If the command is 'fetch', connect now
if (command === "fetch") {
  await client.connect()
}

switch (command) {
  case "fetch": {
    // If arg1 exists, interpret it as a comma-separated list of channel IDs to skip
    const skipChannels = arg1 ? arg1.split(",").map((id) => id.trim()) : []
    console.log("Fetching all channel messages...")
    const data = await fetchAllChannelMessages(client, skipChannels, tempDir)

    // After the loop, combine everything into a single JSON for convenience
    const allJson = JSON.stringify(data, null, 2)
    const combinedFile = `${tempDir}/all-channel-messages.json`
    await Deno.writeTextFile(combinedFile, allJson)
    console.log(`Wrote combined JSON to: ${combinedFile}`)
    break
  }

  case "filter": {
    if (!arg1 || !arg2) {
      console.error("Usage: filter <USER_ID> <PATH_TO_JSON>")
      Deno.exit(1)
    }
    const userId = arg1
    const inputJson = arg2

    const rawData = await Deno.readTextFile(inputJson)
    const data = JSON.parse(rawData)
    const userMessages = filterMessagesByUser(data, userId)

    const outPath = `${tempDir}/${userId}-messages.json`
    await Deno.writeTextFile(outPath, JSON.stringify(userMessages, null, 2))
    console.log(`Wrote ${userMessages.length} messages to: ${outPath}`)
    break
  }

  case "jsonl": {
    if (!arg1) {
      console.error("Usage: jsonl <PATH_TO_JSON>")
      Deno.exit(1)
    }
    const inputJson = arg1
    const rawData = await Deno.readTextFile(inputJson)
    const data = JSON.parse(rawData)

    const jsonlData = createJsonl(data)
    const outPath = `${tempDir}/train-${crypto.randomUUID()}.jsonl`
    await Deno.writeTextFile(outPath, jsonlData)
    console.log(`Wrote JSONL lines to: ${outPath}`)
    break
  }

  default:
    console.error("Unknown command:", command)
    Deno.exit(1)
}

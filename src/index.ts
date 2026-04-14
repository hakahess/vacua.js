/**
 * vacua.js — SDK officiel pour l'API et le Gateway VACUA
 * v1.2.2 — Full Discord.js-compatible API layer
 * https://vacua.app/developers/docs
 */

import EventEmitter from "eventemitter3"
import { io, type Socket } from "socket.io-client"

/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */

export const BASE_URL   = "https://vacua.app"
export const GATEWAY_NS = "/gateway"
export const API_V1     = `${BASE_URL}/api/v1`

export const GatewayIntents = {
  Guilds:         1 << 0,
  GuildMembers:   1 << 1,
  GuildMessages:  1 << 9,
  MessageContent: 1 << 15,
  DirectMessages: 1 << 12,
} as const

/* ══════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════ */

export interface ClientOptions {
  /**
   * Bit field of intents, or an array of intent values.
   * Use GatewayIntents.* constants.
   */
  intents?: number | number[]
  /** Override the VACUA base URL (useful for self-hosted instances) */
  baseUrl?: string
}

export interface BotUser {
  id:       string
  username: string
  bot:      true
}

export interface RawRole {
  id:          string
  name:        string
  color:       string | null
  position:    number
  hoist:       boolean
  managed:     boolean
  mentionable?: boolean
  /** BigInt as string */
  permissions: string
}

export interface GuildInfo {
  id:          string
  name:        string
  icon:        string | null
  memberCount: number
  /** Roles included from GUILDS_LIST response */
  roles?:      RawRole[]
}

export interface RawMessage {
  id:        string
  channelId: string
  guildId:   string
  content:   string
  author: {
    id:   string
    name: string
    bot:  boolean
  }
  createdAt: string
  editedAt?: string
}

export interface RawInteraction {
  id:            string
  type:          number
  data:          { id: string; name: string; options: { name: string; value: unknown; type: string }[] }
  guildId:       string
  channelId:     string
  member: {
    user: { id: string; username?: string; name?: string; avatar?: string | null }
    roles?: RawRole[]
    nickname?: string | null
    joinedAt?:  string
  }
  token:         string
  applicationId: string
  createdAt?:    string
}

export interface SendMessageOptions {
  content?:  string
  embeds?:   EmbedData[]
  /** Set to 64 for ephemeral (only visible to the invoker) */
  flags?:    number
}

export type SendMessageInput = string | SendMessageOptions

export interface InteractionReplyOptions extends SendMessageOptions {
  /** 64 = ephemeral */
  flags?: number
}

export type InteractionReplyInput = string | InteractionReplyOptions

/* ══════════════════════════════════════════════════════════
   COLLECTION — Discord.js-like Map with utility methods
══════════════════════════════════════════════════════════ */

export class Collection<K, V> extends Map<K, V> {
  find(fn: (value: V, key: K, col: this) => boolean): V | undefined {
    for (const [k, v] of this) if (fn(v, k, this)) return v
    return undefined
  }

  filter(fn: (value: V, key: K, col: this) => boolean): Collection<K, V> {
    const out = new Collection<K, V>()
    for (const [k, v] of this) if (fn(v, k, this)) out.set(k, v)
    return out
  }

  map<T>(fn: (value: V, key: K, col: this) => T): T[] {
    const out: T[] = []
    for (const [k, v] of this) out.push(fn(v, k, this))
    return out
  }

  some(fn: (value: V, key: K, col: this) => boolean): boolean {
    for (const [k, v] of this) if (fn(v, k, this)) return true
    return false
  }

  every(fn: (value: V, key: K, col: this) => boolean): boolean {
    for (const [k, v] of this) if (!fn(v, k, this)) return false
    return true
  }

  reduce<T>(fn: (acc: T, value: V, key: K, col: this) => T, initial: T): T {
    let acc = initial
    for (const [k, v] of this) acc = fn(acc, v, k, this)
    return acc
  }

  first(): V | undefined {
    return this.values().next().value as V | undefined
  }

  last(): V | undefined {
    let last: V | undefined
    for (const v of this.values()) last = v
    return last
  }

  toArray(): V[] {
    return [...this.values()]
  }

  toJSON(): V[] {
    return this.toArray()
  }

  /** Sort and return a new Collection */
  sort(fn?: (a: V, b: V) => number): Collection<K, V> {
    const entries = [...this.entries()]
    entries.sort(fn ? (a, b) => fn(a[1], b[1]) : undefined)
    const out = new Collection<K, V>()
    for (const [k, v] of entries) out.set(k, v)
    return out
  }

  /** Clone this Collection */
  clone(): Collection<K, V> {
    const out = new Collection<K, V>()
    for (const [k, v] of this) out.set(k, v)
    return out
  }
}

/* ══════════════════════════════════════════════════════════
   REST HELPER
══════════════════════════════════════════════════════════ */

class REST {
  private token:   string
  private baseUrl: string

  constructor(token: string, baseUrl: string) {
    this.token   = token
    this.baseUrl = baseUrl
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        "Authorization": `Bot ${this.token}`,
        "Content-Type":  "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText })) as { message: string; code?: number }
      throw new VacuaError(err.message, res.status, err.code)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  get<T = unknown>(path: string)                  { return this.request<T>("GET",    path) }
  post<T = unknown>(path: string, body?: unknown)  { return this.request<T>("POST",   path, body) }
  put<T = unknown>(path: string, body?: unknown)   { return this.request<T>("PUT",    path, body) }
  patch<T = unknown>(path: string, body?: unknown) { return this.request<T>("PATCH",  path, body) }
  delete<T = unknown>(path: string, body?: unknown){ return this.request<T>("DELETE", path, body) }
}

export class VacuaError extends Error {
  status: number
  code?: number
  constructor(message: string, status: number, code?: number) {
    super(message)
    this.name   = "VacuaError"
    this.status = status
    this.code   = code
  }
}

/* ══════════════════════════════════════════════════════════
   USER
══════════════════════════════════════════════════════════ */

export class User {
  readonly id:            string
  readonly username:      string
  readonly discriminator: string
  readonly bot:           boolean
  readonly avatar:        string | null
  private  _baseUrl:      string

  constructor(
    data: { id: string; username?: string; name?: string; avatar?: string | null; bot?: boolean; discriminator?: string },
    baseUrl: string
  ) {
    this.id            = data.id
    this.username      = data.username ?? data.name ?? "Utilisateur"
    this.discriminator = data.discriminator ?? "0000"
    this.avatar        = data.avatar ?? null
    this.bot           = data.bot ?? false
    this._baseUrl      = baseUrl
  }

  /** Returns the user's avatar URL, or a default placeholder */
  displayAvatarURL(_options?: { size?: number; format?: string }): string {
    if (this.avatar) return this.avatar
    return `${this._baseUrl}/avatars/default.png`
  }

  /** Approximate creation date (VACUA uses CUID2 — returns epoch as fallback) */
  get createdAt(): Date {
    return new Date(0)
  }

  toString(): string { return `@${this.username}` }
  toJSON()           { return { id: this.id, username: this.username, bot: this.bot, avatar: this.avatar } }
}

/* ══════════════════════════════════════════════════════════
   GUILD MEMBER ROLE MANAGER
══════════════════════════════════════════════════════════ */

export class GuildMemberRoleManager {
  /** Cached roles for this member */
  readonly cache: Collection<string, RawRole>
  private userId:  string
  private guildId: string
  private rest:    REST

  constructor(userId: string, guildId: string, roles: RawRole[], rest: REST) {
    this.userId  = userId
    this.guildId = guildId
    this.rest    = rest
    this.cache   = new Collection()
    for (const r of roles) this.cache.set(r.id, r)
  }

  get size() { return this.cache.size }

  // Convenience delegates to cache — these are the most commonly used patterns
  find(fn: (r: RawRole) => boolean): RawRole | undefined      { return this.cache.find((v) => fn(v)) }
  some(fn: (r: RawRole) => boolean): boolean                   { return this.cache.some((v) => fn(v)) }
  every(fn: (r: RawRole) => boolean): boolean                  { return this.cache.every((v) => fn(v)) }
  filter(fn: (r: RawRole) => boolean): Collection<string, RawRole> { return this.cache.filter((v) => fn(v)) }
  map<T>(fn: (r: RawRole) => T): T[]                           { return this.cache.map((v) => fn(v)) }
  has(roleId: string): boolean                                  { return this.cache.has(roleId) }
  toArray(): RawRole[]                                          { return this.cache.toArray() }

  /** Assign a role to this member (requires MANAGE_ROLES permission) */
  async add(roleId: string): Promise<void> {
    await this.rest.put(`/guilds/${this.guildId}/members/${this.userId}/roles/${roleId}`)
  }

  /** Remove a role from this member (requires MANAGE_ROLES permission) */
  async remove(roleId: string): Promise<void> {
    await this.rest.delete(`/guilds/${this.guildId}/members/${this.userId}/roles/${roleId}`)
    this.cache.delete(roleId)
  }

  /** [Symbol.iterator] for `for...of` loops */
  [Symbol.iterator]() { return this.cache.values() }
}

/* ══════════════════════════════════════════════════════════
   GUILD MEMBER
══════════════════════════════════════════════════════════ */

export interface GuildMemberInfo {
  userId:   string
  nickname: string | null
  /** GUEST | MEMBER | MODERATOR | ADMIN */
  role:     "GUEST" | "MEMBER" | "MODERATOR" | "ADMIN"
  joinedAt: string
  user: {
    id:       string
    username: string
    name:     string | null
    avatar:   string | null
    status:   string | null
  }
  roles: RawRole[]
}

export class GuildMember {
  readonly user:        User
  readonly nickname:    string | null
  readonly joinedAt:    Date | null
  readonly guildId:     string
  readonly roles:       GuildMemberRoleManager
  private  rest:        REST
  private  baseUrl:     string

  constructor(
    data: {
      userId:    string
      nickname?: string | null
      guildId:   string
      joinedAt?: string | null
      user: { id: string; username?: string; name?: string | null; avatar?: string | null; bot?: boolean }
      roles?: RawRole[]
    },
    rest: REST,
    baseUrl: string
  ) {
    this.user     = new User({ ...data.user, username: data.user.username ?? data.user.name ?? undefined, name: data.user.name ?? undefined }, baseUrl)
    this.nickname = data.nickname ?? null
    this.guildId  = data.guildId
    this.joinedAt = data.joinedAt ? new Date(data.joinedAt) : null
    this.rest     = rest
    this.baseUrl  = baseUrl
    this.roles    = new GuildMemberRoleManager(data.userId, data.guildId, data.roles ?? [], rest)
  }

  /** User ID */
  get id(): string { return this.user.id }

  /** Displayed name (nickname if set, otherwise username) */
  get displayName(): string { return this.nickname ?? this.user.username }

  /**
   * Ban this member from the guild.
   * Requires BAN_MEMBERS permission.
   */
  async ban(options?: { reason?: string; deleteMessageDays?: number }): Promise<void> {
    await this.rest.put(`/guilds/${this.guildId}/bans/${this.user.id}`, options ?? {})
  }

  /**
   * Kick this member from the guild.
   * Requires KICK_MEMBERS permission.
   */
  async kick(): Promise<void> {
    await this.rest.delete(`/guilds/${this.guildId}/members/${this.user.id}`)
  }

  /**
   * Change this member's nickname.
   * Pass null to reset.
   * Requires MANAGE_NICKNAMES permission.
   */
  async setNickname(nick: string | null): Promise<void> {
    await this.rest.patch(`/guilds/${this.guildId}/members/${this.user.id}`, { nickname: nick })
  }

  toString(): string { return this.displayName }
}

/* ══════════════════════════════════════════════════════════
   ROLE MANAGER
══════════════════════════════════════════════════════════ */

export class RoleManager {
  /** Cached roles for this guild */
  readonly cache: Collection<string, RawRole>
  private guildId: string
  private rest:    REST

  constructor(guildId: string, rest: REST, initial?: RawRole[]) {
    this.guildId = guildId
    this.rest    = rest
    this.cache   = new Collection()
    if (initial) for (const r of initial) this.cache.set(r.id, r)
  }

  get size() { return this.cache.size }

  // Convenience delegates to cache
  find(fn: (r: RawRole) => boolean): RawRole | undefined      { return this.cache.find((v) => fn(v)) }
  some(fn: (r: RawRole) => boolean): boolean                   { return this.cache.some((v) => fn(v)) }
  filter(fn: (r: RawRole) => boolean): Collection<string, RawRole> { return this.cache.filter((v) => fn(v)) }
  map<T>(fn: (r: RawRole) => T): T[]                           { return this.cache.map((v) => fn(v)) }
  has(roleId: string): boolean                                  { return this.cache.has(roleId) }

  /**
   * Fetch all roles for this guild and populate the cache.
   * Returns the cache Collection.
   */
  async fetch(): Promise<Collection<string, RawRole>> {
    const roles = await this.rest.get<RawRole[]>(`/guilds/${this.guildId}/roles`)
    this.cache.clear()
    for (const r of roles) this.cache.set(r.id, r)
    return this.cache
  }

  /**
   * Create a new role in this guild.
   * Requires MANAGE_ROLES permission.
   */
  async create(data: {
    name:         string
    color?:       string | null
    hoist?:       boolean
    mentionable?: boolean
    permissions?: string
  }): Promise<RawRole> {
    const role = await this.rest.post<RawRole>(`/guilds/${this.guildId}/roles`, data)
    this.cache.set(role.id, role)
    return role
  }

  /** Delete a role. Requires MANAGE_ROLES permission. */
  async delete(roleId: string): Promise<void> {
    await this.rest.delete(`/guilds/${this.guildId}/roles/${roleId}`)
    this.cache.delete(roleId)
  }

  [Symbol.iterator]() { return this.cache.values() }
}

/* ══════════════════════════════════════════════════════════
   GUILD CHANNEL MANAGER
══════════════════════════════════════════════════════════ */

export class GuildChannelManager {
  readonly cache: Collection<string, Channel>
  private guildId: string
  private rest:    REST

  constructor(guildId: string, rest: REST) {
    this.guildId = guildId
    this.rest    = rest
    this.cache   = new Collection()
  }

  get size() { return this.cache.size }
  find(fn: (c: Channel) => boolean): Channel | undefined { return this.cache.find((v) => fn(v)) }
  has(id: string): boolean                               { return this.cache.has(id) }

  /**
   * Fetch all channels for this guild and populate the cache.
   * Returns the cache Collection.
   */
  async fetch(): Promise<Collection<string, Channel>> {
    const raws = await this.rest.get<{ id: string; name: string; type: string; guildId: string }[]>(
      `/guilds/${this.guildId}/channels`
    )
    for (const raw of raws) {
      const ch = new Channel(raw.id, this.rest)
      ch.name    = raw.name
      ch.type    = raw.type
      ch.guildId = raw.guildId
      this.cache.set(raw.id, ch)
    }
    return this.cache
  }

  /**
   * Create a new channel in this guild.
   * Requires MANAGE_CHANNELS permission.
   */
  async create(data: { name: string; type?: "TEXT" | "AUDIO" | "VIDEO"; nsfw?: boolean }): Promise<Channel> {
    const raw = await this.rest.post<{ id: string; name: string; type: string; guildId: string }>(
      `/guilds/${this.guildId}/channels`, data
    )
    const ch = new Channel(raw.id, this.rest)
    ch.name    = raw.name
    ch.type    = raw.type
    ch.guildId = raw.guildId
    this.cache.set(raw.id, ch)
    return ch
  }
}

/* ══════════════════════════════════════════════════════════
   GUILD MEMBER MANAGER
══════════════════════════════════════════════════════════ */

export class GuildMemberManager {
  readonly cache: Collection<string, GuildMember>
  private guildId: string
  private rest:    REST
  private baseUrl: string

  constructor(guildId: string, rest: REST, baseUrl: string) {
    this.guildId = guildId
    this.rest    = rest
    this.baseUrl = baseUrl
    this.cache   = new Collection()
  }

  get size() { return this.cache.size }
  has(userId: string): boolean { return this.cache.has(userId) }

  /**
   * Fetch a specific member or a list of members.
   * Pass a userId string to fetch one member.
   * Pass options object (or nothing) to list members.
   */
  async fetch(userId: string): Promise<GuildMember>
  async fetch(options?: { limit?: number; after?: string }): Promise<Collection<string, GuildMember>>
  async fetch(arg?: string | { limit?: number; after?: string }): Promise<GuildMember | Collection<string, GuildMember>> {
    if (typeof arg === "string") {
      const raw = await this.rest.get<GuildMemberInfo>(`/guilds/${this.guildId}/members/${arg}`)
      const m = new GuildMember({ ...raw, guildId: this.guildId }, this.rest, this.baseUrl)
      this.cache.set(m.id, m)
      return m
    }
    // List members
    const limit = (arg && typeof arg === "object" && arg.limit) ? arg.limit : 100
    const raws = await this.rest.get<GuildMemberInfo[]>(
      `/guilds/${this.guildId}/members?limit=${limit}`
    )
    const col = new Collection<string, GuildMember>()
    for (const raw of raws) {
      const m = new GuildMember({ ...raw, guildId: this.guildId }, this.rest, this.baseUrl)
      this.cache.set(m.id, m)
      col.set(m.id, m)
    }
    return col
  }

  /** Ban a member (requires BAN_MEMBERS permission) */
  async ban(userId: string, options?: { reason?: string; deleteMessageDays?: number }): Promise<void> {
    await this.rest.put(`/guilds/${this.guildId}/bans/${userId}`, options ?? {})
  }

  /** Kick a member (requires KICK_MEMBERS permission) */
  async kick(userId: string): Promise<void> {
    await this.rest.delete(`/guilds/${this.guildId}/members/${userId}`)
  }
}

/* ══════════════════════════════════════════════════════════
   BAN MANAGER
══════════════════════════════════════════════════════════ */

export class BanManager {
  private guildId: string
  private rest:    REST

  constructor(guildId: string, rest: REST) {
    this.guildId = guildId
    this.rest    = rest
  }

  /** Ban a member (requires BAN_MEMBERS permission) */
  async add(userId: string, options?: { reason?: string; deleteMessageDays?: number }): Promise<void> {
    await this.rest.put(`/guilds/${this.guildId}/bans/${userId}`, options ?? {})
  }

  /** Remove a ban (requires BAN_MEMBERS permission) */
  async remove(userId: string): Promise<void> {
    await this.rest.delete(`/guilds/${this.guildId}/bans/${userId}`)
  }
}

/* ══════════════════════════════════════════════════════════
   GUILD COMMANDS MANAGER (guild-specific)
══════════════════════════════════════════════════════════ */

class GuildCommandsManager {
  private guildId: string
  private rest:    REST

  constructor(guildId: string, rest: REST) {
    this.guildId = guildId
    this.rest    = rest
  }

  /** Register (replace) all guild-specific slash commands */
  async set(builders: SlashCommandBuilder[]): Promise<void> {
    const payload = builders.map((b) => b.toJSON())
    await this.rest.put(`/guilds/${this.guildId}/commands`, payload)
  }

  /** Get all guild-specific slash commands */
  async fetch(): Promise<CommandData[]> {
    return this.rest.get<CommandData[]>(`/guilds/${this.guildId}/commands`)
  }
}

/* ══════════════════════════════════════════════════════════
   MESSAGE MANAGER
══════════════════════════════════════════════════════════ */

class MessageManager {
  private channelId: string
  private rest:      REST

  constructor(channelId: string, rest: REST) {
    this.channelId = channelId
    this.rest      = rest
  }

  /** Fetch a single message by ID, or a list of messages */
  async fetch(options: string | { limit?: number; before?: string; after?: string }): Promise<Message | Message[]> {
    if (typeof options === "string") {
      const raw = await this.rest.get<RawMessage>(`/channels/${this.channelId}/messages/${options}`)
      return new Message(raw, this.rest)
    }
    const params = new URLSearchParams()
    if (options.limit)  params.set("limit",  String(options.limit))
    if (options.before) params.set("before", options.before)
    if (options.after)  params.set("after",  options.after)
    const qs = params.toString()
    const raws = await this.rest.get<RawMessage[]>(`/channels/${this.channelId}/messages${qs ? `?${qs}` : ""}`)
    return raws.map((r) => new Message(r, this.rest))
  }
}

/* ══════════════════════════════════════════════════════════
   CHANNEL
══════════════════════════════════════════════════════════ */

export class Channel {
  readonly id:      string
  name?:            string
  type?:            string
  guildId?:         string
  readonly messages: MessageManager
  private rest:      REST

  constructor(id: string, rest: REST) {
    this.id       = id
    this.rest     = rest
    this.messages = new MessageManager(id, rest)
  }

  /** Send a message to this channel. Returns the created Message. */
  async send(input: SendMessageInput): Promise<Message> {
    const payload = typeof input === "string" ? { content: input } : input
    const raw = await this.rest.post<RawMessage>(`/channels/${this.id}/messages`, payload)
    return new Message(raw, this.rest)
  }

  /**
   * Fetch recent messages.
   * @deprecated Use channel.messages.fetch({ limit }) instead.
   */
  async fetchMessages(limit = 50): Promise<Message[]> {
    const raws = await this.rest.get<RawMessage[]>(`/channels/${this.id}/messages?limit=${limit}`)
    return raws.map((r) => new Message(r, this.rest))
  }

  /**
   * Bulk-delete messages.
   * Pass a count (number) to delete the N most recent messages,
   * or an array of Message objects / message IDs.
   * Requires MANAGE_MESSAGES permission.
   */
  async bulkDelete(messages: number | Message[] | string[]): Promise<void> {
    if (typeof messages === "number") {
      await this.rest.delete(`/channels/${this.id}/messages/bulk`, { limit: messages })
    } else {
      const ids = messages.map((m) => (typeof m === "string" ? m : m.id))
      await this.rest.delete(`/channels/${this.id}/messages/bulk`, { ids })
    }
  }
}

/* ══════════════════════════════════════════════════════════
   MESSAGE
══════════════════════════════════════════════════════════ */

export class Message {
  readonly id:        string
  readonly channelId: string
  readonly guildId:   string
  readonly content:   string
  readonly author:    RawMessage["author"]
  readonly createdAt: Date
  readonly editedAt:  Date | null
  readonly channel:   Channel
  private  rest:      REST

  constructor(raw: RawMessage, rest: REST) {
    this.id        = raw.id
    this.channelId = raw.channelId
    this.guildId   = raw.guildId ?? ""
    this.content   = raw.content
    this.author    = raw.author
    this.createdAt = new Date(raw.createdAt)
    this.editedAt  = raw.editedAt ? new Date(raw.editedAt) : null
    this.channel   = new Channel(raw.channelId, rest)
    this.rest      = rest
  }

  /** Reply to this message (sends to same channel) */
  async reply(input: SendMessageInput): Promise<Message> {
    return this.channel.send(input)
  }

  /** Edit the content of this message (own messages only) */
  async edit(content: string): Promise<void> {
    await this.rest.patch(`/channels/${this.channelId}/messages/${this.id}`, { content })
  }

  /** Delete this message */
  async delete(): Promise<void> {
    await this.rest.delete(`/channels/${this.channelId}/messages/${this.id}`)
  }

  /** Add a reaction emoji to this message */
  async react(emoji: string): Promise<void> {
    await this.rest.put(
      `/channels/${this.channelId}/messages/${this.id}/reactions/${encodeURIComponent(emoji)}`
    )
  }

  /** Remove the bot's reaction from this message */
  async removeReaction(emoji: string): Promise<void> {
    await this.rest.delete(
      `/channels/${this.channelId}/messages/${this.id}/reactions/${encodeURIComponent(emoji)}`
    )
  }

  toString(): string { return this.content }
}

/* ══════════════════════════════════════════════════════════
   GUILD
══════════════════════════════════════════════════════════ */

export class Guild {
  id:          string
  name:        string
  icon:        string | null
  memberCount: number

  /** Role manager — use guild.roles.cache to access cached roles */
  readonly roles:    RoleManager
  /** Channel manager — use guild.channels.cache */
  readonly channels: GuildChannelManager
  /** Member manager — use guild.members.fetch() */
  readonly members:  GuildMemberManager
  /** Ban manager — guild.bans.add() / guild.bans.remove() */
  readonly bans:     BanManager
  /** Guild-level command manager — guild.commands.set([...]) */
  readonly commands: GuildCommandsManager

  private rest:    REST
  private baseUrl: string

  constructor(raw: GuildInfo, rest: REST, baseUrl: string) {
    this.id          = raw.id
    this.name        = raw.name
    this.icon        = raw.icon
    this.memberCount = raw.memberCount
    this.rest        = rest
    this.baseUrl     = baseUrl
    this.roles       = new RoleManager(raw.id, rest, raw.roles)
    this.channels    = new GuildChannelManager(raw.id, rest)
    this.members     = new GuildMemberManager(raw.id, rest, baseUrl)
    this.bans        = new BanManager(raw.id, rest)
    this.commands    = new GuildCommandsManager(raw.id, rest)
  }

  /** Get a Channel by ID (convenience shortcut) */
  channel(id: string): Channel { return new Channel(id, this.rest) }

  /** Fetch full guild info from the API */
  async fetch(): Promise<this> {
    const data = await this.rest.get<{
      id: string; name: string; icon: string | null
      memberCount: number; channelCount: number
    }>(`/guilds/${this.id}`)
    this.name        = data.name
    this.icon        = data.icon
    this.memberCount = data.memberCount
    return this
  }

  /**
   * Fetch a member's info.
   * @deprecated Use guild.members.fetch(userId) instead.
   */
  async fetchMember(userId: string): Promise<GuildMember> {
    return this.members.fetch(userId)
  }

  /**
   * Kick a member.
   * @deprecated Use guild.members.kick(userId) instead.
   */
  async kickMember(userId: string): Promise<void> {
    await this.members.kick(userId)
  }

  toString(): string { return this.name }
}

/* ══════════════════════════════════════════════════════════
   GUILD CACHE
══════════════════════════════════════════════════════════ */

class GuildCache extends Collection<string, Guild> {}

/* ══════════════════════════════════════════════════════════
   APPLICATION COMMANDS MANAGER
══════════════════════════════════════════════════════════ */

class ApplicationCommandsManager {
  private appId: string
  private rest:  REST

  constructor(appId: string, rest: REST) {
    this.appId = appId
    this.rest  = rest
  }

  /** Register (replace) all global slash commands */
  async set(builders: SlashCommandBuilder[]): Promise<void> {
    const payload = builders.map((b) => b.toJSON())
    await this.rest.put(`/applications/${this.appId}/commands`, payload)
  }

  /** Register (replace) all guild-specific slash commands */
  async setGuild(guildId: string, builders: SlashCommandBuilder[]): Promise<void> {
    const payload = builders.map((b) => b.toJSON())
    await this.rest.put(`/guilds/${guildId}/commands`, payload)
  }
}

class ApplicationManager {
  readonly commands: ApplicationCommandsManager
  readonly id:       string

  constructor(appId: string, rest: REST) {
    this.id       = appId
    this.commands = new ApplicationCommandsManager(appId, rest)
  }
}

/* ══════════════════════════════════════════════════════════
   CLIENT USER MANAGER
══════════════════════════════════════════════════════════ */

class ClientUserManager {
  private rest:    REST
  private baseUrl: string

  constructor(rest: REST, baseUrl: string) {
    this.rest    = rest
    this.baseUrl = baseUrl
  }

  /** Fetch a user's public information by ID */
  async fetch(userId: string): Promise<User> {
    const raw = await this.rest.get<{
      id: string; username: string; name: string
      image: string | null; bot?: boolean
    }>(`/users/${userId}`)
    return new User({ ...raw, avatar: raw.image }, this.baseUrl)
  }
}

/* ══════════════════════════════════════════════════════════
   INTERACTION — Options
══════════════════════════════════════════════════════════ */

class InteractionOptions {
  private opts: RawInteraction["data"]["options"]
  constructor(opts: RawInteraction["data"]["options"]) { this.opts = opts }

  getString(name: string, required?: boolean): string | null {
    const o = this.opts.find((x) => x.name === name)
    if (!o && required) throw new VacuaError(`Required option "${name}" is missing`, 400)
    return o ? String(o.value) : null
  }

  getInteger(name: string, required?: boolean): number | null {
    const o = this.opts.find((x) => x.name === name)
    if (!o && required) throw new VacuaError(`Required option "${name}" is missing`, 400)
    return o ? Number(o.value) : null
  }

  getNumber(name: string, required?: boolean): number | null {
    return this.getInteger(name, required)
  }

  getBoolean(name: string, required?: boolean): boolean | null {
    const o = this.opts.find((x) => x.name === name)
    if (!o && required) throw new VacuaError(`Required option "${name}" is missing`, 400)
    return o ? Boolean(o.value) : null
  }

  getUser(name: string, required?: boolean): { id: string; name: string } | null {
    const o = this.opts.find((x) => x.name === name)
    if (!o && required) throw new VacuaError(`Required option "${name}" is missing`, 400)
    if (!o) return null
    return typeof o.value === "object" && o.value !== null
      ? (o.value as { id: string; name: string })
      : { id: String(o.value), name: String(o.value) }
  }
}

/* ══════════════════════════════════════════════════════════
   COMMAND INTERACTION
══════════════════════════════════════════════════════════ */

export class CommandInteraction {
  readonly id:          string
  readonly commandName: string
  readonly guildId:     string
  readonly channelId:   string
  /** The user who invoked the command */
  readonly user:        User
  /**
   * The guild member who invoked the command.
   * Includes their roles. Null for DM interactions.
   */
  readonly member:      GuildMember | null
  /** The guild this interaction occurred in (from client cache) */
  readonly guild:       Guild | null
  /** The channel this interaction occurred in */
  readonly channel:     Channel
  readonly options:     InteractionOptions
  readonly createdAt:   Date
  private  rest:        REST
  private  replied = false

  constructor(raw: RawInteraction, rest: REST, baseUrl: string, guilds?: Collection<string, Guild>) {
    this.id          = raw.id
    this.commandName = raw.data.name
    this.guildId     = raw.guildId
    this.channelId   = raw.channelId
    this.options     = new InteractionOptions(raw.data.options ?? [])
    this.createdAt   = new Date()
    this.rest        = rest

    // User (plain object)
    this.user = new User({
      id:       raw.member.user.id,
      username: raw.member.user.username ?? raw.member.user.name ?? "Utilisateur",
      avatar:   raw.member.user.avatar,
    }, baseUrl)

    // GuildMember with roles
    this.member = raw.member ? new GuildMember({
      userId:   raw.member.user.id,
      nickname: raw.member.nickname ?? null,
      guildId:  raw.guildId,
      joinedAt: raw.member.joinedAt ?? null,
      user:     {
        id:       raw.member.user.id,
        username: raw.member.user.username ?? raw.member.user.name,
        name:     raw.member.user.name,
        avatar:   raw.member.user.avatar,
      },
      roles: raw.member.roles ?? [],
    }, rest, baseUrl) : null

    // Guild from cache (has roles pre-populated if GUILDS_LIST was received)
    this.guild = guilds?.get(raw.guildId) ?? null

    // Channel
    this.channel = new Channel(raw.channelId, rest)
  }

  isCommand(): this is CommandInteraction { return true }
  isRepliable(): boolean { return !this.replied }

  /** Reply to the interaction */
  async reply(input: InteractionReplyInput): Promise<void> {
    if (this.replied) throw new VacuaError("Interaction already replied", 400)
    this.replied = true
    const data = typeof input === "string"
      ? { content: input }
      : { content: input.content, embeds: input.embeds, flags: input.flags }
    await this.rest.post(`/interactions/${this.id}/callback`, { type: 4, data })
  }

  /** Defer the reply (shows "thinking..." indicator) */
  async deferReply(options?: { ephemeral?: boolean }): Promise<void> {
    if (this.replied) throw new VacuaError("Interaction already replied", 400)
    this.replied = true
    await this.rest.post(`/interactions/${this.id}/callback`, {
      type: 5,
      data: options?.ephemeral ? { flags: 64 } : undefined,
    })
  }

  /**
   * Follow up after deferring a reply, or send a second response.
   * Sends a regular message to the channel.
   */
  async followUp(input: InteractionReplyInput): Promise<Message> {
    const payload = typeof input === "string" ? { content: input } : input
    const raw = await this.rest.post<RawMessage>(`/channels/${this.channelId}/messages`, payload)
    return new Message(raw, this.rest)
  }

  /** Edit the original reply */
  async editReply(input: InteractionReplyInput): Promise<void> {
    const data = typeof input === "string"
      ? { content: input }
      : { content: input.content, embeds: input.embeds }
    await this.rest.patch(`/interactions/${this.id}/callback`, data)
  }
}

/* ══════════════════════════════════════════════════════════
   CLIENT EVENTS
══════════════════════════════════════════════════════════ */

export interface PrefixCommand {
  prefix:      string
  commandName: string
  args:        string[]
  message:     Message
}

export interface GuildMemberEvent {
  userId:   string
  name:     string
  image:    string | null
  joinedAt: string
}

export interface ClientEvents {
  ready:             [client: Client]
  messageCreate:     [message: Message]
  messageUpdate:     [message: Partial<Message> & { id: string; channelId: string }]
  messageDelete:     [payload: { id: string; channelId: string; guildId: string }]
  interactionCreate: [interaction: CommandInteraction]
  prefixCommand:     [command: PrefixCommand]
  guildMemberAdd:    [guildId: string, member: GuildMemberEvent]
  guildMemberRemove: [guildId: string, user: { id: string; username: string }]
  guildCreate:       [guild: Guild]
  guildDelete:       [guildId: string]
  error:             [error: Error]
  warn:              [message: string]
  debug:             [message: string]
}

/** @deprecated Use GuildMemberEvent */
export type GuildMember_ = GuildMemberEvent

/* ══════════════════════════════════════════════════════════
   CLIENT
══════════════════════════════════════════════════════════ */

export class Client extends EventEmitter<ClientEvents> {
  user:        BotUser | null        = null
  guilds:      GuildCache            = new GuildCache()
  application: ApplicationManager | null = null
  /** Fetch users by ID */
  users:       ClientUserManager | null = null

  /** Current bot prefix (received from READY) */
  get prefix(): string { return this._prefix }

  private _prefix:        string = "!"
  private token:          string | null = null
  private rest:           REST | null   = null
  private socket:              Socket | null = null
  private baseUrl:             string
  private intentsBits:         number
  private heartbeatTimer:      ReturnType<typeof setInterval> | null = null
  private heartbeatIntervalMs: number = 41_250  // default, overridden by HELLO

  constructor(options: ClientOptions = {}) {
    super()
    this.baseUrl = options.baseUrl ?? BASE_URL
    // Accept number | number[] — OR together if array
    if (Array.isArray(options.intents)) {
      this.intentsBits = options.intents.reduce((acc, v) => acc | v, 0)
    } else {
      this.intentsBits = options.intents
        ?? (GatewayIntents.Guilds | GatewayIntents.GuildMessages | GatewayIntents.MessageContent)
    }
  }

  /** Connect to the gateway with your bot token */
  login(token: string): this {
    if (!token?.trim()) throw new VacuaError("Token manquant ou invalide", 400)
    this.token = token.trim()
    this.rest  = new REST(this.token, this.baseUrl)
    this.users = new ClientUserManager(this.rest, this.baseUrl)
    this._connectGateway()
    return this
  }

  /** Destroy the connection and clean up */
  destroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.socket?.disconnect()
    this.socket              = null
    this.heartbeatTimer      = null
    this.heartbeatIntervalMs = 41_250
  }

  /** Update the bot's status and activity */
  async setPresence(options: {
    status?:       "online" | "idle" | "dnd" | "invisible"
    activity?:     string | null
    activityType?: "PLAYING" | "WATCHING" | "LISTENING" | "STREAMING" | "COMPETING"
  }): Promise<void> {
    if (!this.rest) throw new VacuaError("Not logged in", 401)
    await this.rest.patch("/users/@me", options)
  }

  private _connectGateway() {
    this.socket = io(`${this.baseUrl}/gateway`, {
      transports:           ["websocket"],
      reconnection:         true,
      reconnectionAttempts: Infinity,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 30_000,
      auth: { token: `Bot ${this.token}`, intents: this.intentsBits },
    })

    this.socket.on("connect", () => {
      this.emit("debug", "[Gateway] Connected")
    })

    this.socket.on("disconnect", (reason: string) => {
      this.emit("warn", `[Gateway] Disconnected: ${reason}`)
      if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    })

    this.socket.on("error", (err: { code?: number; message?: string }) => {
      this.emit("error", new VacuaError(err?.message ?? "Gateway error", err?.code ?? 500))
    })

    // HELLO — reçu en premier, avant READY. Communique l'intervalle heartbeat du serveur.
    this.socket.on("HELLO", (data: { heartbeatInterval?: number }) => {
      this.heartbeatIntervalMs = data?.heartbeatInterval ?? 41_250
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = setInterval(() => {
        this.socket?.emit("HEARTBEAT")
      }, this.heartbeatIntervalMs)
      this.emit("debug", `[Gateway] HELLO — heartbeat interval: ${this.heartbeatIntervalMs}ms`)
    })

    this.socket.on("READY", (data: {
      v:           number
      application: { id: string; name: string }
      user:        { prefix?: string }
      guilds:      { id: string }[]
    }) => {
      this.user        = { id: data.application.id, username: data.application.name, bot: true }
      this.application = new ApplicationManager(data.application.id, this.rest!)
      if (data.user?.prefix) this._prefix = data.user.prefix

      // Populate guild cache with stubs
      for (const g of data.guilds) {
        if (!this.guilds.has(g.id)) {
          this.guilds.set(g.id, new Guild({ id: g.id, name: "", icon: null, memberCount: 0 }, this.rest!, this.baseUrl))
        }
      }

      // Fallback heartbeat si HELLO n'a pas encore été reçu (compatibilité serveurs anciens)
      if (!this.heartbeatTimer) {
        this.heartbeatTimer = setInterval(() => {
          this.socket?.emit("HEARTBEAT")
        }, this.heartbeatIntervalMs)
      }

      // Request full guild data (name, icon, memberCount, roles)
      this.socket?.emit("REQUEST_GUILDS")

      this.emit("debug", `[Gateway] READY — ${data.application.name}`)
      this.emit("ready", this)
    })

    this.socket.on("GUILDS_LIST", (guilds: GuildInfo[]) => {
      for (const g of guilds) {
        // Update existing guild or create new — preserve roles cache if already fetched
        const existing = this.guilds.get(g.id)
        if (existing) {
          existing.name        = g.name
          existing.icon        = g.icon
          existing.memberCount = g.memberCount
          // Populate roles cache from GUILDS_LIST response
          if (g.roles?.length) {
            existing.roles.cache.clear()
            for (const r of g.roles) existing.roles.cache.set(r.id, r)
          }
        } else {
          this.guilds.set(g.id, new Guild(g, this.rest!, this.baseUrl))
        }
      }
    })

    this.socket.on("MESSAGE_CREATE", (raw: RawMessage) => {
      const msg = new Message(raw, this.rest!)
      this.emit("messageCreate", msg)
    })

    this.socket.on("MESSAGE_UPDATE", (raw: RawMessage) => {
      const msg = new Message(raw, this.rest!)
      this.emit("messageUpdate", msg)
    })

    this.socket.on("MESSAGE_DELETE", (payload: { id: string; channelId: string; guildId: string }) => {
      this.emit("messageDelete", payload)
    })

    this.socket.on("INTERACTION_CREATE", (raw: RawInteraction) => {
      const interaction = new CommandInteraction(raw, this.rest!, this.baseUrl, this.guilds)
      this.emit("interactionCreate", interaction)
    })

    // Prefix commands — already parsed by the server
    this.socket.on("PREFIX_COMMAND", (raw: RawMessage & { prefix: string; commandName: string; args: string[] }) => {
      const msg = new Message(raw, this.rest!)
      this.emit("prefixCommand", {
        prefix:      raw.prefix,
        commandName: raw.commandName,
        args:        raw.args,
        message:     msg,
      })
    })

    // Member events
    this.socket.on("GUILD_MEMBER_ADD", (data: { guildId: string; user: GuildMemberEvent }) => {
      // Update memberCount
      const guild = this.guilds.get(data.guildId)
      if (guild) guild.memberCount++
      this.emit("guildMemberAdd", data.guildId, data.user)
    })

    this.socket.on("GUILD_MEMBER_REMOVE", (data: { guildId: string; user: { id: string; username: string } }) => {
      const guild = this.guilds.get(data.guildId)
      if (guild) guild.memberCount = Math.max(0, guild.memberCount - 1)
      this.emit("guildMemberRemove", data.guildId, data.user)
    })

    this.socket.on("HEARTBEAT_ACK", () => {
      this.emit("debug", "[Gateway] Heartbeat ACK")
    })
  }
}

/* ══════════════════════════════════════════════════════════
   EMBED BUILDER
══════════════════════════════════════════════════════════ */

export interface EmbedField {
  name:    string
  value:   string
  inline?: boolean
}

export interface EmbedAuthor {
  name:     string
  url?:     string
  iconUrl?: string
}

export interface EmbedFooter {
  text:     string
  iconUrl?: string
}

export interface EmbedThumbnail { url: string }
export interface EmbedImage     { url: string }

export interface EmbedData {
  type?:        "rich"
  title?:       string
  description?: string
  url?:         string
  color?:       number
  thumbnail?:   EmbedThumbnail
  image?:       EmbedImage
  author?:      EmbedAuthor
  footer?:      EmbedFooter
  fields?:      EmbedField[]
  timestamp?:   string
}

export class EmbedBuilder {
  private data: EmbedData = { type: "rich", fields: [] }

  setTitle(title: string):          this { this.data.title       = title;       return this }
  setDescription(desc: string):     this { this.data.description = desc;        return this }
  setUrl(url: string):              this { this.data.url         = url;         return this }
  setColor(color: number | string): this {
    this.data.color = typeof color === "string"
      ? parseInt(color.replace("#", ""), 16)
      : color
    return this
  }
  setThumbnail(url: string):        this { this.data.thumbnail = { url }; return this }
  setImage(url: string):            this { this.data.image     = { url }; return this }
  setAuthor(author: EmbedAuthor):   this { this.data.author    = author;  return this }
  setFooter(footer: EmbedFooter):   this { this.data.footer    = footer;  return this }
  setTimestamp(date?: Date):        this { this.data.timestamp = (date ?? new Date()).toISOString(); return this }

  addFields(...fields: EmbedField[]): this {
    this.data.fields = [...(this.data.fields ?? []), ...fields]
    return this
  }

  toJSON(): EmbedData { return { ...this.data } }
}

/* ══════════════════════════════════════════════════════════
   SLASH COMMAND BUILDER
══════════════════════════════════════════════════════════ */

type OptionType = "STRING" | "INTEGER" | "BOOLEAN" | "USER" | "CHANNEL" | "ROLE" | "NUMBER"

export interface CommandOptionData {
  name:        string
  description: string
  type:        OptionType
  required?:   boolean
  choices?:    { name: string; value: string | number }[]
}

export interface CommandData {
  name:        string
  description: string
  options:     CommandOptionData[]
}

export class SlashCommandOptionBuilder {
  private data: Partial<CommandOptionData> = {}

  setName(name: string):        this { this.data.name        = name;  return this }
  setDescription(desc: string): this { this.data.description = desc;  return this }
  setRequired(req: boolean):    this { this.data.required    = req;   return this }
  addChoices(...choices: { name: string; value: string | number }[]): this {
    this.data.choices = [...(this.data.choices ?? []), ...choices]
    return this
  }
  toJSON(type: OptionType): CommandOptionData {
    if (!this.data.name || !this.data.description) {
      throw new VacuaError("Option must have name and description", 400)
    }
    return { ...this.data, type } as CommandOptionData
  }
}

export class SlashCommandBuilder {
  private data: Partial<CommandData> = { options: [] }

  setName(name: string):        this { this.data.name        = name; return this }
  setDescription(desc: string): this { this.data.description = desc; return this }

  private _addOption(type: OptionType, fn: (opt: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this {
    const opt = fn(new SlashCommandOptionBuilder())
    this.data.options = [...(this.data.options ?? []), opt.toJSON(type)]
    return this
  }

  addStringOption(fn:  (o: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this { return this._addOption("STRING",  fn) }
  addIntegerOption(fn: (o: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this { return this._addOption("INTEGER", fn) }
  addBooleanOption(fn: (o: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this { return this._addOption("BOOLEAN", fn) }
  addUserOption(fn:    (o: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this { return this._addOption("USER",    fn) }
  addChannelOption(fn: (o: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this { return this._addOption("CHANNEL", fn) }
  addNumberOption(fn:  (o: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this { return this._addOption("NUMBER",  fn) }
  addRoleOption(fn:    (o: SlashCommandOptionBuilder) => SlashCommandOptionBuilder): this { return this._addOption("ROLE",    fn) }

  toJSON(): CommandData {
    if (!this.data.name || !this.data.description) {
      throw new VacuaError("Command must have name and description", 400)
    }
    return this.data as CommandData
  }
}

/* ══════════════════════════════════════════════════════════
   PERMISSIONS HELPER
══════════════════════════════════════════════════════════ */

export const PermissionFlagsBits = {
  CreateInstantInvite:      BigInt("1"),
  KickMembers:              BigInt("2"),
  BanMembers:               BigInt("4"),
  Administrator:            BigInt("8"),
  ManageChannels:           BigInt("16"),
  ManageGuild:              BigInt("32"),
  AddReactions:             BigInt("64"),
  ViewAuditLog:             BigInt("128"),
  PrioritySpeaker:          BigInt("256"),
  Stream:                   BigInt("512"),
  ViewChannel:              BigInt("1024"),
  SendMessages:             BigInt("2048"),
  SendTtsMessages:          BigInt("4096"),
  ManageMessages:           BigInt("8192"),
  EmbedLinks:               BigInt("16384"),
  AttachFiles:              BigInt("32768"),
  ReadMessageHistory:       BigInt("65536"),
  MentionEveryone:          BigInt("131072"),
  UseExternalEmojis:        BigInt("262144"),
  Connect:                  BigInt("1048576"),
  Speak:                    BigInt("2097152"),
  MuteMembers:              BigInt("4194304"),
  DeafenMembers:            BigInt("8388608"),
  MoveMembers:              BigInt("16777216"),
  ChangeNickname:           BigInt("67108864"),
  ManageNicknames:          BigInt("134217728"),
  ManageRoles:              BigInt("268435456"),
  ManageWebhooks:           BigInt("536870912"),
  UseApplicationCommands:   BigInt("2147483648"),
} as const

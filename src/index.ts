import { Computed, Context, Dict, h, Schema } from 'koishi'
import { load } from 'cheerio'

export interface Config {
  strict?: Computed<boolean>
  ignored?: string[]
  sendTitle: boolean
}

export const Config: Schema<Config> = Schema.object({
  strict: Schema.computed(Schema.boolean()).default(false).description('仅匹配只含链接的消息。'),
  ignored: Schema.array(Schema.string()).description('忽略特定域名的链接。'),
  sendTitle: Schema.boolean().default(false).description('同时发送标题。'),
})

export const name = 'OpenGraph'

export function apply(ctx: Context, config: Config) {
  ctx.on('message', async (session) => {
    const regex = session.resolve(config.strict)
      ? /^https?:\/\/\S+$/g
      : /https?:\/\/\S+/g
    const match = session.content.trim().match(regex)
    if (!match) return
    match.forEach(async (url) => {
      if (config.ignored?.some((prefix) => url.startsWith(prefix))) return
      try {
        const { data, headers } = await ctx.http.axios(url)
        if (!headers['content-type']?.startsWith('text/html')) return
        const $ = load(data)
        const og = $('meta[property^="og:"]').toArray().reduce((prev, meta) => {
          const key = meta.attribs.property.slice(3)
          const value = meta.attribs.content
          if (value) prev[key] = value
          return prev
        }, {} as Dict<string>)
        let message = ''
        if (og.title && config.sendTitle)
          message += `${og.title}`
        if (og.image)
          message += h('image', { url: new URL(og.image.startsWith('//') ? `https:${og.image}` : og.image, url).href })
        if (message !== '')
          await session.send(message)
      } catch {}
    })
  })
}

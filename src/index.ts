import { Computed, Context, Dict, h, Schema } from 'koishi'
import { load } from 'cheerio'

export interface Config {
  strict?: Computed<boolean>
  ignored?: string[]
}

export const Config: Schema<Config> = Schema.object({
  strict: Schema.computed(Schema.boolean()).default(false).description('仅匹配只含链接的消息。'),
  ignored: Schema.array(Schema.string()).description('忽略特定域名的链接。'),
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
        if (og.image) {
          await session.send(h('image', { url: new URL(og.image, url).href }))
        }
      } catch {}
    })
  })
}

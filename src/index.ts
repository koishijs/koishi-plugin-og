import { Computed, Context, Dict, h, Logger, Schema } from 'koishi'
import { load } from 'cheerio'

export interface Config {
  strict?: Computed<boolean>
  ignored?: string[]
  sendTitle: boolean
  sendSiteName: boolean
}

export const Config: Schema<Config> = Schema.object({
  strict: Schema.computed(Schema.boolean()).default(false).description('仅匹配只含链接的消息。'),
  ignored: Schema.array(Schema.string()).description('忽略特定域名的链接。'),
  sendTitle: Schema.boolean().default(false).description('同时发送标题。'),
  sendSiteName: Schema.boolean().default(false).description('标题和原链接域名均不包含站点名的话，就发送站点名。'),
})

export const name = 'OpenGraph'

const logger = new Logger('og')

export function apply(ctx: Context, config: Config) {
  ctx.on('message', async (session) => {
    const regex = session.resolve(config.strict)
      ? /^https?:\/\/\S+$/g
      : /https?:\/\/\S+/g
    const match = session.content.trim().match(regex)
    if (!match) return

    logger.debug('提取出的链接：', match)

    const promises: Promise<string>[] = match.map(async (url: string) => {
      if (config.ignored?.some((prefix) => url.startsWith(prefix))) return '' // 这行实现了：忽略特定域名的链接
      try {
        const { data, headers } = await ctx.http(url, { responseType: 'text' })
        if (!headers.get('content-type')?.startsWith('text/html')) {
          logger.debug(`从 ${url} 上抓取下来的数据的 content-type 不是 text/html。终止对该链接的处理流程。`)
          return ''
        }

        const $ = load(data)
        const og = $('meta[property^="og:"]').toArray().reduce((prev, meta) => {
          const key = meta.attribs.property.slice(3) //假设meta.attribs.property的值为"og:image"，那么slice(3)操作后得到的key值就是"image"。这一操作是为了去掉前缀"og:"，只保留实际的内容标识。
          const value = meta.attribs.content
          if (value) prev[key] = value
          return prev
        }, {} as Dict<string>)

        let ogblock: string = ''
        if (og.site_name && config.sendSiteName && !og.title.toLowerCase().includes(og.site_name.toLowerCase()) && !(new URL(url)).host.toLowerCase().includes(og.site_name.toLowerCase()))
          ogblock += `${og.site_name} - `
        if (og.title && config.sendTitle)
          ogblock += `${og.title}`
        if (og.image)
          ogblock += h('img', { src: new URL(og.image, url).href })
        logger.debug(`从 ${url} 生成了预览：${ogblock}`)
        return ogblock
      } catch (error) {
        logger.warn(`处理 ${url} 时出错：`, error)
        return ''
      }
    }
    )

    const results = await Promise.all(promises) // 等待所有 promise 完成
    const message = results.filter(result => result).join('\n') // 合并结果，过滤掉空字符串
    logger.debug(`发送：${message}`)
    await session.send(message)
  })
}

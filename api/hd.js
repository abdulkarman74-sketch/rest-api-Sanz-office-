const axios = require('axios')
const FormData = require('form-data')
const cheerio = require('cheerio')

const SERVERS = [
  'api1g', 'api2g', 'api3g', 'api8g', 'api9g', 'api10g', 'api11g',
  'api12g', 'api13g', 'api14g', 'api15g', 'api16g', 'api17g', 'api18g',
  'api19g', 'api20g', 'api21g', 'api22g', 'api24g', 'api25g'
]

const TASK =
  'r68zl88mq72xq94j2d5p66bn2z9lrbx20njsbw2qsAvgmzr11lvfhAx9kl87pp6yqgx7c8vg7sfbqnrr42qb16v0gj8jl5s0kq1kgp26mdyjjspd8c5A2wk8b4Adbm6vf5tpwbqlqdr8A9tfn7vbqvy28ylphlxdl379psxpd8r70nzs3sk1'

const MAX_IN = 4 * 1024 * 1024 // batas body Vercel ~4,5 MB

async function getToken() {
  const html = await axios.get('https://www.iloveimg.com/upscale-image', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  const $ = cheerio.load(html.data)
  const script = $('script')
    .filter((_, el) => $(el).html()?.includes('ilovepdfConfig ='))
    .html()
  if (!script) throw new Error('Config tidak ditemukan')

  const jsonStr = script.split('ilovepdfConfig = ')[1]?.split(';')[0]
  if (!jsonStr) throw new Error('Konfigurasi token tidak ditemukan')

  const json = JSON.parse(jsonStr)
  const csrf = $('meta[name="csrf-token"]').attr('content')
  if (!json?.token || !csrf) throw new Error('Token/CSRF gagal diambil')
  return { token: json.token, csrf }
}

async function uploadImage(server, headers, buffer, task) {
  const form = new FormData()
  form.append('name', 'image.jpg')
  form.append('chunk', '0')
  form.append('chunks', '1')
  form.append('task', task)
  form.append('preview', '1')
  form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' })

  const res = await axios.post(`https://${server}.iloveimg.com/v1/upload`, form, {
    headers: { ...headers, ...form.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  })
  return res.data
}

async function imageHD(buffer, scale = 4) {
  const { token, csrf } = await getToken()
  const server = SERVERS[Math.floor(Math.random() * SERVERS.length)]
  const headers = {
    Authorization: 'Bearer ' + token,
    Origin: 'https://www.iloveimg.com',
    Referer: 'https://www.iloveimg.com/upscale-image',
    Cookie: '_csrf=' + csrf,
    'User-Agent': 'Mozilla/5.0'
  }

  const upload = await uploadImage(server, headers, buffer, TASK)
  if (!upload?.server_filename) throw new Error('Upload gambar ke server HD gagal')

  const form = new FormData()
  form.append('task', TASK)
  form.append('server_filename', upload.server_filename)
  form.append('scale', String(scale))

  const res = await axios.post(`https://${server}.iloveimg.com/v1/upscale`, form, {
    headers: { ...headers, ...form.getHeaders() },
    responseType: 'arraybuffer',
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  })
  if (!res.data?.length) throw new Error('Hasil upscale kosong')
  return Buffer.from(res.data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', d => chunks.push(d))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

module.exports = async (req, res) => {
  // CORS terbuka untuk semua origin
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ message: 'Gunakan metode POST.' })

  try {
    const scale = [2, 4].includes(Number(req.query.scale)) ? Number(req.query.scale) : 4
    const buf = await readBody(req)
    if (!buf.length) return res.status(400).json({ message: 'Foto kosong.' })
    if (buf.length > MAX_IN) return res.status(413).json({ message: 'Foto terlalu besar (maks 4 MB).' })

    const out = await imageHD(buf, scale)
    const type =
      out[0] === 0xff && out[1] === 0xd8 ? 'image/jpeg'
      : out[0] === 0x89 && out[1] === 0x50 ? 'image/png'
      : 'application/octet-stream'

    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(out)
  } catch (e) {
    console.error('[HD/iLoveIMG]', e?.response?.status, e?.message)
    return res.status(502).json({ message: 'Server upscaler gagal memproses. Coba lagi.' })
  }
    }
              

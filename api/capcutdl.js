// api/capcut.js
const { alldl } = require('rahad-all-downloader-v2')

const MAX_URL_LENGTH = 2048
const MAX_BODY_LENGTH = 10 * 1024

async function resolveCapcut(url) {
  const result = await alldl.capcut(url)
  if (!result) throw new Error('Resolve CapCut gagal: response kosong')

  // Normalisasi response karena struktur dapat berbeda antarversi library.
  const data = result.data || result
  const videoUrl =
    data.videoUrl ||
    data.video_url ||
    data.url ||
    data.medias?.find(m => m.type === 'video')?.url ||
    null

  if (!videoUrl) throw new Error('Link video tidak ditemukan di response')

  return {
    title: data.title || 'CapCut Video',
    author: data.author || data.username || 'Unknown',
    thumbnail: data.thumbnail || data.cover || null,
    duration: data.duration || null,
    videoUrl,
    allMedias: data.medias || [],
    raw: data
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function isCapcutUrl(value) {
  try {
    const parsed = new URL(value)
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'capcut.com' || parsed.hostname.endsWith('.capcut.com'))
    )
  } catch {
    return false
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({
      message: 'Gunakan metode POST dengan body JSON: { "url": "..." }'
    })
  }

  try {
    const buf = await readBody(req)
    if (!buf.length) {
      return res.status(400).json({ message: 'Body kosong. Kirim JSON { "url": "..." }' })
    }
    if (buf.length > MAX_BODY_LENGTH) {
      return res.status(413).json({ message: 'Body terlalu besar.' })
    }

    let payload
    try {
      payload = JSON.parse(buf.toString('utf8'))
    } catch {
      return res.status(400).json({ message: 'Body bukan JSON valid.' })
    }

    const url = payload?.url
    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ message: 'Field "url" wajib diisi.' })
    }
    if (url.length > MAX_URL_LENGTH) {
      return res.status(400).json({ message: 'URL terlalu panjang.' })
    }
    if (!isCapcutUrl(url.trim())) {
      return res.status(400).json({ message: 'URL harus menggunakan HTTPS dari domain capcut.com.' })
    }

    const result = await resolveCapcut(url.trim())
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ success: true, ...result })
  } catch (e) {
    console.error('[CapCut]', e?.response?.status, e?.message)
    return res.status(502).json({
      message: 'Server downloader gagal memproses. Coba lagi.',
      detail: e?.message || 'unknown error'
    })
  }
}

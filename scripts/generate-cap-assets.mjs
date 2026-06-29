import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import sharp from 'sharp'

const brandingDir = 'assets/branding'
const androidResDir = 'android/app/src/main/res'
const publicDir = 'public'
const splashBackground = '#090807'

const sources = {
  icon: join(brandingDir, 'icon.png'),
}

function ensureCanonicalIcon() {
  if (existsSync(sources.icon)) {
    return
  }

  throw new Error(
    `Missing app icon source: ${sources.icon}. Add a 1024×1024 PNG at assets/branding/icon.png.`,
  )
}

function runGenerate(args) {
  execSync(`npx capacitor-assets generate ${args}`, { stdio: 'inherit' })
}

function installAndroidSplashIcon() {
  const drawableDir = join(androidResDir, 'drawable')
  mkdirSync(drawableDir, { recursive: true })
  copyFileSync(sources.icon, join(drawableDir, 'splash_icon.png'))
}

async function generateFavicon() {
  const size = 32
  const pngBuffer = await sharp(sources.icon)
    .resize(size, size, { fit: 'contain', background: splashBackground })
    .png()
    .toBuffer()

  const base64 = pngBuffer.toString('base64')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><image width="${size}" height="${size}" href="data:image/png;base64,${base64}"/></svg>\n`
  writeFileSync(join(publicDir, 'favicon.svg'), svg)

  await sharp(sources.icon)
    .resize(32, 32, { fit: 'contain', background: splashBackground })
    .png()
    .toFile(join(publicDir, 'favicon-32.png'))
}

const generateArgs = [
  '--ios',
  '--android',
  '--pwa',
  `--assetPath ${brandingDir}`,
  `--splashBackgroundColor ${splashBackground}`,
  `--iconBackgroundColor ${splashBackground}`,
  `--splashBackgroundColorDark ${splashBackground}`,
  `--iconBackgroundColorDark ${splashBackground}`,
  `--pwaManifestPath public/manifest.webmanifest`,
].join(' ')

ensureCanonicalIcon()

try {
  runGenerate(generateArgs)
  installAndroidSplashIcon()
  await generateFavicon()
} catch (error) {
  throw error
}

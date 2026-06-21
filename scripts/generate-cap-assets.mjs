import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const brandingDir = 'assets/branding'
const androidResDir = 'android/app/src/main/res'
const splashBackground = '#090807'

const sources = {
  // Canonical Capacitor icon source (1024×1024). Copy from assets/UI/moon icon.png when updating.
  icon: join(brandingDir, 'icon.png'),
  splashMaster: join(brandingDir, 'moondrone-splash-master.png'),
  splashIcon: join(brandingDir, 'moondrone-splash-icon-transparent.png'),
}

const tempFiles = []

function stageTempFile(source, targetName) {
  const target = join(brandingDir, targetName)
  copyFileSync(source, target)
  tempFiles.push(target)
  return target
}

function cleanupTempFiles() {
  for (const file of tempFiles) {
    if (existsSync(file)) {
      unlinkSync(file)
    }
  }
}

function runGenerate(args) {
  execSync(`npx capacitor-assets generate ${args}`, { stdio: 'inherit' })
}

function installAndroidSplashIcon() {
  const drawableDir = join(androidResDir, 'drawable')
  mkdirSync(drawableDir, { recursive: true })
  copyFileSync(sources.splashIcon, join(drawableDir, 'splash_icon.png'))
}

if (!existsSync(sources.icon)) {
  throw new Error(
    `Missing app icon source: ${sources.icon}. Copy assets/UI/moon icon.png to assets/branding/icon.png first.`,
  )
}

try {
  // iOS: permanent icon.png + staged full-screen splash artwork.
  stageTempFile(sources.splashMaster, 'splash.png')
  runGenerate(
    `--ios --assetPath ${brandingDir} --splashBackgroundColor ${splashBackground} --iconBackgroundColor ${splashBackground}`,
  )
  cleanupTempFiles()

  // Android: same permanent icon.png; splash uses transparent icon on dark background.
  runGenerate(
    `--android --assetPath ${brandingDir} --splashBackgroundColor ${splashBackground} --iconBackgroundColor ${splashBackground} --splashBackgroundColorDark ${splashBackground} --iconBackgroundColorDark ${splashBackground}`,
  )

  installAndroidSplashIcon()
} catch (error) {
  cleanupTempFiles()
  throw error
}

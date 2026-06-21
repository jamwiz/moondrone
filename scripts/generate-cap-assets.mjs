import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'

const brandingDir = 'assets/branding'
const androidResDir = 'android/app/src/main/res'
const splashBackground = '#090807'

const sources = {
  icon: join(brandingDir, 'moondrone-icon.png'),
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

try {
  // iOS: full icon + full-screen splash artwork.
  stageTempFile(sources.icon, 'icon.png')
  stageTempFile(sources.splashMaster, 'splash.png')
  runGenerate(
    `--ios --assetPath ${brandingDir} --splashBackgroundColor ${splashBackground} --iconBackgroundColor ${splashBackground}`,
  )
  cleanupTempFiles()

  // Android: app icons from the standard icon; splash uses transparent icon on dark background.
  stageTempFile(sources.icon, 'icon.png')
  runGenerate(
    `--android --assetPath ${brandingDir} --splashBackgroundColor ${splashBackground} --iconBackgroundColor ${splashBackground} --splashBackgroundColorDark ${splashBackground} --iconBackgroundColorDark ${splashBackground}`,
  )
  cleanupTempFiles()

  installAndroidSplashIcon()
} catch (error) {
  cleanupTempFiles()
  throw error
}

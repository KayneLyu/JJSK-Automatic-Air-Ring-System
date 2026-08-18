import { readFileSync, readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const outputDirectory = join(appDirectory, 'dist-electron')
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  'electron',
])
const importPatterns = [
  /(?:^|\n)\s*import(?:\s+[\s\S]*?\s+from\s+|\s*)['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
]

function isBareSpecifier(specifier) {
  return (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/.test(specifier)
  )
}

const files = readdirSync(outputDirectory)
  .filter((name) => ['.js', '.mjs', '.cjs'].includes(extname(name)))
  .sort()
const forbidden = []

for (const fileName of files) {
  const source = readFileSync(join(outputDirectory, fileName), 'utf8')
  const specifiers = new Set()
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) specifiers.add(match[1])
  }

  for (const specifier of specifiers) {
    if (isBareSpecifier(specifier) && !builtins.has(specifier)) {
      forbidden.push({ file: fileName, specifier })
    }
  }
}

if (forbidden.length > 0) {
  throw new Error(
    `Electron bundle 残留生产依赖裸导入:\n${forbidden
      .map(({ file, specifier }) => `- ${file}: ${specifier}`)
      .join('\n')}`
  )
}

console.log(
  `[ElectronBundleAudit] ${JSON.stringify({
    ok: true,
    files: files.length,
    forbiddenBareImports: 0,
  })}`
)

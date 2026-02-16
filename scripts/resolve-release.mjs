import process from "node:process"

const [repo, channel = "stable"] = process.argv.slice(2)

if (!repo) {
  console.error("Missing repo argument")
  process.exit(1)
}

const endpoint =
  channel === "nightly"
    ? `https://api.github.com/repos/${repo}/releases?per_page=50`
    : `https://api.github.com/repos/${repo}/releases/latest`

const response = await fetch(endpoint, {
  headers: {
    Accept: "application/vnd.github+json",
  },
})

if (!response.ok) {
  console.error(`Failed to fetch release metadata (${response.status})`)
  process.exit(1)
}

const payload = await response.json()

const pickAsset = (release) => {
  const assets = release?.assets ?? []

  for (const asset of assets) {
    const name = asset?.name ?? ""
    if (name.endsWith(".tgz")) {
      return {
        tag: release?.tag_name,
        url: asset?.browser_download_url,
        name,
      }
    }
  }

  return null
}

const resolveNightly = () => {
  const releases = Array.isArray(payload) ? payload : []

  for (const release of releases) {
    if (!release?.prerelease) {
      continue
    }

    const selected = pickAsset(release)
    if (selected) {
      return selected
    }
  }

  return null
}

const resolveStable = () => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null
  }

  return pickAsset(payload)
}

const selected = channel === "nightly" ? resolveNightly() : resolveStable()

if (!selected?.tag || !selected?.url || !selected?.name) {
  console.error(`No ${channel} release artifact found`)
  process.exit(1)
}

process.stdout.write(`${selected.tag}\n${selected.url}\n${selected.name}\n`)

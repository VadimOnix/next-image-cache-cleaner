/**
 * @type {import('semantic-release').GlobalConfig}
 */
const config = {
  branches: ['master'],
  ci: true,
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/github',
    '@semantic-release/git',
  ],
}

export default config

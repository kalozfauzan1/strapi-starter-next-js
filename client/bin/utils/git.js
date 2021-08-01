const _ = require('lodash')
const { runCmd } = require('./shell')

// Takes parsable modified file list from git, which looks something like:
//   AM path/to/file.js
//   D  path/to/anotherFile.js
//
// And convert it to a list of { mods, file }
const _parseFileList = fileListAsString => {
  const result = fileListAsString
    // removes the last empty line
    .trim()

  if (!result) return []

  return (
    result
      .split('\n')
      // Each line now looks something like:
      // AM path/to/file.js
      .map(line => {
        const s = line.split(/\s+/).filter(Boolean)
        return {
          mods: s[0],
          file: s[1],
        }
      })
  )
}

// Takes a list of the list parsed from the `parseFileList` function above,
// and picks out the filename.
const _pickOutFilenameFromList = fileList => {
  return fileList.map(({ mods, file }) => file)
}

// Note, that if the count of files seems unusually large, it could be
// because the dev branch has been merged with the latest master, and you're
// also receiving all of those files.
const _getCommittedChangedFiles = async baseBranch => {
  const differentFiles = await runCmd(`git diff --name-status ${baseBranch}...HEAD`)
  return _.flow(_parseFileList, _pickOutFilenameFromList)(differentFiles)
}

const _getUncommittedChangedFiles = async () => {
  const statusList = await runCmd('git status --porcelain')
  return _.flow(_parseFileList, _pickOutFilenameFromList)(statusList)
}

// Returns any file that has changed since the current dev branch diverged
// from the base branch. It also includes any uncommitted file changes.
// Note, deleted files are not filtered out.
const getChangedFiles = async baseBranch => {
  const committedFiles = await _getCommittedChangedFiles(baseBranch)

  // Find the uncommitted changes
  const uncommittedFiles = await _getUncommittedChangedFiles()

  return _.union(committedFiles, uncommittedFiles)
}

// Looks through the git diffs, and search for the search term
// This is a very hacky way of doing a search on the diff. For now, it suits
// our purposes, but be wary before using it.
const diffContains = async (baseBranch, fileName, searchTerm) => {
  const committedDiff = await runCmd(`git diff --unified=0 ${baseBranch}...HEAD ${fileName}`)
  const uncommittedDiff = await runCmd(`git diff --unified=0 HEAD ${fileName}`)

  return committedDiff.indexOf(searchTerm) !== -1 || uncommittedDiff.indexOf(searchTerm) !== -1
}

module.exports = {
  getChangedFiles,
  diffContains,
}

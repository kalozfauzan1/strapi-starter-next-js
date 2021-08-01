const { ESLint } = require('eslint')
const _ = require('lodash')
const fs = require('fs')
const { logError, logSuccess, logInfo, hasArg } = require('./utils/shell')
const { getChangedFiles, diffContains } = require('./utils/git')

const fileExtensions = ['.tsx', '.js', '.ts', '.jsx']
// Should not start with a slash, but should end in one - lazy programming
const sourceFoldersToCheck = ['components/', 'libs/', 'pages/', 'services/']

// The branch name that we typically merge into.
// If we ever change branching strategies, this may need to be more dynamic.
const baseBranchName = 'master'

// This uses the node api for linting files, rather than the cli. This was
// just to make the parsing of data easier.
// More info on the API:
//    https://eslint.org/docs/developer-guide/nodejs-api#eslint-class
const runLintOnFiles = async (filesOrFolders, options) => {
  try {
    const eslint = new ESLint({
      // Note, these extensions only apply if the `filesOrFolders` entries are
      // folders, not individual files
      extensions: fileExtensions,
      ...options,
    })
    const results = await eslint.lintFiles(filesOrFolders)

    if (options.fix) {
      await ESLint.outputFixes(results)
    }

    const formatter = await eslint.loadFormatter('stylish')
    const resultText = formatter.format(results)

    return {
      resultText,
      warningCount: _.sum(results.map(r => r.warningCount)),
      errorCount: _.sum(results.map(r => r.errorCount)),
    }
  } catch (err) {
    logError('Error while running Linter on files')
  }
}

// Returns filters a list of files, that may possibly invalidate the last
// successful lint checks since `baseBranchName` (which is probably just master).
// For example, I may have only made a change to `.eslintrc`, and `Button.tsx`.
// In `.eslintrc`, I could have added a new rule, so we don't want to simply
// check for `Button.tsx`, we need to check every single file now.
//
// The three files that may possibly cause this invalidation are `.eslintignore`,
// `.eslintrc`, and `package.json`. The `package.json` file changes a lot! So
// I've taken a more pragmatic approach, so when a line contains the word "eslint",
// we can assume that it's a package update, and therefore we should check all
// files.
const getFilesThatMayPossiblyInvalidateExistingLintChecks = async (changedFiles, baseBranchName) => {
  const triggerFiles = []
  if (changedFiles.includes('.eslintignore')) {
    triggerFiles.push('.eslintignore')
  }
  if (changedFiles.includes('.eslintrc')) {
    triggerFiles.push('.eslintrc')
  }
  if (changedFiles.includes('package.json') && (await diffContains(baseBranchName, 'package.json', 'eslint'))) {
    triggerFiles.push('package.json')
  }
  return triggerFiles
}

const filterFilesInSourceFolders = files => {
  return files.filter(file => {
    return sourceFoldersToCheck.find(folder => file.startsWith(folder))
  })
}

const filterFilesOfCorrectExtension = files => {
  return files.filter(file => {
    return fileExtensions.find(ext => file.endsWith(ext))
  })
}

// When we check for the changed files since the last master, it's going to
// include files that have been deleted.
// This method is inefficient, and I originally had filtered out any file marked
// as `D`, but then I thought of another case with deleted merge conflicts,
// and decided to do things the lazy safe way for now. Feel free to fix up.
const filterFilesThatStillExist = files => {
  return files.filter(f => {
    return fs.existsSync(f)
  })
}

// Take the lint results from the `runLintOnFiles` function above, print them
// to the console, and throw an exception if there were any errors.
const handleLintResults = ({ resultText, errorCount, warningCount }) => {
  try {
    logInfo(resultText)

    if (errorCount || warningCount) {
      // Throw an empty error, just so the exit code becomes 1
      throw new Error('')
    } else {
      logSuccess('Lint checks passed')
    }
  } catch (error) {
    logError('Error while display the lint results - ', error)
  }
}

/**
 * This script will run linting on all files that have changed since `master`,
 * including any staged/unstaged files.
 */
const runLinting = async () => {
  // The exhaustive list of eslint cli flags are not supported, but feel free to
  // add them here if you need.
  // CLI list:
  //   https://eslint.org/docs/user-guide/command-line-interface#options
  // Node api list of possible options:
  //   https://eslint.org/docs/developer-guide/nodejs-api#%E2%97%86-new-eslint-options
  const lintOptions = {
    fix: hasArg('--fix'),
  }

  if (!hasArg('--changed')) {
    logInfo('Running lint checks on all files')
    const lintResults = await runLintOnFiles(sourceFoldersToCheck, lintOptions)
    handleLintResults(lintResults)
    return
  }

  const changedFiles = filterFilesThatStillExist(await getChangedFiles(baseBranchName))

  const configFileChanged = await getFilesThatMayPossiblyInvalidateExistingLintChecks(changedFiles, baseBranchName)
  if (configFileChanged.length) {
    logInfo('Running lint checks on all files, since changes were made to: ' + configFileChanged.join(', '))
    const lintResults = await runLintOnFiles(sourceFoldersToCheck, lintOptions)
    handleLintResults(lintResults)
    return
  }

  const filteredChangedFiles = _.flow(filterFilesInSourceFolders, filterFilesOfCorrectExtension)(changedFiles)

  if (!filteredChangedFiles.length) {
    logInfo(`There are no updated files since ${baseBranchName}. No linting required.`)
    return
  }

  logInfo(
    `Running lint checks on ${filteredChangedFiles.length} files(s), ` +
      `which were changed since "${baseBranchName}".`,
  )
  const lintResults = await runLintOnFiles(filteredChangedFiles, lintOptions)

  handleLintResults(lintResults)
}

;(async () => {
  try {
    await runLinting()
  } catch (ex) {
    if (ex.message) {
      logError(ex.message)
    }
    process.exit(1)
  }
})()

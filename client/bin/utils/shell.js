const util = require('util')
const colors = require('colors/safe')
const exec = util.promisify(require('child_process').exec)

const runCmd = async cmd => {
  const { stdout, stderr } = await exec(cmd)
  if (stderr) {
    throw new Error(stderr)
  }
  return stdout
}

const logError = message => {
  console.error(colors.red.bold('Error: ') + colors.red(message))
}

const logSuccess = message => {
  console.log(colors.green(message))
}

const logInfo = console.log

const hasArg = arg => {
  return process.argv.indexOf(arg) !== -1
}

module.exports = {
  runCmd,
  logError,
  logSuccess,
  logInfo,
  hasArg,
}

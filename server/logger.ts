import config from './config'
import log4js from 'log4js'
log4js.configure({
  appenders: {
    out: { type: 'console', layout: { type: 'coloured' } },
    task: {
      type: 'dateFile',
      filename: config.logPath,
      pattern: 'yyyy-MM-dd',
      keepFileExt: true,
      alwaysIncludePattern: true
    }
  },
  categories: {
    default: { appenders: ['out', 'task'], level: 'info' }
  },
  disableClustering: true
})
const logger = log4js.getLogger()

export default logger

module.exports = logger

/*
 * @Date: 2023-07-28 10:31:09
 * @Author: yiyouxiu
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2023-07-28 10:31:09
 */
import config from '../config'
import logger from '../logger';
const request = require('request')

// 前端资源
const getFrontendList = async () => {
  return new Promise((resolve, reject) => {
    let path = `${config.ttsHost}/api/frontend_resource`
    request.get(
      {
        url: path
      },
      (err, response, body) => {
        try {
          if (!body || body.slice(0, 1) != '{') {
            return reject('404')
          }
          let data = JSON.parse(body)
          let cnWordPron = data.man_word_pron_dict
          let twWordPron = data.tw_word_pron_dict
          cnWordPron.forEach((element, index) => {
            cnWordPron[index].t = element.t.split(',')
            if (cnWordPron[index].s) {
              cnWordPron[index].s = element.s.split(',')
            }
            if (cnWordPron[index].b) {
              cnWordPron[index].b = element.b.split(',')
            }
          })
          twWordPron.forEach((element, index) => {
            twWordPron[index].t = element.t.split(',')
            if (twWordPron[index].s) {
              twWordPron[index].s = element.s.split(',')
            }
            if (twWordPron[index].b) {
              twWordPron[index].b = element.b.split(',')
            }
          })
          cnWordPron.tp = data.phone_map_dict.man
          twWordPron.tp = data.phone_map_dict.tw
          resolve({ cn: cnWordPron, tw: twWordPron })
        } catch (e) {
          logger.error(e)
          reject(e)
        }
      }
    )
  })
}
export default getFrontendList

import express, { json } from "express"
import config from "../config/index"
import logger from '../logger'
import axios from 'axios'
import getFrontendResource from './frontend-resource'
import { Crypto, hasJsonStructure, checkIsLegal, } from "./util"
const querystring = require("querystring")
const app = express()
const request = require("request")
app.use(json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
axios.defaults.timeout = 120000
// const Crypt = require('./util').Crypt

// GET流式获取音频文件
app.get("/tts/ssml", (req, res) => {
  let params = JSON.parse(JSON.stringify(req.query))
  if (params.text) {
    params.text = encodeURIComponent(params.text)
  }
  const result = checkIsLegal(params)
  logger.info(`gen result:${JSON.stringify(result)}`)
  if (!result) {
    res.send({
      err_code: -1,
      err_msg: "非法请求",
    })
    return
  }
  let ip =
    (req.headers["x-forwarded-for"] ||
      req.ip ||
      req.socket.remoteAddress ||
      "") + ""
  const url = `${config.javaHost}/tts-web-api/v1/playDemo/getKey`
  let cookie = request.cookie(`ww_token=${params.ww_token}`)
  let jar = request.jar()
  jar.setCookie(cookie, url)

  // eslint-disable-next-line no-unused-vars
  const getKeyReq = request.get(
    {
      url,
      headers: {
        connection: "close",
        "x-forwarded-for": ip,
      },
      jar,
    },
    function (err, response, body) {
      if (err || !hasJsonStructure(body)) {
        res.send({
          err_code: -1,
          err_msg: "服务器出错，请稍后再试",
        })
        return
      }
      const keyResult = JSON.parse(body)
      // console.log('---key---', err, keyResult.data)
      if (keyResult.code != 200 || !keyResult.data) {
        res.send({
          err_code: -1,
          err_msg: "非法请求",
        })
        return
      }
      // const rate = getSpeakerRate(params.speaker)
      let streamingHost = `${config.ttsHost}/api/concurrent_synthesis`
      let streaming = `?current_key=${keyResult.data}&audio_type=${params.audio_type}&ignore_limit=true&speed=${params.speed}&text=${params.text}&product=article_platform&split_bylen=false`
      // 检测英文发音音标是否合法
      if (params.cmu_check) {
        streaming += `&cmu_check=true`
      }
      // 符号静音时长设置
      if (params.symbol_sil) {
        streaming += `&symbol_sil=${params.symbol_sil}`
      }
      // 全文停顿模式
      if (params.pause_map) {
        streaming += `&pause_map=${params.pause_map}`
      }
      // wwid
      if (params.wwid) {
        streaming += `&wwid=${params.wwid}`
      }
      // 文章id
      if (params.article_id) {
        streaming += `&article_id=${params.article_id}`
      }
      if (params.frontend_type)
        streaming = streaming + `&frontend_type=${params.frontend_type}`
      let url = `${streamingHost}${streaming}&speaker=${params.speaker}`
      // 个化性声音添加is_adaptation
      if (params.speaker_source === "mini_program") url += `&is_adaptation=true`
      axios.get(url, {
        responseType: 'arraybuffer'
      }).then(response => {
          if (!response || response.status !== 200) {
            logger.error(`request url:${url}`)
            res.send({
              err_code: -1,
              err_msg: "服务器出错，请稍后再试",
            })
            return
          }
          // 英文发音音标合法判断
          if (
            // eslint-disable-next-line no-prototype-builtins
            response.headers.hasOwnProperty("cmu_check") &&
            response.headers.cmu_check === "false"
          ) {
            res.send({
              err_code: -1,
              msg: "音标格式不合法，请重新输入",
            })
            return
          }
          const dataBinary = response.data
          const binaryLength = dataBinary.length
          if (binaryLength > 0) {
            res.writeHead(200, {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "audio/mpeg",
              "Content-Length": binaryLength,
            })
            logger.info("------audition response content length------")
            logger.info(binaryLength)
            res.write(dataBinary, "binary")
            res.end()
          } else {
            res.send({
              code: 500,
              message: "试听出错，请稍后重试",
            })
          }
        })
    }
  )
})
app.use("/tts/audition", (req, res) => {
  const method = req.method.toLowerCase()
  let path =
    method === "get" ? req.url.replace("/tts/audition", "") : req.body.url
  if (path.indexOf("/") === 0) {
    path = path.replace("/", "")
  }
  logger.info(
    "------audition request url path",path
  )
  let url: any = Crypto.decrypt128(path, config.aesKey)
  if(!url){
    res.send({
        err_code: -1,
        err_msg: "服务器出错，请稍后再试",
    })
    return
  }
  url = `${config.ttsHost}${url}`
  axios.get(url, {
    responseType: 'arraybuffer'
  }).then(response => {
    if (!response || response.status !== 200) {
      logger.error(`request url:${url}`)
      res.send({
        err_code: -1,
        err_msg: "服务器出错，请稍后再试",
      })
      return
    }
    const dataBinary = response.data
    // console.log('axios---------audition', dataBinary)
    if (dataBinary.length) {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "audio/mpeg",
        "Content-Length": dataBinary.length,
      })
      res.write(dataBinary, "binary")
      res.end()
    } else {
      res.send({
        code: 500,
        message: "试听出错，请稍后重试",
      })
    }
   
  }).catch(error => {
    logger.error(`Error: ${error}`)
    res.end()
  })
})
// 音频合成
app.post("/tts/compose", function (req, res) {
  // 获取ssml url
  if (!req.body.compose_url) {
    res.send({
      err_code: -1,
      err_msg: "URL不存在",
    })
    return
  }
  let reqParam = req.body
  let volume = reqParam.volume || 0.98;
  let encodeUrl: any = Crypto.decrypt128(req.body.compose_url, config.aesKey)
  if(!encodeUrl){
    res.send({
      err_code: -1,
      err_msg: "合成解析失败",
    })
    return
  }
  encodeUrl = encodeUrl.replace(/&volume=[^&]*/, '')+'&volume='+volume
  const ssmlUrl = encodeUrl
  console.log('-----音频合成',ssmlUrl);

  /* 获取音频文件 */
  let streaming = ssmlUrl.replace("/api/concurrent_synthesis?", "")
  // 根据url获取参数
  streaming = `title=${encodeURIComponent(req.body.title)}&` + streaming
  const url = `${config.ttsComposeHost}/api/concurrent_synthesis`
  let article_id = ""
  let speaker = ""
  let phone = "",
    current_key = ""

  let wwToken = req.query.ww_token
  try {
    let articleUrlList = ssmlUrl.split("article_id=")
    if (articleUrlList[1] && articleUrlList[1].split("&")[0]) {
      article_id = articleUrlList[1].split("&")[0]
    }
    let articlekeyList = ssmlUrl.split("current_key=")
    if (articlekeyList[1] && articlekeyList[1].split("&")[0]) {
      current_key = articlekeyList[1].split("&")[0]
    }
    let articlespeakerList = ssmlUrl.split("speaker=")
    if (articlespeakerList[1] && articlespeakerList[1].split("&")[0]) {
      speaker = articlespeakerList[1].split("&")[0]
    }
  } catch (error) {
    console.log(error)
  }

  logger.info(
    `[ compose Info ]:article_id=${article_id};speaker=${speaker};phone=${phone};ww_token=${wwToken},current_key=${current_key}`
  )
  axios.post(url, streaming, {
    timeout: 120000,
  }).then(response => {
    const body = JSON.stringify(response.data)
    if (!response || response.status !== 200) {
      logger.error(`request url:${url}`)
      logger.error(`request body: ${streaming}`)

      logger.error(`response body: ${body}`)

      rollback(reqParam.transactionId, res)
      return
    }
    console.log('compose---compose', body)
    if (body || !hasJsonStructure(body)) {
      let data = JSON.parse(body)
      logger.info("[compose body]:", data)
      if (data && data.message == "ok") {
        data.lengthOfTime = Math.ceil(data.lengthOfTime)
        data.str_address = data.srt_address
        res.send({
          message: "合成成功",
          code: 200,
          data: data,
        })
        let param = {
          articleId: reqParam.articleId || article_id,
          ossFile: data.ossFile,
          size: data.size,
          speakerId: reqParam.speakerId,
          lengthOfTime: data.lengthOfTime,
          format: "wav",
        }
        if (reqParam.articleId && reqParam.speakerId) {
          saveAudioPath(req, param)
        }
      } else {
        logger.error("[compose error]:", JSON.stringify(body))

        rollback(reqParam.transactionId, res)
      }
    } else {
      logger.error("[compose error]:", body)
      rollback(reqParam.transactionId, res)
    }
  }).catch(err => {
    if (err) {
      logger.error(`request url:${url}`)
      logger.error(`request body: ${streaming}`)
      logger.error(err)

      rollback(reqParam.transactionId, res)
      return
    }
  })
})
//保存音频连接
function saveAudioPath(req, param) {
  if (!param.articleId) {
    return
  }
  const formData = querystring.stringify(param)
  const contentLength = formData.length
  let saveAudioPath = `${config.javaHost}/tts-web-api/v1/audios`
  let options = {
    url: saveAudioPath,
    method: "POST",
    headers: {
      "Content-Length": contentLength,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `ww_token=${req.query.ww_token}`,
    },
    body: formData,
  }
  axios.post(saveAudioPath, formData, {
    headers: {
      "Content-Length": contentLength,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `ww_token=${req.query.ww_token}`,
    },
  }).then(response => {
    if (!response || response.status !== 200) {
      logger.error(`request url:${saveAudioPath}`)

      return
    }
    let myObj = response.data
      if (myObj.code != 200) {
        logger.info(param)
        logger.info(response.data)
      }
  }).catch(err => {
    logger.info(param)
  })
}
//回滚合成次数
function rollback(transactionid, res) {
  if (!transactionid) {
    res.send({
      err_code: -1,
      err_msg: "合成失败",
    })
    return
  }
  let rollbackPath = `${config.javaHost}/tts-web-api/v1/buy/audio/transaction/rollback?transactionId=${transactionid}`

  let options = {
    url: rollbackPath,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transactionId: transactionid }),
  }
  logger.error("[回滚]:", transactionid)
  axios.post(rollbackPath, JSON.stringify({ transactionId: transactionid }), {
    headers: {
      "Content-Type": "application/json",
    },
  }).then(() => {
    res.send({
      err_code: -1,
      err_msg: "合成失败",
    })
  })
}
//小程序声音商店查询接口
app.post('/wx-api/getKeyWordSearch', (req, res) => {
  const q = encodeURI(req.body.q)
  logger.info('----参数q', q)
  let url = `http://moyin-suggestion-server-main/query?q=${q}`;
  axios.get(url).then((response) => {
    if (!response || response.status !== 200) {
      logger.info('---response err', url)
      res.send({
        code: -1,
        message: '关键字搜索失败'
      })
      return
    }
    res.send({
      code: 200,
      data: JSON.stringify(response.data)
    })
  })
  // request.get({ url: url },
  //   (err, response, body) => {
  //     if (err) {
  //       logger.info('---response err', err)
  //       res.send({
  //         code: -1,
  //         message: '关键字搜索失败'
  //       })
  //     } else {
  //       logger.info('---response body', body)
  //       res.send({
  //         code: 200,
  //         data: body
  //       })
  //     }

  //   }
  // )
})
// 验证码登录
app.use('/tts/captcha/login', (req, res) => {
  res.header("Access-Control-Allow-Origin", "*")
  const query = req.query
  if (!query.phone || !query.app || !query.origin || !query.captcha_value) {
    res.send({
      err_code: 1,
      err_msg: '参数缺失'
    })
    return
  }
  var ip =
    req.headers['x-forwarded-for'] ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    ''
  if (typeof ip =='string'&&ip.split(',').length > 0) {
    ip = ip.split(',')[0]
    ip = ip.split(':')[ip.split(':').length - 1]
  }
  const params = {
    phone: query.phone,
    captcha_value: query.captcha_value,
    app: query.app,
    origin:query.origin,
    client_ip: ip,
    bd_vid: query.bd_vid,
    bd_wd: query.bd_wd,
    promotsource: query.promotsource,
    promottype: query.promottype
  }

  function __fParams(params) {
    if (!params || !Object.keys(params).length) return ''
    let paramsStr = ''
    for (let i in params) {
      paramsStr += `${i}=${params[i]}&`
    }
    return paramsStr.substr(0, paramsStr.length - 1)
  }

  let url = `${config.accountHost}/v2/login/captcha?origin=${query.origin}`
  url += __fParams(params)
  axios.post(url, JSON.stringify(params), {
    headers: { 'Content-Type': 'application/json' },
  }).then(response => {
    res.send(response.data)
  })

})

// 获取验证码
app.use('/tts/captcha', (req, res) => {
  res.header("Access-Control-Allow-Origin", "*")
  const phone = req.query.phone
  const usage = req.query.usage
  const origin = req.query.origin
  // const path = `${config.userHost}/captcha/dynamic?phone=${phone}&usage=${usage}&header=zh-CN&language=chinese&origin=${origin}`
  
  const path = `${config.accountHost}/captcha/sms?phone=${phone}&usage=${usage}&origin=${origin}`

  axios.get(path).then(response => {
    const data = response.data
    if (data) {
      res.send(data)
    } else {
      res.send({
        err_code: -1,
        message: '服务器出错，请稍后再试'
      })
    }
  })
})
// 获取验证码
app.use('/h5/user/info/token', (req, res) => {
  console.log('req.query', req.query);
  
  const ww_token = req.query.ww_token
  
  // const path = `${config.userHost}/captcha/dynamic?phone=${phone}&usage=${usage}&header=zh-CN&language=chinese&origin=${origin}`
  
  const path = `${config.accountHost}/user/info/token?token=${ww_token}`

  request.get({ url: path }, (err, response, body) => {
    if (hasJsonStructure(body)) {
      let data = JSON.parse(body)
      res.send(data)
    } else {
      res.send({
        err_code: -1,
        message: '服务器出错，请稍后再试'
      })
    }
  })
})

app.post('/filetool/downloadMp3', (req, res) => {
  const path = `${config.toMp3Host}/wave_to_mp3`
  if (!req.body.videoUrl) {
    res.send({
      err_code: -1,
      err_msg: 'videoUrl不能为空'
    })
  }
  let videoUrl = req.body.videoUrl.replace(
    'https://mobvoi-speech-public.mobvoi.com/mobvoi-tts',
    'http://mobvoi-oss/v1/ufile/mobvoi-speech-public/mobvoi-tts'
  )
 
  axios.post(path, JSON.stringify({ videoUrl: videoUrl }), {
    headers: {
      'content-type': 'application/json'
    },
  }).then(response => {
    console.log('downloadMp3', response.data)
    if (!response.data) {
      logger.info(response)
    }
    res.send(response.data)
  })
})
// 获取多音字信息
app.use('/tts/getWords', async (req, res) => {
  const lang = req.query.lang
  const word = req.query.word
  let pinyin:any = req.query.pinyin
  let data = null
  let map = null
  let pron = null
  let tone = null
  let stone = null
  let cnWordList, twWordList
  if (global.cnFrontend && global.twFrontend) {
    cnWordList = global.cnFrontend
    twWordList = global.twFrontend
  } else {
    try {
      const frontendResource:any = await getFrontendResource()
      if(frontendResource){
        global.cnFrontend = frontendResource.cn
        global.twFrontend = frontendResource.tw
        cnWordList = frontendResource.cn
        twWordList = frontendResource.tw
      }
    } catch (error) {
      res.sendStatus(500)
    }
  }
  const wordList = lang === 'zh-tw' ? twWordList : cnWordList
  wordList.forEach(item => {
    if (item.w === word) {
      // 多音字
      data = item.t ? item.t : null
      // 轻音
      pron = item.s ? item.s : null
      // 变调
      tone = item.b ? item.b : null
      //排序音
      stone = item.st ? item.st : null
    }
  })
  if (!pinyin) {
    pinyin = data && data[0]
  }
  // 儿化音
  wordList.tp.forEach(blob => {
    if (blob.t === pinyin) map = blob.tp
  })
  res.send({
    err_code: 0,
    map: map,
    data: data,
    pron: pron,
    tone: tone,
    stone: stone
  })
})
// 获取多音字信息
app.post('/tts/getWordList', (req, res) => {
  const body = req.body
  const lang = body.lang
  const defaltword = body.word || ''
  const word = defaltword.split('')
  var reg = new RegExp('^[\u4E00-\u9FFF]+$')
  if (!reg.test(defaltword)) {
    res.send({
      err_code: -1,
      err_msg: '多音字不得出现非中文'
    })
  }
  // let pinyin = body.pinyin
  let path = `${
    config.ttsHost
  }/api/frontend_analysis?request_type=frontend&for_voice_maker=true&text=${encodeURIComponent(
    defaltword
  )}`

  request.get({ url: path }, (err, response, body) => {
    if (err || !hasJsonStructure(body)) {
      logger.error(`request url:${path}`)
      logger.error(err)
      res.send({
        err_code: -1,
        err: '服务器出错，请稍后再试'
      })
      return
    }
    let defaltData = JSON.parse(body)
    let defaltPinyin = {}
    defaltData = defaltData.map(item => {
      item = item.map(ele => {
        return ele.originJson
      })
      return item
    })
    defaltData.forEach(item => {
      item.forEach(ele => {
        ele.forEach(i => {
          defaltPinyin[i.w] = i
        })
      })
    })
    let cnWordList, twWordList
    if (global.cnFrontend && global.twFrontend) {
      cnWordList = global.cnFrontend
      twWordList = global.twFrontend
      let resData = resSend(word, twWordList, cnWordList, defaltPinyin)
      res.send({
        err_code: 0,
        data: resData
      })
    } else {
      getFrontendResource()
        .then((frontendResource:any)=> {
          global.cnFrontend = frontendResource.cn
          global.twFrontend = frontendResource.tw
          cnWordList = frontendResource.cn
          twWordList = frontendResource.tw
          let resData = resSend(word, twWordList, cnWordList, defaltPinyin)
          res.send({
            err_code: 0,
            data: resData
          })
        })
        .catch(err => {
          logger.error(`request url:/tts/getWordList`)
          logger.error(err)
          res.send({
            err_code: -1,
            err: err
          })
        })
    }
    function resSend(word, twWordList, cnWordList, defaltPinyin) {
      const wordList = lang === 'zh-tw' ? twWordList : cnWordList
      let resData:any = []
      let map = null
      wordList.forEach(item => {
        if (word.indexOf(item.w) != -1) {
          wordList.tp.forEach(blob => {
            if (blob.t === item.t[0]) map = blob.tp
          })
          let WordDefaltPinyin = ''
          if (defaltPinyin[item.w] && defaltPinyin[item.w].t) {
            WordDefaltPinyin = defaltPinyin[item.w].t
          } else {
            WordDefaltPinyin = item.t[0]
          }
          // 多音字
          resData.push({
            word: item.w,
            pinyinList: item.t,
            pron: item.s,
            tone: item.b,
            stone: item.st,
            defalt: WordDefaltPinyin,
            map: map
          })
        }
      })
      return resData
    }
  })
})
// 获取tn列表
app.use('/tts/tnList', (req, res) => {
  const word= req.query.word
  let data:any = {}
  let path = `${
    config.ttsHost
  }/api/frontend_analysis?speaker=billy_lpcnet&frontend_type=man&split_bylen=false&request_type=frontend_tn&text_type=text&for_voice_maker=true&text=${typeof word =='string' ?encodeURIComponent(word):''}`
  if (!word) {
    res.send({
      err_code: 1,
      err_msg: '您选择的文本为空，请重新选择'
    })
    return
  }
  request.get(
    {
      url: path
    },
    (err, response, body) => {
      if (err) {
        logger.error(`request url:${path}`)
        logger.error(err)
        res.send(body)
        return
      }
      if (
        !response ||
        response.statusCode !== 200 ||
        !body ||
        !hasJsonStructure(body)
      ) {
        logger.error(`request url:${path}`)
        logger.error(`response body: ${body}`)
        res.send({
          err_code: -1,
          err_msg: '服务器出错，请稍后再试'
        })
        return
      }
      logger.info(`request url:${path}`)
      data = JSON.parse(body)
      if (data&&data.errMsg) {
        res.send({
          err_code: -1,
          data: data.errMsg
        })
        return
      }
      if (
        data[0] &&
        data[0].originTnlistJson &&
        data[0].originTnlistJson.candidates
      ) {
        res.send({
          err_code: 0,
          data: data[0].originTnlistJson.candidates
        })
      } else {
        res.send({
          err_code: 1,
          err_msg: '请滑选数字或符号'
        })
      }
    }
  )
})

// polyphoneDictList
app.get('/tts/polyphoneDictList', (req, res) => {
  if(global.cnPronMap){
    res.send({code:200,data: global.cnPronMap,message:"多音字拼音获取成功"})
  }else{
    res.send({code:-1,data: global.cnPronMap,message:"多音字拼音获取失败"})
  }
 
})
// 转化类名
const modifyFormat = val => {
  let frontendWordList = JSON.parse(val)
  frontendWordList.forEach((item, index) => {
    frontendWordList[index] = item.map(word => {
      if (word.originJson.length === 0)
        word.originJson = [{ pinyin: '', word: ' ', rhythm: '' }]
      return {
        originWord: word.originJson
      }
    })
  })
  return frontendWordList
}
// 获取tts读音TN
app.post('/tts/frontend/word', function(req, res) {
  const params = req.query
  const data = req.body
  let text_type = 'text'
  const language = params.language
  let frontendType = 'man'
  let speaker = 'billy_lpcnet'
  if (language === 'zh-tw') {
    frontendType = 'tw'
    speaker = 'tina_lpcnet'
  }
  const article = req.body['result']
  let merge_symbol=req.body['merge_symbol']
  if (!article) {
    res.send({
      err_code: -1,
      msg: '请求数据为空'
    })
    return
  }
  const url = `${config.ttsHost}/api/frontend_analysis`
  if (typeof params.text_type =='string') text_type = params.text_type
  let maxLenParams = ''
  if (data.split_bylen && data.split_bylen_value) {
    maxLenParams = `&split_bylen=true&split_bylen_value=${data.split_bylen_value}`
  }
  const paramsStr = `?audio_type=mp3&merge_symbol=${merge_symbol ? true : false}&frontend_type=${frontendType}&text_type=${text_type}&for_voice_maker=true&request_type=frontend&speaker=${speaker}${maxLenParams}&text=${encodeURIComponent(
    article
  )}`
  axios.post(url, paramsStr, {
    timeout: 120000
  }).then(response => {
    if (!response || response.status !== 200) {
      logger.error(`[/frontend/word] : ${paramsStr}`)
      res.send({
        err_code: -1,
        err_msg: "服务器出错，请稍后再试",
      })
      return
    }
    console.log('response-----', JSON.stringify(response.data))
    const body = JSON.stringify(response.data)
    try {
      let articleArr = modifyFormat(body)
      // 添加停顿和拼音
      articleArr.forEach((item, index) => {
        item.forEach((content, Iindex) => {
          articleArr[index][Iindex].originWord = content.originWord.map(
            originWord => {
              return {
                pinyin: originWord.t || '',
                originPinyin: originWord.t || '',
                word: originWord.w || '',
                rhythm: originWord.p || 0,
                originRhythm: originWord.p || 0
              }
            }
          )
        })
      })
      res.send({
        err_code: 0,
        result: articleArr
      })
    } catch (error) {
      logger.error(`request url:${url}`)
      logger.error(`request params:${paramsStr}`)
      logger.error(`response body: ${body}`)
      res.send({
        err_code: -1,
        msg: 'article upload err'
      })
    }
  })
})
// 预合成音频
app.post('/tts/log', (req, res) => {
  const params = req.body.log
  logger.info(`[pagelog]`,params)
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Headers', "*");
  res.header("Access-Control-Allow-Methods", "*");
  if (req.method.toLowerCase() == 'options') {
      res.send(200) 
      return
  }
  res.send({
    code: 200
  })
})
// 小程序openid获取token
app.use('/tts/wechat/applet', (req, res) => {
  res.header("Access-Control-Allow-Origin", "*")
  const query = req.query
  if (!query.phone || !query.openId || !query.app || !query.origin) {
    res.send({
      code: 1,
      message: '参数缺失'
    })
    return
  }
  var ip =
    req.headers['x-forwarded-for'] ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    ''
  if (typeof ip =='string'&&ip.split(',').length > 0) {
    ip = ip.split(',')[0]
    ip = ip.split(':')[ip.split(':').length - 1]
  }
  const params = {
    phone: query.phone,
    openId: query.openId,
    source: query.source,
    app: query.app,
    origin:query.origin,
    client_ip: ip,
    bd_vid: query.bd_vid,
    bd_wd: query.bd_wd,
    promotsource: query.promotsource,
    promottype: query.promottype,
    device: query.device
  }

  let par = preProcessData(params)
  let url = `${config.javaHost}/moyin-account/v1/weChat/user/applet?`
  url += __fParams(par)
  axios.get(url, {
    headers: { 'Content-Type': 'application/json' },
  }).then(response => {
    console.log('applet--', response)
    res.send(response.data)
  })
})
// 下载mp4
app.get('/tts/video', (req, res) => {
  res.setTimeout(1000 * 60 * 30)
  const { articleId, mobile, bg, hasSrt, ww_token } = req.query
  const wwtoken = ww_token || req.cookies.ww_token
  const url = `${config.javaHost}/tts-web-api/v1/articles/compose/video?articleId=${articleId}&mobile=${mobile}&ww_token=${wwtoken}&hasSrt=${hasSrt}&bg=${bg}&async=false`
  let requestOpration = {
    url: url,
    timeout: 1000 * 60 * 5
  }
  req
    .pipe(
      request(requestOpration).on('error', e => {
        console.log(e)
      })
    )
    .pipe(res)
})
function isEmpty(obj) {
  if (typeof obj === 'undefined' || obj === null || obj === '') {
    return true;
  } else {
    return false;
  }
}
function __fParams(params) {
  if (!params || !Object.keys(params).length) return ''
  let paramsStr = ''
  for (let i in params) {
    paramsStr += `${i}=${params[i]}&`
  }
  return paramsStr.substr(0, paramsStr.length - 1)
}
function preProcessData(formData) {
  /* 删除空值 */
  Object.keys(formData).forEach(item=>{
    if(isEmpty(formData[item])) {
      delete formData[item];
    }
  })
  return formData;
}

module.exports = app

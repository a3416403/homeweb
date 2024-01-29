import express, { json } from 'express'
import config from '../config'
// import logger from '../logger';
import axios from 'axios'
// const tts = require('./tts')
const app = express();
// import getFrontendResource from './frontend-resource'
// const port = 8979
// var port = normalizePort('3000')
var port = normalizePort(process.env.PORT || '3000')
app.use(express.static('./dist'))
app.use(json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.get('/status', function (req, res) {
    res.send({ status: 'ok' })
})
axios.defaults.timeout = 120000
app.get('/tt/getAccessToken',(req,res)=>{
  let path =`https://developer.toutiao.com/api/apps/v2/token`;
  let params = {
    "appid": "tt0ff4794990cb256901",
    "secret": "0828bc279983d732a115e899a629cf4d8b6b987e",
    "grant_type": "client_credential"
  }
  axios.post(path, JSON.stringify(params), {
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(response => {
    let bodyN = response.data
    if (bodyN.err_no!=0) {
      res.send({
        err_code: -1,
        err_msg: '抖音获取access_token失败'
      })
      return
    }
    let access_token = bodyN.data.access_token

    res.send({code:200,"atoken":access_token})
  })
});
app.post('/tt/checkContent',(req,res)=>{
  let atoken=req.body.atoken
  let content = req.body.content;
  let path =`https://developer.toutiao.com/api/v2/tags/text/antidirt`;
  let params = {
    "tasks": [
      {
        "content": content
      }
    ]
  }
  axios.post(path, JSON.stringify(params), {
    headers: {
      'Content-Type': 'application/json',
      "X-Token":atoken
    }
  }).then(response => {
    let bodyN = response.data
    if (bodyN.error_id) {
      res.send({
        err_code: -1,
        err_msg: '抖音校验内容失败'
      })
      return
    }
    res.send({code:200,"data":bodyN.data})
  })
});
// app.use(tts)

app.get("/h5/english_cmu_check",(req, res)=>{
  let text:any=req.query.text||''
  let path=`${config.ttsHost}/api/english_cmu_check?text=${encodeURI(text)}`
  axios.get(path).then(function(response) {
    res.send(response.data)
  })
})
app.post('/wechat/tts/getHttpLinkUrl', (req, res) => {
    let path =
      'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wxeaf08774d5cc2d58&secret=20f671aaf0fb6eaa70e2f85f5bff6e20'
    axios.get(path).then(response => {
      if (!response || response.status !== 200) {
        res.send({
          err_code: -1,
          err_msg: '小程序跳转失败'
        })
        return 
      }
      let access_token = JSON.parse(response.data).access_token
      let path = `https://api.weixin.qq.com/wxa/generate_urllink?access_token=${access_token}`
      let sendData = req.body.queryParam
      let miniProgramPath = req.body.path||'pages/home-new/home-new'
      let param = {
        path: miniProgramPath,
        query: sendData ,
        env_version: config.minigram,
        expire_type:1,
        expire_interval:1
      }
      axios.post(path, JSON.stringify(param)).then(response => {
        if (!response || response.status !== 200) {
          res.send({
            err_code: -1,
            err_msg: '小程序跳转失败'
          })
          return 
        }
        let data = JSON.parse(response.data)
        res.send(data)
      })
    })
  })

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})
process.on('uncaughtException', (err) => {
  // 处理错误，例如记录日志
  console.log('uncaughtException',err)
});
function normalizePort(val:string) {
    var port = parseInt(val, 10)
    if (isNaN(port)) {
        // named pipe
        return val
    }

    if (port >= 0) {
        // port number
        return port
    }

    return false
}
export default app;

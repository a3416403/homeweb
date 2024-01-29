const crypto = require('crypto')
// import crypto from 'crypto'
const md5 = require('js-md5')
let aesIV = 'cemakeconcurrent'
const salt = 'WdAwuUooLajE2QRy'
export class Crypto {
  static decrypt128(data, key) {
    const cipher = crypto.createDecipheriv(
      'aes-128-cbc',
      Buffer.from(key, 'hex'),
      Buffer.from(aesIV)
    )
    let decrypted = null;
    if(!data){
        return decrypted;
    }
    try{
        decrypted = cipher.update(data, 'hex', 'utf8') + cipher.final('utf8');
    }catch(err){
        console.log('---decrypt128',err,data);
    }
    return  decrypted;
  }
  static encrypt128(data, key) {
    const cipher = crypto.createCipheriv(
      'aes-128-cbc',
      Buffer.from(key, 'hex'),
      Buffer.from(aesIV)
    )
    return cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
  }
}
export function hasJsonStructure(str) {
  if (typeof str !== 'string') return false;
  try {
      const result = JSON.parse(str);
      const type = Object.prototype.toString.call(result);
      return type === '[object Object]' 
          || type === '[object Array]';
  } catch (err) {
      return false;
  }
}
export function checkIsLegal(params, options:any={}) {
  const result = __genSaltSign(params)
  console.log(result)
  let bool = result.originalSign === result.newSign

  if (options.timeRange) {
    bool = result.current - result.fromTs < options.timeRange * 1000
  }

  return bool
}
const isObject = data =>
  Object.prototype.toString.call(data) === '[object Object]'
const isString = data =>
  Object.prototype.toString.call(data) === '[object String]'

function __genSaltSign(params:any) {
  let obj:any = {}
  if (isObject(params)) obj = Object.assign({}, params)
  if (isString(params)) {
    params = params.replace('?', '')
    params.split('&').forEach(item => {
      item = item.split('=')
      obj[item[0]] = item[1]
    })
  }
  let originalSign = obj.sign
  delete obj.sign
  let keys = Object.keys(obj).sort()
  let signStr = keys.reduce((p, a) => {
    return `${p}${a}${obj[a]}`
  }, '')
  signStr = signStr.slice(0, 6) + salt + signStr.slice(6)
  return {
    fromTs: Number(obj.v_ts),
    current: +new Date(),
    originalSign: originalSign,
    newSign: md5(signStr)
  }
}
